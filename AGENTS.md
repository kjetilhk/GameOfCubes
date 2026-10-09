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
├── docs/               # Technical documentation
│   ├── README.md       # Documentation index
│   ├── xpbd.md         # XPBD physics engine reference
│   ├── testroom.md     # 3.0m room, PBR, lighting, sensors
│   ├── cloth.md        # Cloth simulation reference
│   ├── softbody.md     # Soft body continuum mechanics reference
│   ├── car.md          # RC Buggy car & suspension reference
│   └── tests.md        # Test suite catalog & developer guide
├── src/
│   ├── xpbd.js         # Core XPBD physics engine (Müller et al.)
│   ├── car.js          # Reusable off-road RC Buggy car asset
│   ├── viewcube.js     # Standalone 3D isometric CAD ViewCube gravity controller
│   ├── room.js         # Shared 3.0m room setup, 3-point lighting, spawner, dragger, and FPS meter
│   └── common.css      # Shared responsive UI styling tokens, HUD, and badges
└── tests/
    ├── verify.js       # Headless automated Node.js physics verification suite
    ├── test1/
    │   └── index.html  # Test 1: Cube Box (mobile XPBD rigid bodies)
    ├── test2/
    │   └── index.html  # Test 2: Cloth Simulation (compliant XPBD cloth)
    ├── test3/
    │   └── index.html  # Test 3: Soft Body Simulation (tet mesh continuum elasticity)
    ├── test4/
    │   └── index.html  # Test 4: Cloth Over Sphere (fabric draping & sphere collision benchmark)
    ├── test5/
    │   └── index.html  # Test 5: Joints & Articulated Bodies (ragdoll & chain linkages)
    ├── test6/
    │   └── index.html  # Test 6: Wrecking Ball & Destruction (high-impulse demolition & stacking benchmark)
    └── test7/
        └── index.html  # Test 7: RC Buggy & Suspension Dynamics (off-road vehicle dynamics benchmark)
