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
