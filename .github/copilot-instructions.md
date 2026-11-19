# Copilot Instructions

## Project

Sleigh Bells is a browser-only Three.js game built with vanilla ES modules and Vite. There is no UI framework or TypeScript layer.

## Build and Run

- Install dependencies: `npm ci`
- Start the Vite dev server: `npm run dev`
- Production build: `npm run build`
- Preview the production build: `npm run preview`
- Regenerate the bundled moon/cloud PNG textures: `npm run sky`

In dev mode, open `http://localhost:5173/?autostart=1` to start a run immediately for smoke testing. `window.__game` exposes selected state and helpers only when `import.meta.env.DEV` is true.

No test runner or lint script is configured. `npm run build` is the available automated validation command. There is no single-test command.

The build may report a Three.js bundle-size warning; it does not stop the build.

## Architecture

- `index.html` owns the canvas and HUD/menu DOM, with all application styling in `src/style.css`.
- `src/main.js` is the runtime orchestrator: renderer/post-processing setup, flight and camera state, present physics, collision resolution, input, level state, and the animation loop.
- `src/world.js` owns the persistent scene shell: sky, stars, snow, moon/cloud sprites, lights, fog, and level-village replacement.
- `src/village.js` deterministically builds the village for a level: ground, houses, chimneys, roads, trees, props, and animated smoke/lights. It returns the `villageState` used by `main.js` for delivery/collision data.
- `src/levels.js` is the level configuration source: names, targets, present counts, speed, scenery density, fog, and seeds.
- `src/sleigh.js`, `src/particles.js`, `src/audio.js`, and `src/ui.js` provide scene actors, particle rendering, Web Audio effects, and DOM presentation respectively.
- `src/textures.js` creates CanvasTexture fallbacks for procedural art. `public/textures/` contains pre-generated moon/cloud assets loaded at boot.
- `tools/make-sky-texture.mjs` generates `public/textures/moon-clouds.png` and `public/textures/clouds.png` without external dependencies.

Boot loads the two sky textures, constructs `World`, `Sleigh`, `Sparkles`, and post-processing, then shows the menu. `World.build(level, seed)` disposes the previous `villageState` and builds a replacement village. Level changes therefore require updating both level configuration and the deterministic village rebuild path.

The present simulation lives in `main.js`: a present is integrated with gravity, swept against the previous position for chimney/roof/ground hits, and removed after resolution. `predictDrop()` performs the same collision logic on sampled future positions to drive the aim marker.

## Key Conventions

- Keep browser runtime code in ES modules; use `.js` with `type: module` package settings.
- Three.js objects use real units and shared module-level geometries/materials where the scene has many identical meshes. Match the existing patterns in `main.js`, `sleigh.js`, and `village.js`.
- Procedural scenery is seeded. `src/rng.js` exposes `mulberry32`, `range`, `pick`, and `shuffle`; pass a seed-derived RNG through generation code instead of calling `Math.random()` for level layout.
- `world.build()` and `villageState.dispose()` define the level rebuild lifecycle. When adding GPU resources or scene groups, ensure they are removed/disposed when the village is rebuilt or the scene loop will leak resources.
- Collision-sensitive data is owned by the built village: use `world.chimneys` and `world.houses`, and account for house local/world transforms for roof checks.
- UI state is coordinated through `state.mode` in `main.js` and the `UI.onAction` action-name switch. Body mode is mirrored through `ui.setMode()` and `document.body.dataset.mode`.
- DOM lookups rely on the IDs in `index.html`; changes to controls or HUD elements must update both `index.html` and `src/ui.js`.
- Input handling includes mouse/keyboard, coarse-pointer touch detection, and a touch stick. Steering is normalized by `getSteerX()`/`getSteerY()` before flight-state updates.
- Generic USB/Bluetooth controllers use the browser Gamepad API. `updateGamepad()` supports left-stick/right-stick fallback, D-pad steering, face/shoulder/trigger drop edges, Start/Back pause behavior, stick-click restart, and right-stick-click mute. Keep new controller actions in edge-detected form so held buttons do not repeat.
- Browser audio must be initialized by a user action. `AudioEngine.start()` creates/resumes the `AudioContext`; the title score is scheduled procedurally, while level music is the looping MP3 in `public/audio/`. `setMusicScene()` switches between them, and both follow the existing mute control.
- Texture loading is two-tiered: loaded PNG assets are preferred, while `World` and `textures.js` provide generated fallbacks if loading fails.
- Dev-only diagnostics live behind `import.meta.env.DEV`; do not add user-facing debugging behavior outside that guard.
