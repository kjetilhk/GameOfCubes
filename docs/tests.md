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
- **Focus**: High-performance vehicle dynamics, independent long-travel coilover suspension, 4WD motor drive, and tire traction friction.
- **Scene**: Competition RC buggy featuring oversized knobby wheels, visible 3D helical springs, and roll cage in the 3.0m studio room with optional terrain bumps.
- **Interactions**:
  - Driving Controls: WASD or Arrow Keys for 4WD throttle and steering, Space for brake, on-screen touch D-Pad for mobile.
  - "Suspension: Soft / Medium / Stiff": real-time spring stiffness ($300 - 650\,\text{N/m}$) and damping adjustment.
  - "Cam: Chase / Orbit": switches between smooth dynamic follow-cam and free 3D orbit camera.
  - "Add Bumps": spawns terrain curbs and bumps to test wheel articulation and suspension travel.
  - "Flip Upright": rights the buggy if flipped or inverted.
  - "Drop Cube": drops rigid blocks onto or in front of the car.
  - Touch/Mouse Drag: grab the roll cage or wheels with pointer to lift, swing, and drop the car to watch the suspensions absorb the impact.

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
