# AGENTS.md

Guidance for AI coding agents working on this repository.

## What this is

**Cube Box**: a mobile-first browser toy. The phone screen is the glass front of a small box full of cubes. Tilting the phone makes the cubes slide, shaking rattles them, and twisting makes them lag behind because of inertia. On desktop, or when motion sensors are unavailable, dragging tilts the box instead.

## Layout

The whole project is one file, `index.html`, with inline CSS and JS. There is no build step, package manager, bundler, or test suite. Keep it that way unless the owner asks otherwise.

The only external dependencies are:
- three.js **r128**, loaded as a UMD script from cdnjs (`THREE` global).
- The Google Font *Bricolage Grotesque*, with a system-font fallback.

Do not upgrade three.js casually. The code uses r128-era APIs such as `renderer.outputEncoding` and `THREE.sRGBEncoding`, which were removed in later releases.

## Code map (inside the single `<script>` IIFE)

1. **XPBD rigid-body solver**, based on Müller et al., "Detailed Rigid Body Simulation with Extended Position Based Dynamics".
   - `Body` stores position/previous position/velocity (`x`, `px`, `v`) and orientation/previous orientation/angular velocity (`q`, `pq`, `w`). A cube's inertia is isotropic, so `invI` is a scalar.
   - `detect()` finds contacts as cube **vertices** penetrating walls or other cubes (`pointInBox`). Edge-edge contacts are not handled.
   - `solvePositions()` handles penetration plus static friction. `solveVelocities()` handles dynamic friction plus restitution.
   - `step()` runs `SUBSTEPS = 20` substeps per fixed `DT = 1/60` frame. It applies apparent acceleration plus the fictitious forces from phone rotation (Euler, centrifugal, Coriolis).
   - Tunables: `MU_S`, `MU_D`, `REST`, the density in `Body` (700 kg/m³), and cube size in `addCube()`.
2. **Rendering**: a three.js scene with soft shadows, five wall planes (`rebuildWallMeshes`), and rounded cube meshes (`roundedCube`).
3. **Input**:
   - `onMotion` reads `devicemotion`. It negates `accelerationIncludingGravity`, maps `rotationRate` (beta, gamma, alpha) to screen x, y, z, and rotates both by screen orientation (`toScreen`).
   - The Start button requests iOS motion permission (`DeviceMotionEvent.requestPermission`). It must stay inside a user gesture.
   - Drag to tilt (`dragGravity`) works only when no motion data has arrived. The Shake button appears only in that fallback case.
4. **Loop**: a fixed-timestep accumulator, at most 3 physics steps per animation frame, then sync meshes to bodies.

## Conventions and invariants

- **Units are SI**: meters, kilograms, seconds. The box's short side is about 7 cm and its depth is 4.5 cm. Cubes are 9–14 mm.
- **Coordinates are screen space**: x right, y up, z out of the glass toward the viewer. The box spans z from `-box.d` (back) to `0` (glass).
- Walls are `{n, o}` with inward normal; a point is inside when `n·p >= o`. Rebuild them through `resize()`, never by hand.
- `bodies[i]` and `meshes[i]` are parallel arrays. Always add or remove them together, as `addCube()` and `reset()` do.
- In the hot path, reuse module-level scratch vectors (`t1`–`t4`, `tq`, `P1`, `r1`, etc.) instead of allocating. Contact detection is O(n²) with a bounding-sphere early-out. The cube count is capped at 30 and resets to 12.
- Layout must stay mobile-safe. Keep the `viewport-fit=cover` meta tag, the safe-area padding, `touch-action: none`, and the light/dark color tokens on `:root`.
- Match the existing style: compact, 2-space indentation, short names, and comments only where the physics is non-obvious.

## Running and testing

- Desktop: open `index.html` directly, or serve it with `python3 -m http.server` and visit `http://localhost:8000`. Drag to tilt.
- Phone: motion sensors require **HTTPS** and a top-level page. They don't work in an iframe or embedded preview. Host it (for example on GitHub Pages) and test on a real device, ideally both iOS and Android.
- There are no automated tests. After any physics change, check that cubes come to rest without jitter, don't tunnel through walls or each other, and handle a hard shake and a fast twist without exploding.

## Git

- The default branch is `main`, and small direct commits are fine.
- Write commit messages that say what changed in the toy or the physics.
- Never commit credentials or tokens.
