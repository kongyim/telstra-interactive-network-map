import * as THREE from 'three';
import { network, type Layers, type Location } from './network';
import { FLAT_WIDTH, morphVertex } from './motion';
import { sampleRoute, type Coordinate } from './routes';

type MarkerKind = 'landing' | 'media' | 'pop' | 'centre' | 'teleport' | 'office' | 'broadcast' | 'selection';
type Route = { id: string; from: string; to: string; color: string; planned: boolean; media: boolean; coordinates: number[][] };
type LineEntry = { route: Route; coordinates: Coordinate[]; geometry: THREE.BufferGeometry; material: THREE.LineBasicMaterial; copies: THREE.Line[]; enabled: boolean };
type MarkerEntry = { location: Location; kind: MarkerKind; copies: THREE.Sprite[]; enabled: boolean };
export type OverlayHit = { kind: 'location' | 'route'; id: string };
const colors: Record<MarkerKind, string> = { landing: '#087db5', media: '#f38b24', pop: '#66c9a5', centre: '#287ad5', teleport: '#e32a91', office: '#443482', broadcast: '#18b887', selection: '#ec168c' };
const sizes: Record<MarkerKind, number> = { landing: 9, media: 9, pop: 6, centre: 19, teleport: 19, office: 13, broadcast: 13, selection: 25 };

