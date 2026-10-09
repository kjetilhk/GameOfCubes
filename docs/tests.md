# Test Suite Catalog & Developer Guide

The repository hosts standalone interactive test scenes located in `tests/`, accessible from the landing page at `index.html`.

---

## Catalog of Tests

### Test 1: Cube Box (`tests/test1/index.html`)
- **Focus**: 6DOF XPBD rigid bodies, contact manifolds, Coulomb friction, and non-inertial fictitious forces.
- **Scene**: Phone screen represents the front glass of a 3.0m box containing loose, rounded, beveled cubes ($36\text{–}50\,\text{cm}$).
- **Interactions**:
  - Tilt device / drag desktop: slides cubes across the floor under directional gravity.
  - Shake device / click "Shake": rattles cubes, inducing rotational spin and fictitious forces.
  - "Add Cube": dynamically spawns a new cube with randomized dimensions, orientation, and color.
  - "Reset": restores the default 3-cube configuration.

### Test 2: Cloth Simulation (`tests/test2/index.html`)
- **Focus**: High-resolution XPBD fabric sheet ($48 \times 48$, 2,304 vertices, 8,930 constraints).
- **Scene**: 1.6m × 1.6m cotton canvas sheet hanging in the room.
- **Interactions**:
  - "Unpin / Pin Top": toggles the corner brass anchor pins to drop or hang the sheet.
  - "Self Collision: On / Off": toggles zero-allocation spatial hashing for fold self-collision.
  - "Add Cube": drops 38 cm rigid cubes that hammock and collide with the fabric.
  - Touch/Mouse Drag: pinch and pull individual vertices in real time.

### Test 3: Soft Body Simulation (`tests/test3/index.html`)
- **Focus**: Volumetric continuum mechanics on a tetrahedral mesh (1,715 tetrahedra, 512 particles).
- **Scene**: Translucent fluid-like elastic block ($0.85\text{m} \times 0.85\text{m} \times 0.85\text{m}$) conserving hydrostatic volume.
- **Interactions**:
  - "Softness: Water / Rubber": toggles between water-like fluid elasticity and snappy rubber solid elasticity.
  - "Wireframe: Off / On": toggles tetrahedral triangle wireframe rendering.
  - "Add Cube": drops rigid cubes causing impact deformation and cratering.
  - Touch/Mouse Drag: pinch and deform the soft body volume.

### Test 4: Cloth Over Sphere (`tests/test4/index.html`)
- **Focus**: High-resolution XPBD fabric draping benchmark over curved 3D obstacle geometry ($48 \times 48$, 2,304 vertices, 8,930 constraints).
- **Scene**: $1.5\,\text{m} \times 1.5\,\text{m}$ horizontal fabric plane falling under downward gravity onto a $0.7\,\text{m}$ diameter polished sphere perched on a studio pedestal ($1.5\,\text{m}$ above floor, center at $y = 0.0\,\text{m}$).
- **Interactions**:
  - No gyro / static studio gravity: gravity is fixed downwards $(0, -9.81, 0)\,\text{m/s}^2$ with immediate simulation start (no permission modal).
  - 3D Orbit Camera: dragging background orbits smoothly around the sphere, mouse wheel zooms in/out.
  - Touch/Mouse Drag: raycast grab lifts and repositions cloth folds in 3D.
  - "Self Collision: On / Off": toggles zero-allocation spatial hashing for overlapping pleats (enabled by default).
  - "Wireframe": toggles mesh wireframe rendering.
  - "Drop Cube": spawns falling rigid cubes onto the draped cloth.
  - "Reset": restores the cloth at $1\,\text{m}$ above the sphere center to fall again.

### Test 5: Joints & Articulated Bodies (`tests/test5/index.html`)
- **Focus**: Articulated multibody physics, XPBD spherical & distance joints, character dynamics.
- **Scene**: Interactive 15-body humanoid ragdoll with 14 spherical joints and a hanging 6-link metallic articulated chain with heavy tip pendulum in the 3.0m studio room.
- **Interactions**:
  - Touch/Mouse Drag: raycast grab lifts, poses, and tosses any ragdoll limb or chain link with momentum transfer.
  - 3D Orbit Camera: dragging background orbits smoothly around the character, mouse wheel zooms in/out.
  - "Drop Ragdoll": drops the humanoid from height with random angular tumbling spin to land on the floor.
  - "Suspend / Free": toggles suspension cords anchoring hands and head to ceiling anchors.
  - "Drop Cube": spawns falling rigid cubes directly onto the ragdoll and chain.
  - "Wireframe": toggles mesh wireframe rendering.
  - "Reset": restores default suspended pose.

### Test 6: Wrecking Ball & Destruction (`tests/test6/index.html`)
- **Focus**: High-energy multi-body impact dynamics, stacking stability, destructive structural collapse, and extreme mass-ratio collision resolution.
- **Scene**: Massive cast-iron wrecking ball ($6,500\,\text{kg/m}^3$, $\approx 220\,\text{kg}$) suspended from the ceiling by an articulated 6-link metallic chain, poised before a destructible multi-tier block structure in the 3.0m studio room.
- **Interactions**:
  - Interactive Slingshot Aim: drag the wrecking ball with touch or mouse to pull it back against tension; release to fire with high velocity impulse.
  - "Demolish": automated high-energy slingshot launch directly into the tower.
  - "Rebuild": clears debris and reconstructs the tower cleanly.
  - "Tower: Jenga / Brick Wall": toggles between a 30-block 10-tier alternating Jenga tower and a 31-block 7-row interlocking masonry brick wall.
  - 3D Orbit Camera: background drag rotates camera around the destruction zone, mouse wheel zooms.
  - "Drop Cube": spawns falling dynamic rigid cubes to cause secondary collateral impacts.
  - "Wireframe": toggles wireframe rendering for all rigid bodies and chain links.

