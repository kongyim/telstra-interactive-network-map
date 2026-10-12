'use client';
import { useEffect, useRef, useState } from 'react';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import * as THREE from 'three';
import { drawAtlas, loadWorld } from '@/lib/atlas';
import { DragVelocity } from '@/lib/drag-velocity';
import { Cartography } from '@/lib/cartography';
import { NetworkOverlays } from '@/lib/network-overlays';
import { atlasWidth, atlasHeight, type Layers, type ViewMode } from '@/lib/network';
import { MAX_MAP_ZOOM, MAX_GLOBE_ZOOM, ALIGN_MS, MORPH_MS, SETTLE_MS, FLAT_WIDTH, FLAT_HEIGHT, INITIAL_YAW, INITIAL_PITCH, INITIAL_MAP_X, clamp, easeOut, lerp, wrapAngle, nearestAngle, morphVertex, spinDecay } from '@/lib/motion';

export type MapProps = {
  mode: ViewMode; layers: Layers; country: string; selected: string | null;
  onSelect: (id: string) => void; selectedRoute: string | null; onSelectRoute: (id: string) => void; zoom: number; onZoom: (value: number) => void;
  reset: number; welcome?: boolean;
};
type Pose = { rate: number; yaw: number; pitch: number; panX: number; panY: number; zoom: number };
type Transition = { from: Pose; target: ViewMode; start: number };

