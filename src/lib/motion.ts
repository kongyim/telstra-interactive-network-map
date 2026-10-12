// Adapted from the supplied Globe.update / SceneService tween timings.
export const MORPH_MS = 600;
export const SETTLE_MS = 600;
export const ALIGN_MS = 400;
export const TAU = Math.PI * 2;
export const MAX_GLOBE_ZOOM = 2.5;
// Match the globe's central geographic scale at maximum zoom on landscape screens.
// Its surface is one unit nearer than its centre: map zoom = pi / (2*tan(fov/2)*(distance-1)).
const maxGlobeDistance = 1.2 / Math.sin(19 * Math.PI / 180) / MAX_GLOBE_ZOOM;
export const MAX_MAP_ZOOM = Math.round(Math.PI / (2 * Math.tan(19 * Math.PI / 180) * (maxGlobeDistance - 1)) * 10) / 10;
export const FLAT_WIDTH = TAU;
export const FLAT_HEIGHT = Math.PI;
export const INITIAL_YAW = -115 * Math.PI / 180;
export const INITIAL_PITCH = 8 * Math.PI / 180;
export const INITIAL_MAP_X = -115 / 360;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const easeOut = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrapAngle = (n: number) => ((n + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const nearestAngle = (n: number, reference: number) => reference + wrapAngle(n - reference);
export function morphVertex(u: number, v: number, rate: number): [number, number, number] {
  const x = (u - .5) * FLAT_WIDTH;
  const y = (v - .5) * FLAT_HEIGHT;
  const longitude = (u - .5) * TAU;
  const latitude = (v - .5) * Math.PI;
  const distance = Math.hypot(x, y) / Math.hypot(FLAT_WIDTH / 2, FLAT_HEIGHT / 2);
  const blend = Math.pow(clamp(rate, 0, 1), distance ** 3 + 1);
  return [
    lerp(x, Math.sin(longitude) * Math.cos(latitude), blend),
    lerp(y, Math.sin(latitude), blend),
    Math.cos(longitude) * Math.cos(latitude) * blend,
  ];
}
// Match the old 0.95 angular decay at a 15ms frame without refresh-rate dependence.
export const spinDecay = (dt: number) => Math.pow(.95, dt / 15);
