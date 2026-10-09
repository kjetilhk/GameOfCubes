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
| **Wheelbase** | $0.70\,\text{m}$ | Distance between front and rear axle centers |
| **Track Width** | $0.82\,\text{m}$ | Wide lateral stance clearing double-wide tires |
| **Tire Diameter** | $0.32\,\text{m}$ ($R = 0.16\,\text{m}$) | Oversized knobby off-road competition tires |
| **Tire Width** | $0.22\,\text{m}$ | Double-wide monster knobby beadlock rubber footprint |
| **Suspension Rest Length** | $0.32\,\text{m}$ | Extended uncompressed suspension strut length |
| **Suspension Stroke (Travel)** | $0.22\,\text{m}$ | Extra long-travel bouncy compression stroke |
| **Spring Stiffness ($k$)** | $130\,\text{N/m}$ (Medium) | Soft, highly compliant bouncy restoration stiffness ($85\,\text{N/m}$ Soft, $240\,\text{N/m}$ Stiff) |
| **Damper Coefficient ($c$)** | $7.0\,\text{N}\cdot\text{s/m}$ (Medium) | Under-damped shock dissipation allowing expressive body roll & bounce |
| **Motor Thrust Force** | $58.0\,\text{N}$ | 4WD electric motor torque (14.5 N per wheel) |
| **Braking Force** | $70.0\,\text{N}$ | Progressive decelerating friction force |
| **Max Steering Angle** | $\pm 23^\circ$ ($0.40\,\text{rad}$) | Progressive speed-damped front wheel steering sweep |
| **Top Speed** | $13.0\,\text{m/s}$ ($\approx 47\,\text{km/h}$) | High-speed electric brushless motor cap |

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
          │  │ Rest: 0.32m              │  │ Rest: 0.32m
          │  ▼ Travel: 0.22m            │  ▼ Travel: 0.22m
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
where $L_0$ is the uncompressed rest length ($0.32\,\text{m}$). The vertical suspension force applied to the chassis at the mount point is:
$$F_{\text{susp}} = \max\left(0,\, k \cdot \Delta x - c \cdot v_{\text{rel}}\right)$$
where:
- $k$ is the spring stiffness ($\text{N/m}$).
- $c$ is the damping coefficient ($\text{N}\cdot\text{s/m}$).
- $v_{\text{rel}} = -\mathbf{v}_{\text{mount}} \cdot \hat{\mathbf{u}}_{\text{chassis}}$ is the compression velocity along the suspension axis.

### 2.2 Terrain & Debris Filtering
Suspension length queries test the procedural terrain surface height (`world.getTerrainHeight(x, z)`), elevated ramp profiles (`ramp.getHeight(x, z)`), and heavy obstacles (`b.invM <= 2.0`). Lightweight debris such as hollow plastic shell cubes ($m = 0.045\,\text{kg}, w > 2.0$) are ignored by the suspension raycast, preventing wheels from experiencing artificial vertical jolt impulses when rolling over scattered debris.

### 2.3 Visual Spring & Wishbone Deformation
To maintain high performance without dynamic vertex allocation:
1. **Helical Spring Scaling**: The 3D helical coil mesh scales along its local Y-axis in real time ($\text{scale}_y = L / L_0$).
2. **Wishbone Angle Pivoting**: The control A-arms rotate around their pivot pins proportional to $(1 - L / L_0) \times 20^\circ$.
3. **Damper Rod Sliding**: The chrome shock absorber cylinder telescopes within the anodized outer body.

---

## 3. Drivetrain & Tire Traction Model

### 3.1 4WD Motor Drive, Braking & Free-Wheeling Coast
The motor provides full-time four-wheel drive up to $26.0\,\text{m/s}$ ($\approx 94\,\text{km/h}$):
$$F_{\text{drive}} = \begin{cases} 
0.25 \cdot \text{throttle} \cdot F_{\text{motor}} \cdot \max(0, 1 - v_{\text{long}} / v_{\max}) & \text{if driving forward} \\ 
-\operatorname{sign}(v_{\text{long}}) \cdot \min(|v_{\text{long}}| \cdot 25, 0.25 \cdot F_{\text{brake}}) & \text{if active braking} \\ 
-\operatorname{sign}(v_{\text{long}}) \cdot \min(|v_{\text{long}}| \cdot 1.2, 0.95) - 0.05 \cdot v_{\text{long}} & \text{free-wheeling coast (throttle released)}
\end{cases}$$
When the joystick is released, the car continues rolling freely under its own momentum with realistic, gentle mechanical rolling resistance, smoothly and gradually slowing down over long distances rather than locking abruptly. Active motor braking is engaged when pulling the stick backward while in forward motion.