export default function NetworkMap(props: MapProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const commands = useRef({ redraw: () => {}, changeMode: () => {}, zoom: () => {}, reset: () => {} });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Both renderers live for the component lifetime. Three.js owns the real mesh
  // deformation and all network objects; Pixi supplies only the settled flat basemap.
  useEffect(() => {
    const element = host.current!;
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const initialize = async () => {
      const image = await loadWorld();
      if (disposed) return;
      const pixi = new Application();
      await pixi.init({ backgroundAlpha: 0, antialias: true, autoDensity: true, autoStart: false, resolution: Math.min(devicePixelRatio, 2), width: element.clientWidth, height: element.clientHeight });
      if (disposed) { pixi.destroy(true); return; }
      cleanups.push(() => pixi.destroy(true, { children: true }));
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      cleanups.push(() => { renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); });
      pixi.canvas.dataset.renderer = 'pixi';
      renderer.domElement.dataset.renderer = 'three';
      element.append(pixi.canvas, renderer.domElement);
      let infrastructure = latest.current.layers.infrastructure;
      const atlas = () => drawAtlas(image, infrastructure, renderer.capabilities.maxTextureSize);
      let canvas = atlas();
      let pixiTexture = Texture.from(canvas);
      let globeTexture = new THREE.CanvasTexture(canvas);
      globeTexture.colorSpace = THREE.SRGBColorSpace;
      globeTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      cleanups.push(() => { pixiTexture.destroy(true); globeTexture.dispose(); });
      const world = new Container(); pixi.stage.addChild(world);
      const sprites = [-1, 0, 1].map(i => { const s = new Sprite(pixiTexture); s.width = atlasWidth; s.height = atlasHeight; s.x = i * atlasWidth; world.addChild(s); return s; });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
      const geometry = new THREE.PlaneGeometry(FLAT_WIDTH, FLAT_HEIGHT, 128, 64);
      (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
      const material = new THREE.MeshBasicMaterial({ map: globeTexture, side: THREE.DoubleSide });
      const surface = new THREE.Mesh(geometry, material);
      const group = new THREE.Group(); group.add(surface); scene.add(group);
      const cartography = new Cartography(image); group.add(cartography.group);
      cleanups.push(() => cartography.dispose());
      const overlays = new NetworkOverlays(); group.add(overlays.group);
      overlays.setState(latest.current.layers, latest.current.country, latest.current.selected, latest.current.selectedRoute);
      cleanups.push(() => overlays.dispose());
      // Repeated flat neighbours cover dateline panning, just like the Pixi atlas.
      const neighbours = [-1, 1].map(i => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FLAT_WIDTH, FLAT_HEIGHT), material); mesh.position.x = i * FLAT_WIDTH; group.add(mesh); return mesh; });
      const rimMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { opacity: { value: .43 } }, vertexShader: 'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}', fragmentShader: 'uniform float opacity; varying vec3 n; varying vec3 v; void main(){float edge=pow(1.0-max(dot(normalize(n),normalize(v)),0.0),5.0);gl_FragColor=vec4(.12,.23,.27,edge*opacity);}' });
      const rim = new THREE.Mesh(new THREE.SphereGeometry(1.001, 96, 64), rimMaterial); group.add(rim);
      cleanups.push(() => { geometry.dispose(); material.dispose(); neighbours.forEach(n => n.geometry.dispose()); rim.geometry.dispose(); rimMaterial.dispose(); });
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      const pose: Pose = { rate: latest.current.mode === 'globe' ? 1 : 0, yaw: INITIAL_YAW, pitch: INITIAL_PITCH, panX: INITIAL_MAP_X, panY: 0, zoom: latest.current.zoom };
      if (!pose.rate) { pose.yaw = 0; pose.pitch = 0; }
      let transition: Transition | null = null;
      let lastRate = -1, width = 1, height = 1, scale = 1, angularVelocity = 0, pitchVelocity = 0, mapVelocity = 0, mapYVelocity = 0;
      const dragVelocity = new DragVelocity();
      let activePointer: number | null = null, anchor: THREE.Vector3 | null = null;
      let previous = { x: 0, y: 0, time: 0 }, start = { x: 0, y: 0 }, moved = false;
      const pointers = new Map<number, { x: number; y: number }>();
      let pinchDistance = 0, pinchZoom = 1, edgeDragging = false;
      let lastDragRelease = -Infinity, wheelCarry = 0;
      let previousTime = performance.now();
      const sphere = new THREE.Sphere(new THREE.Vector3(), 1), ray = new THREE.Raycaster();
      const stop = () => { angularVelocity = 0; pitchVelocity = 0; mapVelocity = 0; mapYVelocity = 0; activePointer = null; anchor = null; pointers.clear(); pinchDistance = 0; };
      const setEndpoint = (mode: ViewMode) => {
        Object.assign(pose, mode === 'globe' ? { rate: 1, yaw: INITIAL_YAW, pitch: INITIAL_PITCH, panX: 0, panY: 0, zoom: 1 } : { rate: 0, yaw: 0, pitch: 0, panX: INITIAL_MAP_X, panY: 0, zoom: 1 });
      };
      const requestMode = () => {
        const target = latest.current.mode;
        if (!transition && pose.rate === (target === 'globe' ? 1 : 0)) return;
        stop(); pose.yaw = wrapAngle(pose.yaw);
        transition = { from: { ...pose }, target, start: performance.now() };
        latest.current.onZoom(1);
        if (reducedMotion.matches) { setEndpoint(target); transition = null; }
        render();
      };
      const updateTransition = (now: number) => {
        if (!transition) return;
        const { from, target, start } = transition;
        const elapsed = now - start;
        const align = easeOut(elapsed / ALIGN_MS);
        pose.rate = lerp(from.rate, target === 'globe' ? 1 : 0, easeOut(elapsed / MORPH_MS));
        pose.yaw = lerp(from.yaw, 0, align);
        pose.pitch = lerp(from.pitch, 0, align);
        pose.panX = lerp(from.panX, 0, align);
        pose.panY = lerp(from.panY, 0, align);
        pose.zoom = lerp(from.zoom, 1, align);
        if (elapsed >= MORPH_MS) {
          const focus = easeOut((elapsed - MORPH_MS) / SETTLE_MS);
          if (target === 'globe') { pose.yaw = INITIAL_YAW * focus; pose.pitch = INITIAL_PITCH * focus; }
          else pose.panX = INITIAL_MAP_X * focus;
        }
        if (elapsed >= MORPH_MS + SETTLE_MS || reducedMotion.matches) { setEndpoint(target); transition = null; }
      };
      const updateGeometry = () => {
        if (lastRate === pose.rate) return;
        cartography.update(pose.rate);
        const positions = geometry.attributes.position, uv = geometry.attributes.uv;
        for (let i = 0; i < positions.count; i++) positions.setXYZ(i, ...morphVertex(uv.getX(i), uv.getY(i), pose.rate));
        positions.needsUpdate = true;
        geometry.computeBoundingSphere();
        lastRate = pose.rate;
      };
      const render = (draw = true) => {
        updateGeometry();
        // Flat-map zoom 1 fits the full latitude range exactly to the viewport.
        scale = height / atlasHeight * pose.zoom;
        pose.panX = ((pose.panX + .5) % 1 + 1) % 1 - .5;
        const verticalLimit = Math.max(0, (atlasHeight * scale - height) / 2);
        pose.panY = clamp(pose.panY, -verticalLimit, verticalLimit);
        const mapDistance = height / (2 * Math.tan(19 * Math.PI / 180) * scale * (atlasWidth / FLAT_WIDTH));
        const globeDistance = Math.max(1.18, (1 / Math.sin(19 * Math.PI / 180)) * Math.max(1, height / width) * 1.2 / pose.zoom);
        camera.position.set(0, 0, lerp(mapDistance, globeDistance, pose.rate));
        camera.updateMatrixWorld();
        group.rotation.set(pose.pitch, pose.yaw, 0, 'XYZ');
        group.position.set(pose.panX * FLAT_WIDTH * (1 - pose.rate), -pose.panY / scale / (atlasWidth / FLAT_WIDTH) * (1 - pose.rate), 0);
        group.updateMatrixWorld(true);
        neighbours.forEach(n => n.visible = pose.rate === 0);
        rim.visible = pose.rate > .999;
        world.scale.set(scale);
        world.position.set((width - atlasWidth * scale) / 2 + pose.panX * atlasWidth * scale, (height - atlasHeight * scale) / 2 + pose.panY);
        const flat = !transition && pose.rate === 0;
        pixi.canvas.style.visibility = flat ? 'visible' : 'hidden';
        renderer.domElement.style.visibility = 'visible';
        material.colorWrite = !flat;
        if (draw && flat) pixi.render();
        overlays.update(pose.rate, camera, width, height);
        if (draw) renderer.render(scene, camera);
        element.dataset.overlayRenderer = 'three';
        element.dataset.lineCount = String(overlays.stats.lines);
        element.dataset.markerCount = String(overlays.stats.markers);
        element.dataset.visibleMarkerCount = String(overlays.stats.visibleMarkers);
        element.parentElement?.style.setProperty('--globe-amount', String(pose.rate));
        element.dataset.transition = transition ? 'running' : 'idle';
        element.dataset.morph = pose.rate.toFixed(5);
        element.dataset.rotation = [pose.pitch, pose.yaw, 0].map(n => n.toFixed(6)).join(',');
        element.dataset.cameraDistance = camera.position.z.toFixed(6);
        element.dataset.pan = `${world.x.toFixed(3)},${world.y.toFixed(3)}`;
        element.dataset.scale = scale.toFixed(7);
      };
      const resize = () => {
        width = element.clientWidth; height = element.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height); pixi.renderer.resize(width, height);
        camera.aspect = width / height; camera.updateProjectionMatrix(); render();
      };
      const surfacePoint = (x: number, y: number) => {
        const rect = element.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera);
        return ray.ray.intersectSphere(sphere, new THREE.Vector3());
      };
      const localPoint = (worldPoint: THREE.Vector3) => worldPoint.clone().applyQuaternion(group.quaternion.clone().invert());
      // Solve the grabbed surface point under the cursor with yaw and bounded
      // pitch only. Unlike camera orbiting this keeps the geography in your hand.
      const dragGlobe = (grabbed: THREE.Vector3, end: THREE.Vector3) => {
        const yz = Math.hypot(end.y, end.z);
        const limit = pose.zoom > 2 ? Math.PI * .49 : Math.PI * .3;
        const pitch = Math.asin(clamp(grabbed.y / yz, -1, 1)) - Math.atan2(end.y, end.z);
        pose.pitch = clamp(pitch, -limit, limit);
        const unpitched = end.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), -pose.pitch);
        const yaw = Math.atan2(unpitched.x, unpitched.z) - Math.atan2(grabbed.x, grabbed.z);
        pose.yaw = nearestAngle(yaw, pose.yaw);
      };
      const select = (x: number, y: number) => {
        const rect = element.getBoundingClientRect();
        const hit = overlays.pick(x - rect.left, y - rect.top, camera, width, height, surface);
        if (hit?.kind === 'location') latest.current.onSelect(hit.id);
        else if (hit?.kind === 'route') latest.current.onSelectRoute(hit.id);
      };
      const down = (e: PointerEvent) => {
        if (transition || latest.current.welcome || e.button !== 0) return;
        const hit = pose.rate === 1 ? surfacePoint(e.clientX, e.clientY) : null;
        if (pose.rate === 1 && !hit) return;
        angularVelocity = 0; pitchVelocity = 0; mapVelocity = 0; mapYVelocity = 0; overlays.highlight(null); element.style.cursor = 'grabbing';
        wheelCarry = 0;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        element.setPointerCapture(e.pointerId);
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()]; pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); pinchZoom = pose.zoom; moved = true; anchor = null; return;
        }
        activePointer = e.pointerId; anchor = hit ? localPoint(hit) : null;
        edgeDragging = false; moved = false; start = { x: e.clientX, y: e.clientY }; previous = { ...start, time: e.timeStamp }; dragVelocity.reset(e.timeStamp);
      };
      const move = (e: PointerEvent) => {
        if (transition) return;
        if (!pointers.has(e.pointerId)) {
          if (e.pointerType === 'mouse') {
            const rect = element.getBoundingClientRect();
            const hit = overlays.pick(e.clientX - rect.left, e.clientY - rect.top, camera, width, height, surface);
            overlays.highlight(hit); element.style.cursor = hit ? 'pointer' : 'grab';
            element.dataset.hovered = hit ? `${hit.kind}:${hit.id}` : '';
          }
          return;
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size > 1) {
          const [a, b] = [...pointers.values()];
          if (pinchDistance > 0) { pose.zoom = clamp(pinchZoom * Math.hypot(a.x - b.x, a.y - b.y) / pinchDistance, latest.current.mode === 'map' ? 1 : .8, latest.current.mode === 'map' ? MAX_MAP_ZOOM : MAX_GLOBE_ZOOM); latest.current.onZoom(pose.zoom); render(); }
          return;
        }
        if (e.pointerId !== activePointer) return;
        if (e.clientX === previous.x && e.clientY === previous.y) return;
        moved ||= Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4;
        const now = e.timeStamp;
        if (anchor && pose.rate === 1) {
          const end = surfacePoint(e.clientX, e.clientY);
          const oldYaw = pose.yaw, oldPitch = pose.pitch;
          if (end && !edgeDragging) dragGlobe(anchor, end);
          else {
            // Captured drags continue beyond the globe silhouette. Keep using
            // screen deltas for this gesture so re-entering cannot snap the anchor.
            edgeDragging = true;
            const radiansPerPixel = 2 * Math.tan(19 * Math.PI / 180) * (camera.position.z - 1) / height;
            pose.yaw += (e.clientX - previous.x) * radiansPerPixel;
            const limit = pose.zoom > 2 ? Math.PI * .49 : Math.PI * .3;
            pose.pitch = clamp(pose.pitch + (e.clientY - previous.y) * radiansPerPixel, -limit, limit);
          }
          dragVelocity.add(wrapAngle(pose.yaw - oldYaw), pose.pitch - oldPitch, now);
        } else if (pose.rate === 0) {
          const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
          pose.panX += dx / (atlasWidth * scale); pose.panY += dy;
          dragVelocity.add(dx / (atlasWidth * scale), dy, now);
        }
        previous = { x: e.clientX, y: e.clientY, time: now }; render(false);
      };
      const up = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) return;
        const wasPinch = pinchDistance > 0;
        // Some devices deliver the final position only on pointerup.
        if (!wasPinch && e.pointerId === activePointer && (e.clientX !== previous.x || e.clientY !== previous.y)) move(e);
        const velocity = dragVelocity.release(e.timeStamp);
        if (pose.rate === 1) { angularVelocity = clamp(velocity[0], -8, 8); pitchVelocity = clamp(velocity[1], -4, 4); }
        else { mapVelocity = velocity[0]; mapYVelocity = velocity[1]; }
        pointers.delete(e.pointerId);
        if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
        if (wasPinch) { stop(); return; }
        if (!moved) { angularVelocity = 0; pitchVelocity = 0; mapVelocity = 0; mapYVelocity = 0; select(e.clientX, e.clientY); }
        if (reducedMotion.matches) { angularVelocity = 0; pitchVelocity = 0; mapVelocity = 0; mapYVelocity = 0; }
        if (moved) { lastDragRelease = performance.now(); wheelCarry = 0; }
        activePointer = null; anchor = null; element.style.cursor = 'grab';
      };
      const cancel = () => stop();
      const wheel = (e: WheelEvent) => {
        e.preventDefault(); if (transition || latest.current.welcome || pointers.size > 0 || e.deltaY === 0) return;
        let deltaY = e.deltaY;
        // A trackpad finger lifting after a click-drag can also emit tiny scrolls.
        // Require a deliberate scroll before changing zoom immediately after release.
        if (!e.ctrlKey && e.deltaMode === 0 && performance.now() - lastDragRelease < 200) {
          wheelCarry += deltaY;
          if (Math.abs(wheelCarry) < 12) return;
          deltaY = wheelCarry; lastDragRelease = -Infinity;
        }
        const nextZoom = clamp(pose.zoom * Math.exp(-deltaY * (e.deltaMode === 1 ? .025 : .001)), latest.current.mode === 'map' ? 1 : .8, latest.current.mode === 'map' ? MAX_MAP_ZOOM : MAX_GLOBE_ZOOM);
        if (nextZoom === pose.zoom) return;
        // Zoom changes the framing without cancelling an existing flick.
        const hit = pose.rate === 1 ? surfacePoint(e.clientX, e.clientY) : null;
        const grabbed = hit ? localPoint(hit) : null;
        const rect = element.getBoundingClientRect();
        const mapX = (e.clientX - rect.left - world.x) / scale, mapY = (e.clientY - rect.top - world.y) / scale;
        pose.zoom = nextZoom; render();
        if (grabbed) { const end = surfacePoint(e.clientX, e.clientY); if (end) dragGlobe(grabbed, end); }
        else if (pose.rate === 0) { pose.panX += (e.clientX - rect.left - (world.x + mapX * scale)) / (atlasWidth * scale); pose.panY += e.clientY - rect.top - (world.y + mapY * scale); }
        latest.current.onZoom(pose.zoom); render();
      };
      commands.current = {
        redraw: () => {
          overlays.setState(latest.current.layers, latest.current.country, latest.current.selected, latest.current.selectedRoute);
          if (infrastructure !== latest.current.layers.infrastructure) {
            infrastructure = latest.current.layers.infrastructure;
            canvas = atlas(); const oldPixi = pixiTexture, oldGlobe = globeTexture;
            pixiTexture = Texture.from(canvas); sprites.forEach(s => s.texture = pixiTexture);
            globeTexture = new THREE.CanvasTexture(canvas); globeTexture.colorSpace = THREE.SRGBColorSpace; globeTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
            material.map = globeTexture; material.needsUpdate = true; oldPixi.destroy(true); oldGlobe.dispose();
          }
          render();
        },
        changeMode: requestMode,
        zoom: () => { if (transition) { if (latest.current.zoom !== 1) latest.current.onZoom(1); return; } pose.zoom = clamp(latest.current.zoom, latest.current.mode === 'map' ? 1 : .8, latest.current.mode === 'map' ? MAX_MAP_ZOOM : MAX_GLOBE_ZOOM); render(); },
        reset: () => { stop(); transition = null; setEndpoint(latest.current.mode); latest.current.onZoom(1); render(); },
      };
      const observer = new ResizeObserver(resize); observer.observe(element);
      element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', cancel); element.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('blur', cancel);
      // A normal release must retain inertia; lost capture only cancels an active drag.
      const lost = (e: PointerEvent) => { if (pointers.has(e.pointerId)) stop(); };
      element.addEventListener('lostpointercapture', lost);
      cleanups.push(() => { observer.disconnect(); element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', cancel); element.removeEventListener('lostpointercapture', lost); element.removeEventListener('wheel', wheel); window.removeEventListener('blur', cancel); element.parentElement?.style.removeProperty('--globe-amount'); });
      resize(); setStatus('ready');
      renderer.setAnimationLoop(now => {
        const dt = Math.min(50, now - previousTime); previousTime = now;
        if (transition) updateTransition(now);
        else if (activePointer === null && !reducedMotion.matches) {
          // One gentle revolution every three minutes while the welcome globe is visible.
          if (latest.current.welcome && pose.rate === 1) pose.yaw = wrapAngle(pose.yaw + (Math.PI * 2 / 180) * dt / 1000);
          if (Math.abs(angularVelocity) > .001) { pose.yaw += angularVelocity * dt / 1000; angularVelocity *= spinDecay(dt); }
          if (Math.abs(pitchVelocity) > .001) {
            const limit = pose.zoom > 2 ? Math.PI * .49 : Math.PI * .3;
            const next = pose.pitch + pitchVelocity * dt / 1000;
            pose.pitch = clamp(next, -limit, limit);
            pitchVelocity = pose.pitch === next ? pitchVelocity * spinDecay(dt) : 0;
          }
          if (Math.abs(mapYVelocity) > .1) { pose.panY += mapYVelocity * dt / 1000; mapYVelocity *= Math.pow(.9, dt / 15); }
          if (Math.abs(mapVelocity) > .00001) { pose.panX += mapVelocity * dt / 1000; mapVelocity *= Math.pow(.9, dt / 15); }
        }
        render();
      });
    };
    initialize().catch(error => { console.error(error); cleanups.reverse().forEach(fn => fn()); cleanups.length = 0; if (!disposed) setStatus('error'); });
    return () => { disposed = true; commands.current = { redraw: () => {}, changeMode: () => {}, zoom: () => {}, reset: () => {} }; cleanups.reverse().forEach(fn => fn()); };
  }, []);
  useEffect(() => { commands.current.redraw(); }, [props.layers, props.country, props.selected, props.selectedRoute]);
  useEffect(() => { commands.current.changeMode(); }, [props.mode]);
  useEffect(() => { commands.current.zoom(); }, [props.zoom]);
  useEffect(() => { commands.current.reset(); }, [props.reset]);
  return <div ref={host} className="map-canvas" data-mode={props.mode} data-status={status} role="img" aria-label={props.mode === 'globe' ? 'Interactive 3D globe. Drag its surface to rotate.' : 'Interactive 2D world map. Drag to pan.'}>{status === 'loading' && <div className="map-message">Loading world map…</div>}{status === 'error' && <div className="map-message">Unable to render the map. Please reload.<br/>You can still explore locations in the country filter.</div>}</div>;
}
