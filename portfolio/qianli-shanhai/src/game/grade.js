/** 品第只看这一局：失败次数和用时。代笔不给品第。 */
export function gradeFlow({ fails, ms, ghost }) {
  if (ghost) return null;
  if (fails <= 0 && ms <= 60000) return '神品';
  if (fails <= 2) return '妙品';
  return '能品';
}
