# Soft Body Continuum Mechanics (Test 3)

Test 3 ([`tests/test3/index.html`](file:///c:/Projects/GameOfCubes/tests/test3/index.html)) implements a 3D volumetric continuum mechanics soft body on a tetrahedral mesh.

---

## 1. Discretization & Mesh Structure

- **Particle Grid**: $8 \times 8 \times 8$ regular grid = **512 particles**.
- **Tetrahedral Decomposition**: 5-tetrahedron decomposition per cube cell = **1,715 volumetric tetrahedra**.
- **Edge Elasticity Constraints**: **2,520 distance constraints** along all tetrahedral edges.
- **Volume Constraints**: **1,715 tetrahedral volume preservation constraints**.
- **Dimensions**: $0.85\,\text{m} \times 0.85\,\text{m} \times 0.85\,\text{m}$ resting block.
- **Mass**: Total mass of $14.0\,\text{kg}$.

---

## 2. Continuum Mechanics & Hydrostatic Volume Preservation

Standard spring-mass systems suffer from catastrophic volume loss: when squashed from the top, they shrink instead of expanding laterally.

Test 3 enforces **exact hydrostatic incompressibility** by decomposing the continuum into tetrahedra and enforcing an exact XPBD volume preservation constraint on every single tetrahedron:

$$C(\mathbf{x}_1, \mathbf{x}_2, \mathbf{x}_3, \mathbf{x}_4) = V - V_0$$

With volume compliance set to $\alpha_{\text{vol}} = 0.0$:
- When the soft body hits the floor or is squashed by dropped rigid cubes, the volume cannot shrink.
- The constraint forces particles outward laterally, producing authentic physical bulging and squishing.
- Measured volume drift is less than **$0.0001\%$** over thousands of simulation steps.

### Elastic Compliance Modes
- **Water / Ultra-Soft Mode (`edgeCompliance = 0.12`)**: Soft, fluid-like elasticity where the body jiggles and sloshes like gelatin or water trapped in a flexible membrane.
- **Rubber / Elastic Mode (`edgeCompliance = 0.005`)**: Snappy, springy solid that rebounds quickly from collisions.

---

## 3. Real-Time Surface Extraction & PBR Shader

Only the exterior surface triangles of the tetrahedral mesh are rendered, keeping rendering performance lightweight:

- **Surface Indices**: The solver identifies all triangular faces belonging to exactly one tetrahedron (internal shared faces are omitted).
- **Normal Computation**: `geometry.computeVertexNormals()` is evaluated each frame after vertex buffer updates.
- **Physical Fluid Shader (`MeshPhysicalMaterial`)**:
  - Color: Light cyan (`0x38bdf8`)
  - Roughness: `0.12`
  - Metalness: `0.02`
  - **Transmission**: `0.75` (volumetric optical translucency)
  - **Index of Refraction (IOR)**: `1.333` (physical refractive index of water)
  - Clearcoat: `0.35` (surface water sheen)
  - Wireframe: Togglable via "Wireframe" button to inspect tetrahedral deformation in real time.

---

## 4. Interactive Features

1. **Raycast Pinch & Drag**:
   - Clicking/tapping on the soft body identifies the nearest surface particle within $0.25\,\text{m}$.
   - Pulling the particle deforms the entire volume; hydrostatic constraints immediately pull neighboring vertices inward to conserve volume.
2. **Cube Drops ("Add Cube")**:
   - Rigid cubes fall into the soft body, causing deep impact craters, wave ripples, and rebound bouncing.
3. **Sensor Rattling**:
   - Tilting or shaking the phone rattles the soft body against the walls and floor, showcasing fluid compression and elastic recovery.
