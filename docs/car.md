# RC Buggy Car Asset Reference (`src/car.js`)

The **RC Buggy Car** is a modular, zero-dependency vehicle dynamics asset developed for the browser-based Extended Position-Based Dynamics (XPBD) simulation engine.

It models a high-performance **off-road competition RC buggy** featuring oversized all-terrain knobby tires, long-travel visible coilover suspensions, realistic spring-damper kinematics, Ackermann-style steering, and 4WD electric motor drivetrain.

---

## 1. Discretization & Mechanical Specifications

Calibrated to the standard $3.0\,\text{m}$ high studio room:

| Parameter | Value | Description |
|---|---|---|
| **Chassis Scale** | $1.0\times$ (configurable) | Global dimension scalar |
| **Chassis Core Dimensions** | $0.40\,\text{m} \times 0.18\,\text{m} \times 0.65\,\text{m}$ | Low center-of-gravity faceted buggy chassis |
| **Total Mass** | $4.2\,\text{kg}$ | Scale-calibrated rigid body inertia |
| **Wheelbase** | $0.68\,\text{m}$ | Distance between front and rear axle centers |
| **Track Width** | $0.58\,\text{m}$ | Lateral distance between left and right tire centers |
| **Tire Diameter** | $0.30\,\text{m}$ ($R = 0.15\,\text{m}$) | Oversized knobby off-road competition tires |
| **Tire Width** | $0.11\,\text{m}$ | Deep-dish beadlock all-terrain rubber footprint |
| **Suspension Rest Length** | $0.26\,\text{m}$ | Static uncompressed suspension strut length |
| **Suspension Stroke (Travel)** | $0.16\,\text{m}$ | Maximum compression travel before bump-stop |
| **Spring Stiffness ($k$)** | $450\,\text{N/m}$ (Medium) | Linear Hookean restoration stiffness |
| **Damper Coefficient ($c$)** | $28\,\text{N}\cdot\text{s/m}$ (Medium) | Velocity-proportional shock dissipation |
| **Motor Thrust Force** | $160\,\text{N}$ | 4WD electric motor torque (40 N per wheel) |
| **Max Steering Angle** | $\pm 30^\circ$ ($0.52\,\text{rad}$) | Front wheel steering sweep |

---

## 2. Suspension Kinematics & Physical Formulation

Each of the four corners (**Front-Left**, **Front-Right**, **Rear-Left**, **Rear-Right**) features an independent coilover strut with an upper mount anchored to the chassis body at $\mathbf{p}_{\text{mount}}$ and a lower contact point at the wheel hub $\mathbf{p}_{\text{hub}}$.

```
        Chassis Body Shell (XPBD Rigid Body)
     ┌────────────────────────────────────────┐
     │ ┌──────┐                      ┌──────┐ │
     └─┤ Mount├──────────────────────┤ Mount├─┘
       └──┬───┘                      └──┬───┘
          │  ▲                          │  ▲
          │  │ Helical Coil             │  │ Helical Coil
          │  │ Spring                   │  │ Spring
          │  │                          │  │
       ===█===                          ===█===
       │Damper│                         │Damper│
       │ Shaft│                         │ Shaft│
       ===█===                          ===█===
          │  │ Rest: 0.26m              │  │ Rest: 0.26m
          │  ▼ Travel: 0.16m            │  ▼ Travel: 0.16m
       ┌──┴────────┐                 ┌──┴────────┐
       │ Wheel Hub │                 │ Wheel Hub │
       └──┬────────┘                 └──┬────────┘
      (===) Knobby                  (===) Knobby
     (     ) Big Tire              (     ) Big Tire
      (===)                         (===)
────────────────────────────────────────────────────
                   Ground / Floor
```

### 2.1 Spring-Damper Normal Force
At each substep $\Delta t$, the suspension length $L$ is measured by raycasting from $\mathbf{p}_{\text{mount}}$ along the chassis down axis toward the terrain/floor or obstacles:
$$\Delta x = \max(0, L_0 - L)$$
where $L_0$ is the uncompressed rest length ($0.26\,\text{m}$). The vertical suspension force applied to the chassis at the mount point is:
$$F_{\text{susp}} = \max\left(0,\, k \cdot \Delta x - c \cdot v_{\text{rel}}\right)$$
where:
- $k$ is the spring stiffness ($\text{N/m}$).
- $c$ is the damping coefficient ($\text{N}\cdot\text{s/m}$).
- $v_{\text{rel}} = -\mathbf{v}_{\text{mount}} \cdot \hat{\mathbf{u}}_{\text{chassis}}$ is the compression velocity along the suspension axis.

### 2.2 Visual Spring & Wishbone Deformation
To maintain high performance without dynamic vertex allocation:
1. **Helical Spring Scaling**: The 3D helical coil mesh scales along its local Y-axis in real time ($\text{scale}_y = L / L_0$).
2. **Wishbone Angle Pivoting**: The control A-arms rotate around their pivot pins proportional to $(1 - L / L_0) \times 20^\circ$.
3. **Damper Rod Sliding**: The chrome shock absorber cylinder telescopes within the anodized outer body.

---

## 3. Drivetrain & Tire Traction Model

