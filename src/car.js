/* =========================================================================
   RC Buggy Car Asset — Extended Position-Based Dynamics (XPBD)
   High-performance, modular off-road RC buggy asset with big wheels,
   long-travel visible coilover suspensions, and realistic vehicle dynamics.
   ========================================================================= */

(function(global) {
'use strict';

const THREE = global.THREE;
if (!THREE) {
  throw new Error('RCCar requires Three.js (THREE global)');
}

const V = THREE.Vector3;
const Q = THREE.Quaternion;
const M4 = THREE.Matrix4;

// Scratch vectors for zero-allocation simulation updates
const _v1 = new V();
const _v2 = new V();
const _v3 = new V();
const _v4 = new V();
const _q1 = new Q();
const _up = new V(0, 1, 0);
const _forward = new V(0, 0, -1);
const _right = new V(1, 0, 0);

/* ================= Procedural Spring Geometry ================= */
function createCoilSpringGeometry(radius, wireRadius, turns, height, radialSegments, tubularSegments) {
  const points = [];
  const totalPoints = turns * tubularSegments;
  for (let i = 0; i <= totalPoints; i++) {
    const t = i / totalPoints;
    const angle = t * turns * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = (t - 0.5) * height;
    const z = Math.sin(angle) * radius;
    points.push(new V(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, totalPoints, wireRadius, radialSegments, false);
}

/* ================= Procedural Knobby Off-Road Wheel Geometry ================= */
function createBuggyWheelGeometry(radius, width, rimRadius) {
  const group = new THREE.Group();

  // 1. Rubber Tire Outer Cylinder
  const tireGeom = new THREE.CylinderGeometry(radius, radius, width, 24, 1, false);
  tireGeom.rotateZ(Math.PI / 2);

  // 2. Beadlock Rim
  const rimGeom = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 1.02, 20);
  rimGeom.rotateZ(Math.PI / 2);

  // 3. Central Hex Nut & Hub Cap
  const hubGeom = new THREE.CylinderGeometry(rimRadius * 0.35, rimRadius * 0.35, width * 1.08, 6);
  hubGeom.rotateZ(Math.PI / 2);

  // 4. Knobby Tread Lugs around circumference
  const lugCount = 14;
  const lugGeom = new THREE.BoxGeometry(width * 0.75, radius * 0.16, radius * 0.22);
  const lugsMerged = new THREE.Group();
  for (let i = 0; i < lugCount; i++) {
    const angle = (i / lugCount) * Math.PI * 2;
    const lug = new THREE.Mesh(lugGeom);
    lug.position.set(0, Math.cos(angle) * (radius * 0.98), Math.sin(angle) * (radius * 0.98));
    lug.rotation.x = -angle;
    lugsMerged.add(lug);
  }

  return { tireGeom, rimGeom, hubGeom, lugsMerged };
}

/* ================= RCCar Class Definition ================= */
class RCCar {
  constructor(world, scene, options = {}) {
    this.world = world;
    this.scene = scene;

    // Dimensions & Geometry Configuration (calibrated to 3m room scale)
    this.scale = options.scale || 1.0;
    this.wheelbase = (options.wheelbase || 0.68) * this.scale;   // Front to rear distance
    this.trackWidth = (options.trackWidth || 0.58) * this.scale; // Left to right distance
    this.wheelRadius = (options.wheelRadius || 0.15) * this.scale; // Big buggy tires
    this.wheelWidth = (options.wheelWidth || 0.11) * this.scale;
    this.chassisSize = (options.chassisSize || 0.40) * this.scale;
    this.chassisMass = options.chassisMass || 4.2; // kg

    // Suspension Parameters (Long-travel off-road buggy coilovers)
    this.suspensionRestLength = (options.suspensionRestLength || 0.26) * this.scale;
    this.suspensionTravel = (options.suspensionTravel || 0.16) * this.scale;
    this.suspensionStiffness = options.suspensionStiffness || 450.0; // N/m
    this.suspensionDamping = options.suspensionDamping || 28.0;     // N·s/m
    this.suspensionPreset = 'medium';

    // Drivetrain & Handling
    this.engineForce = options.engineForce || 160.0;    // Forward motor thrust
    this.brakeForce = options.brakeForce || 120.0;      // Braking force
    this.maxSteerAngle = options.maxSteerAngle || 0.52; // ~30 degrees max steer
    this.steerSpeed = options.steerSpeed || 6.5;        // Rad/s steering response
    this.tireFrictionForward = options.tireFrictionForward || 1.4;
    this.tireFrictionSide = options.tireFrictionSide || 1.6;

    // Dynamic State
    this.throttle = 0.0;  // -1 to 1
    this.steering = 0.0;  // -1 to 1
    this.currentSteerAngle = 0.0;
    this.isBraking = false;
    this.wheelSpinAngles = [0, 0, 0, 0]; // FL, FR, RL, RR

    // Initial Position & Orientation
    const posX = options.x !== undefined ? options.x : 0.0;
    const posY = options.y !== undefined ? options.y : -world.box.hy + this.wheelRadius + this.suspensionRestLength + 0.05;
    const posZ = options.z !== undefined ? options.z : -world.box.d * 0.5;

    // 1. Create Core XPBD Rigid Body (Chassis)
    this.body = new XPBD.Body(this.chassisSize, this.chassisMass / Math.pow(this.chassisSize, 3));
    this.body.x.set(posX, posY, posZ);
    this.body.px.copy(this.body.x);
    this.body.v.set(0, 0, 0);
    this.body.w.set(0, 0, 0);
    this.body.collisionGroup = 'rccar';
    this.body.sync();
    this.world.bodies.push(this.body);

    // 2. Visual Theme & PBR Materials
    const bodyColor = options.bodyColor !== undefined ? options.bodyColor : 0x00e5ff; // Electric Cyan
    const cageColor = options.cageColor !== undefined ? options.cageColor : 0x1f242d; // Dark matte titanium
    const rimColor = options.rimColor !== undefined ? options.rimColor : 0xffb300;   // Anodized racing gold

    this.materials = {
      body: new THREE.MeshPhysicalMaterial({
        color: bodyColor,
        roughness: 0.28,
        metalness: 0.15,
        clearcoat: 0.90,
        clearcoatRoughness: 0.10
      }),
      cockpit: new THREE.MeshPhysicalMaterial({
        color: 0x0a0c10,
        roughness: 0.12,
        metalness: 0.85,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08
      }),
      rollcage: new THREE.MeshStandardMaterial({
        color: cageColor,
        roughness: 0.45,
        metalness: 0.85
      }),
      springs: new THREE.MeshPhysicalMaterial({
        color: rimColor,
        roughness: 0.25,
        metalness: 0.90,
        clearcoat: 0.50
      }),
      damperShaft: new THREE.MeshStandardMaterial({
        color: 0xe0e6ed,
        roughness: 0.15,
        metalness: 0.95
      }),
      tires: new THREE.MeshStandardMaterial({
        color: 0x1a1c20,
        roughness: 0.88,
        metalness: 0.05
      }),
      rims: new THREE.MeshPhysicalMaterial({
        color: rimColor,
        roughness: 0.30,
        metalness: 0.85,
        clearcoat: 0.40
      }),
      hub: new THREE.MeshStandardMaterial({
        color: 0x111317,
        roughness: 0.50,
        metalness: 0.80
      }),
      lights: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x88ccff,
        emissiveIntensity: 0.8,
        roughness: 0.1
      }),
      flag: new THREE.MeshBasicMaterial({
        color: 0xff2a5f,
        side: THREE.DoubleSide
      }),
      antenna: new THREE.LineBasicMaterial({
        color: 0x8899aa
      })
    };

    // 3. Assemble Visual 3D Hierarchy
    this.rootGroup = new THREE.Group();
    this.chassisMesh = this._buildChassisVisuals();
    this.rootGroup.add(this.chassisMesh);

    // 4. Wheel & Suspension Mount Anchors (Local Chassis Space)
    // Indices: 0: Front-Left, 1: Front-Right, 2: Rear-Left, 3: Rear-Right
    const hx = this.trackWidth * 0.5;
    const hz = this.wheelbase * 0.5;
    const mountY = -this.chassisSize * 0.15;

    this.wheelMounts = [
      { id: 'FL', isFront: true,  isLeft: true,  localPos: new V(-hx, mountY, -hz) },
      { id: 'FR', isFront: true,  isLeft: false, localPos: new V( hx, mountY, -hz) },
      { id: 'RL', isFront: false, isLeft: true,  localPos: new V(-hx, mountY,  hz) },
      { id: 'RR', isFront: false, isLeft: false, localPos: new V( hx, mountY,  hz) }
    ];

    this.wheels = [];
    this._buildSuspensionAndWheels();

    // 5. RC Dynamic Whip Antenna
    this._buildAntenna();

    this.scene.add(this.rootGroup);
    this.updateVisuals();
  }

  /* ================= Visual Mesh Builders ================= */
  _buildChassisVisuals() {
    const chassis = new THREE.Group();

    // Main wedge-shaped buggy body shell
    const bodyGeom = new THREE.BoxGeometry(this.chassisSize * 0.88, this.chassisSize * 0.38, this.chassisSize * 1.55);
    const bodyMesh = new THREE.Mesh(bodyGeom, this.materials.body);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    chassis.add(bodyMesh);

    // Cockpit canopy / tinted windshield
    const canopyGeom = new THREE.BoxGeometry(this.chassisSize * 0.68, this.chassisSize * 0.32, this.chassisSize * 0.82);
    canopyGeom.translate(0, this.chassisSize * 0.28, -this.chassisSize * 0.08);
    const canopyMesh = new THREE.Mesh(canopyGeom, this.materials.cockpit);
    canopyMesh.castShadow = true;
    chassis.add(canopyMesh);

    // Tubular Roll Cage Frame
    const cageGeom = new THREE.CylinderGeometry(0.012 * this.scale, 0.012 * this.scale, this.chassisSize * 0.85);
    const addRollBar = (px, py, pz, rx, ry, rz) => {
      const bar = new THREE.Mesh(cageGeom, this.materials.rollcage);
      bar.position.set(px, py, pz);
      bar.rotation.set(rx, ry, rz);
      bar.castShadow = true;
      chassis.add(bar);
    };

    const cw = this.chassisSize * 0.38;
    const ch = this.chassisSize * 0.44;
    addRollBar(-cw, ch, -this.chassisSize * 0.10, Math.PI / 4, 0, 0);
    addRollBar( cw, ch, -this.chassisSize * 0.10, Math.PI / 4, 0, 0);
    addRollBar(-cw, ch,  this.chassisSize * 0.22, -Math.PI / 4, 0, 0);
    addRollBar( cw, ch,  this.chassisSize * 0.22, -Math.PI / 4, 0, 0);

    // High-Downforce Rear Wing / Spoiler
    const wingGeom = new THREE.BoxGeometry(this.trackWidth * 0.72, 0.018 * this.scale, this.chassisSize * 0.35);
    const wingMesh = new THREE.Mesh(wingGeom, this.materials.body);
    wingMesh.position.set(0, this.chassisSize * 0.42, this.chassisSize * 0.82);
    wingMesh.rotation.x = 0.12;
    wingMesh.castShadow = true;
    chassis.add(wingMesh);

    // Wing Endplates
    const endplateGeom = new THREE.BoxGeometry(0.01 * this.scale, this.chassisSize * 0.20, this.chassisSize * 0.38);
    const leftEndplate = new THREE.Mesh(endplateGeom, this.materials.rollcage);
    leftEndplate.position.set(-this.trackWidth * 0.36, this.chassisSize * 0.42, this.chassisSize * 0.82);
    chassis.add(leftEndplate);

    const rightEndplate = new THREE.Mesh(endplateGeom, this.materials.rollcage);
    rightEndplate.position.set(this.trackWidth * 0.36, this.chassisSize * 0.42, this.chassisSize * 0.82);
    chassis.add(rightEndplate);

    // Front Bumper / Skid Plate
    const bumperGeom = new THREE.CylinderGeometry(0.016 * this.scale, 0.016 * this.scale, this.trackWidth * 0.62);
    bumperGeom.rotateZ(Math.PI / 2);
    const bumper = new THREE.Mesh(bumperGeom, this.materials.rollcage);
    bumper.position.set(0, -this.chassisSize * 0.08, -this.chassisSize * 0.85);
    bumper.castShadow = true;
    chassis.add(bumper);

    // Twin Rally Roof LED Lights
    const lightGeom = new THREE.CylinderGeometry(0.024 * this.scale, 0.024 * this.scale, 0.028 * this.scale, 16);
    lightGeom.rotateX(Math.PI / 2);
    const lightL = new THREE.Mesh(lightGeom, this.materials.lights);
    lightL.position.set(-this.chassisSize * 0.18, this.chassisSize * 0.46, -this.chassisSize * 0.42);
    chassis.add(lightL);

    const lightR = new THREE.Mesh(lightGeom, this.materials.lights);
    lightR.position.set(this.chassisSize * 0.18, this.chassisSize * 0.46, -this.chassisSize * 0.42);
    chassis.add(lightR);

    return chassis;
  }

  _buildSuspensionAndWheels() {
    const coilGeom = createCoilSpringGeometry(
      0.024 * this.scale, // spring radius
      0.005 * this.scale, // wire radius
      7,                  // turns
      0.18 * this.scale,  // height
      6,
      36
    );

    const damperShaftGeom = new THREE.CylinderGeometry(0.012 * this.scale, 0.012 * this.scale, 0.22 * this.scale, 12);
    const armGeom = new THREE.BoxGeometry(this.trackWidth * 0.32, 0.014 * this.scale, 0.035 * this.scale);

    for (let i = 0; i < 4; i++) {
      const mount = this.wheelMounts[i];
      const wheelGroup = new THREE.Group();

      // 1. Suspension Upper Strut & Coil Spring (attached to chassis)
      const strutGroup = new THREE.Group();
      strutGroup.position.copy(mount.localPos);

      const springMesh = new THREE.Mesh(coilGeom, this.materials.springs);
      springMesh.castShadow = true;
      strutGroup.add(springMesh);

      const damperMesh = new THREE.Mesh(damperShaftGeom, this.materials.damperShaft);
      damperMesh.castShadow = true;
      strutGroup.add(damperMesh);

      this.chassisMesh.add(strutGroup);

      // 2. Suspension Wishbone Control Arm (pivoting arm)
      const wishbone = new THREE.Mesh(armGeom, this.materials.rollcage);
      const armOffsetX = mount.isLeft ? -this.trackWidth * 0.16 : this.trackWidth * 0.16;
      wishbone.position.set(mount.localPos.x - armOffsetX * 0.5, mount.localPos.y - 0.04 * this.scale, mount.localPos.z);
      this.chassisMesh.add(wishbone);

      // 3. Wheel Assembly (Steering pivot -> Wheel Hub -> Rotating Rim & Tire)
      const steerPivot = new THREE.Group();

      const wheelHub = new THREE.Group();
      const wheelGeom = createBuggyWheelGeometry(this.wheelRadius, this.wheelWidth, this.wheelRadius * 0.55);

      const tireMesh = new THREE.Mesh(wheelGeom.tireGeom, this.materials.tires);
      tireMesh.castShadow = true;
      tireMesh.receiveShadow = true;
      wheelHub.add(tireMesh);

      const rimMesh = new THREE.Mesh(wheelGeom.rimGeom, this.materials.rims);
      rimMesh.castShadow = true;
      wheelHub.add(rimMesh);

      const hubMesh = new THREE.Mesh(wheelGeom.hubGeom, this.materials.hub);
      wheelHub.add(hubMesh);

      // Add knobby tread block meshes
      for (const lug of wheelGeom.lugsMerged.children) {
        const lugMesh = new THREE.Mesh(lug.geometry, this.materials.tires);
        lugMesh.position.copy(lug.position);
        lugMesh.rotation.copy(lug.rotation);
        lugMesh.castShadow = true;
        wheelHub.add(lugMesh);
      }

      steerPivot.add(wheelHub);
      wheelGroup.add(steerPivot);
      this.rootGroup.add(wheelGroup);

      this.wheels.push({
        mount,
        strutGroup,
        springMesh,
        damperMesh,
        wishbone,
        steerPivot,
        wheelHub,
        wheelGroup,
        compression: 0.0,       // Current compression (0 = fully extended, 1 = max bottomed out)
        suspensionLength: this.suspensionRestLength,
        contactPoint: new V(),
        isGrounded: false
      });
    }
  }

  _buildAntenna() {
    this.antennaBasePos = new V(this.chassisSize * 0.32, this.chassisSize * 0.22, this.chassisSize * 0.65);
    this.antennaTipPos = new V();
    this.antennaTipVel = new V();

    const antennaGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(2 * 3);
    antennaGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.antennaLine = new THREE.Line(antennaGeom, this.materials.antenna);
    this.rootGroup.add(this.antennaLine);

    const flagGeom = new THREE.BufferGeometry();
    const flagPos = new Float32Array([
      0, 0, 0,
      -0.08 * this.scale, -0.02 * this.scale, 0,
      0, -0.05 * this.scale, 0
    ]);
    flagGeom.setAttribute('position', new THREE.BufferAttribute(flagPos, 3));
    flagGeom.computeVertexNormals();
    this.flagMesh = new THREE.Mesh(flagGeom, this.materials.flag);
    this.rootGroup.add(this.flagMesh);
  }

  /* ================= Public Controls & API ================= */
  setThrottle(val) {
    this.throttle = THREE.MathUtils.clamp(val, -1.0, 1.0);
  }

  setSteering(val) {
    this.steering = THREE.MathUtils.clamp(val, -1.0, 1.0);
  }

  setBrake(active) {
    this.isBraking = !!active;
  }

  setSuspensionPreset(preset) {
    this.suspensionPreset = preset;
    if (preset === 'soft') {
      this.suspensionStiffness = 300.0;
      this.suspensionDamping = 18.0;
    } else if (preset === 'stiff') {
      this.suspensionStiffness = 650.0;
      this.suspensionDamping = 45.0;
    } else { // medium
      this.suspensionStiffness = 450.0;
      this.suspensionDamping = 28.0;
    }
  }

  reset(x = 0, y = null, z = -1.2) {
    const groundY = -this.world.box.hy;
    const targetY = y !== null ? y : groundY + this.wheelRadius + this.suspensionRestLength + 0.05;
    this.body.x.set(x, targetY, z);
    this.body.px.copy(this.body.x);
    this.body.v.set(0, 0, 0);
    this.body.w.set(0, 0, 0);
    this.body.q.set(0, 0, 0, 1);
    this.body.pq.set(0, 0, 0, 1);
    this.body.sync();
    this.throttle = 0;
    this.steering = 0;
    this.currentSteerAngle = 0;
    this.updateVisuals();
  }

  flipUpright() {
    this.body.q.set(0, 0, 0, 1);
    this.body.x.y += 0.35 * this.scale;
    this.body.px.copy(this.body.x);
    this.body.v.set(0, 1.2, 0);
    this.body.w.set(0, 0, 0);
    this.body.sync();
  }

  /* ================= Suspension & Drivetrain Physics Step ================= */
  step(dt) {
    const body = this.body;
    const floorY = -this.world.box.hy;
    const maxTravel = this.suspensionTravel;
    const restLen = this.suspensionRestLength;
    const minLen = restLen - maxTravel;

    // Smooth steering input interpolation
    const targetSteerAngle = this.steering * this.maxSteerAngle;
    this.currentSteerAngle = THREE.MathUtils.lerp(
      this.currentSteerAngle,
      targetSteerAngle,
      Math.min(1.0, this.steerSpeed * dt)
    );

    // Chassis local orientation directions in world space
    const forwardDir = _forward.set(0, 0, -1).applyQuaternion(body.q);
    const rightDir = _right.set(1, 0, 0).applyQuaternion(body.q);
    const upDir = _up.set(0, 1, 0).applyQuaternion(body.q);

    // Forward ground speed
    const forwardSpeed = body.v.dot(forwardDir);

    let groundedWheelCount = 0;

    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      const mount = wheel.mount;

      // 1. World position of suspension upper mount point
      body.toWorld(mount.localPos, _v1); // mount world pos
      const mountWorldPos = _v1;

      // 2. Query contact surface (Floor and dynamic rigid bodies)
      // Ray cast downwards along suspension stroke (-upDir)
      const rayDir = _v2.copy(upDir).negate();
      let hitY = floorY; // default flat floor

      // Test obstacles and other cubes in world
      for (const b of this.world.bodies) {
        if (b === body || b.collisionGroup === 'rccar') continue;
        const dx = Math.abs(mountWorldPos.x - b.x.x);
        const dz = Math.abs(mountWorldPos.z - b.x.z);
        if (dx < b.h + this.wheelRadius * 0.7 && dz < b.h + this.wheelRadius * 0.7) {
          const topY = b.x.y + b.h;
          if (topY > hitY && topY < mountWorldPos.y) {
            hitY = topY;
          }
        }
      }

      // Desired wheel center height at contact
      const contactWheelCenterY = hitY + this.wheelRadius;
      const currentDistToContact = mountWorldPos.y - contactWheelCenterY;

      // Check if suspension is compressed by contact
      if (currentDistToContact < restLen) {
        wheel.isGrounded = true;
        groundedWheelCount++;
        wheel.suspensionLength = Math.max(minLen, currentDistToContact);
        wheel.compression = (restLen - wheel.suspensionLength) / maxTravel;

        // Suspension Spring Force (Hooke's Law: F_s = k * delta_x)
        const springCompression = restLen - wheel.suspensionLength;
        const springForce = springCompression * this.suspensionStiffness;

        // Suspension Damper Force (F_d = -c * v_rel)
        // Relative velocity at mount point along suspension axis
        const pointVel = _v3.crossVectors(body.w, _v4.subVectors(mountWorldPos, body.x)).add(body.v);
        const compressVel = -pointVel.dot(upDir);
        const dampingForce = compressVel * this.suspensionDamping;

        const totalSuspensionForce = Math.max(0, springForce + dampingForce);

        // Apply suspension force to chassis
        const suspForceVec = _v3.copy(upDir).multiplyScalar(totalSuspensionForce * dt * body.invM);
        body.v.add(suspForceVec);

        // Suspension torque on chassis
        _v4.subVectors(mountWorldPos, body.x);
        const suspTorque = _v2.crossVectors(_v4, _v3.copy(upDir).multiplyScalar(totalSuspensionForce * dt));
        body.w.addScaledVector(suspTorque, body.invI);

        // 3. Tire Traction: Longitudinal (Drive / Brake) & Lateral (Cornering Grip)
        // Wheel heading direction (steered if front, straight if rear)
        const wheelHeading = _v3.copy(forwardDir);
        if (mount.isFront) {
          wheelHeading.applyAxisAngle(upDir, -this.currentSteerAngle);
        }
        const wheelSideDir = _v2.crossVectors(upDir, wheelHeading).normalize();

        // Longitudinal velocity & Lateral slip velocity
        const wheelLongSpeed = pointVel.dot(wheelHeading);
        const wheelLatSpeed = pointVel.dot(wheelSideDir);

        // Longitudinal Motor / Brake Force
        let driveThrust = 0;
        if (this.isBraking) {
          driveThrust = -Math.sign(wheelLongSpeed) * Math.min(Math.abs(wheelLongSpeed) * 30.0, this.brakeForce);
        } else if (Math.abs(this.throttle) > 0.01) {
          // 4WD torque distribution (25% per wheel)
          driveThrust = this.throttle * this.engineForce * 0.25;
        } else {
          // Natural rolling resistance drag
          driveThrust = -wheelLongSpeed * 8.0;
        }

        const driveForceVec = _v4.copy(wheelHeading).multiplyScalar(driveThrust * dt * body.invM);
        body.v.add(driveForceVec);

        // Lateral Tire Grip (cancels sideways drift with realistic cornering stiffness)
        const sideGripForce = -wheelLatSpeed * (this.tireFrictionSide * 42.0);
        const sideForceVec = _v4.copy(wheelSideDir).multiplyScalar(sideGripForce * dt * body.invM);
        body.v.add(sideForceVec);

        // Update wheel spin rotation angle
        const angularDelta = (wheelLongSpeed / this.wheelRadius) * dt;
        this.wheelSpinAngles[i] += angularDelta;

      } else {
        // Airborne: suspension fully extended
        wheel.isGrounded = false;
        wheel.suspensionLength = restLen;
        wheel.compression = 0.0;
        // In-air wheel spin inertia decay
        this.wheelSpinAngles[i] += (this.throttle * 25.0) * dt;
      }
    }

    // Mid-air RC gyro pitch/roll stabilizer (allows landing cleanly on all 4 wheels)
    if (groundedWheelCount === 0) {
      // Upright torque correction
      const currentUp = _v1.set(0, 1, 0).applyQuaternion(body.q);
      const correctionAxis = _v2.crossVectors(currentUp, _up);
      body.w.addScaledVector(correctionAxis, 4.5 * dt);
    }
  }

  /* ================= Visual Scene Graph Synchronization ================= */
  updateVisuals() {
    const body = this.body;

    // 1. Sync Chassis Root Transformation
    this.rootGroup.position.copy(body.x);
    this.rootGroup.quaternion.copy(body.q);

    // 2. Sync Suspensions & Wheels
    const restLen = this.suspensionRestLength;

    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      const mount = wheel.mount;

      const currentStroke = wheel.suspensionLength;
      const compressionScale = Math.max(0.4, currentStroke / restLen);

      // Spring coil compression scaling
      wheel.springMesh.scale.set(1.0, compressionScale, 1.0);
      wheel.springMesh.position.y = -currentStroke * 0.5;

      // Damper cylinder positioning
      wheel.damperMesh.position.y = -currentStroke * 0.5;

      // Wishbone angle pivoting
      const angle = (1.0 - compressionScale) * 0.35 * (mount.isLeft ? 1 : -1);
      wheel.wishbone.rotation.z = angle;

      // Wheel assembly positioning (at base of suspension stroke)
      wheel.wheelGroup.position.set(mount.localPos.x, mount.localPos.y - currentStroke, mount.localPos.z);

      // Steering angle on front wheels
      if (mount.isFront) {
        wheel.steerPivot.rotation.y = this.currentSteerAngle;
      }

      // Wheel spin roll
      wheel.wheelHub.rotation.x = this.wheelSpinAngles[i];
    }

    // 3. Dynamic Flexible Antenna Simulation
    this._updateAntennaVisuals();
  }

  _updateAntennaVisuals() {
    // World position of antenna base
    this.body.toWorld(this.antennaBasePos, _v1);
    const basePos = _v1;

    // Antenna tip physics (inertial bend against velocity & acceleration)
    const targetTip = _v2.copy(basePos).addScaledVector(_up.set(0, 1, 0).applyQuaternion(this.body.q), 0.36 * this.scale);
    targetTip.addScaledVector(this.body.v, -0.04); // lag behind velocity

    this.antennaTipPos.lerp(targetTip, 0.35);

    // Update line geometry
    const lineArr = this.antennaLine.geometry.attributes.position.array;
    this.rootGroup.worldToLocal(_v3.copy(basePos));
    lineArr[0] = _v3.x; lineArr[1] = _v3.y; lineArr[2] = _v3.z;

    this.rootGroup.worldToLocal(_v4.copy(this.antennaTipPos));
    lineArr[3] = _v4.x; lineArr[4] = _v4.y; lineArr[5] = _v4.z;
    this.antennaLine.geometry.attributes.position.needsUpdate = true;

    // Position pennant flag at antenna tip
    this.flagMesh.position.copy(_v4);
    this.flagMesh.rotation.y = Math.atan2(this.body.v.x, this.body.v.z);
  }

  /* ================= Cleanup & Disposal ================= */
  destroy() {
    // Remove rigid body from physics world
    const idx = this.world.bodies.indexOf(this.body);
    if (idx !== -1) this.world.bodies.splice(idx, 1);

    // Remove meshes from Three.js scene
    if (this.rootGroup && this.rootGroup.parent) {
      this.rootGroup.parent.remove(this.rootGroup);
    }
  }
}

// Export
global.RCCar = RCCar;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RCCar;
}

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
