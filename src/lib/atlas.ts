import { atlasWidth, atlasHeight, project } from './network';
export type WorldPolygons = [number, number][][][];
let baseMap: Promise<WorldPolygons> | undefined;
export function loadWorld() {
  return baseMap ??= fetch('data/world-polygons.json').then(response => {
    if (!response.ok) throw new Error('Unable to load the world map.');
    return response.json() as Promise<WorldPolygons>;
  }).catch(error => { baseMap = undefined; throw error; });
}
// Natural Earth vector land fills; borders are rendered separately as geometry.
export function drawAtlas(polygons: WorldPolygons, infrastructure: boolean, maxTextureSize = 8192) {
  const resolution = Math.min(2, maxTextureSize / atlasWidth, maxTextureSize / atlasHeight);
  const canvas = document.createElement('canvas'); canvas.width = Math.round(atlasWidth * resolution); canvas.height = Math.round(atlasHeight * resolution);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(canvas.width / atlasWidth, canvas.height / atlasHeight);
  ctx.fillStyle = '#b9e5f6'; ctx.fillRect(0, 0, atlasWidth, atlasHeight);
  ctx.fillStyle = '#ffffff';
  for (const polygon of polygons) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([lon, lat], i) => { const p = project(lon, lat); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  if (infrastructure) {
    ctx.fillStyle = '#7069ba25';
    [[115, 10, 29, 57], [143, -19, 22, 34]].forEach(([lon, lat, rx, ry]) => {
      const p = project(lon, lat); ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx / 360 * atlasWidth, ry / 180 * atlasHeight, 0, 0, Math.PI * 2); ctx.fill();
    });
  }
  return canvas;
}
