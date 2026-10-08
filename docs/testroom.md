# Test Room Environment & Rendering Pipeline

The test room environment, physically based rendering (PBR) setup, studio lighting, and device sensors are managed in [`src/room.js`](file:///c:/Projects/GameOfCubes/src/room.js) and styled via [`src/common.css`](file:///c:/Projects/GameOfCubes/src/common.css).

---

## 1. Physical Scale & Viewport Calibration

Across all tests in the repository, the room scale is calibrated to true **SI units (meters)**:

- **Height**: Standard room height is **3.0 meters** (`roomHeight = 3.0 m`, half-height $h_y = 1.5\,\text{m}$).
- **Depth**: Fixed at $2.4\,\text{m}$ ($d = 2.4\,\text{m}$), spanning $Z \in [-2.4\,\text{m}, 0\,\text{m}]$. The front screen/glass corresponds to $Z = 0.0\,\text{m}$.
- **Width**: Responsive derived half-width based on the viewport aspect ratio ($h_x = h_y \times \text{aspect}$). This ensures the 3-meter vertical height fits completely in view on any screen without vertical letterboxing.
- **Camera Calibration**: The perspective camera FOV ($38^\circ$) dynamically positions the camera at:
  $$\text{dist} = \max\left(\frac{h_y}{\tan(\text{fov}/2)}, \frac{h_x}{\tan(\text{fov}/2) \cdot \text{aspect}}\right)$$
  looking at the center-depth of the room $(0, 0, -d \times 0.3)$.

---

## 2. Physically Based Rendering (PBR)

Rendering uses Three.js r128 with modern PBR standards:

- **Color Management**: Linear color space with `sRGBEncoding` output encoding (`renderer.outputEncoding = THREE.sRGBEncoding`).
- **Tone Mapping**: **ACES Filmic Tone Mapping** (`renderer.toneMapping = THREE.ACESFilmicToneMapping`, `renderer.toneMappingExposure = 1.0`). ACES Filmic applies the industry-standard Academy Color Encoding System S-curve, compressing bright specular highlights smoothly while preserving deep, saturated contrast.
- **Shadow Mapping**: 2048×2048 PCF Soft Shadows (`THREE.PCFSoftShadowMap`) with `shadow.radius = 2.5` for gentle, natural penumbra falloff and `shadow.normalBias = 0.02` to prevent self-shadowing acne.

---

## 3. Calibrated Studio Lighting (3-Point Setup)

The scene features a studio 3-point lighting setup with soft shadow translucency and clean room definition:

```
                          Ceiling (Y = +hy)
                                  │
    Fill Light 1 (Left)           │           Key Light (Right)
    0xcfe0f5, Int: 0.28           │           0xfff4e6, Int: 0.56
    Pos: (-0.7*hx, 0.7*hy, 0.35)  │           Pos: (1.35*hx, 0.85*hy, 0.05)
    Target: (-0.3*hx, -0.25*hy)   │           Target: (-0.1*hx, -0.25*hy)
              \                   │                   /
               \                  │                  /
                ▼                 │                 ▼
           Left Wall ───────── Objects ───────── Right Wall
                                  │
                                  │
                                Floor
                     Ambient Light (Fill Light 2)
                         0xdde5f0, Int: 0.21
```

1. **Key Light (`THREE.DirectionalLight`)**:
   - Color: Warm primary (`0xfff4e6`).
   - Intensity: `0.56` (reduced by 50% for glare-free PBR highlights).
   - Position: Front-right aperture ($X = 1.35 \times h_x, Y = 0.85 \times h_y, Z = 0.05$), casting soft PCF shadows (`radius = 2.5`, `bias = -0.0003`, `normalBias = 0.02`).
   - Function: Establishes dominant 3/4 directional form, edge highlights, and primary cast shadows.

2. **Fill Light 1 (`THREE.DirectionalLight`)**:
   - Color: Cool soft fill (`0xcfe0f5`).
   - Intensity: `0.28` (50% of Key Light, classic 2:1 studio ratio).
   - Position: Front-left aperture ($X = -0.7 \times h_x, Y = 0.7 \times h_y, Z = 0.35$), aimed directly into the left wall and cast shadow region.
   - Function: Eliminates stark shadow cutouts on the left wall and softens object shadows.

3. **Fill Light 2 (`THREE.AmbientLight`)**:
   - Color: Neutral ambient sky bounce (`0xdde5f0`).
   - Intensity: `0.21`.
   - Function: Uniform omnidirectional illumination ensuring cast shadows, ceiling, and back corners are never pitch-black voids.

---

## 4. Dark Gray Materials Palette

All room meshes use PBR `THREE.MeshStandardMaterial`:

| Surface | Color | Roughness | Metalness | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Walls & Ceiling** | `0x242830` | `0.85` | `0.05` | Dark slate gray with subtle diffuse falloff |
| **Back Wall** | `0x1b1f25` | `0.90` | `0.04` | Recessed dark charcoal for stage depth |
| **Floor** | `0x16191f` | `0.65` | `0.10` | Deep slate with soft specular contact sheen |

---

## 5. Device Sensors & Interaction Pipeline

Implemented via `RoomEnv.setupMotionSensors(options)`:

1. **Mobile Motion (`devicemotion`)**:
   - Requests `DeviceMotionEvent.requestPermission()` on iOS Safari.
   - Converts device accelerometer vectors (`-g.x, -g.y, -g.z`) to screen space coordinates.
   - Converts gyro rotation rates ($\alpha, \beta, \gamma$) to box-space angular velocity $\boldsymbol{\omega}$ and computes angular acceleration $\dot{\boldsymbol{\omega}}$ via finite differences.
2. **Desktop Fallback (Drag-to-Tilt)**:
   - When device motion is inactive or blocked, mouse/touch dragging tilts the virtual box ($\text{tiltX}, \text{tiltY} \in [-1.5, 1.5]$ radians).
   - Synthetic gravity is derived from tilt angles:
     $$\mathbf{g} = (g \sin\theta_x \cos\theta_y, -g \cos\theta_x \cos\theta_y, -g \sin\theta_y)$$
3. **Raycast Interception**:
   - Interactive tests (like Cloth and Soft Body) pass `onPointerDrag` to intercept clicks/touches before tilt handling occurs.

---

## 6. Interactive Desktop ViewCube (Gravity Controller)

Implemented via `RoomEnv.createViewCube(options)` and auto-initialized by `RoomEnv.setupMotionSensors()`:

When viewed on desktop computers or environments without mobile motion sensors (`devicemotion`), an interactive 3D **ViewCube** widget is rendered in the top-right corner to control the simulation's gravity direction in real time:

```
    ┌──────────────────────┐
    │  ⌂  [ FLOOR (DOWN) ] │  ← Home reset button & active direction badge
    ├──────────────────────┤
    │                      │
    │     ┌──────┐         │
    │    ╱ TOP  ╱│         │  ← 3D Canvas with axonometric CAD cube
    │   ┌──────┬─┤         │    - Inset face panels with 3-point shading
    │   │FRONT │R│         │    - Face hover highlights & direct clicking
    │   │  ●→  │─┘         │    - Internal glowing gravity vector arrow
    │   └──────┘           │    - Free 3D trackball dragging
    │                      │
    ├──────────────────────┤
    │ [Floor] [Left] [Right│  ← Quick 1-click direction presets
    │ [Ceil]  [Front][Back]│
    │    [ 0-G Float ]     │  ← Weightless zero-gravity toggle
    └──────────────────────┘
```

### Features:
1. **Interactive 3D Isometric Cube Canvas**:
   - High-DPI Canvas 2D rendering ($96 \times 96$ CSS px) with axonometric projection ($\text{pitch} = 22^\circ, \text{yaw} = -32^\circ$).
   - Inset beveled face panels with directional shading matching the room's 3-point lighting.
   - Hover detection via point-in-polygon math: hovering over any face highlights it in warm amber gold (`#f2b632`).
   - Clicking any visible face smoothly animates (slerp) the cube to make that face the active floor.
2. **Free 3D Trackball Dragging**:
   - Dragging directly on the cube orbits the orientation freely in all 3 dimensions using virtual camera basis vectors.
   - Gravity updates continuously in real time as the cube is manipulated.
3. **Internal Gravity Arrow**:
   - An internal glowing vector arrow shows the true 3D direction of gravitational pull inside the room.
4. **Quick Presets & Zero-G**:
   - One-click preset chips for `Floor`, `Left`, `Right`, `Ceil`, `Front`, `Back`, and `0-G Float`.
   - `0-G Float` sets $\mathbf{g} = (0, 0, 0)$, enabling weightless physics experiments.
5. **Home Reset Button (`⌂`)**:
   - Instantly snaps gravity back to default floor downward pull $(0, -9.81, 0)\,\text{m/s}^2$.
6. **Two-Way Synchronization**:
   - Dragging the main room canvas rotates the ViewCube in sync.
   - Dragging the ViewCube updates the room's synthetic tilt angles (`tiltX`, `tiltY`).
7. **Mobile Auto-Hide**:
   - Automatically hidden when real mobile hardware motion sensors (`devicemotion`) are detected, keeping phone viewports clean.

---

## 7. Shared Utilities

- **FPS Meter (`RoomEnv.createFpsMeter()`)**: Rolling frame counter updating the `#fps` HUD pill.
- **Toast Notifications (`RoomEnv.showNote(text, ms)`)**: Responsive toast notifications for sensor permissions, self-collision state, and hints.
- **Desktop ViewCube (`RoomEnv.createViewCube({ world, onGravityChange })`)**: 3D gravity gizmo and direction controller.
- **Beveled Rounded Cube Geometry (`RoomEnv.roundedCube(size, radius, segments)`)**: Generates true beveled cubes whose rounded edges catch PBR clearcoat specular glints.