### 3.2 Dynamic Speed-Sensitive Steering
To prevent high-speed twitchiness and spinouts while retaining tight maneuverability at low speeds, steering is dynamically damped based on forward velocity:
$$\theta_{\text{target}} = -\text{steer} \cdot \theta_{\max} \cdot \max\left(0.35,\, 1.0 - \frac{|v_{\text{fwd}}|}{v_{\max}} \times 0.55\right)$$
where $\theta_{\max} = 0.40\,\text{rad}$ ($\approx 23^\circ$) and $v_{\max} = 26.0\,\text{m/s}$. A rate-limiting lerp smooths instantaneous steer commands over time ($\text{steerSpeed} = 4.5\,\text{rad/s}$).
Additionally, the virtual joystick applies a progressive exponential power curve:
$$\text{steer} = \operatorname{sign}(x) \cdot |x|^{1.6}$$
providing micro-trim precision around center stick with progressive lock at outer deflections.

### 3.3 Lateral Cornering Traction & Drift Breakaway
Tire lateral grip opposes sideways velocity $v_{\text{lat}}$, but is physically clamped by Coulomb normal load friction:
$$F_{\text{lat}} = \operatorname{clamp}\left(-v_{\text{lat}} \cdot C_{\alpha},\, -\mu_{\text{side}} \cdot F_{\text{normal}},\, \mu_{\text{side}} \cdot F_{\text{normal}}\right)$$
where $F_{\text{normal}} = \max(12\,\text{N}, F_{\text{susp}})$. When lateral forces exceed this threshold during aggressive high-speed cornering ($26\,\text{m/s}$), the tires cleanly break away into a smooth, authentic powerslide/drift instead of tripping the buggy into a rollover.

### 3.4 Rollover Prevention & Anti-Roll Sway Bars
High-speed stability is reinforced through multi-stage vehicle dynamics:
1. **Yaw-Decoupled Steering Torque**: Tire traction torque is strictly projected onto the chassis vertical axis $\hat{\mathbf{u}}_{\text{chassis}}$, eliminating artificial roll moments caused by ground contact height offsets.
2. **Front & Rear Anti-Roll Bars (ARB)**: Transfers stiffness between left and right suspension arms ($k_{\text{arb}} = 45\,\text{N}$ per unit compression delta), keeping the chassis level during cornering.
3. **Aerodynamic Downforce**: Progressive downforce from front and rear wings scales with $v_{\text{fwd}}^2$ ($F_{\text{down}} \le 32\,\text{N}$), sucking the buggy into the track at top speed.
4. **Active Low-CoM Righting Moment**: Replicating a bottom-mounted LiPo battery and brushless motor, roll tilt is strongly resisted and damped:
   $$\boldsymbol{\tau}_{\text{roll}} = \hat{\mathbf{f}}_{\text{forward}} \cdot \left(-38 \cdot \sin(\phi_{\text{roll}}) - 12 \cdot \omega_{\text{roll}}\right)$$

### 3.5 Gyroscopic Air-Control Stabilizer
When airborne (all 4 wheels disconnected from ground), a subtle attitude stabilizer applies corrective torque toward the world up-vector:
$$\boldsymbol{\tau}_{\text{air}} = 4.5 \cdot (\hat{\mathbf{u}}_{\text{chassis}} \times \hat{\mathbf{u}}_{\text{world}})$$
This replicates the gyroscopic pitch and roll control experienced in competition RC cars when tapping the throttle or brake mid-air, guaranteeing clean landings on all four wheels.

---

## 4. Visual Scene Graph & Three.js Hierarchy

The asset builds a detailed PBR hierarchy with double-sided shading enabled across all components (`side: THREE.DoubleSide`) to guarantee complete lighting fidelity from any camera angle:

