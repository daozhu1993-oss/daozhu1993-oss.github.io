// Independent, stateless intake. Suggestions never mutate the confirmed trip.
import { PlannerError, normalizeBrief } from './engine.mjs';

const stringLimits = { origin: 80, destination: 120, transport: 12, drivingOrigin: 80, startDate: 10, departureTime: 5, dayEnd: 5, returnBy: 5, pace: 8, accommodation: 200, notes: 800 };
const numeric = ['days', 'adults', 'maxDriveHours', 'maxDriveKm', 'budgetCny'];
const arrays = ['childrenAges', 'elderAges', 'mustVisit', 'avoid', 'interests', 'constraints'];
const fields = new Set([...Object.keys(stringLimits), ...numeric, ...arrays, 'lastDayReturnOnly']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const invalid = message => { throw new PlannerError(message, 400); };

function checkedFields(value, now) {
  if (!object(value)) invalid('需求须为有效对象。');
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (!fields.has(key)) invalid('需求包含不支持的字段。');
    if (key in stringLimits && (typeof item !== 'string' || item.length > stringLimits[key])) invalid('需求文字过长或格式无效。');
    if (numeric.includes(key) && !(['budgetCny', 'maxDriveKm'].includes(key) && item === null) && (typeof item !== 'number' || !Number.isFinite(item))) invalid('数字条件格式无效。');
    if (arrays.includes(key) && (!Array.isArray(item) || item.length > 6)) invalid('年龄或偏好每项最多填写6条。');
    if (key === 'lastDayReturnOnly' && typeof item !== 'boolean') invalid('返程选项格式无效。');
    if (key === 'pace' && !['slow', 'mid', 'fast'].includes(item)) invalid('旅行节奏格式无效。');
    if (key === 'transport' && !['drive', 'flight-drive'].includes(item)) invalid('交通方式格式无效。');
    if (key === 'constraints' && item.some(v => !['nohike', 'noplateau'].includes(v))) invalid('限制条件格式无效。');
    clean[key] = item;
  }
  // Reuse the planning boundary; temporary placeholders are never returned or sent to the model.
  normalizeBrief({ origin: '待确认', destination: '待确认', drivingOrigin: '待确认取车城市', startDate: new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10),
    days: 3, adults: 2, maxDriveHours: 4, ...clean }, now);
  return clean;
}

export async function clarifyBrief(input, tools, now = new Date()) {
  if (!object(input) || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 800) invalid('请用1—800字描述这次旅行。');
  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > 4 || history.some(v => typeof v !== 'string' || !v.trim() || v.length > 800)) invalid('对话过长，请分次补充。');
  const current = checkedFields(input.current ?? {}, now);
  const result = await tools.model('intake', { current, message: input.message.trim(), history,
    today: new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10) });
  try {
    if (!object(result) || !Array.isArray(result.changes) || result.changes.length > fields.size || !Array.isArray(result.questions) || result.questions.length > 2 ||
      result.questions.some(v => typeof v !== 'string' || !v.trim() || v.length > 240)) throw new Error();
    const patch = {}, evidence = [];
    for (const change of result.changes) {
      if (!object(change) || !fields.has(change.field) || Object.hasOwn(patch, change.field) || typeof change.evidence !== 'string' ||
        !change.evidence.trim() || change.evidence.length > 800 || ![input.message, ...history].some(v => v.includes(change.evidence))) throw new Error();
      if (change.field === 'constraints' && Array.isArray(change.value)) {
        const explicit = { nohike: /(?:不(?:想|要|能)?|避免|避开)(?:爬山|登山|徒步)/, noplateau: /(?:不(?:想|要|能)?(?:去|上)?|避开|避免)(?:高原|高海拔)/ };
        // A quoted destination is evidence of a destination, not of an invented travel restriction.
        for (const limit of change.value.filter(v => !(current.constraints || []).includes(v))) {
          if (!explicit[limit]?.test(change.evidence) || /(?:不是|并非|不必|不用|无需).{0,6}(?:爬山|登山|徒步|高原|高海拔)/.test(change.evidence)) throw new Error();
        }
      }
      patch[change.field] = change.value;
      evidence.push({ field: change.field, quote: change.evidence });
    }
    checkedFields({ ...current, ...patch }, now);
    return { status: 'draft', patch, evidence, questions: result.questions, requiresConfirmation: true };
  } catch { throw new PlannerError('整理结果有不明确或无效的条件，未修改需求。请补充说明，或直接填写右侧表单。', 502); }
}
