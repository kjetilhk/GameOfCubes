# AGENTS.md

Guidance for AI coding agents working on this repository.

## What this is

This repository is an interactive testbed and laboratory for developing and benchmarking a custom **Extended Position-Based Dynamics (XPBD)** physics engine in the browser (based on Müller et al., "Detailed Rigid Body Simulation with Extended Position Based Dynamics").

The root serves a landing page cataloguing tests, and individual tests are hosted as self-contained environments in the `tests/` directory.

## Layout

```
.
├── index.html          # Test suite landing page (catalog of tests)
├── AGENTS.md           # Developer and agent guidance
├── src/
│   └── xpbd.js         # Core XPBD physics engine (Müller et al.)
└── tests/
    ├── test1/
    │   └── index.html  # Test 1: Cube Box (mobile XPBD rigid bodies)
    ├── test2/
    │   └── index.html  # Test 2: Cloth Simulation (compliant XPBD cloth)
    └── test3/
        └── index.html  # Test 3: Soft Body Simulation (tet mesh continuum elasticity)
```

The core physics engine lives in `src/xpbd.js` without DOM or rendering dependencies. It exports `XPBD` (and alias `CubePhysics`) to the global scope (`window`/`globalThis`) and to CommonJS (`module.exports`).

Each test in `tests/` is a self-contained environment loading three.js and `../../src/xpbd.js`. There is no build step, package manager, bundler, or complex runner. Keep it lightweight and accessible directly via static file servers.

The only external dependencies across tests are:
- three.js **r128**, loaded as a UMD script from cdnjs (`THREE` global).
- The Google Font *Bricolage Grotesque*, with a system-font fallback.

Do not upgrade three.js casually. The code uses r128-era APIs such as `renderer.outputEncoding` and `THREE.sRGBEncoding`, which were removed in later releases.

## Core Physics Engine (`src/xpbd.js`)

XPBD rigid bodies with no DOM or rendering code, based on Müller et al., "Detailed Rigid Body Simulation with Extended Position Based Dynamics".
- `World` holds `bodies`, `particles`, `constraints`, `volumeConstraints`, `cloths`, `tetMeshes`, `box`, `accel` (apparent acceleration felt inside the box), and `omega` / `omegaDot` (device rotation rate and angular acceleration). Methods: `setBox()`, `addCube()`, `addCloth()`, `addTetMesh()`, `addParticle()`, `addDistanceConstraint()`, `clear()`, `crowded()`, and `step()`.
- `step()` runs one fixed `dt` frame split into `substeps`:
  1. **Integrate** rigid bodies and particles (gravity/shake plus fictitious Euler, centrifugal, and Coriolis forces).
  2. **Solve particle constraints** using exact XPBD compliance ($\Delta \lambda = (-C - \tilde{\alpha}\lambda) / (\sum w + \tilde{\alpha})$ with $\tilde{\alpha} = \alpha / h^2$):
     - Edge distance constraints for stretch and shear elasticity.
     - Tetrahedral volume preservation constraints ($C = V - V_0$) for incompressibility ($0.0001\%$ volume drift).
  3. **Particle collisions** against the 6 box walls and against rigid cubes.
  4. **Derive particle velocities** and apply linear damping.
  5. **Rigid body collision.** Cube corners are tested against the six walls. Cube–cube uses a separating-axis test with a contact manifold (`collideBoxes`). Face contacts clip the incident face against the reference face (up to 8 points). Edge axes are used only when strictly better than a face axis to prevent normal flips. Contacts within `contactMargin` are collected and solved only if penetrating.
  6. **Position solve.** `positionIterations` normal sweeps run first, then static friction, then a normal cleanup sweep. Depenetration is capped at `maxPushSpeed`.
  7. **Derive velocities** from position changes.
  8. **Velocity solve.** `velocityIterations` interleaved sweeps apply dynamic friction (accumulated impulse clamped to μ·λ/h) and restitution (disabled for slow contacts).
  9. **Damping** and speed/spin clamps.
- Contacts sit in a pool and are swept in alternating order each substep to prevent resting creep.
- All tunables live in `DEFAULTS`, overridden via `new World(opts)`.

## Current Tests

### Test 1: Cube Box (`tests/test1/index.html`)

