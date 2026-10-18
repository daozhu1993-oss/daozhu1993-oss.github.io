export const asset = (path) => `${import.meta.env.BASE_URL}${String(path).replace(/^\//, '')}`;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function worldToScreen(wx, wy, camera, viewW, viewH) {
  const vw = camera.visibleWidth();
  const vh = camera.visibleHeight();
  const sx = (wx - (camera.x - vw / 2)) / vw * viewW;
  const sy = viewH - (wy - (camera.y - vh / 2)) / vh * viewH;
  return { x: sx, y: sy };
}

export function screenToWorld(sx, sy, camera, viewW, viewH) {
  const vw = camera.visibleWidth();
  const vh = camera.visibleHeight();
  return {
    x: camera.x - vw / 2 + (sx / viewW) * vw,
    y: camera.y - vh / 2 + (1 - sy / viewH) * vh,
  };
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function cnCount(n) {
  if (n >= 0 && n <= 10) return CN[n];
  return String(n);
}

export function formatDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}′${String(r).padStart(2, '0')}″`;
}

export function tryImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
