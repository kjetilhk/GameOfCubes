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

## Code map

`index.html` has two inline scripts after the three.js tag.

**1. Physics (`CubePhysics`)**: XPBD rigid bodies, based on Müller et al., "Detailed Rigid Body Simulation with Extended Position Based Dynamics". It contains no DOM or rendering code.
- `World` holds `bodies`, `box`, `accel` (apparent acceleration felt inside the phone), and `omega` / `omegaDot` (phone rotation). Its methods are `setBox()`, `addCube()`, `clear()`, `crowded()`, and `step()`.
- `step()` runs one fixed `dt` frame split into `substeps`:
  1. **Integrate** gravity/shake plus the fictitious forces (Euler, centrifugal, Coriolis).
  2. **Collide.** Cube corners are tested against the six walls. Cube–cube uses a separating-axis test with a contact manifold (`collideBoxes`). Face contacts clip the incident face against the reference face, giving up to 8 points. Edge axes are used only when clearly better than a face axis, so the normal doesn't flip. Contacts within `contactMargin` are collected but solved only if they penetrate.
  3. **Position solve.** `positionIterations` normal sweeps run first, then static friction, then one more normal sweep. Depenetration is capped at `maxPushSpeed`.
  4. **Derive velocities** from the position change.
  5. **Velocity solve.** `velocityIterations` interleaved sweeps apply dynamic friction (an accumulated impulse clamped to μ·λ/h) and restitution, which is switched off for slow contacts.
  6. **Damping** and speed/spin clamps.
- Contacts sit in a pool and are swept in alternating order each substep. A fixed order makes resting cubes creep.
- All tunables are in `DEFAULTS`, and `new World(opts)` overrides them.

**2. App**: rendering, input, and the loop.
- **Rendering**: a three.js scene with soft shadows, wall planes (`rebuildWallMeshes`), and rounded cube meshes (`roundedCube`).
- **Input**:
  - `onMotion` reads `devicemotion` into `world.accel` and `world.omega`, rotated to screen orientation by `toScreen`.
  - The Start button requests iOS motion permission, which must happen inside a user gesture.
  - Drag to tilt (`dragGravity`) works when no motion data arrives, and the Shake button appears only in that case.
- **Loop**: a fixed-timestep accumulator, at most 3 `world.step()` calls per animation frame, then meshes are synced to bodies.

## Conventions and invariants

- **Units are SI**: meters, kilograms, seconds. The box's short side is about 7 cm and its depth is 4.5 cm. Cubes are 9–14 mm.
- **Coordinates are screen space**: x right, y up, z out of the glass toward the viewer. The box spans z from `-box.d` (back) to `0` (glass).
- Contact normals point from body `b` (or a wall) toward body `a`.
- Walls are `{n, o}` with inward normal; a point is inside when `n·p >= o`. Change them only through `world.setBox()`, which `resize()` calls.
- `world.bodies[i]` and `meshes[i]` are parallel arrays. Always add or remove them together, as `addCube()` and `reset()` do.
- In the hot path, reuse module-level scratch vectors and the contact pool instead of allocating. Pair detection is O(n²) with a bounding-sphere early-out. The cube count is capped at 30 and resets to 3. With 30 cubes a frame costs about 3.5 ms on a desktop CPU, so mind the cost on phones before adding substeps or iterations.
- Layout must stay mobile-safe. Keep the `viewport-fit=cover` meta tag, the safe-area padding, `touch-action: none`, and the light/dark color tokens on `:root`.
- Match the existing style: compact, 2-space indentation, short names, and comments only where the physics is non-obvious.

## Running and testing

- Desktop: open `index.html` directly, or serve it with `python3 -m http.server` and visit `http://localhost:8000`. Drag to tilt.
- Phone: motion sensors require **HTTPS** and a top-level page. They don't work in an iframe or embedded preview. Host it (for example on GitHub Pages) and test on a real device, ideally both iOS and Android.
- There are no automated tests in the repo. The physics script has no DOM dependencies, so it can be extracted and run headless in Node with `three@0.128.0` to measure behaviour.
- After any physics change, check that:
  - a single cube on a level floor stays perfectly still and doesn't slowly spin;
  - a cube on a floor tilted about 18° doesn't slide, since μs is 0.55;
  - stacks hold, and a 30-cube pile settles within a few seconds;
  - cubes don't tunnel or stay overlapped through a hard shake or a fast twist.

## Git

- The default branch is `main`, and small direct commits are fine.
- Write commit messages that say what changed in the toy or the physics.
- Never commit credentials or tokens.