```

The core physics engine lives in `src/xpbd.js` without DOM or rendering dependencies. It exports `XPBD` (and alias `CubePhysics`) to the global scope (`window`/`globalThis`) and to CommonJS (`module.exports`).
Shared rendering, lighting, device sensors, and UI utilities live in `src/room.js`, `src/viewcube.js`, and `src/common.css`.

Each test in `tests/` is a self-contained environment loading three.js, `../../src/xpbd.js`, `../../src/room.js`, and `../../src/common.css`. There is no build step, package manager, bundler, or complex runner. Keep it lightweight and accessible directly via static file servers.

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
  3. **Particle collisions** against the 6 box walls, rigid cubes, and optional particle/cloth self-collision using zero-allocation 3D spatial hashing.
  4. **Derive particle velocities** and apply linear damping and internal constraint damping.
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
- Loads `../../src/xpbd.js` for physics and `../../src/room.js` for room environment.
- Handles cube spawning, rigid body collision responses, and live FPS meter.

### Test 2: Cloth Simulation (`tests/test2/index.html`)

Interactive XPBD cotton cloth sheet in the box.
- High-resolution dynamic $48 \times 48$ grid of particles (2,304 vertices, 8,930 constraints) connected by inextensible structural warp and weft constraints with compliant shear, allowing fine natural catenary draping and detailed folding without springy paper curling.
- Textured with a procedural interwoven warp-and-weft cotton canvas texture and bump relief map for authentic textile appearance under 3-point lighting.
- Top corners pinned with visual pin markers; togglable via "Unpin / Pin Top" button.
- Cloth self-collision toggle ("Self Collision: Off / On") using zero-allocation spatial hashing, preventing overlapping folds from penetrating.
- Raycaster pointer interaction allows grabbing and dragging cloth vertices in real time.
- Two-way interaction: dynamic rigid cubes can be spawned into the box, falling and colliding with the cloth fabric.
- DeviceMotion accelerometer and gyroscope induce waves and wrinkles in the fabric through fictitious forces.

### Test 3: Soft Body Simulation (`tests/test3/index.html`)

Volumetric continuum mechanics soft body on a 3D tetrahedral mesh.
- Decomposed into 1,715 tetrahedra (512 particles in an $8\times8\times8$ grid) with 2,520 edge constraints and 1,715 tetrahedral volume preservation constraints.
- Hydrostatic volume conservation ensures true physical incompressibility: squishing against walls or floor causes realistic lateral bulging without volume loss.
- Water-like extra soft elasticity with translucent fluid shader styling, wireframe mode toggle, interactive raycaster pointer pinching, and rigid cube drop collisions.

### Test 4: Cloth Over Sphere (`tests/test4/index.html`)

Cloth draping and 3D curved obstacle collision benchmark.
- Horizontal $1.5\,\text{m} \times 1.5\,\text{m}$ fabric sheet falling under gravity onto a $0.7\,\text{m}$ diameter polished sphere perched on a studio pedestal stand ($1.5\,\text{m}$ above floor, sphere center $y = 0.0\,\text{m}$).
- Cloth starts $1\,\text{m}$ above sphere center ($y = 1.0\,\text{m}$) and falls freely without pinned corners.
- Active spatial-hash cloth self-collision preventing overlapping folds from penetrating as they flute around the sphere.
- Fixed downwards gravity with no gyro sensor permission modal; features a 3D orbit camera, wireframe mode toggle, raycast grab & pull, and dynamic rigid cube drop collisions.

### Test 5: Joints & Articulated Bodies (`tests/test5/index.html`)

Articulated multibody physics and character dynamics benchmark.
- Features an interactive 15-body humanoid ragdoll connected by 14 XPBD spherical joints (head, torso, pelvis, arms, hands, thighs, shins, feet), and a hanging 6-link metallic articulated chain with heavy tip pendulum.
- Raycaster pointer interaction allows grabbing, lifting, posing, and tossing any body segment or chain link with momentum transfer.
- "Drop Ragdoll" drops the figure from height with random angular tumbling spin to land on the floor.
- "Suspend / Free" toggles suspension cords anchoring hands and head to ceiling anchors.
- Dropping dynamic cubes directly collides with the ragdoll and chain, demonstrating high-strain joint stability and zero detachment drift.
- Full 3D orbit camera controls with background dragging and zoom wheel.

### Test 6: Wrecking Ball & Destruction (`tests/test6/index.html`)

High-energy multi-body impact and dynamic stack collapse benchmark.
- Heavy cast-iron wrecking ball ($6,500\,\text{kg/m}^3$, $\approx 220\,\text{kg}$) suspended from the ceiling by an articulated 6-link metallic chain using XPBD spherical joints.
- Switchable destructible structures:
  - 10-tier Jenga tower: 30 wooden blocks arranged in alternating perpendicular trios, resting stably under gravity until impacted.
  - 7-row staggered masonry brick wall: 31 interlocking terracotta blocks testing friction, shear resistance, and structural collapse.
- Interactive raycaster slingshot aiming: clicking or dragging the wrecking ball pulls it back along an aiming vector with a dynamic visual tension trajectory line, imparting high release momentum upon release.
- "Demolish" launch trigger, "Rebuild" tower reset, "Tower: Jenga / Brick Wall" style toggle, wireframe toggle, and dynamic rigid cube spawner.
- Rigorous benchmark for high-mass-ratio collision stability ($220\,\text{kg}$ ball impacting $1.5\,\text{kg}$ bricks), preventing tunneling, explosion, or solver divergence under extreme impulse transfer.
- Full 3D orbit camera controls with background dragging and zoom wheel.

### Test 7: RC Buggy & Suspension Dynamics (`tests/test7/index.html`)

High-performance off-road vehicle dynamics, circuit racing, and high-speed multi-body crash destruction benchmark.
- Reusable modular `RCCar` asset (`src/car.js`) featuring authentic competition RC buggy styling: low-slung clearcoat body shell, dark titanium roll cage, rear downforce wing, front bull-bar bumper with twin rally LED spotlights, double-sided PBR shading, and dynamic flexible whip antenna with pennant flag.
- Long-travel independent coilover suspension ($0.22\,\text{m}$ stroke, $0.32\,\text{m}$ rest length) with real-time Hookean spring and velocity damping forces, procedural 3D helical coil springs that compress along their stroke, and pivoting suspension wishbone control arms.
- Oversized knobby beadlock all-terrain wheels ($0.32\,\text{m}$ diameter, $0.22\,\text{m}$ wide) with deep-dish rims and dual-row staggered tread lugs rotating with speed and steering with Ackermann geometry.
- Full-time 4WD electric motor drive with forward/reverse throttle, progressive braking ($95\,\text{N}$), top speed $26.0\,\text{m/s}$ ($\approx 94\,\text{km/h}$), realistic free-wheeling coasting with gentle rolling resistance upon releasing joystick, front & rear anti-roll sway bars (ARB), Coulomb drift breakaway limits preventing rollovers, aerodynamic downforce, active low-CoM roll stabilization, and in-flight gyroscopic attitude stabilization.
- Massive $96\,\text{m} \times 112\,\text{m}$ figure-8 racing circuit with double-wide $15.2\,\text{m}$ roadway lanes, continuous procedural off-road terrain elevation function `world.getTerrainHeight(x, z)` (undulating swells, washboard whoops, and packed-dirt chatter with 8-ribbon cross-lane mesh subdivision), 3D raised beveled border curbs ($0.60\,\text{m}$ wide) with automatic intersection clearance, checkered start/finish line, turf infield beds, corner apex cones, and wide tabletop ($10\,\text{m}$) & mega kicker ($8\,\text{m}$) jumps.
- 44 ultra-lightweight ($45\,\text{g}$) hollow plastic shell crash cubes with momentum transfer collision physics (car plows through barriers with $<2\%$ speed loss while cubes scatter into the air).
- Suspension debris filtering: wheels ignore lightweight debris ($w > 2.0$), preventing artificial vertical shock jolts when rolling over scattered plastic boxes.
- Compact bottom-center virtual analog joystick with progressive exponential response ($\text{steer} = \operatorname{sign}(x) \cdot |x|^{1.6}$) and lowered-horizon screen-centered chase follow camera.
- High-refresh rate 120Hz display interpolation eliminating motion ghosting.

## Adding New Tests

When adding new tests:
1. Create a new subfolder in `tests/`, e.g., `tests/test2/index.html`.
2. Add a navigation link back to `../../` (the test suite landing page).
3. Add a card for the new test on the landing page in `index.html`.
4. Document the test purpose and invariants in this file (`AGENTS.md`).

## Conventions and Invariants

- **Units are SI**: meters, kilograms, seconds.
- **Room Dimensions**: The test room is **3.0 meters tall** across all tests (`roomHeight = 3.0` m, half-height `hy = 1.5` m, depth `d = 2.4` m). Horizontal half-width is derived from aspect ratio (`hx = hy * aspect`) so the room fits vertically on screen at true 3m scale.
- **Physically Based Rendering (PBR)**:
  - **Tone Mapping**: ACES Filmic (`renderer.toneMapping = THREE.ACESFilmicToneMapping`, `renderer.toneMappingExposure = 1.0`) with sRGB output encoding.
  - **Materials**: `MeshPhysicalMaterial` used for objects: cubes feature physical clearcoat lacquer (`clearcoat: 0.25`), soft body features physical fluid transmission (`transmission: 0.75`, `ior: 1.333`), and cloth uses `MeshStandardMaterial` with woven cotton bump and roughness.
- **Lighting**: Studio lighting setup (1 Key Light, 2 Fill Lights, reduced by 50%):
  - **Key Light**: Primary warm directional light from the front-right side (`0xfff4e6`, intensity 0.56) positioned at $z = 0.05$ (near the front glass) for balanced 3/4 key illumination with soft PCF shadow mapping (2048×2048 map, near 0.1, far 15).
  - **Fill Light 1**: Soft cool directional fill from the front-left aperture (`0xcfe0f5`, intensity 0.28, $z = 0.35$) aimed directly at the left wall to soften cast shadows.
  - **Fill Light 2**: Ambient room fill (`THREE.AmbientLight(0xdde5f0, 0.21)`) ensuring cast shadows, ceiling, and back corners are never pitch black.
- **Dark Gray Walls Palette**:
  - Walls and ceiling: `0x242830` (roughness 0.85, metalness 0.05).
  - Back wall: `0x1b1f25` (roughness 0.90, metalness 0.04).
  - Floor: `0x16191f` (roughness 0.65, metalness 0.10, soft PBR floor sheen).
- **Object Scales (calibrated to 3m room)**:
  - Test 1 rigid cubes: 36–50 cm (`s = 0.36 + Math.random()*0.14`).
  - Test 2 cloth: 1.6 m × 1.6 m sheet, mass 1.5 kg, pin radius 0.04 m, dropped cubes 38 cm.
  - Test 3 soft body: 0.85 m × 0.85 m × 0.85 m volumetric tetrahedral cube, mass 25 kg, dropped cubes 38 cm.
- **Coordinates are screen space**: x right, y up, z out of the glass toward the viewer. The box spans z from `-box.d` (back) to `0` (glass).
- Contact normals point from body `b` (or a wall) toward body `a`.
- Walls are `{n, o}` with inward normal; a point is inside when `n·p >= o`. Change them only through `world.setBox()`, which `resize()` calls.
- `world.bodies[i]` and `meshes[i]` are parallel arrays. Always add or remove them together, as `addCube()` and `reset()` do.
- In the hot path, reuse module-level scratch vectors and the contact pool instead of allocating. Pair detection is O(n²) with a bounding-sphere early-out.
- Layout must stay mobile-safe: keep the `viewport-fit=cover` meta tag, safe-area padding (`env(safe-area-inset-*)`), `touch-action: none`, and light/dark color tokens on `:root`.
- Match existing style: compact, 2-space indentation, short names, and comments only where physics math is non-obvious.

## Running and Testing

- **Desktop**:
  - Run `python3 -m http.server` and visit `http://localhost:8000` to view the tests catalog.
  - Visit `http://localhost:8000/tests/test1/` to run Test 1. Use the 3D ViewCube in the top-right to control gravity (click faces/presets, drag to rotate) or drag on screen to tilt.
- **Phone**:
  - Motion sensors require **HTTPS** and a top-level page (they do not work inside iframes). Host on GitHub Pages and test on physical devices (iOS and Android).
- **Headless & Automated Verification**:
  - Run the automated physics verification suite:
    ```bash
    node tests/verify.js
    ```
    Verifies resting stability, 18° static friction threshold, hydrostatic volume conservation, non-tunneling boundary collision, and multi-instance concurrency isolation.
- **Physics verification checklist**:
  - A single cube on a level floor stays perfectly still without slow spin.
  - A cube on a floor tilted ~18° does not slide (μs = 0.55).
  - Stacks hold and settle within seconds.
  - Cubes do not tunnel or stay overlapped during hard shakes or rapid twists.

## Git

- The default branch is `main`, and small direct commits are fine.
- Write commit messages that describe what changed in the engine, tests, or landing page.
- Never commit credentials or tokens.