- **Root Group** (`THREE.Group`): Synchronized to the XPBD rigid body center $\mathbf{x}$ and orientation $\mathbf{q}$.
  - **Chassis Subgroup**:
    - Aerodynamic buggy shell with physical clearcoat lacquer (`clearcoat: 0.90`, `clearcoatRoughness: 0.10`, `side: THREE.DoubleSide`).
    - Smoked polycarbonate cockpit visor (`roughness: 0.12`, `metalness: 0.85`).
    - Tubular roll cage frame with matte titanium finish (`roughness: 0.45`, `metalness: 0.85`).
    - High-downforce rear wing with aerodynamic endplates.
    - Front tubular bull-bar bumper.
    - Twin high-intensity rally LED spotlights (`emissiveIntensity: 0.9`).
    - Upper suspension mount struts with coilover springs.
  - **4× Wheel Assemblies**:
    - Steering pivot (front wheels rotate with steer angle).
    - Wheel hub and rotating axle (rolls forward/backward with linear speed).
    - Deep-dish beadlock rims with anodized gold or cyan accents (`clearcoat: 0.40`).
    - Knobby all-terrain rubber tire with 14 extruded traction lugs across double width.
  - **Dynamic RC Whip Antenna**:
    - High-flexibility spring steel wire.
    - Inertial tip tracking that bends backward under acceleration and forward under braking.
    - High-visibility fluorescent pennant flag (`side: THREE.DoubleSide`).

---

## 5. API Reference (`RCCar`)

### Constructor
```javascript
const car = new RCCar(world, scene, {
  x: 0.0,                   // Initial X coordinate (default 0)
  y: null,                  // Initial Y coordinate (default: ground + offset)
  z: -6.5,                  // Initial Z coordinate (default -6.5m)
  scale: 1.0,               // Dimension scale factor
  chassisMass: 4.2,         // Chassis mass in kg
  bodyColor: 0x00e5ff,      // Shell color (hex)
  rimColor: 0xffb300,       // Wheel rim & spring color (hex)
  suspensionPreset: 'medium',// 'soft' | 'medium' | 'stiff'
  maxSpeed: 26.0,           // Max top speed in m/s (~94 km/h)
  engineForce: 130.0,       // 4WD drive motor force in N
  brakeForce: 95.0,         // Braking deceleration force in N
  maxSteerAngle: 0.40,      // Max steer angle in radians (~23 deg)
  steerSpeed: 4.5           // Steering rotation speed in rad/s
});
```

### Methods
- `car.setThrottle(value)`: Sets throttle input $[-1.0, 1.0]$ (negative = reverse).
- `car.setSteering(value)`: Sets steering input $[-1.0, 1.0]$ (negative = left, positive = right).
- `car.setBrake(active)`: Activates or releases the brakes (`true` / `false`).
- `car.setSuspensionPreset('soft' | 'medium' | 'stiff')`: Adjusts spring stiffness ($85\,\text{N/m}$ Soft, $130\,\text{N/m}$ Medium, $240\,\text{N/m}$ Stiff) and damping in real time.
- `car.step(dt)`: Advances suspension, drivetrain, and tire physics (called every simulation frame).
- `car.updateVisuals(interpPos, interpQuat)`: Synchronizes visual meshes, coils, wishbones, and wheels with optional interpolated transform vectors for 120Hz retinal smoothness.
- `car.reset(x, y, z)`: Teleports the car back to target coordinates with zero velocity.
- `car.flipUpright()`: Righting impulse to flip the car back onto its wheels if inverted.
- `car.destroy()`: Cleans up meshes from Three.js scene and unregisters the rigid body from XPBD.

---

## 6. Integration Across Tests

To use `RCCar` in any test scene:

```html
<!-- Include Three.js r128, XPBD, and RCCar -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="../../src/xpbd.js"></script>
<script src="../../src/car.js"></script>

<script>
  const world = new XPBD.World();
  const scene = new THREE.Scene();

  // Instantiate the buggy
  const buggy = new RCCar(world, scene, { x: 0, z: -6.5 });

  // In animation / simulation loop with high-refresh display interpolation:
  let acc = 0, last = performance.now();
  const prevPos = new THREE.Vector3().copy(buggy.body.x);
  const prevQuat = new THREE.Quaternion().copy(buggy.body.q);
  const interpPos = new THREE.Vector3();
  const interpQuat = new THREE.Quaternion();

  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;

    prevPos.copy(buggy.body.x);
    prevQuat.copy(buggy.body.q);
    while (acc >= world.dt) {
      world.step();
      buggy.step(world.dt);
      acc -= world.dt;
    }

    const alpha = Math.min(1.0, Math.max(0.0, acc / world.dt));
    interpPos.lerpVectors(prevPos, buggy.body.x, alpha);
    interpQuat.slerpQuaternions(prevQuat, buggy.body.q, alpha);

    buggy.updateVisuals(interpPos, interpQuat);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
</script>
```
