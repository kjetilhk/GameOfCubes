# Cloth Simulation (Test 2)

Test 2 ([`tests/test2/index.html`](file:///c:/Projects/GameOfCubes/tests/test2/index.html)) simulates an interactive, high-density cotton cloth fabric sheet inside the 3.0-meter room.

---

## 1. Discretization & Mesh Structure

- **Particle Grid**: $48 \times 48$ regular grid of XPBD particles = **2,304 vertices** and **4,608 triangular faces**.
- **Sheet Dimensions**: $1.6\,\text{m} \times 1.6\,\text{m}$.
- **Mass**: Total mass of $1.6\,\text{kg}$ ($m_i \approx 0.7\,\text{g}$ per particle).
- **Initial Location**: Centered at $(0, h_y \times 0.35, -d \times 0.5) = (0, 0.525\,\text{m}, -1.2\,\text{m})$.

---

## 2. Constraint Network & Physical Compliance

The fabric is governed by **8,930 XPBD distance constraints**:

```
        (i, j) ───[Structural Warp]─── (i+1, j)
          │   ╲                      ╱   │
          │     ╲  [Shear]  [Shear]╱     │
    [Structural]   ╲            ╱   [Structural]
        Weft         ╲        ╱         Weft
          │            ╲    ╱            │
          │              ╳               │
          │            ╱    ╲            │
          │          ╱        ╲          │
        (i, j+1) ───[Structural Warp]─── (i+1, j+1)
```

1. **Structural Warp & Weft Constraints (Horizontal & Vertical)**:
   - Compliance: $\alpha = 0.000004$ ($4 \times 10^{-6}$).
   - Inextensible fabric behavior: Prevents rubber-band stretching under gravity while allowing natural catenary draping.
2. **Shear Constraints (Diagonal Diagonals)**:
   - Compliance: $\alpha = 0.02$.
   - Compliant shear allows the fabric to bend along diagonal lines, creating authentic folds and wrinkles as corners shift or rigid bodies collide.
3. **Zero Bending Constraints ($\alpha_{\text{bend}} = 0$)**:
   - Eliminates artificial paper-like spring-back and curling, giving the sheet a heavy textile drape.

---

## 3. Procedural Cotton Canvas Texture

To maintain the project's zero-external-dependency requirement, Test 2 dynamically synthesizes a $512 \times 512$ procedural woven cotton texture and matching bump relief map on an HTML5 canvas at initialization:

- **Weave Simulation**: Generates 32 interlaced threads per axis. Each crossing point alternates between warp-over-weft and weft-over-warp with directional linear shading gradients.
- **Micro-Grain Fiber Fuzz**: Applies subtle random luminance jitter simulating microscopic cotton lint and fiber fuzz under grazing illumination.
- **Bump Relief Map**: Paired with `bumpScale: 0.001` on `MeshStandardMaterial`, producing authentic tactile texture under the 3-point studio lighting.

---

## 4. Interactive Features

1. **Corner Pins ("Unpin / Pin Top")**:
   - By default, vertices `0` (top-left) and `nx - 1` (top-right) have their inverse mass set to zero (`invM = 0`), anchoring them to fixed coordinates with visual brass spheres (`MeshPhysicalMaterial`, `metalness: 0.85`).
   - Clicking "Unpin" unlocks the corners, allowing the entire sheet to fall, drape, and crumple on the floor.
2. **Raycast Vertex Grabbing**:
   - When clicking/tapping the cloth on screen, a Three.js raycaster finds the closest particle within $0.20\,\text{m}$.
   - While dragging, the vertex is locked directly to the cursor's intersection with a virtual plane at the cloth's depth, allowing dynamic pulling, stretching, and waving.
3. **Self-Collision ("Self Collision: On / Off")**:
   - Optional spatial-hashing particle self-collision prevents overlapping folds from intersecting during crumpling.
4. **Rigid Body Collisions ("Add Cube")**:
   - Spawns 38 cm rigid cubes that fall into the cloth. The XPBD solver computes two-way impulses between the rigid bodies and cloth particles, causing the cloth to sag, hammock, and deform realistically under the weight of the cubes.

---

## 5. Cloth Over Sphere Benchmark (Test 4)

Test 4 ([`tests/test4/index.html`](file:///c:/Projects/GameOfCubes/tests/test4/index.html)) provides the classical computer graphics cloth draping benchmark:

- **Horizontal Plane Geometry (`plane: 'xz'`)**: A $1.5\,\text{m} \times 1.5\,\text{m}$ sheet ($36 \times 36$ particles, 1,296 vertices, 5,042 constraints) is created horizontally at $y = 1.0\,\text{m}$, centered above the sphere.
- **Curved Obstacle ($0.7\,\text{m}$ Sphere)**: An analytical sphere ($R = 0.35\,\text{m}$, center $(0, 0, -1.2)\,\text{m}$, $1.5\,\text{m}$ above the floor) is solved during substep particle collisions.
- **Self-Collision Active by Default**: Zero-allocation 3D spatial hashing resolves fold-on-fold contact as the draping fabric forms radial pleats and flutes down the sphere's sides.
- **Static Studio Physics (No Gyro)**: Gravity is fixed downwards at $(0, -9.81, 0)\,\text{m/s}^2$ without motion sensors or permission modals.
- **3D Orbit Camera**: Dragging outside the cloth orbits the camera in 3D around the pedestal to observe drapery from all angles.
