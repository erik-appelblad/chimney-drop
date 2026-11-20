# Sleigh Bells — Architecture

A short map of the codebase for future sessions.

## What it is

A 3D Christmas flight game: steer Santa's sleigh over a village and drop presents
down chimneys. Three levels with distinct themes. Vite + Three.js, no framework.

## Quick start

```bash
npm install
npm run dev          # local dev server
npm run build        # production build into dist/
npm run preview      # serve the build
npm run sky          # regenerate the sky texture (tools/make-sky-texture.mjs)
```

Dev shortcuts:

- `?autostart` — start level 1 immediately.
- `?autostart&level=2` — start a specific level (1–3).
- `window.__game` in the console exposes `state`, `flight`, `startRun`,
  `startLevel`, `dropPresent`, `handleAction`, `world`, `ui`, `audio`, etc.

Deployment: multi-stage `Dockerfile` builds with Node and serves `dist/` via
nginx (`nginx.conf`). `dist/` is not tracked.

## File map

| File | Responsibility |
| --- | --- |
| `index.html` | HUD, menus, touch controls, canvas; loads `src/main.js`. |
| `src/main.js` | Boot, render loop, state machine, input, gameplay, cameras, post FX. |
| `src/levels.js` | Level balance + the full per-level theme data. |
| `src/world.js` | Scene-level lighting/sky/fog/moon/stars/clouds/snow; applies themes. |
| `src/village.js` | Procedural village: materials, houses, layouts, props, delivery FX. |
| `src/sleigh.js` | Sleigh, Santa, reindeer and animations. |
| `src/particles.js` | Additive GPU sparkle system (trail, bursts, puffs). |
| `src/textures.js` | Procedural canvas textures (glow, snow, smoke, windows, fallbacks). |
| `src/ui.js` | DOM screens/HUD updates; emits actions through `ui.onAction`. |
| `src/audio.js` | WebAudio music/wind/SFX + HTML audio level track. |
| `src/rng.js` | Seeded `mulberry32` RNG and `range` helper. |
| `src/style.css` | All UI styling. |
| `tools/make-sky-texture.mjs` | Optional sky texture generator. |

## Boot and frame loop

`boot()` in `main.js`:

1. `setupComposer()` — `EffectComposer` with `RenderPass` → `UnrealBloomPass` →
   `OutputPass`.
2. Load moon/cloud textures (procedural fallbacks if missing).
3. Create `World`, `createSleigh()`, `Sparkles`.
4. `prepareMenu()` builds level 1 for the title backdrop.
5. `renderer.setAnimationLoop(frame)`.

`frame()`:

- Updates gamepad, advances `dt` (clamped to 0.05 s) and `elapsed`.
- `menu`: orbit camera + idle sleigh.
- `playing`: flight → camera → presents → aim marker → trail particles.
- `ending`: autopilot flight, remaining presents, then `showPendingResult()`.
- Always: `world.update(...)`, `sparkles.update(dt)`, `composer.render()`.

## State and modes

`state.mode` drives everything:

`boot → menu → playing → ending → levelComplete | gameover | victory`, plus
`paused`.

Key state fields: `levelIndex`, `level`, `attempt`, `score`, `target`,
`presents`, `hits`, `streak`, `bestStreak`, `activePresents`, and run totals
(`runScore`, `runHits`, `runPresents`).

Level flow:

- `startRun()` → `startLevel(0)`.
- `startLevel(i)` seeds the village with `level.seed + attempt * 104729`, resets
  flight/HUD, and sets `playing`.
- `finishLevel()` waits 1.05 s, then shows completion or victory.
- Running out of presents with no active drops and score below target triggers
  game over.
- `handleAction()` handles `start`, `next`, `retry`, `restart`, `pause`,
  `resume`, `menu`, `mute`, `victory`.

## Level themes (important)

Each entry in `LEVELS` (`src/levels.js`) has balance fields plus a `theme`
object. The theme is the single source of truth for the level's look:

- `fogColor`, `background`, `fog`, `exposure`
- `bloom: { strength, radius, threshold }`
- `sky`: gradient colors, aurora color/strength, horizon glow
- `lights`: hemisphere, ambient, moon directional, warm/cool fill
- `moon`: direction, sprite color/scale, halo color/opacity
- `stars`: tint and brightness
- `clouds`: color and opacity
- `snow`: color, size, opacity, amount, fall speed, drift
- `shootInterval`: min/max seconds between shooting stars
- `village`: layout, roof style, palettes, window behavior, lamp colors,
  house size ranges, pond, and `extras` (props/features)

`World.applyTheme(level)` applies all scene-level fields in `World.build()`.
`buildVillage()` reads `level.theme.village` for materials, layouts, and props.

Current identities:

- **First Snow** — blue twilight, warm windows, pyramid roofs, radial layout.
- **Frost & Bells** — teal aurora, cold light, ring layout, steep gable roofs,
  icicles, fences, ice spires/arches.
- **Silent Night** — indigo/magenta dusk, huge moon, sleeping windows, hamlet
  layout, large warm gable houses, bonfire, birches with fairy lights,
  luminaries.

Level 1 is the visual baseline; 2 and 3 deliberately diverge.

## World (`world.js`)

- Owns fog/background, `HemisphereLight`, `AmbientLight`, moon
  `DirectionalLight` (+ shadows), warm fill light.