// Small shared icon textures, used by THREE.Sprite (never painted on the map).
function iconTexture(kind: MarkerKind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colors[kind]; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
  ctx.beginPath();
  if (kind === 'selection') {
    ctx.strokeStyle = colors[kind]; ctx.lineWidth = 3; ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'centre' || kind === 'teleport') {
    ctx.moveTo(32, 61); ctx.bezierCurveTo(8, 35, 6, 25, 14, 13); ctx.bezierCurveTo(22, 0, 43, 0, 51, 13); ctx.bezierCurveTo(59, 25, 56, 35, 32, 61); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.fillStyle = 'white'; ctx.arc(32, 24, 8, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'office' || kind === 'broadcast') {
    ctx.moveTo(8, 10); ctx.lineTo(56, 10); ctx.lineTo(32, 59); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'pop') {
    ctx.fillRect(14, 14, 36, 36);
  } else {
    ctx.arc(32, 32, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.fillStyle = '#ffffff88'; ctx.arc(27, 26, 7, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function position(longitude: number, latitude: number, rate: number, lift = .003) {
  const p = new THREE.Vector3(...morphVertex((longitude + 180) / 360, (latitude + 90) / 180, rate));
  const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
  p.x += Math.sin(lon) * Math.cos(lat) * lift * rate;
  p.y += Math.sin(lat) * lift * rate;
  p.z += Math.cos(lon) * Math.cos(lat) * lift * rate + lift * (1 - rate);
  return p;
}

export class NetworkOverlays {
  readonly group = new THREE.Group();
  private tiles = [-1, 0, 1].map(shift => { const group = new THREE.Group(); group.position.x = shift * FLAT_WIDTH; this.group.add(group); return group; });
  private lines: LineEntry[] = [];
  private markers: MarkerEntry[] = [];
  private iconMaterials = new Map<MarkerKind, THREE.SpriteMaterial>();
  private rate = -1;
  private selectedRoute: string | null = null;
  private hovered: OverlayHit | null = null;
  private worldPoint = new THREE.Vector3();
  private temp = new THREE.Vector3();
  private cameraPoint = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private targets: THREE.Object3D[] = [];

  constructor() {
    this.group.name = 'network-overlays';
    const routes: Route[] = network.connections.map(route => ({ ...route, media: false }));
    network.media.forEach(route => {
      const a = network.locations.find(l => l.id === route.from)!, b = network.locations.find(l => l.id === route.to)!;
      let lon = b.longitude;
      while (lon - a.longitude > 180) lon -= 360;
      while (lon - a.longitude < -180) lon += 360;
      routes.push({ ...route, color: '#ef882b', planned: false, media: true, coordinates: [[a.longitude, a.latitude], [lon, b.latitude]] });
    });
    routes.forEach(route => sampleRoute(route.coordinates).forEach(coordinates => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coordinates.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const options = { color: route.color, depthTest: true, depthWrite: false, transparent: true, opacity: .9 };
      const material = route.planned ? new THREE.LineDashedMaterial({ ...options, dashSize: .02, gapSize: .012 }) : new THREE.LineBasicMaterial(options);
      const copies = this.tiles.map(tile => {
        const line = new THREE.Line(geometry, material); line.name = route.id; line.userData.hit = { kind: 'route', id: route.id };
        line.renderOrder = 2; tile.add(line); return line;
      });
      this.lines.push({ route, coordinates, geometry, material, copies, enabled: false });
    }));
    network.locations.forEach(location => {
      const kinds: MarkerKind[] = ['landing', 'media', 'pop', 'selection'];
      if (location.dataCentre) kinds.push('centre');
      if (location.teleport) kinds.push('teleport');
      if (location.office) kinds.push('office');
      if (location.broadcast) kinds.push('broadcast');
      kinds.forEach(kind => {
        if (!this.iconMaterials.has(kind)) this.iconMaterials.set(kind, new THREE.SpriteMaterial({ map: iconTexture(kind), sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
        const copies = this.tiles.map(tile => {
          const sprite = new THREE.Sprite(this.iconMaterials.get(kind)!);
          sprite.name = `${location.id}:${kind}`;
          if (['centre', 'teleport', 'office', 'broadcast'].includes(kind)) sprite.center.set(.5, .06);
          sprite.userData.hit = { kind: 'location', id: location.id };
          sprite.renderOrder = kind === 'selection' ? 5 : 4;
          tile.add(sprite); return sprite;
        });
        this.markers.push({ location, kind, copies, enabled: false });
      });
    });
  }

  setState(layers: Layers, country: string, selected: string | null, selectedRoute: string | null) {
    this.selectedRoute = selectedRoute;
    const countries = new Map(network.locations.map(l => [l.id, l.country]));
    this.lines.forEach(entry => {
      entry.enabled = (entry.route.media ? layers.media : layers.network) && (!country || countries.get(entry.route.from) === country || countries.get(entry.route.to) === country);
    });
    this.markers.forEach(entry => {
      const { location: l, kind } = entry;
      const inCountry = !country || l.country === country;
      const isMedia = network.media.some(route => route.from === l.id || route.to === l.id);
      const visible = layers.network || layers.pops || (layers.infrastructure && (l.dataCentre || l.teleport)) || (layers.other && l.office) || (layers.media && isMedia);
      const enabled: Record<MarkerKind, boolean> = {
        landing: layers.network, media: layers.media && isMedia, pop: layers.pops,
        centre: layers.infrastructure, teleport: layers.network || layers.infrastructure,
        office: layers.other, broadcast: layers.media, selection: selected === l.id && visible,
      };
      entry.enabled = inCountry && enabled[kind];
    });
    this.highlight(null);
  }

  highlight(hit: OverlayHit | null) {
    this.hovered = hit;
    this.lines.forEach(entry => {
      const active = entry.route.id === this.selectedRoute || (hit?.kind === 'route' && hit.id === entry.route.id);
      entry.material.color.set(active ? '#eb168d' : entry.route.color);
      entry.material.opacity = active ? 1 : .9;
    });
  }

  update(rate: number, camera: THREE.PerspectiveCamera, width: number, height: number) {
    if (this.rate !== rate) {
      this.rate = rate;
      this.lines.forEach(entry => {
        const attribute = entry.geometry.getAttribute('position') as THREE.BufferAttribute;
        entry.coordinates.forEach(([lon, lat], i) => { const p = position(lon, lat, rate); attribute.setXYZ(i, p.x, p.y, p.z); });
        attribute.needsUpdate = true; entry.geometry.computeBoundingSphere();
        if (entry.route.planned) {
          let distances = entry.geometry.getAttribute('lineDistance') as THREE.BufferAttribute | undefined;
          if (!distances) { distances = new THREE.BufferAttribute(new Float32Array(attribute.count), 1).setUsage(THREE.DynamicDrawUsage); entry.geometry.setAttribute('lineDistance', distances); }
          distances.setX(0, 0);
          for (let i = 1; i < attribute.count; i++) distances.setX(i, distances.getX(i - 1) + Math.hypot(attribute.getX(i) - attribute.getX(i - 1), attribute.getY(i) - attribute.getY(i - 1), attribute.getZ(i) - attribute.getZ(i - 1)));
          distances.needsUpdate = true;
        }
      });
      this.markers.forEach(entry => entry.copies.forEach(sprite => sprite.position.copy(position(entry.location.longitude, entry.location.latitude, rate, .005))));
    }
    const pixelsToScale = 2 * Math.tan(camera.fov * Math.PI / 360) / height;
    this.iconMaterials.forEach(material => { material.depthTest = rate < .999; });
    camera.getWorldPosition(this.cameraPoint);
    this.targets = [];
    this.tiles.forEach((tile, i) => { tile.visible = i === 1 || rate === 0; });
    this.lines.forEach(entry => entry.copies.forEach((line, i) => {
      line.visible = entry.enabled && (i === 1 || rate === 0);
      if (line.visible) this.targets.push(line);
    }));
    this.group.updateWorldMatrix(true, true);
    this.markers.forEach(entry => entry.copies.forEach((sprite, i) => {
      sprite.visible = entry.enabled && (i === 1 || rate === 0);
      if (!sprite.visible) return;
      sprite.getWorldPosition(this.worldPoint);
      // As in Point.coffee, sprites face the camera and do not sink into the
      // surface. Explicit culling keeps the far hemisphere from showing through.
      if (rate > .999 && this.worldPoint.dot(this.temp.copy(this.cameraPoint).sub(this.worldPoint)) <= 0) { sprite.visible = false; return; }
      const ndc = this.temp.copy(this.worldPoint).project(camera);
      if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 1.1 || Math.abs(ndc.y) > 1.1) { sprite.visible = false; return; }
      const hovered = this.hovered?.kind === 'location' && this.hovered.id === entry.location.id;
      const size = sizes[entry.kind] * pixelsToScale * (hovered && entry.kind !== 'selection' ? 1.15 : 1);
      sprite.scale.set(size, size, 1);
      if (entry.kind !== 'selection') this.targets.push(sprite);
    }));
    this.group.updateWorldMatrix(true, true);
  }

  pick(x: number, y: number, camera: THREE.PerspectiveCamera, width: number, height: number, surface: THREE.Mesh): OverlayHit | null {
    this.ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const depth = this.ray.intersectObject(surface, false)[0]?.distance ?? Infinity;
    this.ray.params.Line.threshold = 5 * 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.z / height;
    const hits = this.ray.intersectObjects(this.targets, false);
    const marker = hits.find(hit => hit.object instanceof THREE.Sprite);
    if (marker) return marker.object.userData.hit as OverlayHit;
    const route = hits.find(hit => hit.distance <= depth + .02);
    return route ? route.object.userData.hit as OverlayHit : null;
  }

  get stats() {
    return { lines: this.lines.filter(l => l.enabled).length, markers: this.markers.filter(m => m.enabled && m.kind !== 'selection').length, visibleMarkers: this.markers.reduce((n, m) => n + m.copies.filter(s => s.visible).length, 0) };
  }

  dispose() {
    this.lines.forEach(entry => { entry.geometry.dispose(); entry.material.dispose(); });
    this.iconMaterials.forEach(material => { material.map?.dispose(); material.dispose(); });
    this.group.removeFromParent(); this.group.clear(); this.targets = [];
  }
}
