export type Coordinate = [number, number];

// Split at ±180 before sampling. No flat segment may cross the entire atlas.
// Adjacent pieces share the same geographic seam point on the globe.
export function sampleRoute(coordinates: number[][], step = 1): Coordinate[][] {
  if (coordinates.length < 2) return [];
  const pieces: Coordinate[][] = [];
  let current: Coordinate[] = [];
  for (let i = 1; i < coordinates.length; i++) {
    const [ax, ay] = coordinates[i - 1];
    const [bx, by] = coordinates[i];
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = i === 1 ? 0 : 1; j <= count; j++) {
      const t = j / count;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const normalized = ((x + 180) % 360 + 360) % 360 - 180;
      const last = current.at(-1);
      if (last && Math.abs(normalized - last[0]) > 180) {
        const direction = normalized < last[0] ? 1 : -1;
        const edge = direction * 180;
        const continued = normalized + direction * 360;
        const fraction = (edge - last[0]) / (continued - last[0]);
        const latitude = last[1] + (y - last[1]) * fraction;
        current.push([edge, latitude]);
        if (current.length > 1) pieces.push(current);
        current = [[-edge, latitude]];
      }
      current.push([normalized, y]);
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}
