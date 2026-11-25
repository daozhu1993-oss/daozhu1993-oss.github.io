import { createClient, distanceBudgetIssue } from './byok.mjs';
import { MAX_TRIP_DAYS } from './planner/engine.mjs';
/* Credentials and trips are page-local. Model estimates never become verified road data. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeHref = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? escape(u.href) : '#'; } catch { return '#'; } };
  const split = value => value.split(/[,，、\n]/).map(v => v.trim()).filter(Boolean);
  const duration = value => value < 60 ? `${value}分钟` : `${Math.floor(value / 60)}小时${value % 60 ? `${value % 60}分` : ''}`;
  const dateLabel = value => value.replaceAll('-', '.');
  let current = null, proposal = null, currentBrief = null, requestId = 0, controller = null, busy = false;
  let briefDraft = null, focusedDay = 0;
  const conversation = [];
  const briefLabels = { transport: '交通方式', drivingOrigin: '落地取还车城市', origin: '出发地', destination: '目的地', startDate: '出发日期', days: '总天数', adults: '成人数', childrenAges: '孩子年龄', elderAges: '长辈年龄', maxDriveHours: '每日驾驶上限', maxDriveKm: '每日公里上限', budgetCny: '全团预算', departureTime: '每日出发', dayEnd: '每日结束', returnBy: '返程截止', lastDayReturnOnly: '最后一天只返程', pace: '旅行节奏', mustVisit: '必去地点', avoid: '避开地点', interests: '喜欢的体验', constraints: '限制条件', accommodation: '住宿偏好', notes: '其他要求' };
  const pretty = (key, value) => {
    if (key === 'transport') return { drive: '全程自驾往返', 'flight-drive': '飞机往返＋当地租车' }[value] || value;
    if (key === 'pace') return { slow: '慢慢游', mid: '适中', fast: '紧凑' }[value] || value;
    if (key === 'constraints') return value.map(v => ({ nohike: '不爬山', noplateau: '避开高原（待核验）' }[v] || v)).join('、') || '未设置';
    if (Array.isArray(value)) return value.join('、') || '未设置';
    if (typeof value === 'boolean') return value ? '是' : '否';
    return value == null || value === '' ? '未填写' : `${value}${({ days: '天', adults: '人', maxDriveHours: '小时', maxDriveKm: '公里', budgetCny: '元' })[key] || ''}`;
  };
  let client = null;
  function clearKey(message = 'Key 已清除。重新填写并验证后才能继续调用模型。') {
    client = null; $('#aiKey').value = ''; $('#aiKey').type = 'password';
    $('#aiShowKey').textContent = '显示'; $('#aiShowKey').setAttribute('aria-pressed', 'false');
    $('#aiService').textContent = message; $('#aiService').classList.remove('is-ready');
    controller?.abort(); requestId++; setBusy(false);
  }
  function connected() {
    if (client) return true;
    status('请先填写 API 地址、模型名和 Key，并验证连接。', true);
    $('#aiConnection').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#aiKey').focus({ preventScroll: true }); return false;
  }
  const errorMessage = error => [error.message, ...(Array.isArray(error.details) ? error.details.filter(v => typeof v === 'string') : [])].join('；');
  function status(message, isError = false) {
    const box = $('#aiProgress'); box.hidden = false; box.textContent = message; box.classList.toggle('is-error', isError);
  }
  function setBusy(value, intake = false) {
    busy = value; $('#aiFields').disabled = value; $('#aiRevise').disabled = value; $('#aiConnect').disabled = value;
    for (const node of document.querySelectorAll('#aiSend, #aiMessage, #aiEndpoint, #aiModel, #aiKey, #aiShowKey, #aiChange, #aiDraft button, [data-brief-example]')) node.disabled = value;
    $('#aiGenerate').textContent = value && !intake ? '正在编排行程…' : '确认条件，开始规划';
    $('#aiSend').textContent = value && intake ? '正在整理…' : '整理我的想法 →';
    $('#aiCancel').hidden = !value; $('#aiCancelNote').hidden = !value;
    $('#aiForm').setAttribute('aria-busy', String(value));
    $('#aiChatForm').setAttribute('aria-busy', String(value && intake));
  }
  async function health() {
    if (busy) return;
    const id = ++requestId; controller = new AbortController();
    const service = $('#aiService'); client = null; service.classList.remove('is-ready');
    service.textContent = '正在向你填写的 API 发送一次小额验证请求…'; setBusy(true, true);
    try {
      const candidate = createClient({ baseUrl: $('#aiEndpoint').value, model: $('#aiModel').value, apiKey: $('#aiKey').value });
      await candidate.test(AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]));
      if (id !== requestId) return;
      client = candidate; $('#aiKey').value = ''; $('#aiKey').placeholder = 'Key 已在本页临时接入；刷新后清除';
      $('#aiKey').type = 'password'; $('#aiShowKey').textContent = '显示'; $('#aiShowKey').setAttribute('aria-pressed', 'false');
      service.textContent = `模型连接成功 · ${$('#aiModel').value.trim()}。可以整理需求、生成和修改行程；地图与实时资料未接入。`;
      service.classList.add('is-ready');
    } catch (error) {
      if (id === requestId) service.textContent = error.name === 'TimeoutError' ? '连接验证超时，请检查网络或服务商状态。' : error.name === 'AbortError' ? '已取消验证。' : error.message;
    } finally { if (id === requestId) setBusy(false); }
  }
  function readBrief() {
    const f = Object.fromEntries(new FormData($('#aiForm')));
    return { ...f, days: Number(f.days), adults: Number(f.adults), maxDriveHours: Number(f.maxDriveHours), maxDriveKm: f.maxDriveKm ? Number(f.maxDriveKm) : null, budgetCny: f.budgetCny ? Number(f.budgetCny) : null,
      childrenAges: split(f.childrenAges).map(Number), elderAges: split(f.elderAges).map(Number), mustVisit: split(f.mustVisit), avoid: split(f.avoid), interests: split(f.interests),
      constraints: [$('#aiNoHike').checked && 'nohike', $('#aiNoPlateau').checked && 'noplateau'].filter(Boolean), lastDayReturnOnly: $('#aiReturnOnly').checked };
  }
  function summary() {
    const flying = $('#aiTransport').value === 'flight-drive';
    $('#aiDrivingOriginField').hidden = !flying;
    $('#aiDrivingOrigin').disabled = !flying; $('#aiDrivingOrigin').required = flying;
    const b = readBrief();
    $('#aiBriefSummary').innerHTML = `<strong>${escape(b.origin || '出发地待定')} ${flying ? `✈ ${escape(b.drivingOrigin || '落地城市待定')}取车` : ''} → ${escape(b.destination || '目的地待定')} → ${flying ? `${escape(b.drivingOrigin || '落地城市')}还车 ✈ ${escape(b.origin || '出发地')}` : '返回'}</strong><p>${escape(b.startDate ? dateLabel(b.startDate) + ' 出发' : '请确认出发日期')} · ${escape(b.days || '—')}天（${flying ? '含往返飞机与自驾' : '含往返'}）</p><div><span>每日驾驶 ≤ ${escape(b.maxDriveHours || '—')}小时</span>${b.maxDriveKm ? `<span>每日自驾 ≤ ${escape(b.maxDriveKm)}公里</span>` : ''}<span>末日 ${escape(b.returnBy || '—')} 前到家</span></div>`;
  }
  function partialBrief() {
    const b = readBrief(), f = new FormData($('#aiForm'));
    for (const key of Object.keys(b)) if (!Object.hasOwn(briefLabels, key) || (f.has(key) && f.get(key) === '')) delete b[key];
    return b;
  }
  function chatStatus(message, error = false) {
    const box = $('#aiChatStatus'); box.hidden = false; box.textContent = message; box.classList.toggle('is-error', error);
  }
  async function post(path, body, signal) {
    if (!client) throw new Error('请先验证你的 API 连接。');
    return path === '/api/brief' ? client.clarify(body, signal) : client.plan(body, signal, message => status(message));
  }
  async function clarify() {
    if (busy || !connected() || !$('#aiChatForm').reportValidity()) return;
    const message = $('#aiMessage').value.trim();
    if (!message) return;
    const base = partialBrief();
    const id = ++requestId; controller = new AbortController();
    briefDraft = null; $('#aiDraft').hidden = true;
    setBusy(true, true); chatStatus('正在从描述中整理条件；还没有查询路线。');
    try {
      const data = await post('/api/brief', { message, current: base, history: conversation.slice(-4) }, AbortSignal.any([controller.signal, AbortSignal.timeout(100000)]));
      if (id !== requestId) return;
      if (data.status !== 'draft' || data.requiresConfirmation !== true || !data.patch || Array.isArray(data.patch) || typeof data.patch !== 'object' || !Array.isArray(data.questions) ||
        !Array.isArray(data.evidence) || Object.keys(data.patch).some(key => !Object.hasOwn(briefLabels, key))) throw new Error('需求整理结果不完整，原有条件没有改变。');
      const arrays = ['childrenAges', 'elderAges', 'mustVisit', 'avoid', 'interests', 'constraints'];
      const numbers = ['days', 'adults', 'maxDriveHours', 'maxDriveKm', 'budgetCny'];
      for (const [key, value] of Object.entries(data.patch)) {
        const valid = arrays.includes(key) ? Array.isArray(value) && value.length <= 6 && value.every(v => key.endsWith('Ages') ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string') :
          numbers.includes(key) ? (['budgetCny', 'maxDriveKm'].includes(key) && value === null) || (typeof value === 'number' && Number.isFinite(value)) :
          key === 'lastDayReturnOnly' ? typeof value === 'boolean' : typeof value === 'string';
        if (!valid) throw new Error('需求整理结果不完整，原有条件没有改变。');
      }
      const changes = Object.entries(data.patch).filter(([key, value]) => JSON.stringify(base[key]) !== JSON.stringify(value));
      const messageNode = document.createElement('article');
      messageNode.className = 'ai-message'; messageNode.innerHTML = `<small>我的想法</small><p>${escape(message)}</p>`;
      $('#aiMessages').append(messageNode);
      while ($('#aiMessages').children.length > 4) $('#aiMessages').firstElementChild.remove();
      $('#aiDraft').innerHTML = `<h4>${changes.length ? '这些条件，和你想的一样吗？' : '还需要再对齐一下'}</h4><p>以下只整理你的描述，尚未核验路线是否可行。</p>${changes.length ? `<dl>${changes.map(([key, value]) => `<div><dt>${escape(briefLabels[key])}</dt><dd><small>${escape(pretty(key, base[key]))} →</small> ${escape(pretty(key, value))}</dd></div>`).join('')}</dl>` : ''}${data.questions.length ? `<ul>${data.questions.map(q => `<li>${escape(q)}</li>`).join('')}</ul>` : ''}${data.evidence.length ? `<details><summary>核对依据：你说过的话</summary>${data.evidence.map(e => `<p>${escape(briefLabels[e.field] || e.field)}：${escape(e.quote)}</p>`).join('')}</details>` : ''}<div class="ai-draft-actions">${changes.length ? '<button type="button" class="btn-gen" id="aiApplyBrief">采用这些条件</button>' : ''}<button type="button" class="btn-quiet" id="aiDismissBrief">保留当前条件</button></div>`;
      conversation.push(message); if (conversation.length > 4) conversation.shift();
      $('#aiMessage').value = '';
      briefDraft = { patch: data.patch, base };
      $('#aiDraft').hidden = false; chatStatus('需求已整理。尚未修改表单，请先核对；不确定的地方可以继续补充。');
    } catch (error) { if (id === requestId) chatStatus(error.name === 'TimeoutError' ? '需求整理超时，文字和原条件仍保留。可以重试或直接填写表单。' : error.message === 'Failed to fetch' ? '需求整理模型尚未连接。可以先直接填写旅行条件。' : errorMessage(error), true); }
    finally { if (id === requestId) setBusy(false); }
  }
  function applyBrief() {
    if (!briefDraft || busy) return;
    if (JSON.stringify(partialBrief()) !== JSON.stringify(briefDraft.base)) { chatStatus('你刚修改了表单，这份建议已过期。请重新整理，避免覆盖新条件。', true); return; }
    for (const [key, value] of Object.entries(briefDraft.patch)) {
      if (key === 'constraints') { $('#aiNoHike').checked = value.includes('nohike'); $('#aiNoPlateau').checked = value.includes('noplateau'); }
      else if (key === 'lastDayReturnOnly') $('#aiReturnOnly').checked = value;
      else { const input = $('#aiForm').elements.namedItem(key); if (input) input.value = Array.isArray(value) ? value.join('，') : value ?? ''; }
    }
    briefDraft = null; $('#aiDraft').hidden = true; summary();
    $('#aiPreferences').open = true;
    chatStatus('已填入旅行条件。请检查日期、同行人和驾驶上限，再确认生成行程。');
    $('#aiProfileTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function link(url, title) { return `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a>`; }
  function assertPlan(plan) {
    const arrays = [plan?.days, plan?.sources, plan?.budget, plan?.assumptions, plan?.alternatives, plan?.checks?.errors, plan?.checks?.warnings];
    const placeOK = p => p && (plan.verification === 'ai-estimate' ? typeof p.name === 'string' : Array.isArray(p.coord) && p.coord.length === 2 && p.coord.every(Number.isFinite));
    const valid = arrays.every(Array.isArray) && plan.brief && plan.days.length > 0 && plan.days.length <= MAX_TRIP_DAYS &&
      [plan.totals?.km, plan.totals?.drivingMinutes].every(Number.isFinite) &&
      plan.budget.every(b => b && [b.low, b.high].every(Number.isFinite)) &&
      plan.days.every(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && [d.distanceKm, d.drivingMinutes].every(Number.isFinite) &&
        placeOK(d.start) && (!d.overnight || placeOK(d.overnight)) && Array.isArray(d.items) && Array.isArray(d.legs) &&
        d.items.every(v => v && ['visit', 'rest'].includes(v.kind) && typeof v.start === 'string' && Array.isArray(v.sourceIds) && placeOK(v.place)) &&
        d.legs.every(l => l && typeof l.depart === 'string' && [l.distanceMeters, l.durationSeconds, l.bufferMinutes].every(Number.isFinite) && placeOK(l.from) && placeOK(l.to)));
    if (!valid) throw new Error('服务返回了不完整的行程，原行程仍保留，请重试。');
  }
  function overview(plan) {
    const points = [plan.days[0]?.start, ...plan.days.map(d => d.overnight)].filter(Boolean).filter((p, i, a) => !i || a[i - 1].id !== p.id);
    if (points.length < 2) return '';
    if (plan.verification === 'ai-estimate') return `<div class="ai-map ai-sequence"><p>住宿与返程顺序 <small>示意，不是导航地图</small></p><ol>${points.map(p => `<li>${escape(p.name)}</li>`).join('')}</ol></div>`;
    const xs = points.map(p => p.coord[0]), ys = points.map(p => p.coord[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = Math.max(0.08, Math.max(...xs) - x0), dy = Math.max(0.08, Math.max(...ys) - y0);
    const coord = p => [60 + (p.coord[0] - x0) / dx * 780, 245 - (p.coord[1] - y0) / dy * 180];
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${coord(p).join(' ')}`).join(' ');
    return `<div class="ai-map"><p>住宿与返程顺序示意 <small>连线不是实际道路；每段路程可打开对应地图核对。</small></p><svg viewBox="0 0 900 300" role="img" aria-label="住宿与返程顺序示意图"><path d="${path}" fill="none" stroke="#b2573a" stroke-width="3" stroke-dasharray="7 5"/>${points.slice(0, -1).map((p, i) => { const [x, y] = coord(p); return `<circle cx="${x}" cy="${y}" r="7" fill="#f5f0e7" stroke="#b2573a" stroke-width="3"/><text x="${x}" y="${y - 18 - (i % 2) * 20}" text-anchor="middle" fill="#173b57" font-size="15">${escape(p.name)}</text>`; }).join('')}</svg></div>`;
  }
  function dayGuide(day, index, plan) {
    const stops = [day.start, ...day.legs.map(leg => leg.to)];
    const last = index === plan.days.length - 1;
    const estimated = plan.verification === 'ai-estimate';
    const returnsHome = last && day.overnight?.id === 'ORIGIN';
    const returnNote = last ? `<p>${returnsHome && day.returnArrivalTime ? `预计 ${escape(day.returnArrivalTime)} 到家` : '尚未确认能回到出发地'}<br>要求最晚 ${escape(plan.brief.returnBy)} 返回</p>` : '';
    return `<aside class="ai-route-sheet" aria-label="当天路线速览"><span class="ai-eyebrow">DAY ${String(index + 1).padStart(2, '0')} / 路上的小抄</span><h3>${last ? '把回家的路留好' : '这一程，慢慢走'}</h3><p class="ai-route-caption">停靠顺序示意，不是导航地图</p><ol class="ai-road-list">${stops.map((place, i) => `<li><span class="ai-road-number">${String(i + 1).padStart(2, '0')}</span><div><strong>${escape(place.name)}</strong>${day.legs[i] ? `<p>${day.legs[i].mode === 'flight' ? '飞机 · 航班待确认' : `${estimated ? '估算 ' : ''}${Math.round(day.legs[i].distanceMeters / 100) / 10} 公里`} · 约 ${duration(Math.ceil(day.legs[i].durationSeconds / 60))}</p>${day.legs[i].navigationUrl ? link(day.legs[i].navigationUrl, '在地图中核对') : ''}` : `<p>${returnsHome ? '回到出发地' : last ? '返程尚未闭合' : '当天落脚处'}</p>`}</div></li>`).join('')}</ol><div class="ai-road-total"><span>${estimated ? '当日驾驶估算' : '当日驾驶'}</span><strong>${day.distanceKm} <small>公里</small></strong><p>约 ${duration(day.drivingMinutes)} · 上限 ${escape(plan.brief.maxDriveHours)}小时</p>${returnNote}</div><p class="ai-muted">${estimated ? '车程由 AI 估算，尚未查询道路；请在地图中核对起终点和实际车程。' : '驾驶耗时来自道路查询；停车和休息另留。出发前仍需复核实时路况。'}</p></aside>`;
  }
  function planMarkup(plan, preview = false, focus = null) {
    const interactive = focus !== null && !preview;
    const blocked = plan.checks.errors.length > 0;
    const estimated = plan.verification === 'ai-estimate';
    const sourceRefs = (ids, dayIndex) => ids.map(id => `<a href="#${preview ? 'proposed' : 'current'}-${escape(id)}" aria-label="第${dayIndex + 1}天的来源${escape(id)}">[${escape(id)}]</a>`).join(' ');
    const days = plan.days.map((day, i) => {
      const tasks = [
        ...day.legs.map(leg => ({ time: leg.depart, html: `<li class="ai-transfer"><span class="ai-time">${escape(leg.depart)}—${escape(leg.arrive)}</span><div><strong>${leg.mode === 'flight' ? '✈ ' : ''}${escape(leg.from.name)} → ${escape(leg.to.name)}</strong><p>${leg.mode === 'flight' ? `航段待确认 · 飞行估计 ${duration(Math.ceil(leg.durationSeconds / 60))}，另留 ${leg.bufferMinutes} 分钟机场接驳、值机行李和取还车。左侧为整个转场的规划时间窗，不是航班起降时刻。` : `${estimated ? 'AI 估算 ' : ''}${Math.round(leg.distanceMeters / 100) / 10} 公里 · 驾驶约 ${duration(Math.ceil(leg.durationSeconds / 60))}，另留 ${leg.bufferMinutes} 分钟停车/休息。`}</p><p class="ai-muted">${escape(leg.source || '道路规划服务')} · ${escape(leg.note || '预计耗时，出发前复核路况')}</p>${leg.navigationUrl ? link(leg.navigationUrl, '打开地图路线') : ''}</div></li>` })),
        ...day.items.map(item => ({ time: item.start, html: `<li><span class="ai-time">${escape(item.start)}—${escape(item.end)}</span><div><strong>${escape(item.kind === 'rest' ? '用餐 / 休息 · ' + item.place.name : item.place.name)}</strong><p>${escape(item.note)}</p>${item.kind === 'visit' ? `<small>开放与预约待确认 · ${sourceRefs(item.sourceIds, i)} ${link(item.place.url, '在地图中查找地点')}</small>` : ''}</div></li>` })),
      ].sort((a, b) => a.time.localeCompare(b.time));
      const weather = estimated ? '未查询天气，请临近出发自行确认' : day.weather ? `${escape(day.weather.day)}，${escape(day.weather.low)}—${escape(day.weather.high)}℃（${escape(day.weather.reportTime)} 发布）` : '该日期暂无预报，临近出发再确认';
      return `<article class="ai-day" data-day-index="${i}" ${interactive && focus >= 0 && focus !== i ? 'hidden' : ''}><div class="ai-day-head"><div class="ai-day-number">${String(i + 1).padStart(2, '0')}<small>DAY</small></div><div><span class="ai-muted">${dateLabel(day.date)}</span><h3>${escape(day.title)}</h3><p>自驾${estimated ? '估算 ' : ''}${day.distanceKm} 公里 · 驾驶约 ${duration(day.drivingMinutes)}${day.flightMinutes ? ` · 飞行估计 ${duration(day.flightMinutes)}（待确认）` : ''} · ${i === plan.days.length - 1 ? '返回' : '住宿区域'}：${escape(day.overnight?.name || '未安排')}</p></div></div><ul class="ai-timeline">${tasks.map(t => t.html).join('')}</ul><div class="ai-day-foot">${day.returnArrivalTime ? `预计 ${escape(day.returnArrivalTime)} 回到出发地 · ` : ''}${escape(day.arrivalTime)} 完成当日行程 · 当日终点地区天气：${weather}</div></article>`;
    }).join('');
    return `<div class="ai-plan-head"><span class="kicker">${preview ? '调整预览' : estimated ? '你的旅行行程草案' : '你的旅行行程'} / ${blocked ? '存在冲突，暂不可采用' : estimated ? '时间结构已检查 · 道路未核验' : '道路与时间检查通过'}</span><h2>${escape(plan.title)}</h2><p>${escape(plan.reason)}</p><div class="ai-stats"><span>${plan.days.length} 个完整旅行日</span><span>${estimated ? '自驾估算合计' : '道路合计'} ${plan.totals.km} 公里</span><span>驾驶约 ${duration(plan.totals.drivingMinutes)}</span><span>${plan.brief.transport === 'flight-drive' ? '往返飞机＋当地租车 · 航班待确认' : '往返出发地'}</span></div><p class="ai-muted">${estimated ? '本方案由你接入的模型生成，未联网查询地图、天气或景区信息。公里数、车程和费用为 AI 估算；时间检查基于估算，不能代替实际导航核对。生成于' : '道路数据查询于'} ${escape(new Date(plan.createdAt).toLocaleString('zh-CN'))}。预约、营业和预算仍需复核。</p></div>
      ${blocked ? `<div class="ai-conflicts"><strong>需要先解决这些问题</strong><ul>${plan.checks.errors.map(e => `<li>${escape(e)}</li>`).join('')}</ul></div>` : ''}
      ${interactive ? `<nav class="ai-day-switcher" aria-label="选择旅行日">${plan.days.map((day, i) => `<button type="button" data-focus-day="${i}" aria-pressed="${focus === i}"><span>第 ${i + 1} 天</span><small>${dateLabel(day.date).slice(5)}${i === plan.days.length - 1 ? ' · 返程' : ''}</small></button>`).join('')}<button type="button" data-focus-day="-1" aria-pressed="${focus === -1}">看完整行程</button></nav>` : ''}
      ${interactive && focus >= 0 ? '' : overview(plan)}<div class="${interactive && focus >= 0 ? 'ai-journey-layout' : ''}"><div class="ai-days">${days}</div>${interactive && focus >= 0 ? dayGuide(plan.days[focus], focus, plan) : ''}</div>
      ${(plan.mapAttributions || []).length ? `<p class="ai-muted">地图数据：${plan.mapAttributions.map(a => link(a.url, a.title)).join(' · ')}</p>` : ''}
      <section class="ai-budget"><h3>全团费用粗估</h3><p>未查询实时报价；以下区间用于预算分配，非门票、酒店或交通报价。</p><ul>${plan.budget.map(b => `<li><span>${escape(b.category)}</span><strong>¥${b.low}—${b.high}</strong></li>`).join('')}</ul></section>
      <details class="ai-evidence"><summary>查看待确认事项与备选建议（${plan.checks.warnings.length} 项待确认）</summary><ul>${[...plan.checks.warnings, ...plan.assumptions, ...plan.alternatives].map(w => `<li>${escape(w)}</li>`).join('')}</ul></details>
      <details class="ai-evidence"><summary>${estimated ? '如何核实这份行程' : `资料来源与查询记录（${plan.sources.length} 条）`}</summary><p>${estimated ? '本版没有联网检索，不提供模型编造的来源链接。请用各地点的地图入口查找官方信息，再核对日期、开放和预约。' : '以下是检索到的参考资料，不代表已核实所有政策。以景区、场馆官方公告和预约渠道为准。'}</p>${plan.sources.map(s => `<article id="${preview ? 'proposed' : 'current'}-${escape(s.id)}"><strong>[${escape(s.id)}] ${link(s.url, s.title)}</strong><p>${escape(s.excerpt)}</p><small>检索：${escape(s.query)} · ${escape(s.retrievedAt)}</small></article>`).join('')}</details>`;
  }
  function showCurrent(plan, brief) {
    // Finish rendering before committing state: a malformed response must not erase the original.
    const markup = planMarkup(plan, false, 0) + (!plan.checks.errors.length ? '<button type="button" class="btn-quiet" id="aiExport">保存完整行程 HTML</button>' : '');
    focusedDay = 0;
    current = plan; currentBrief = structuredClone(brief); proposal = null;
    $('#aiResult').hidden = false; $('#aiProposal').hidden = true;
    $('#aiPlan').innerHTML = markup;
    $('#aiRevision').hidden = false;
    $('#aiResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function compact(plan) {
    return {
      title: plan.title, transport: plan.brief.transport, drivingOrigin: plan.brief.drivingOrigin,
      days: plan.days.map(day => ({
        date: day.date, title: day.title, overnight: day.overnight?.name,
        transfers: day.legs.map(leg => ({
          mode: leg.mode, from: leg.from.name, to: leg.to.name, depart: leg.depart, arrive: leg.arrive,
          minutes: Math.ceil(leg.durationSeconds / 60), bufferMinutes: leg.bufferMinutes,
          ...(leg.mode === 'flight' ? {} : { km: leg.distanceMeters / 1000 }),
        })),
        activities: day.items.map(item => ({
          kind: item.kind, name: item.place.name, note: item.note,
          ...(item.durationMinutes
            ? { durationMinutes: item.durationMinutes, notBefore: item.notBefore }
            : { start: item.start, end: item.end }),
        })),
      })),
    };
  }
  function proposalDiff(before, after) {
    const describe = day => {
      if (!day) return '无';
      const events = [
        ...day.legs.map(leg => ({ time: leg.depart, text: `${leg.depart}—${leg.arrive} ${leg.mode === 'flight' ? '✈ ' : ''}${leg.from.name}→${leg.to.name}${leg.mode === 'flight' ? '' : `（${Math.round(leg.distanceMeters / 100) / 10}公里，约${duration(Math.ceil(leg.durationSeconds / 60))}）`}${leg.note ? `：${leg.note}` : ''}` })),
        ...day.items.map(item => ({ time: item.start, text: `${item.start}—${item.end} ${item.kind === 'rest' ? '休息' : '游览'}·${item.place.name}${item.note ? `：${item.note}` : ''}` })),
      ].sort((a, b) => a.time.localeCompare(b.time)).map(event => event.text);
      return `${day.title}；${day.distanceKm}公里 / ${duration(day.drivingMinutes)}；${day.overnight?.name || '未安排'}；${day.returnArrivalTime ? `预计${day.returnArrivalTime}返程；` : ''}${events.join('；')}`;
    };
    const rows = after.days.map((day, i) => {
      const old = before.days[i];
      const original = describe(old), revised = describe(day);
      return original === revised ? '' : `<li><strong>${escape(day.date)}</strong><p>原计划：${escape(original)}</p><p>新计划：${escape(revised)}</p></li>`;
    }).join('');
    return rows || '<li>逐日路线、时间和说明没有变化；可展开下方完整方案核对费用与待确认事项。</li>';
  }
  async function generate(revising = false) {
    if (busy || !connected()) return;
    if (!revising && briefDraft) { chatStatus('请先采用或保留当前条件，再生成行程。', true); $('#aiDraft').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!revising && !$('#aiForm').reportValidity()) return;
    const instruction = $('#aiChange').value.trim();
    if (revising && !instruction) { status('请先写下想调整的内容。', true); return; }
    const brief = revising ? structuredClone(currentBrief) : readBrief();
    const distanceIssue = distanceBudgetIssue(brief, window.TRAVEL_DATA?.destinations);
    if (distanceIssue) { status(distanceIssue, true); return; }
    const id = ++requestId; controller?.abort(); controller = new AbortController();
    // An unapplied revision can never survive a new generation request.
    proposal = null; $('#aiProposal').hidden = true;
    setBusy(true); status('正在使用你的模型编排行程。距离、车程和费用会标明估算，未查询实时地图。');
    try {
      const data = await post('/api/plan', { brief, ...(revising ? { revision: { instruction, previous: compact(current) } } : {}) }, AbortSignal.any([controller.signal, AbortSignal.timeout(brief.days > 14 ? 900000 : brief.days > 7 ? 600000 : 300000)]));
      if (id !== requestId) return;
      if (data.status === 'needs_input') { status(`规划师建议先调整条件：${data.questions.join('；')}。请核对交通方式、落地城市、天数与驾驶限制后再规划；原行程保留。`, true); return; }
      const plan = data.plan;
      assertPlan(plan);
      if (revising || (current && plan.checks.errors.length)) {
        proposal = plan;
        $('#aiProposal').innerHTML = `<h3>先看调整，再决定是否采用</h3><ul class="ai-diff">${proposalDiff(current, plan)}</ul><details><summary>展开完整方案</summary>${planMarkup(plan, true)}</details><div class="gen-row"><button type="button" class="btn-gen" id="aiAccept" ${plan.checks.errors.length ? 'disabled' : ''}>采用这份方案</button><button type="button" class="btn-quiet" id="aiDiscard">保留原行程</button></div>${plan.checks.errors.length ? '<p>仍存在行程冲突，不能采用。原行程没有改变。</p>' : ''}`;
        $('#aiProposal').hidden = false; $('#aiProposal').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else showCurrent(plan, brief);
      status(plan.checks.errors.length ? '方案仍有冲突，已明确列出；请调整天数、范围或驾驶上限后再规划。' : revising ? '调整方案已生成，确认后才会替换原行程。' : '行程草案已生成，时间结构已检查。里程与车程是 AI 估算，出发前请核对地图与预约。', plan.checks.errors.length > 0);
    } catch (error) {
      if (id === requestId) status(error.name === 'AbortError' ? '已取消本次请求，原行程保留。' : error.name === 'TimeoutError' ? '本次规划超时，请稍后重试；原行程仍保留。' : error.message === 'Failed to fetch' ? '暂时连接不上规划服务。请检查连接；不会用离线模板冒充 AI 结果。' : errorMessage(error), true);
    } finally { if (id === requestId) setBusy(false); }
  }
  async function exportPlan() {
    const snapshot = structuredClone(current);
    if (!snapshot || snapshot.checks.errors.length) return;
    let css = '';
    // The page may stay open after its server goes offline; reuse the styles already loaded.
    try {
      const href = new URL('styles.css', document.baseURI).href;
      const sheet = [...document.styleSheets].find(sheet => sheet.href === href);
      css = [...(sheet?.cssRules || [])].map(rule => rule.cssText).join('\n');
    } catch { /* A restricted stylesheet can still be fetched from the same origin below. */ }
    if (!css.trim()) {
      try {
        const r = await fetch('styles.css', { signal: AbortSignal.timeout(10000) });
        if (r.ok) css = await r.text();
      } catch { /* Preserve the current itinerary and report the failed export below. */ }
    }
    if (!css.trim()) { status('暂时无法读取行程样式，未下载不完整文件。请保留当前页面，恢复网络后重试。', true); return; }
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(snapshot.title)}</title><style>${css.replace(/<\/style/gi, '<\\/style')} body{padding:24px}main{max-width:1000px;margin:auto}details{display:block}</style><main>${planMarkup(snapshot)}</main></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${snapshot.title.replace(/[\\/:*?"<>|]/g, '')}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    $('#aiStart').min = today;
    summary();
    $('#aiForm').addEventListener('input', summary);
    $('#aiForm').addEventListener('change', summary);
    $('#aiForm').addEventListener('invalid', event => { event.target.closest('details')?.setAttribute('open', ''); }, true);
    $('#aiChatForm').addEventListener('submit', event => { event.preventDefault(); clarify(); });
    document.querySelectorAll('[data-brief-example]').forEach(button => button.addEventListener('click', () => { $('#aiMessage').value = button.dataset.briefExample; $('#aiMessage').focus(); }));
    $('#aiDraft').addEventListener('click', event => {
      if (event.target.closest('#aiApplyBrief')) applyBrief();
      if (event.target.closest('#aiDismissBrief') && !busy) { briefDraft = null; $('#aiDraft').hidden = true; chatStatus('已保留当前条件。'); }
    });
    $('#aiForm').addEventListener('submit', event => { event.preventDefault(); generate(); });
    $('#aiConnect').addEventListener('click', health);
    $('#aiClearKey').addEventListener('click', () => clearKey());
    $('#aiShowKey').addEventListener('click', () => {
      const show = $('#aiKey').type === 'password'; $('#aiKey').type = show ? 'text' : 'password';
      $('#aiShowKey').textContent = show ? '隐藏' : '显示'; $('#aiShowKey').setAttribute('aria-pressed', String(show));
    });
    $('#aiEndpoint').addEventListener('input', () => clearKey('服务地址已改变，请重新填写 Key 并验证，避免发往错误服务。'));
    $('#aiModel').addEventListener('input', () => { client = null; $('#aiService').textContent = '模型已改变，请重新验证连接。'; $('#aiService').classList.remove('is-ready'); });
    $('#aiKey').addEventListener('input', () => { client = null; $('#aiService').textContent = 'Key 已改变，请重新验证连接。'; $('#aiService').classList.remove('is-ready'); });
    $('#aiCancel').addEventListener('click', () => {
      controller?.abort(); requestId++; setBusy(false);
      status('已取消本次请求，原行程保留；服务商可能仍对已处理内容计费。');
      chatStatus('已停止等待，原条件没有改变。');
      if (!client) $('#aiService').textContent = '尚未连接，请重新验证。';
    });
    window.addEventListener('pagehide', () => clearKey('页面已离开，Key 已清除；返回后请重新验证。'));
    $('#aiRevise').addEventListener('click', () => generate(true));
    $('#aiResult').addEventListener('click', event => {
      const button = event.target.closest('button'), action = button?.id;
      if (button?.hasAttribute('data-focus-day') && current) {
        const index = Number(button.dataset.focusDay);
        if (index < -1 || index >= current.days.length) return;
        focusedDay = index;
        $('#aiPlan').innerHTML = planMarkup(current, false, index) + (!current.checks.errors.length ? '<button type="button" class="btn-quiet" id="aiExport">保存完整行程 HTML</button>' : '');
        $(`#aiPlan [data-focus-day="${index}"]`).focus({ preventScroll: true });
      }
      if (button?.dataset.revision && !busy && current) {
        if (focusedDay < 0) { status('请先选择想调整的那一天。'); return; }
        $('#aiChange').value = `只调整第${focusedDay + 1}天（${current.days[focusedDay].date}），${button.dataset.revision === 'lighter' ? '减少景点，增加休息时间' : '优先安排有资料支持的室内活动，不假设当天会下雨'}。其余日期尽量不变，保留必去、预算、每日驾驶和返程限制。`;
        $('#aiChange').focus();
      }
      if (action === 'aiAccept' && proposal && !proposal.checks.errors.length && !busy) { showCurrent(proposal, proposal.brief); $('#aiChange').value = ''; status('已采用调整后的行程。'); }
      if (action === 'aiDiscard') { proposal = null; $('#aiProposal').hidden = true; status('已保留原行程。'); }
      if (action === 'aiExport') exportPlan();
    });
    setBusy(false);
  });
})();
