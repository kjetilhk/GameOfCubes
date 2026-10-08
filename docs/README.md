# GameOfCubes Documentation

Interactive testbed and laboratory for developing and benchmarking a custom **Extended Position-Based Dynamics (XPBD)** physics engine in the browser (based on Müller et al., *"Detailed Rigid Body Simulation with Extended Position Based Dynamics"*).

---

## Documentation Index

1. **[XPBD Physics Engine (`docs/xpbd.md`)](xpbd.md)**
   - Core architecture of `src/xpbd.js`
   - Mathematical formulation of XPBD compliance ($\alpha$)
   - Non-inertial fictitious reference frame dynamics (Coriolis, centrifugal, Euler forces)
   - Hydrostatic tetrahedral volume conservation ($C = V - V_0$)
   - Separating-Axis Theorem (SAT) box–box contact manifold generation
   - Position & velocity constraint solvers
   - Zero-allocation memory patterns

2. **[Test Room & Rendering Pipeline (`docs/testroom.md`)](testroom.md)**
   - Standard 3.0-meter SI room calibration and responsive projection
   - Physically Based Rendering (PBR) & ACES Filmic tone mapping
   - Calibrated 3-point studio lighting (Key, Directional Fill, Ambient Fill)
   - DeviceMotion mobile sensor pipeline and desktop drag-to-tilt fallback
   - Real-time FPS monitoring and UI component system (`src/common.css`)

3. **[Cloth Simulation (`docs/cloth.md`)](cloth.md)**
   - Test 2 architecture (`tests/test2/index.html`)
   - High-density $48 \times 48$ particle grid (2,304 vertices, 8,930 constraints)
   - Inextensible warp/weft with compliant diagonal shear
   - Procedural interwoven canvas texture and bump relief map
   - Spatial hash self-collision detection
   - Dynamic pinning and raycaster vertex grabbing

4. **[Soft Body Simulation (`docs/softbody.md`)](softbody.md)**
   - Test 3 architecture (`tests/test3/index.html`)
   - Continuum volumetric elasticity on a tetrahedral mesh (1,715 tetrahedra, 512 particles)
   - True hydrostatic incompressibility with $0.0001\%$ volume drift
   - Water-like fluid compliance and optical transmission shader (`ior: 1.333`)
   - Raycast pinching and rigid cube drop collisions

5. **[Test Suite Guide (`docs/tests.md`)](tests.md)**
   - Overview of Test 1 (Cube Box), Test 2 (Cloth), and Test 3 (Soft Body)
   - HUD controls, touch gestures, and interactive hotkeys
   - Mobile sensor HTTPS requirements and verification checklist
   - Running locally and benchmarking

---

## Repository Structure

```
.
├── index.html          # Test suite landing page (catalog of tests)
├── AGENTS.md           # Developer and agent guidance
├── docs/               # Technical documentation
│   ├── README.md       # Documentation index (this file)
│   ├── xpbd.md         # XPBD physics engine reference
│   ├── testroom.md     # 3.0m room, PBR, lighting, sensors
│   ├── cloth.md        # Cloth simulation reference
│   ├── softbody.md     # Soft body continuum mechanics reference
│   └── tests.md        # Test suite catalog & developer guide
├── src/
│   ├── xpbd.js         # Core XPBD physics engine (Müller et al.)
│   ├── room.js         # Shared 3.0m room, studio lighting, sensors, FPS meter
│   └── common.css      # Shared responsive UI styling tokens and HUD
└── tests/
    ├── test1/          # Test 1: Cube Box (6DOF mobile XPBD rigid bodies)
    ├── test2/          # Test 2: Cloth Simulation (compliant XPBD cloth)
    └── test3/          # Test 3: Soft Body Simulation (volumetric tetrahedral mesh)
```
