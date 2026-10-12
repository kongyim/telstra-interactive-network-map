import * as THREE from 'three';
import type { WorldPolygons } from './atlas';
import { FLAT_WIDTH, morphVertex } from './motion';

// Geographic outlines stay at screen resolution instead of enlarging JPEG pixels.
export class Cartography {
  readonly group = new THREE.Group();
  private coordinates: [number, number][] = [];
  private geometry = new THREE.BufferGeometry();
  private material = new THREE.LineBasicMaterial({ color: '#b1c4cb', transparent: true, opacity: .65, depthWrite: false });
  private copies: THREE.LineSegments[];
  private rate = -1;

  constructor(polygons: WorldPolygons) {
    const seen = new Set<string>();
    for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if (Math.abs(a[0] - b[0]) > 180) continue;
      const key = [a.join(','), b.join(',')].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      this.coordinates.push(a, b);
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.coordinates.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.copies = [-1, 0, 1].map(shift => {
      const line = new THREE.LineSegments(this.geometry, this.material);
      line.position.x = shift * FLAT_WIDTH;
      this.group.add(line);
      return line;
    });
  }

  update(rate: number) {
    if (rate === this.rate) return;
    this.rate = rate;
    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.coordinates.forEach(([lon, lat], i) => {
      const p = morphVertex((lon + 180) / 360, (lat + 90) / 180, rate);
      const longitude = lon * Math.PI / 180, latitude = lat * Math.PI / 180;
      const lift = .001;
      positions.setXYZ(i, p[0] + Math.sin(longitude) * Math.cos(latitude) * lift * rate, p[1] + Math.sin(latitude) * lift * rate, p[2] + Math.cos(longitude) * Math.cos(latitude) * lift * rate + lift * (1 - rate));
    });
    positions.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.copies.forEach((line, i) => { line.visible = i === 1 || rate === 0; });
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