### Test 7: RC Buggy & Suspension Dynamics (`tests/test7/index.html`)
- **Focus**: High-performance vehicle dynamics, independent long-travel coilover suspension, speed-sensitive steering, double-sided PBR rendering, and high-energy multi-body impact response.
- **Scene**: Competition RC buggy on a massive $96\,\text{m} \times 112\,\text{m}$ figure-8 racing circuit featuring:
  - Continuous procedural off-road terrain elevation function `world.getTerrainHeight(x, z)` creating rolling swells, washboard whoops, and packed-dirt chatter with 8-ribbon cross-lane mesh subdivision.
  - Double-wide $15.2\,\text{m}$ asphalt roadway lanes with yellow dashed centerline conforming to terrain.
  - 3D raised beveled inner and outer border curbs ($0.60\,\text{m}$ wide, $14\,\text{cm}$ high) following terrain elevation with automatic intersection clearance opening ($dist > 19\,\text{m}$).
  - Checkered start/finish line grid ($15.2\,\text{m}$ wide across roadway).
  - Two elliptic turf infield beds ($16\,\text{m}$ radius scaled $1.9\times$ in X) and 6 perimeter apex cones resting on terrain.
  - Two wide tabletop jumps ($10.0\,\text{m}$ wide, $8.5\,\text{m}$ long, $0.80\,\text{m}$ high) and an infield mega kicker ramp ($8.0\,\text{m}$ wide) seated on terrain.
  - 44 ultra-lightweight ($45\,\text{g}$) hollow plastic shell crash cubes stacked in roadway barriers, jump landing zone, drift apex, and crossover.
- **Interactions**:
  - Bottom-Center Virtual Joystick: compact low-profile analog joystick with progressive exponential response ($\text{steer} = \operatorname{sign}(x) \cdot |x|^{1.6}$) for precision micro-trim around center and full lock at edges.
  - Lowered-Horizon Action Chase Camera: low-angle follow cam keeping the buggy centered on screen while dropping the horizon line lower in the frame for a dramatic racing viewpoint.
  - Dynamic Speed-Sensitive Steering: automatic damping at high speeds ($\approx 47\,\text{km/h}$) prevents twitchy spinouts while preserving full lock at low speeds.
  - Momentum Transfer Crash Physics: the $4.2\,\text{kg}$ car has $93\times$ more inertia than the $45\,\text{g}$ plastic shell cubes, plowing through barriers with $<2\%$ speed drop while cubes explode into the air.
  - Suspension Debris Filter: wheels ignore lightweight debris ($w > 2.0$), preventing artificial vertical shock jolts when rolling over scattered plastic boxes.
  - Keyboard Controls: WASD or Arrow Keys for throttle and steering, Space for brake, `R` to reset, `F` to flip upright.
  - HUD "Reset" button: restores car to start grid ($z = -6.5\,\text{m}$) and rebuilds all 44 crash cubes.
  - 120Hz Display Interpolation: state snapshot lerp/slerp prevents retinal double-image ghosting on high-refresh mobile displays.
  - Motion Sensors Disabled: device gyro/accelerometer events are blocked for pure analog joystick control.

---

## Running Locally

Because there are no build steps, bundlers, or package managers, tests can be served with any static web server:

```bash
# Python 3
python3 -m http.server 8000

# Node.js (npx)
npx serve -l 8000
```

Open `http://localhost:8000` to view the test catalog, or navigate directly to `http://localhost:8000/tests/test1/`.

### Automated Headless Verification

Run the automated physics verification suite directly in Node.js (zero dependencies):

```bash
node tests/verify.js
```

Verifies resting stability, static friction thresholds, volume conservation, non-tunneling boundary collision, and multi-instance concurrency isolation.

---

## Mobile Sensor Testing & Permissions

- **HTTPS Requirement**: Mobile browsers (iOS Safari, Android Chrome) restrict `DeviceMotionEvent` and `DeviceOrientationEvent` to secure origins (`https://` or `localhost`).
- **Permissions Modal**: On iOS 13+, motion sensors require explicit user permission. The `#intro` card's "Start" button initiates the permission prompt.
- **Desktop Fallback**: If sensors are unavailable or permission is denied, dragging on screen transparently tilts the room, computing equivalent gravity vectors.

---

## Physics Verification Checklist

When benchmarking or modifying physics routines in `src/xpbd.js`:

1. **Resting Stability**: A single cube on a level floor must remain completely still with zero angular drift or resting creep.
2. **Static Friction Threshold**: On a floor tilted to $\approx 18^\circ$, cubes must remain stationary without sliding ($\mu_s = 0.55$).
3. **Stacking Convergence**: Stacks of 3–5 cubes must settle stably within 1–2 seconds.
4. **Volume Conservation**: Compressing the soft body against walls must induce lateral bulging without overall volume shrinkage ($< 0.0001\%$ drift).
5. **No Tunneling**: Hard shaking or rapid twisting must not cause cubes or cloth vertices to tunnel through the 6 boundary walls.
