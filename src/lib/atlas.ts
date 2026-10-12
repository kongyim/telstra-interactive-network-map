import { atlasWidth, atlasHeight, project } from './network';
let baseImage: Promise<HTMLImageElement> | undefined;
export function loadWorld() {
  return baseImage ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => { baseImage = undefined; reject(new Error('Unable to load the world map.')); };
    image.src = 'assets/world.jpg';
  });
}
// Cartography only. Markers, route lines and selection are Three.js objects.
export function drawAtlas(image: HTMLImageElement, infrastructure: boolean, maxTextureSize = 8192) {
  // Preserve source detail independently of the map's logical coordinates.
  const resolution = Math.min(image.naturalWidth / atlasWidth, image.naturalHeight / atlasHeight, maxTextureSize / atlasWidth, maxTextureSize / atlasHeight);
  const canvas = document.createElement('canvas'); canvas.width = Math.round(atlasWidth * resolution); canvas.height = Math.round(atlasHeight * resolution);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(canvas.width / atlasWidth, canvas.height / atlasHeight);
  ctx.drawImage(image, 0, 0, atlasWidth, atlasHeight);
  if (infrastructure) {
    ctx.fillStyle = '#7069ba25';
    [[115, 10, 29, 57], [143, -19, 22, 34]].forEach(([lon, lat, rx, ry]) => {
      const p = project(lon, lat); ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx / 360 * atlasWidth, ry / 180 * atlasHeight, 0, 0, Math.PI * 2); ctx.fill();
    });
  }
  return canvas;
}
