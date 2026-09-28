# Telstra Network & Infrastructure

A frontend-only recreation of Kong Yim’s original Telstra interactive network experience, following the supplied 2017 screenshots. Built with **Next.js, TypeScript, PixiJS 8 and Three.js**.

The welcome screen, white toolbar and sidebar, pale-blue cartography, globe shadow, coloured routes, category filters, legend and vertical zoom control reflect the original application. The geographic map texture and Telstra logo are copied from the supplied legacy project; all network information is newly generated fictional data. This is an independent portfolio demonstration, not an official Telstra service or coverage checker.

## Local development

Requires Node.js 20.9+.

```sh
npm install
npm run dev
```

Open http://localhost:3000 and select **ENTER**. Quick access opens a country filter directly.

## Views and interactions

- **Globe:** Three.js deformable globe with the original texture and direct surface-grab controls. The point under the pointer stays anchored during a drag. Pitch is limited to ±54° at normal zoom; only horizontal rotation carries momentum after release, matching the legacy interaction. Empty-background drags do not rotate the globe.
- **2D map:** PixiJS repeated basemap with horizontal wrapping and bounded vertical panning. A transparent Three.js canvas stays above it to render native markers and network routes in both views.
- Switch views with the first toolbar button. Layers, country and selected location are shared. Switching uses the legacy 600 ms, quadratic-eased, distance-weighted vertex morph, with 400 ms alignment/zoom reset and a following 600 ms Asia-Pacific focus. Three.js renders the entire deformation; the settled flat basemap hands off to PixiJS while Three.js continues rendering the marker and line objects without remounting either renderer. Rapid toggles reverse from the current pose.
- Scroll or use the vertical slider and + / − buttons to zoom. Reset returns to the initial Asia-Pacific view.
- Toggle Network, Points of Presence, Infrastructure, Other, and Global Media Network. Select All supports a mixed state.
- Filter by Country supports country selection and city / country text search. Country selection limits displayed hubs and connected routes; it does not automatically recenter the camera.
- Select a camera-facing Three.js marker or list entry for fictional location details. Hover a native route to highlight it; click for endpoint and capacity details. The HTML list also provides keyboard access to locations.
- Toolbar buttons open the legend and help, print the current map or request fullscreen. On mobile, the menu button opens filters.
- Reduced-motion preference makes view changes immediate and disables release inertia. Touch dragging and two-finger pinch zoom work in both views. Wheel zoom keeps the location under the cursor anchored. Slider and button zoom are also available.

## Static deployment

```sh
npm test
npm run build
npm run preview
```

Deploy the generated `out/` directory to any static host. No backend, database, CMS, API keys, remote fonts, or runtime map services are used. `next start` is not used for static exports. All textures and JSON are served locally.

## Fictional JSON

`public/data/network.json` contains 65 global locations, 264 coloured network route segments and 9 media links. The route segments include parallel illustrative cables. Locations have country, coordinates, site count, capacity, latency and facility flags. Routes reference location IDs and contain longitude/latitude waypoints. Longitudes on routes may exceed ±180° to make dateline crossings continuous.

```sh
npm run data:generate
```

Edit `scripts/generate-data.mjs` to regenerate the deterministic dataset, or edit the JSON directly. Rebuild after changes: the renderer imports JSON at build time, while `/data/network.json` serves the downloadable copy. Each hub has a native PoP marker. Translucent infrastructure footprints remain decorative texture overlays.

## Structure

- `src/components/Explorer.tsx`: welcome screen, original-style UI, shared view/filter state.
- `src/components/NetworkMap.tsx`: PixiJS map and Three.js globe, pointer handling, picking and resource cleanup.
- `src/lib/motion.ts`: legacy-derived deformation, tween timings and frame-independent damping.
- `src/lib/atlas.ts`: cartography and decorative infrastructure footprints only.
- `src/lib/network-overlays.ts`: shared icon sprites, sampled line geometry, dashes, visibility, raycasting, highlighting and disposal.
- `src/lib/routes.ts`: sampling and dateline splitting for route geometry.
- `src/lib/network.ts`: types, data access and geographic projection.
- `public/assets/world.jpg`, `logo.svg`: original static assets from the supplied legacy source.
- `scripts/generate-data.mjs`: fictional global data generator.
- `tests/data.test.mjs`: schema assumptions, coordinate bounds, references, connectivity and dateline continuity.

The legacy Angular, CoffeeScript, Express and private CMS code is not required. No legacy credentials are copied.

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run preview -- --listen tcp://127.0.0.1:3000
# In another terminal:
npm run test:browser
```

The browser check tests the welcome screen, actual drag rotation and pan, map/globe marker selection, view switching, shared filters, zoom/reset, location search, help, mobile sizing, static JSON delivery mesh deformation, uninterrupted renderer reuse, surface-anchor tracking, horizontal-only release inertia, rapid reversals and reduced-motion behaviour. Screenshots are written to `/tmp/telstra-{welcome,globe,map,mobile}.png`.

Technical references: [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports), [PixiJS Application](https://pixijs.com/8.x/guides/components/application), [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).

## Legacy motion reference

The rewrite follows `Globe.coffee` (`update` and `onUpdate`), `SceneService.coffee` (`openGlobe`, `closeGlobe`, `setOriginalRotation`, `zoomOut`) and `MainCtrl.coffee` (`updateGlobeRotation`, pointer and wheel handling), plus `Point.coffee` / `Image.coffee` (camera-facing markers) and `Network.coffee` (sampled solid/dashed routes) from the supplied old project. Surface dragging uses an exact yaw/pitch solution and frame-independent decay rather than copying the old browser-event timing assumptions.

## Native network rendering

Markers use cached icon textures on `THREE.Sprite` objects with fixed screen sizing, upright camera-facing orientation, explicit far-hemisphere culling and object raycasting. Routes use sampled `THREE.Line` buffer geometry, `LineBasicMaterial` / `LineDashedMaterial`, a small surface offset and depth testing. Their vertices and marker anchors use the same distance-weighted morph as the geographic surface. Dateline crossings are split into separate geometry pieces; repeated flat tiles preserve continuous panning. Selected and hovered routes change material colour.

The basemap texture contains no markers, routes or selection rings. Normal layer filtering and selection update object visibility/materials without generating a new atlas. Only toggling decorative infrastructure footprints changes the basemap texture. Shared geometries, icon textures and materials are disposed on unmount.