### 3.1 4WD Motor Drive & Braking
The motor provides full-time four-wheel drive:
$$F_{\text{drive}} = \begin{cases} 
0.25 \cdot \text{throttle} \cdot F_{\text{motor}} & \text{if driving} \\ 
-\operatorname{sign}(v_{\text{long}}) \cdot \min(|v_{\text{long}}| \cdot 30, F_{\text{brake}}) & \text{if braking} \\ 
-8.0 \cdot v_{\text{long}} & \text{rolling resistance drag}
\end{cases}$$

### 3.2 Lateral Cornering Traction
To ensure responsive handling without unrealistic frictionless slipping, tire lateral grip opposes sideways drift velocity $v_{\text{lat}}$:
$$F_{\text{lat}} = -v_{\text{lat}} \cdot C_{\alpha}$$
where $C_{\alpha} = \mu_{\text{side}} \times 42\,\text{N}\cdot\text{s/m}$ is the cornering stiffness.

### 3.3 Gyroscopic Air-Control Stabilizer
When airborne (all 4 wheels disconnected from ground), a subtle attitude stabilizer applies corrective torque toward the world up-vector:
$$\boldsymbol{\tau}_{\text{air}} = 4.5 \cdot (\hat{\mathbf{u}}_{\text{chassis}} \times \hat{\mathbf{u}}_{\text{world}})$$
This replicates the gyroscopic pitch and roll control experienced in competition RC cars when tapping the throttle or brake mid-air, guaranteeing clean landings on all four wheels.

---

## 4. Visual Scene Graph & Three.js Hierarchy

The asset builds a detailed PBR hierarchy using Three.js standard and physical materials:

- **Root Group** (`THREE.Group`): Synchronized to the XPBD rigid body center $\mathbf{x}$ and orientation $\mathbf{q}$.
  - **Chassis Subgroup**:
    - Aerodynamic buggy shell with physical clearcoat lacquer (`clearcoat: 0.90`, `clearcoatRoughness: 0.10`).
    - Smoked polycarbonate cockpit visor.
    - Tubular roll cage frame with matte titanium finish.
    - High-downforce rear wing with aerodynamic endplates.
    - Front tubular bull-bar bumper.
    - Twin high-intensity rally LED spotlights (`emissiveIntensity: 0.8`).
    - Upper suspension mount struts with coilover springs.
  - **4× Wheel Assemblies**:
    - Steering pivot (front wheels rotate with steer angle).
    - Wheel hub and rotating axle (rolls forward/backward with linear speed).
    - Deep-dish beadlock rims with anodized gold or cyan accents.
    - Knobby all-terrain rubber tire with 14 extruded traction lugs.
  - **Dynamic RC Whip Antenna**:
    - High-flexibility spring steel wire.
    - Inertial tip tracking that bends backward under acceleration and forward under braking.
    - High-visibility fluorescent pennant flag.

---

## 5. API Reference (`RCCar`)

### Constructor
```javascript
const car = new RCCar(world, scene, {
  x: 0.0,                   // Initial X coordinate (default 0)
  y: null,                  // Initial Y coordinate (default: ground + offset)
  z: -1.2,                  // Initial Z coordinate (default -1.2m)
  scale: 1.0,               // Dimension scale factor
  chassisMass: 4.2,         // Chassis mass in kg
  bodyColor: 0x00e5ff,      // Shell color (hex)
  rimColor: 0xffb300,       // Wheel rim & spring color (hex)
  suspensionPreset: 'medium'// 'soft' | 'medium' | 'stiff'
});
```

### Methods
- `car.setThrottle(value)`: Sets throttle input $[-1.0, 1.0]$ (negative = reverse).
- `car.setSteering(value)`: Sets steering input $[-1.0, 1.0]$ (negative = left, positive = right).
- `car.setBrake(active)`: Activates or releases the brakes (`true` / `false`).
- `car.setSuspensionPreset('soft' | 'medium' | 'stiff')`: Adjusts spring stiffness ($300 - 650\,\text{N/m}$) and damping in real time.
- `car.step(dt)`: Advances suspension, drivetrain, and tire physics (called every simulation frame).
- `car.updateVisuals()`: Synchronizes visual meshes, coils, wishbones, and wheels with physics state.
- `car.reset(x, y, z)`: Teleports the car back to target coordinates with zero velocity.
- `car.flipUpright()`: Righting impulse to flip the car back onto its wheels if inverted.
- `car.destroy()`: Cleans up meshes from Three.js scene and unregisters the rigid body from XPBD.

---

## 6. Integration Across Tests

To use `RCCar` in any test scene:

```html
<!-- Include Three.js, XPBD, and RCCar -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="../../src/xpbd.js"></script>
<script src="../../src/car.js"></script>

<script>
  const world = new XPBD.World();
  const scene = new THREE.Scene();

  // Instantiate the buggy
  const buggy = new RCCar(world, scene, { x: 0, z: -1.2 });

  // In animation / simulation loop:
  function animate() {
    requestAnimationFrame(animate);
    world.step();
    buggy.step(1/60);
    buggy.updateVisuals();
    renderer.render(scene, camera);
  }
</script>
```