A mobile-first browser toy and test scene. The phone screen represents the front glass of a small box holding loose cubes. Tilting slides them under gravity, shaking rattles them, and twisting induces rotational inertia and fictitious forces. On desktop or when motion sensors are inactive, dragging tilts the box.
- Loads `../../src/xpbd.js` for physics.
- App script handles three.js scene, wall planes (`rebuildWallMeshes`), rounded cube meshes (`roundedCube`), DeviceMotion sensor integration, drag-to-tilt desktop fallback, and loop accumulator.

### Test 2: Cloth Simulation (`tests/test2/index.html`)

Interactive XPBD cloth sheet in the box.
- Dynamic $15 \times 15$ grid of particles connected by structural, shear, and 2-hop bending compliant distance constraints.
- Top corners pinned with visual pin markers; togglable via "Unpin / Pin Top" button.
- Raycaster pointer interaction allows grabbing and dragging cloth vertices in real time.
- Two-way interaction: dynamic rigid cubes can be spawned into the box, falling and colliding with the cloth fabric.
- DeviceMotion accelerometer and gyroscope induce waves and wrinkles in the fabric through fictitious forces.

### Test 3: Soft Body Simulation (`tests/test3/index.html`)

Volumetric continuum mechanics soft body on a 3D tetrahedral mesh.
- Decomposed into 40 tetrahedra (27 particles in a $3\times3\times3$ grid) with 90 edge constraints and 40 tetrahedral volume preservation constraints.
- Hydrostatic volume conservation ensures true physical incompressibility: squishing against walls or floor causes realistic lateral bulging.
- Wireframe mode toggle to inspect interior/surface tetrahedral deformation.
- Interactive raycaster pointer allows pinching, poking, and stretching the volumetric solid.
- Dynamic rigid cubes can be dropped onto the soft body, causing realistic compression and bouncing.

## Adding New Tests

When adding new tests:
1. Create a new subfolder in `tests/`, e.g., `tests/test2/index.html`.
2. Add a navigation link back to `../../` (the test suite landing page).
3. Add a card for the new test on the landing page in `index.html`.
4. Document the test purpose and invariants in this file (`AGENTS.md`).

## Conventions and Invariants

- **Units are SI**: meters, kilograms, seconds. In Test 1, the box's short side is ~7 cm and depth is 4.5 cm. Cubes are 9–14 mm.
- **Coordinates are screen space**: x right, y up, z out of the glass toward the viewer. The box spans z from `-box.d` (back) to `0` (glass).
- Contact normals point from body `b` (or a wall) toward body `a`.
- Walls are `{n, o}` with inward normal; a point is inside when `n·p >= o`. Change them only through `world.setBox()`, which `resize()` calls.
- `world.bodies[i]` and `meshes[i]` are parallel arrays. Always add or remove them together, as `addCube()` and `reset()` do.
- In the hot path, reuse module-level scratch vectors and the contact pool instead of allocating. Pair detection is O(n²) with a bounding-sphere early-out. The cube count is capped at 30 and defaults/resets to 3.
- Layout must stay mobile-safe: keep the `viewport-fit=cover` meta tag, safe-area padding (`env(safe-area-inset-*)`), `touch-action: none`, and light/dark color tokens on `:root`.
- Match existing style: compact, 2-space indentation, short names, and comments only where physics math is non-obvious.

## Running and Testing

- **Desktop**:
  - Run `python3 -m http.server` and visit `http://localhost:8000` to view the tests catalog.
  - Visit `http://localhost:8000/tests/test1/` to run Test 1. Drag to tilt.
- **Phone**:
  - Motion sensors require **HTTPS** and a top-level page (they do not work inside iframes). Host on GitHub Pages and test on physical devices (iOS and Android).
- **Headless**:
  - Physics modules have no DOM dependencies and can be extracted and run headlessly in Node with `three@0.128.0` to measure stability, overlap, and performance.
- **Physics verification checklist**:
  - A single cube on a level floor stays perfectly still without slow spin.
  - A cube on a floor tilted ~18° does not slide (μs = 0.55).
  - Stacks hold and settle within seconds.
  - Cubes do not tunnel or stay overlapped during hard shakes or rapid twists.

## Git

- The default branch is `main`, and small direct commits are fine.
- Write commit messages that describe what changed in the engine, tests, or landing page.
- Never commit credentials or tokens.
