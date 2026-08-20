/* =========================================================================
 * 岛主和佳佳的旅行手账 · 路线引擎 + 渲染
 * 纯前端：把"偏好 / 节奏 / 真实约束"交给一套规则，长成一条能出发的路线。
 * ========================================================================= */
(function () {
  "use strict";
  const D = window.TRAVEL_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* 特殊约束集合 */
  const PLATEAU = ["lhasa", "daocheng", "qinghai"];          // 高海拔，不去高原则排除
  const HARD    = ["zhangjiajie", "huangshan", "wuyishan", "jiuzhai", "daocheng", "lhasa", "dunhuang"]; // 费腿

  /* 地图投影：经纬度 -> SVG 坐标 */
  const MAP = { w: 680, h: 520, pad: 34, lng0: 72, lng1: 136, lat0: 17, lat1: 55 };
  function project(lng, lat) {
    const x = (lng - MAP.lng0) / (MAP.lng1 - MAP.lng0) * (MAP.w - MAP.pad * 2) + MAP.pad;
    const y = MAP.h - ((lat - MAP.lat0) / (MAP.lat1 - MAP.lat0) * (MAP.h - MAP.pad * 2) + MAP.pad);
    return [x, y];
  }
  function dist(a, b) {
    const dx = a[0] - b[0], dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ---------------- 状态 ---------------- */
  const state = {
    origin: "beijing",
    days: 7,
    pace: "mid",          // slow | mid | fast
    tags: new Set(),      // 自然/人文/美食/出片/亲子
    month: "auto",
    budget: "mid",        // econ | mid | comfort
    transport: "any",     // rail | flight | drive | any
    constraints: new Set(), // kids | elder | nohike | noplateau | frugal
    view: "route",        // route | photo | food | story
    plan: null,
    fixed: null,          // 预设固定序列（id 数组）或 null（走评分引擎）
    presetLabel: null,    // 预设标题
  };

  /* ---------------- 评分 ---------------- */
  function scoreDest(d) {
    let s = 0;
    // 标签匹配
    state.tags.forEach((t) => { if (d.tags.includes(t)) s += 2.2; });
    // 季节
    if (state.month !== "auto") {
      s += d.best.includes(state.month) ? 3 : -0.6;
    }
    // 约束
    const c = state.constraints;
    if (c.has("kids")) s += d.tags.includes("亲子") ? 1.4 : (HARD.includes(d.id) ? -2.4 : 0);
    if (c.has("elder")) s += HARD.includes(d.id) ? -2.6 : 0.4;
    if (c.has("nohike")) s += HARD.includes(d.id) ? -3.2 : 0.3;
    if (c.has("noplateau")) s += PLATEAU.includes(d.id) ? -5 : 0;
    if (c.has("frugal")) s -= (d.region === "northwest" || d.region === "southwest") ? 0.8 : 0;
    // 预算 vs 距离（远西线更烧钱）
    const origin = byId(state.origin);
    if (origin) {
      const km = geoKm(origin.coord, d.coord);
      if (state.budget === "econ" && km > 1600) s -= 1.2;
      if (state.budget === "comfort" && km > 1600) s += 0.5;
    }
    // 轻微随机，避免每次完全一样但稳定（按 id 哈希）
    s += (hash(d.id) % 10) / 10 - 0.05;
    return s;
  }
  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 1000; return h; }
  function geoKm(a, b) {
    const R = 6371, toR = (d) => d * Math.PI / 180;
    const dLat = toR(b[1] - a[1]), dLng = toR(b[0] - a[0]);
    const la1 = toR(a[1]), la2 = toR(b[1]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  // ponytail: 城市坐标只能做路线级估算；接入道路导航 API 后再替换这两个常量。
  const DRIVE_ROAD_FACTOR = 1.25;
  const DRIVE_AVG_KMH = 65;
  function formatDriveTime(hours) {
    const minutes = Math.max(30, Math.round(hours * 60 / 10) * 10);
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h ? `${h}小时${m ? `${m}分` : ""}` : `${m}分钟`;
  }
  function driveLeg(from, to) {
    const km = Math.max(1, Math.round(geoKm(from.coord, to.coord) * DRIVE_ROAD_FACTOR / 10) * 10);
    const hours = km / DRIVE_AVG_KMH;
    return { km, hours, label: `约 ${km} 公里 · 约 ${formatDriveTime(hours)} 车程` };
  }
  function planPoints(plan) {
    const points = [plan.origin, ...plan.stops.map((s) => s.dest)];
    if (plan.returnToOrigin) points.push(plan.origin);
    return points;
  }
  const byId = (id) => D.destinations.find((d) => d.id === id);

  /* ---------------- 真实照片（来自 Wikimedia Commons，与参考站同源） ----------------
   * manifest.json 由下载脚本生成：{ id: {file, alt, credit, license} }
   * 封面图统一命名 images/<id>.jpg（与下载脚本一致）。
   */
  let PHOTO_META = {};
  const coverSrc = (id) => `images/${id}.jpg`;
  const photoMeta = (id) => PHOTO_META[id] || null;

  const HERO_POOL = ["guilin", "zhangjiajie", "dali", "qinghai", "daocheng", "xian", "huangshan", "jiuzhai", "lhasa"];
  const INSPO_POOL = ["guilin", "zhangjiajie", "dali", "xian", "qinghai", "huangshan", "jiuzhai", "daocheng", "lhasa", "kashgar", "sanya", "wuyuan", "chengdu", "xiamen"];

  function applyHero() {
    const heroBg = $("#heroBg"); if (!heroBg) return;
    const id = HERO_POOL.find((x) => PHOTO_META[x]) || Object.keys(PHOTO_META)[0];
    if (!id) return;
    heroBg.src = coverSrc(id);
    heroBg.alt = PHOTO_META[id].alt || "中国风光";
    const cr = $("#heroCredit");
    if (cr) cr.textContent = PHOTO_META[id].credit ? `照片：${PHOTO_META[id].credit} · ${PHOTO_META[id].license} · Wikimedia Commons` : "";
  }

  function populateInspo() {
    const strip = $("#inspoStrip"); if (!strip) return;
    const ids = INSPO_POOL.filter((x) => PHOTO_META[x]).slice(0, 6);
    if (!ids.length) return;
    strip.innerHTML = ids.map((id) => {
      const m = PHOTO_META[id];
      const name = byId(id) ? byId(id).name : id;
      return `<figure class="inspo-cell" data-id="${id}">
        <img src="${coverSrc(id)}" alt="${m.alt || name}" loading="lazy"
             onerror="this.parentNode.style.display='none'"/>
        <figcaption class="cap">${name}</figcaption>
      </figure>`;
    }).join("");
    $$("#inspoStrip .inspo-cell").forEach((cell) => {
      cell.addEventListener("click", () => { const t = $("#customize"); if (t) t.scrollIntoView({ behavior: "smooth" }); });
    });
  }

  function loadPhotos() {
    if (typeof fetch !== "function") return;
    fetch("images/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => { PHOTO_META = m || {}; applyHero(); populateInspo(); renderFootprints(); })
      .catch(() => {});
  }

  /* ---------------- 选点 + 串路线 ---------------- */
  function buildPlan() {
    // 固定路线（预设模板）：不走评分引擎，严格按序列生成
    if (state.fixed && state.fixed.length) {
      const route = [];
      for (const id of state.fixed) { const d = byId(id); if (d) route.push(d); }
      const origin = byId(state.origin) || route[0] || D.destinations[0];
      if (route.length === 0) route.push(origin);
      const raw = route.map((d) => d.baseDays || 1);
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      let alloc = raw.map((n) => Math.max(1, Math.round((n / sum) * state.days)));
      let diff = state.days - alloc.reduce((a, b) => a + b, 0);
      let i = 0;
      while (diff !== 0 && !alloc.every((n) => (diff > 0 ? n >= 4 : n <= 1))) {
        if (diff > 0 && alloc[i] < 4) { alloc[i]++; diff--; }
        else if (diff < 0 && alloc[i] > 1) { alloc[i]--; diff++; }
        i = (i + 1) % alloc.length;
      }
      const stopsWithDays = route.map((d, k) => ({ dest: d, days: alloc[k] }));
      return { origin, stops: stopsWithDays, fixed: true, returnToOrigin: state.transport === "drive" };
    }
    const cand = D.destinations.filter((d) => d.id !== state.origin);
    cand.forEach((d) => (d._s = scoreDest(d)));
    cand.sort((a, b) => b._s - a._s);

    // 停点数：节奏决定每站天数
    const perStop = state.pace === "slow" ? 2.6 : state.pace === "fast" ? 1.4 : 2.0;
    let stops = Math.round(state.days / perStop);
    stops = Math.max(2, Math.min(7, stops));

    // 贪心：从出发地最近的高分点起，之后每一步选"分数高且离上一站近"的
    const origin = byId(state.origin);
    const used = new Set();
    const route = [];
    let prev = origin.coord;
    const pool = cand.slice();
    for (let i = 0; i < stops; i++) {
      let best = null, bestKey = -1e9;
      for (const d of pool) {
        if (used.has(d.id)) continue;
        const km = geoKm(prev, d.coord);
        // 离上一站越近越好（避免折返），但分数权重更高
        // 自驾最后一站还要承担回到出发地的路程，避免把远端目的地随手排成终点
        const returnKm = state.transport === "drive" && i === stops - 1 ? geoKm(d.coord, origin.coord) : 0;
        const key = d._s - km / 380 - returnKm / 380;
        if (key > bestKey) { bestKey = key; best = d; }
      }
      if (!best) break;
      route.push(best); used.add(best.id); prev = best.coord;
    }
    if (route.length === 0) route.push(cand[0]);

    // 把总天数摊到各站
    const raw = route.map((d) => {
      let n = state.pace === "slow" ? d.baseDays : state.pace === "fast" ? 1 : Math.max(1, Math.round(d.baseDays * 0.7));
      return Math.max(1, n);
    });
    let sum = raw.reduce((a, b) => a + b, 0);
    // 按比例缩放到目标天数
    let alloc = raw.map((n) => Math.max(1, Math.round((n / sum) * state.days)));
    // 修正取整误差
    let diff = state.days - alloc.reduce((a, b) => a + b, 0);
    let idx = 0;
    while (diff !== 0) {
      if (diff > 0 && alloc[idx] < 4) { alloc[idx]++; diff--; }
      else if (diff < 0 && alloc[idx] > 1) { alloc[idx]--; diff++; }
      idx = (idx + 1) % alloc.length;
      if (alloc.every((n) => n === (diff > 0 ? 4 : 1))) break;
    }

    const stopsWithDays = route.map((d, i) => ({ dest: d, days: alloc[i] }));
    return { origin, stops: stopsWithDays, returnToOrigin: state.transport === "drive" };
  }

  /* ---------------- 渲染：行程头 ---------------- */
  function renderHead(plan) {
    const regions = new Set(plan.stops.map((s) => s.dest.region));
    const regionName = regions.size === 1 ? D.REGIONS[[...regions][0]].name : "环游";
    const routePoints = planPoints(plan);
    const seq = routePoints.map((d, i) => plan.returnToOrigin && i === routePoints.length - 1 ? `${d.name}（返程）` : d.name).join(" → ");
    const totalDays = plan.stops.reduce((a, b) => a + b.days, 0);
    const totalKm = routePoints.slice(1).reduce((sum, d, i) => sum + geoKm(routePoints[i].coord, d.coord), 0);

    const title = state.presetLabel ? state.presetLabel : `${totalDays}天，慢游中国 · ${regionName}线`;
    $("#tripTitle").innerHTML = title;
    $("#tripSub").textContent = seq;
    const fill = $("#progFill");
    fill.style.width = "0%";
    requestAnimationFrame(() => { setTimeout(() => (fill.style.width = "100%"), 80); });
    if (plan.returnToOrigin) {
      const legs = routePoints.slice(1).map((d, i) => driveLeg(routePoints[i], d));
      const driveKm = legs.reduce((sum, leg) => sum + leg.km, 0);
      const driveHours = legs.reduce((sum, leg) => sum + leg.hours, 0);
      $("#progLbl").textContent = `自驾约 ${driveKm} 公里 · 约 ${formatDriveTime(driveHours)} 车程 · ${plan.stops.length} 站 · 回到起点`;
    } else {
      $("#progLbl").textContent = `全程约 ${Math.round(totalKm)} 公里 · ${plan.stops.length} 站`;
    }
  }

  /* ---------------- 渲染：地图 ---------------- */
  function setMapActive(index) {
    const stop = $("#mapStops .map-stop[data-stop-index=\"" + index + "\"]");
    const cityIndex = stop ? +(stop.dataset.cityIndex || index) : index;
    $$("#mapSvg .city").forEach((c) => c.classList.toggle("now", +c.dataset.i === cityIndex));
    $$("#mapStops .map-stop").forEach((stop) => stop.classList.toggle("now", +stop.dataset.stopIndex === index));
    if (stop) $("#mapNow").textContent = stop.querySelector("strong").textContent;
  }

  function renderMap(plan) {
    const routePoints = planPoints(plan).map((dest, i, points) => ({
      dest,
      kind: i === 0 ? "origin" : (plan.returnToOrigin && i === points.length - 1 ? "return" : "stop"),
    }));
    const pts = routePoints.map((p) => p.dest);
    const coords = pts.map((d) => project(d.coord[0], d.coord[1]));
    // 国界
    const bnd = D.chinaBoundary.map((p) => project(p[0], p[1]).join(",")).join(" ");
    const hainan = `<ellipse class="cn-isl" cx="${project(D.hainan.center[0], D.hainan.center[1])[0]}" cy="${project(D.hainan.center[0], D.hainan.center[1])[1]}" rx="14" ry="13"/>`;
    const taiwan = `<ellipse class="cn-isl" cx="${project(D.taiwan.center[0], D.taiwan.center[1])[0]}" cy="${project(D.taiwan.center[0], D.taiwan.center[1])[1]}" rx="9" ry="16"/>`;

    // 网格
    let grid = "";
    for (let lng = 80; lng <= 130; lng += 10) { const [x] = project(lng, 0); grid += `<line class="grid" x1="${x}" y1="${MAP.pad}" x2="${x}" y2="${MAP.h - MAP.pad}"/>`; }
    for (let lat = 25; lat <= 50; lat += 10) { const [, y] = project(0, lat); grid += `<line class="grid" x1="${MAP.pad}" y1="${y}" x2="${MAP.w - MAP.pad}" y2="${y}"/>`; }

    // 足迹（淡橄榄点）
    let foots = "";
    D.footprints.forEach((f) => {
      const coord = f.coord || (f.id ? (byId(f.id) || {}).coord : null);
      if (!coord) return;
      const [x, y] = project(coord[0], coord[1]);
      foots += `<circle class="foot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`;
    });

    // 路线
    const dAttr = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ");
    let cities = "";
    let stops = "";
    coords.forEach((c, i) => {
      const point = routePoints[i];
      const isOrigin = point.kind === "origin";
      const isReturn = point.kind === "return";
      const d = pts[i];
      const cls = "city" + (isOrigin ? " done" : "");
      const label = d.name.replace(/\s*\(.*\)/, "");
      if (!isReturn) {
        const crowded = coords.slice(0, i).some((p) => dist(c, p) < 38);
        const side = crowded && i % 2 ? -1 : 1;
        const dx = side < 0 ? -12 : 12;
        const dy = crowded ? (i % 2 ? 18 : -18) : -12;
        const labelWidth = Math.max(44, label.length * 10 + 16);
        const boxX = side < 0 ? dx - labelWidth : dx;
        const textX = side < 0 ? dx - 8 : dx + 8;
        const anchor = side < 0 ? "end" : "start";
        cities += `<circle class="${cls}" data-i="${i}" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="8.5"/>`;
        cities += `<text class="city-number" x="${c[0].toFixed(1)}" y="${(c[1] + 3.5).toFixed(1)}" text-anchor="middle">${i + 1}</text>`;
        cities += `<g class="city-label" transform="translate(${c[0].toFixed(1)} ${c[1].toFixed(1)})"><rect x="${boxX}" y="${dy - 17}" width="${labelWidth}" height="23" rx="7"/><text x="${textX}" y="${dy}" text-anchor="${anchor}">${label}</text></g>`;
      }
      const stopLabel = isReturn ? `返回 ${label}` : label;
      const leg = i > 0 && plan.returnToOrigin ? driveLeg(pts[i - 1], d) : null;
      const stopSub = isOrigin
        ? "出发地"
        : isReturn
          ? `最后一天返程 · ${leg.label}`
          : plan.returnToOrigin
            ? `第 ${i} 站 · ${leg.label}`
            : "第 " + i + " 站";
      const cityIndex = isReturn ? 0 : i;
      stops += `<li><button type="button" class="map-stop${isOrigin ? " now" : ""}${isReturn ? " return" : ""}" data-stop-index="${i}" data-city-index="${cityIndex}"><span class="stop-no">${String(i + 1).padStart(2, "0")}</span><span class="stop-copy"><strong>${stopLabel}</strong><small>${stopSub}</small></span></button></li>`;
    });

    $("#mapSvg").innerHTML =
      `<polygon class="cn-land" points="${bnd}"/>${hainan}${taiwan}${grid}${foots}` +
      `<path class="route" d="${dAttr}"/><path class="route drawn" d="${dAttr}"/>${cities}`;
    $("#mapStops").innerHTML = stops;
    const mapNote = $("#mapNote");
    if (mapNote) {
      mapNote.textContent = plan.returnToOrigin
        ? "自驾公里数与车程按城市间道路距离估算，不含堵车、停车和景区接驳；出发前请再用导航确认。"
        : "编号对应地图上的停靠点。橄榄色小点，是我们已经走过的地方。";
    }
    $$("#mapStops .map-stop").forEach((stop) => stop.addEventListener("click", () => setMapActive(+stop.dataset.stopIndex)));
    setMapActive(0);
  }

  /* ---------------- 渲染：每日卡片 ---------------- */
  function buildDays(plan) {
    const days = [];
    let dayNo = 1;
    plan.stops.forEach((stop, si) => {
      const d = stop.dest;
      const n = stop.days;
      const arrivalLabel = plan.returnToOrigin
        ? ` · ${driveLeg(si === 0 ? plan.origin : plan.stops[si - 1].dest, d).label}`
        : "";
      // 拆分亮点到若干天
      const fixed = d.highlights.filter((h) => h.fixed);
      const opt = d.highlights.filter((h) => !h.fixed);
      const cardCount = n >= 2 ? Math.min(2, n) : 1;
      if (cardCount === 1) {
        days.push({ no: dayNo++, stop: si, destId: d.id, city: d.name, sub: `${d.city} · 全程 ${stop.days} 天${arrivalLabel}`, tags: d.tags, items: d.highlights, food: d.food, photo: d.photo, story: d.story });
      } else {
        const half = Math.ceil(d.highlights.length / 2);
        days.push({ no: dayNo++, stop: si, destId: d.id, city: d.name + "（上）", sub: `${d.city} · 第 1/${n} 天${arrivalLabel}`, tags: d.tags, items: d.highlights.slice(0, half), food: d.food, photo: d.photo, story: d.story });
        days.push({ no: dayNo++, stop: si, destId: d.id, city: d.name + "（下）", sub: `${d.city} · 第 2/${n} 天`, tags: d.tags, items: d.highlights.slice(half), food: d.food, photo: d.photo, story: d.story });
      }
    });
    if (plan.returnToOrigin && days.length) {
      const lastStop = plan.stops[plan.stops.length - 1].dest;
      days[days.length - 1].returnLeg = { city: plan.origin.name, ...driveLeg(lastStop, plan.origin) };
    }
    return days;
  }

  function renderDays(plan) {
    const days = buildDays(plan);
    const view = state.view;
    const list = $("#dayList");
    list.innerHTML = "";

    days.forEach((day) => {
      const card = document.createElement("div");
      card.className = "day-card";
      card.dataset.stop = day.stop;

      const tagsHtml = day.tags.slice(0, 4).map((t) => `<span class="t">${t}</span>`).join("");

      let bodyInner = "";
      let coverHtml = "";
      if (view === "route") {
        bodyInner = `<div class="timeline">` + day.items.map((h) => tlItem(h)).join("") + `</div>`;
      } else if (view === "photo") {
        const id = day.destId;
        const m = photoMeta(id);
        let fig = "";
        if (m) {
          fig = `<figure class="photo-fig">
              <img src="${coverSrc(id)}" alt="${m.alt || day.city}" loading="lazy" onerror="this.style.display='none'"/>
              <figcaption><span class="cap">${m.alt || day.city}</span>
                <span class="cr">照片：${m.credit} · ${m.license} · <a href="https://commons.wikimedia.org/wiki/Category:China" target="_blank" rel="noopener">Wikimedia Commons</a></span>
              </figcaption>
            </figure>`;
        }
        const tips = day.photo.length
          ? `<div class="sec-h">出片机位（文字参考）</div><div class="gallery">` +
            day.photo.map((p) => `<div class="gitem"><div class="gt"><span class="mk">📷</span>${p.name}</div><div class="gn">${p.note}</div></div>`).join("") + `</div>`
          : "";
        bodyInner = fig + tips;
      } else if (view === "food") {
        bodyInner = `<div class="sec-h">吃喝清单</div><div class="gallery">` +
          day.food.map((f) => `<div class="gitem"><div class="gt"><span class="mk">🍜</span>${f.name}</div><div class="gn">${f.note}</div></div>`).join("") + `</div>`;
      } else if (view === "story") {
        bodyInner = `<div class="story-block"><span class="dayname">${day.city}</span>${day.story}</div>`;
      }
      if (day.returnLeg) {
        bodyInner += `<div class="return-leg"><span class="return-label">自驾返程</span><strong>最后一天返回${day.returnLeg.city}</strong><p>${day.returnLeg.label}。已把回到出发地的路程计入路线；出发前再确认还车、加油和高速时间。</p></div>`;
      }

      // 封面图：除"出片"视图外，每个卡片顶部配一张真实旅行照
      if (view !== "photo" && day.destId) {
        const m = photoMeta(day.destId);
        coverHtml = `<div class="dc-cover">
            <img src="${coverSrc(day.destId)}" alt="${m ? m.alt : day.city}" loading="lazy" onerror="this.parentNode.style.display='none'"/>
            <div class="dc-cap">${m ? m.alt : day.city}</div>
          </div>`;
      }

      card.innerHTML =
        `${coverHtml}
         <div class="dc-head">
           <div class="dc-no">D${day.no}<small>DAY</small></div>
           <div>
             <div class="dc-title">${day.city}</div>
             <div class="dc-sub">${day.sub}</div>
           </div>
           <div class="dc-tags">${tagsHtml}</div>
         </div>
         <div class="dc-body">${bodyInner}</div>`;
      list.appendChild(card);

      // 点击卡片 -> 高亮地图对应城市
      card.addEventListener("click", () => setMapActive(day.stop + 1));
    });

    // 入场动画
    $$("#dayList .day-card").forEach((c, i) => setTimeout(() => c.classList.add("in"), 60 * i + 40));
  }

  function tlItem(h) {
    const cls = h.fixed ? "fixed" : "opt";
    const flag = h.fixed
      ? `<span class="tl-flag fixed">团上安排</span>`
      : `<span class="tl-flag opt">有空可以这样加</span>`;
    return `<div class="tl-item ${cls}">
        <div class="tl-time">${h.time}</div>
        <div class="tl-title">${h.title}${flag}</div>
        <div class="tl-note">${h.note}</div>
      </div>`;
  }

  /* ---------------- 渲染：贴士 ---------------- */
  function renderTips(plan) {
    const c = state.constraints;
    const tips = [];
    if (c.has("kids")) tips.push("带娃出行：每天预留午休，行李里常备退烧药、退烧贴与小朋友熟悉的小零食。");
    if (c.has("elder")) tips.push("同行的长辈：节奏放更慢，多选有缆车/电瓶车的景区，避免连续爬山。");
    if (c.has("nohike")) tips.push("不爬山：已自动避开需要大量攀爬的景区，多选古城、湖区与平原线路。");
    if (c.has("noplateau")) tips.push("不去高原：已排除海拔 3000m+ 的目的地，安心玩。");
    if (state.month !== "auto") {
      const m = +state.month;
      if ([12, 1, 2].includes(m)) tips.push("冬季：北方干冷、南方湿冷，保湿与保暖都要做足；东北/三亚反差极大。");
      else if ([6, 7, 8].includes(m)) tips.push("夏季：南方多雨闷热，随身带伞与驱蚊；高原/草原白天晒、夜里凉。");
      else tips.push("春秋最舒服：昼夜温差仍在，备一件外套，拍照光线也最柔。");
    }
    if (plan.returnToOrigin) {
      const lastStop = plan.stops[plan.stops.length - 1];
      tips.push(`交通：这是闭环自驾路线，最后一天从${lastStop ? lastStop.dest.name : "途中"}返回${plan.origin.name}；热门景区门票尽量提前在官方渠道预约。`);
    } else {
      tips.push("交通：长途优先高铁/飞机，市内用打车+地铁；热门景区门票尽量提前在官方渠道预约。");
    }
    tips.push("节奏：把'团上安排'当主线，'有空可以这样加'留作弹性，别把每天排太满——旅行的余味在计划外。");
    $("#tipsBox").innerHTML = `<h3>出发前的小抄</h3><ul>${tips.map((t) => `<li>${t}</li>`).join("")}</ul>`;
  }

  /* ---------------- 主流程 ---------------- */
  function generate() {
    const plan = buildPlan();
    state.plan = plan;
    $("#result").classList.remove("hidden");
    renderHead(plan);
    renderMap(plan);
    renderDays(plan);
    renderTips(plan);
    // 滚动到结果
    setTimeout(() => { const el = $("#result"); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
  }

  /* ---------------- 足迹 ---------------- */
  function renderFootprints() {
    const grid = $("#fpGrid");
    grid.innerHTML = "";
    D.footprints.forEach((f) => {
      const d = f.id ? byId(f.id) : null;
      const name = f.name || (d && d.name) || f.id;
      const city = f.city || (d && d.city) || "";
      const coverPath = f.img || (d ? coverSrc(f.id) : null);
      const m = f.id ? photoMeta(f.id) : null;
      const alt = (m && m.alt) || f.alt || name;
      const card = document.createElement("div");
      card.className = "fp-card";
      const cover = coverPath
        ? `<div class="fp-cover"><img src="${coverPath}" alt="${alt}" loading="lazy" onerror="this.parentNode.classList.add('noimg'); this.style.display='none'"/></div>`
        : `<div class="fp-cover noimg"></div>`;
      card.innerHTML = `${cover}
        <div class="fp-body">
          <div class="fp-city"><span class="pin">📍</span>${name}</div>
          <div class="fp-note">${f.note}</div>
          <div class="fp-when">${f.when}${city ? " · " + city : ""}</div>
        </div>`;
      grid.appendChild(card);
    });
  }

  /* ---------------- 预设：一键生成固定路线 ---------------- */
  function applyPreset(key) {
    const p = (D.presets || []).find((x) => x.key === key);
    if (!p) return;
    const f = p.form || {};
    state.origin = f.origin || "beijing";
    state.days = f.days || 7;
    state.month = f.month || "auto";
    state.budget = f.budget || "mid";
    state.pace = f.pace || "mid";
    state.transport = f.transport || "any";
    state.tags = new Set(f.tags || []);
    state.constraints = new Set(f.constraints || []);
    state.fixed = p.fixed || null;
    state.presetLabel = p.label || null;
    syncUI();
    generate();
  }

  function syncUI() {
    const set = (sel, val) => { const el = $(sel); if (el && val != null) el.value = val; };
    set("#origin", state.origin);
    set("#days", state.days);
    set("#month", state.month);
    set("#budget", state.budget);
    set("#transport", state.transport);
    $$(".seg button[data-pace]").forEach((b) => {
      const on = b.dataset.pace === state.pace;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    $$(".chip[data-tag]").forEach((c) => {
      const on = state.tags.has(c.dataset.tag);
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", String(on));
    });
    $$(".chip[data-cons]").forEach((c) => {
      const on = state.constraints.has(c.dataset.cons);
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", String(on));
    });
  }

  /* ---------------- UI 绑定 ---------------- */
  function bindUI() {
    // 出发地
    const originSel = $("#origin");
    D.destinations.forEach((d) => {
      const o = document.createElement("option"); o.value = d.id; o.textContent = d.name + "（" + d.city + "）";
      originSel.appendChild(o);
    });
    originSel.value = state.origin;
    originSel.addEventListener("change", (e) => (state.origin = e.target.value));

    // 天数
    const daysInput = $("#days");
    daysInput.value = state.days;
    daysInput.addEventListener("input", (e) => (state.days = Math.max(2, Math.min(21, +e.target.value || 2))));

    // 季节
    const monthSel = $("#month");
    monthSel.addEventListener("change", (e) => (state.month = e.target.value));
    // 预算 / 交通
    $("#budget").addEventListener("change", (e) => (state.budget = e.target.value));
    $("#transport").addEventListener("change", (e) => (state.transport = e.target.value));

    // 口味标签（多选）
    $$(".chip[data-tag]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.tag;
        if (state.tags.has(t)) { state.tags.delete(t); chip.classList.remove("on"); chip.setAttribute("aria-pressed", "false"); }
        else { state.tags.add(t); chip.classList.add("on"); chip.setAttribute("aria-pressed", "true"); }
      });
    });

    // 节奏
    $$(".seg button[data-pace]").forEach((b) => {
      b.addEventListener("click", () => {
        $$(".seg button[data-pace]").forEach((x) => {
          x.classList.remove("on");
          x.setAttribute("aria-pressed", "false");
        });
        b.classList.add("on");
        b.setAttribute("aria-pressed", "true");
        state.pace = b.dataset.pace;
      });
    });

    // 约束（多选）
    $$(".chip[data-cons]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.cons;
        if (state.constraints.has(t)) { state.constraints.delete(t); chip.classList.remove("on"); chip.setAttribute("aria-pressed", "false"); }
        else { state.constraints.add(t); chip.classList.add("on"); chip.setAttribute("aria-pressed", "true"); }
      });
    });

    // tabs
    $$(".tab[data-view]").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".tab[data-view]").forEach((x) => {
          x.classList.remove("on");
          x.setAttribute("aria-selected", "false");
        });
        tab.classList.add("on");
        tab.setAttribute("aria-selected", "true");
        state.view = tab.dataset.view;
        if (state.plan) renderDays(state.plan);
      });
    });

    // 生成（手动：清掉预设，走评分引擎）
    $("#genBtn").addEventListener("click", () => { state.fixed = null; state.presetLabel = null; generate(); });

    // 回到顶部
    const totop = $("#totop");
    totop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    // 默认 pace 高亮
    $('.seg button[data-pace="mid"]').classList.add("on");

    // 路线灵感预设
    const bar = $("#presetBar");
    if (bar && D.presets && D.presets.length) {
      bar.innerHTML = D.presets.map((p) =>
        `<button class="preset-btn" data-preset="${p.key}" title="${p.desc}">
           <span class="pl">${p.label}</span><span class="pd">${p.desc}</span>
         </button>`).join("");
      $$("#presetBar .preset-btn").forEach((b) =>
        b.addEventListener("click", () => applyPreset(b.dataset.preset)));
    }
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    loadPhotos();          // 拉取照片清单 -> 设置 Hero 封面 / 灵感相册 / 足迹配图
    renderFootprints();    // 先出文字版，照片到位后 loadPhotos 内会重渲染
    // 用观察器处理首屏状态与回顶按钮，避免每一帧读取 scrollY。
    const hero = $(".hero");
    const totop = $("#totop");
    if (hero && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(([entry]) => {
        hero.classList.toggle("scrolled", !entry.isIntersecting);
        totop.classList.toggle("show", !entry.isIntersecting);
      }, { threshold: 0.08 });
      observer.observe(hero);
    }
  });
})();