- Sky is a shader dome (gradient + animated aurora + horizon glow), plus a star
  point field, moon/glow sprites, cloud sprites, shooting star line.
- Snow is a wrapped `Points` cloud around the camera; theme changes color,
  size, opacity, speed, drift, and active count via `setDrawRange`.
- `update()` keeps the sky centered on the camera, moves moonlight with the
  sleigh, animates clouds/stars/shooting stars, and updates snow.
- Shared procedural textures live in `world.shared` and are **not** disposed
  per level.

## Village (`village.js`)

`buildVillage()` returns `{ group, houses, chimneys, deliver, update, dispose }`.

Materials are rebuilt per village from the theme (walls, roofs, snow, stone,
pine, pond, lamps, window tint, etc.).

House generation (`buildHouse`):

- Box body + stone base, optional half-timbering.
- `pyramid` roof (cone) or `gable` roof (custom triangular prism); gable ridge
  is randomly along X or Z.
- Chimney placed on the roof slope; its world-space top is the gameplay target
  (`chimney.topWorld`, `topY`, radius 2.8).
- Windows/door/wreath/lantern, optional dormers, icicles, fences, second
  chimney.
- Stores roof dimensions and type on each house for collision:
  `roofHalfX`, `roofHalfZ`, `roofType`, `ridgeAlongZ`.

Village layouts (`theme.village.layout`):

- `radial` — original scattered ring around the plaza.
- `rings` — ordered concentric rings.
- `hamlets` — clusters around four centers, with fallback fill.

Landmarks/props include the central tree, market stalls, benches, snowmen,
lamps, pond, mountains, snow drifts, pines (instanced), and themed extras:
ice spires/arches, bonfire with embers, luminaries, birch grove and fairy
lights.

`deliver(chimney)` marks a chimney used, turns its cap/window/smoke golden,
adds a floating star, and records it for animation. `update()` animates smoke,
delivered stars, lamps, tree, garlands, bonfire, fairies and luminaries.
`dispose()` disposes all non-shared geometries/materials and removes the group.

## Gameplay pipeline (`main.js`)

- Flight: yaw/pitch from mouse, keyboard, touch stick or gamepad; altitude
  clamped to 20–55; horizontal radius clamped to 300; speed comes from the
  level.
- Drop: `dropPresent()` spawns a present with velocity
  `forward * speed * 0.55`, `y -= 2.2`, then gravity 26.
- Aim marker: `predictDrop()` simulates 130 steps (0.045 s) through the same
  `collisionAt()` path and colors the marker:
  - gold = chimney hit
  - red = roof hit
  - blue = ground
- Collision order: chimneys (crossing `topY` within radius), house roofs
  (pyramid `max(|x|,|z|)` slope or gable ridge slope), then ground.
- Scoring: `100 × clamp(streak, 1, 3)`; a miss resets the streak. Reaching the
  target calls `finishLevel()` (`ending` → `levelComplete`/`victory`).
- Camera: third-person chase, lerped, with subtle roll/shake.

## UI, input, audio

- `UI` binds HUD elements, builds menu/result screens, and forwards button
  actions to `ui.onAction` → `handleAction`.
- Inputs: pointer (steer), click/space (drop), W/S (altitude), A/D (fine
  steering), R/M/Esc, touch stick + drop button, gamepad (left stick/D-pad,
  face buttons to drop, Start/Back pause, shoulder restart/mute).
- `AudioEngine` starts on first pointer/key interaction (browser autoplay
  rules), uses WebAudio for procedural music/wind/SFX plus an HTML audio level
  track. Mute state persists in `localStorage` as `sleigh-bells-muted`.
- Rendering: ACES tone mapping, sRGB output, shadows, bloom. Pixel ratio is
  capped at 2 on desktop and 1.6 on touch.

## Common change recipes

- **New level:** add a `LEVELS` entry with balance + a complete `theme`; pick
  `layout`, `roofStyle`, palettes, `sizes`, `pond`, and `extras`. Test all
  extras and target reachability.
- **New prop:** add an `extras` flag in the theme, build it in `village.js`,
  animate it in the village `update()`, and rely on group traversal for
  disposal. Reuse shared textures/materials where possible.
- **New roof style:** add geometry in `village.js`, set `roofType` on houses,
  and extend the roof branch in `collisionAt()` so drops still behave.
- **Re-theme a level:** prefer theme values over hard-coded colors in
  `village.js`/`world.js`.
- **Balance:** tune `target`, `presents`, `speed`, `houses`, `trees`, `fog`,
  `seed`; keep `presents × 3× mult` comfortably above target.

## Gotchas

- Gable roof collision and geometry must stay in sync; both use
  `roofHalfX/roofHalfZ` and `ridgeAlongZ`.
- Village dispose traverses the group, so any new mesh/points gets cleaned up
  automatically, but **shared** textures (`world.shared`) must not be disposed.
- Theme objects are currently expected to be complete; `applyTheme()` reads
  fields directly without defaults.
- Mobile detection is `(pointer: coarse)`; mobile reduces shadow map size,
  lamp lights, snow, clouds and some detail, but not house counts.
- Keep animated per-frame work allocation-free; the frame loop reuses `tmp`
  vectors and typed arrays.
