/* =========================================================================
   RC Buggy Car Asset — Extended Position-Based Dynamics (XPBD)
   High-performance, modular off-road RC buggy asset with double-wide wheels,
   exposed long-travel bouncy coilover suspensions, and realistic vehicle dynamics.
   ========================================================================= */

(function(global) {
'use strict';

const THREE = global.THREE;
if (!THREE) {
  throw new Error('RCCar requires Three.js (THREE global)');
}

const V = THREE.Vector3;
const Q = THREE.Quaternion;

// Scratch vectors for zero-allocation simulation updates
const _v1 = new V();
const _v2 = new V();
const _v3 = new V();
const _v4 = new V();
const _mountWorldPos = new V();
const _pointVel = new V();
const _relMount = new V();
const _suspForceVec = new V();
const _suspTorque = new V();
const _wheelHeading = new V();
const _wheelSideDir = new V();
const _driveForce = new V();
const _sideForce = new V();
const _tireForceTotal = new V();
const _tireTorque = new V();
const _q1 = new Q();
const _up = new V(0, 1, 0);
const _forward = new V(0, 0, -1);
const _right = new V(1, 0, 0);
const _upDir = new V();
const _forwardDir = new V();
const _rightDir = new V();

/* ================= Procedural Helical Spring Geometry ================= */
function createCoilSpringGeometry(radius, wireRadius, turns, height, radialSegments, tubularSegments) {
  const points = [];
  const totalPoints = turns * tubularSegments;
  for (let i = 0; i <= totalPoints; i++) {
    const t = i / totalPoints;
    const angle = t * turns * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = t * height;
    const z = Math.sin(angle) * radius;
    points.push(new V(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, totalPoints, wireRadius, radialSegments, false);
}

/* ================= Procedural Double-Wide Off-Road Knobby Wheel ================= */
function createDoubleWideBuggyWheelGeometry(radius, width, rimRadius) {
  // 1. Double-Wide Rubber Tire Outer Cylinder (oriented along X axis)
  const tireGeom = new THREE.CylinderGeometry(radius, radius, width, 28, 1, false);
  tireGeom.rotateZ(Math.PI / 2);

  // 2. Deep-Dish Beadlock Rim
  const rimGeom = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 1.01, 24);
  rimGeom.rotateZ(Math.PI / 2);

  // 3. Central Hex Hub Nut
  const hubGeom = new THREE.CylinderGeometry(rimRadius * 0.38, rimRadius * 0.38, width * 1.06, 6);
  hubGeom.rotateZ(Math.PI / 2);

  // 4. Staggered Dual-Row Off-Road Tread Lugs across double width
  const lugCount = 14;
  const lugWidth = width * 0.42;
  const lugGeom = new THREE.BoxGeometry(lugWidth, radius * 0.16, radius * 0.22);
  const lugsMerged = new THREE.Group();

  for (let i = 0; i < lugCount; i++) {
    const angle = (i / lugCount) * Math.PI * 2;
    // Row 1 (inner side of tire)
    const lug1 = new THREE.Mesh(lugGeom);
    lug1.position.set(-width * 0.24, Math.cos(angle) * (radius * 0.98), Math.sin(angle) * (radius * 0.98));
    lug1.rotation.x = -angle;
    lugsMerged.add(lug1);

    // Row 2 (outer side of tire, staggered angle)
    const angle2 = angle + (Math.PI / lugCount);
    const lug2 = new THREE.Mesh(lugGeom);
    lug2.position.set(width * 0.24, Math.cos(angle2) * (radius * 0.98), Math.sin(angle2) * (radius * 0.98));
    lug2.rotation.x = -angle2;
    lugsMerged.add(lug2);
  }

  return { tireGeom, rimGeom, hubGeom, lugsMerged };
}

/* ================= RCCar Class Definition ================= */
class RCCar {
  constructor(world, scene, options = {}) {
    this.world = world;
    this.scene = scene;

    // Dimensions & Geometry Configuration
    this.scale = options.scale || 1.0;
    this.wheelbase = (options.wheelbase || 0.70) * this.scale;   // Front to rear distance
    this.trackWidth = (options.trackWidth || 0.82) * this.scale; // Wide stance for double-wide tires
    this.wheelRadius = (options.wheelRadius || 0.16) * this.scale;
    this.wheelWidth = (options.wheelWidth || 0.22) * this.scale;  // DOUBLE AS WIDE
    this.chassisSize = (options.chassisSize || 0.40) * this.scale;
    this.chassisMass = options.chassisMass || 4.2; // kg

    // Suspension Parameters (Long-travel, soft & bouncy)
    this.suspensionRestLength = (options.suspensionRestLength || 0.32) * this.scale; // Longer travel rest
    this.suspensionTravel = (options.suspensionTravel || 0.22) * this.scale;         // Big bouncy travel
    this.suspensionStiffness = options.suspensionStiffness || 130.0;                 // Soft & bouncy spring (N/m)
    this.suspensionDamping = options.suspensionDamping || 7.0;                       // Low damping for visible bounce
    this.suspensionPreset = 'medium';

    // Drivetrain & Handling (Scaled RC buggy speed & responsiveness)
    this.engineForce = options.engineForce || 28.0;      // 4WD motor thrust (realistic acceleration ~6 m/s²)
    this.maxSpeed = options.maxSpeed || 6.5;            // Top speed cap ~23 km/h
    this.brakeForce = options.brakeForce || 35.0;       // Progressive braking force
    this.maxSteerAngle = options.maxSteerAngle || 0.54; // ~31 degrees max steer
    this.steerSpeed = options.steerSpeed || 8.0;        // Rad/s steering response
    this.tireFrictionForward = options.tireFrictionForward || 1.5;
    this.tireFrictionSide = options.tireFrictionSide || 1.8;

    // Dynamic State
    this.throttle = 0.0;  // -1 to 1
    this.steering = 0.0;  // -1 to 1
    this.currentSteerAngle = 0.0;
    this.isBraking = false;
    this.wheelSpinAngles = [0, 0, 0, 0]; // FL, FR, RL, RR

    // Initial Position & Orientation: calculate exact static equilibrium sag
    const mountY = -this.chassisSize * 0.08;
    const staticSag = (this.chassisMass * 9.81 * 0.25) / this.suspensionStiffness;
    const initialSuspLength = this.suspensionRestLength - staticSag;
    const groundY = -world.box.hy;
    const defaultY = groundY + this.wheelRadius + initialSuspLength - mountY;

    const posX = options.x !== undefined ? options.x : 0.0;
    const posY = (options.y !== undefined && options.y !== null) ? options.y : defaultY;
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
        roughness: 0.22,
        metalness: 0.90,
        clearcoat: 0.50
      }),
      damperShaft: new THREE.MeshStandardMaterial({
        color: 0xedf2f7,
        roughness: 0.12,
        metalness: 0.95
      }),
      tires: new THREE.MeshStandardMaterial({
        color: 0x181a1f,
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
        color: 0x0f1115,
        roughness: 0.50,
        metalness: 0.80
      }),
      lights: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x88ccff,
        emissiveIntensity: 0.9,
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
    const hx = this.trackWidth * 0.5;
    const hz = this.wheelbase * 0.5;

    this.wheelMounts = [
      { id: 'FL', isFront: true,  isLeft: true,  localPos: new V(-hx, mountY, -hz) },
      { id: 'FR', isFront: true,  isLeft: false, localPos: new V( hx, mountY, -hz) },
      { id: 'RL', isFront: false, isLeft: true,  localPos: new V(-hx, mountY,  hz) },
      { id: 'RR', isFront: false, isLeft: false, localPos: new V( hx, mountY,  hz) }
    ];

    this.wheels = [];
    this._buildSuspensionAndWheels();

    for (const w of this.wheels) {
      w.suspensionLength = initialSuspLength;
      w.compression = staticSag / this.suspensionTravel;
      w.isGrounded = true;
    }

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
    const cageBarGeom = new THREE.CylinderGeometry(0.012 * this.scale, 0.012 * this.scale, this.chassisSize * 0.85);
    const addRollBar = (px, py, pz, rx, ry, rz) => {
      const bar = new THREE.Mesh(cageBarGeom, this.materials.rollcage);
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

    // Prominent High Shock Towers (Front & Rear)
    const towerGeom = new THREE.BoxGeometry(this.chassisSize * 0.95, 0.035 * this.scale, 0.035 * this.scale);
    const frontTower = new THREE.Mesh(towerGeom, this.materials.rollcage);
    frontTower.position.set(0, this.chassisSize * 0.26, -this.wheelbase * 0.5);
    chassis.add(frontTower);

    const rearTower = new THREE.Mesh(towerGeom, this.materials.rollcage);
    rearTower.position.set(0, this.chassisSize * 0.28, this.wheelbase * 0.5);
    chassis.add(rearTower);

    // High-Downforce Rear Wing / Spoiler
    const wingGeom = new THREE.BoxGeometry(this.trackWidth * 0.70, 0.018 * this.scale, this.chassisSize * 0.35);
    const wingMesh = new THREE.Mesh(wingGeom, this.materials.body);
    wingMesh.position.set(0, this.chassisSize * 0.44, this.chassisSize * 0.82);
    wingMesh.rotation.x = 0.12;
    wingMesh.castShadow = true;
    chassis.add(wingMesh);

    // Wing Endplates
    const endplateGeom = new THREE.BoxGeometry(0.01 * this.scale, this.chassisSize * 0.20, this.chassisSize * 0.38);
    const leftEndplate = new THREE.Mesh(endplateGeom, this.materials.rollcage);
    leftEndplate.position.set(-this.trackWidth * 0.35, this.chassisSize * 0.44, this.chassisSize * 0.82);
    chassis.add(leftEndplate);

    const rightEndplate = new THREE.Mesh(endplateGeom, this.materials.rollcage);
    rightEndplate.position.set(this.trackWidth * 0.35, this.chassisSize * 0.44, this.chassisSize * 0.82);
    chassis.add(rightEndplate);

    // Front Bumper / Skid Plate
    const bumperGeom = new THREE.CylinderGeometry(0.016 * this.scale, 0.016 * this.scale, this.chassisSize * 0.88);
    bumperGeom.rotateZ(Math.PI / 2);
    const bumper = new THREE.Mesh(bumperGeom, this.materials.rollcage);
    bumper.position.set(0, -this.chassisSize * 0.08, -this.chassisSize * 0.85);
    bumper.castShadow = true;
    chassis.add(bumper);

    // Twin Rally Roof LED Lights
    const lightGeom = new THREE.CylinderGeometry(0.024 * this.scale, 0.024 * this.scale, 0.028 * this.scale, 16);
    lightGeom.rotateX(Math.PI / 2);
    const lightL = new THREE.Mesh(lightGeom, this.materials.lights);
    lightL.position.set(-this.chassisSize * 0.18, this.chassisSize * 0.48, -this.chassisSize * 0.42);
    chassis.add(lightL);

    const lightR = new THREE.Mesh(lightGeom, this.materials.lights);
    lightR.position.set(this.chassisSize * 0.18, this.chassisSize * 0.48, -this.chassisSize * 0.42);
    chassis.add(lightR);

    return chassis;
  }

  _buildSuspensionAndWheels() {
    const coilRestHeight = 0.25 * this.scale;
    const coilGeom = createCoilSpringGeometry(
      0.026 * this.scale, // spring radius
      0.0055 * this.scale, // wire radius
      8,                   // turns
      coilRestHeight,
      6,
      40
    );

    const damperShaftGeom = new THREE.CylinderGeometry(0.013 * this.scale, 0.013 * this.scale, 0.30 * this.scale, 12);
    damperShaftGeom.translate(0, 0.15 * this.scale, 0);

    const hx = this.trackWidth * 0.5;

    for (let i = 0; i < 4; i++) {
      const mount = this.wheelMounts[i];
      const signX = mount.isLeft ? -1 : 1;
      const mountZ = mount.localPos.z;

      // 1. Suspension Attachment Anchors (Strictly INBOARD of the wheel!)
      // Upper shock mount on chassis shock tower
      const upperMountLocal = new V(signX * this.chassisSize * 0.36, this.chassisSize * 0.26, mountZ);
      // Inner wishbone hinge on lower chassis
      const innerHingeLocal = new V(signX * this.chassisSize * 0.28, -this.chassisSize * 0.12, mountZ);

      // Wheel Hub knuckle sits on the INNER face of the wheel
      // Wheel center is at X = signX * hx. Wheel width is this.wheelWidth.
      // Inner edge of wheel is at signX * (hx - this.wheelWidth * 0.5).
      // Knuckle is strictly inboard by an extra 0.015m clearance!
      const knuckleXInChassis = signX * (hx - this.wheelWidth * 0.5 - 0.018 * this.scale);
      const knuckleLocalOffset = new V(-signX * (this.wheelWidth * 0.5 + 0.018 * this.scale), 0, 0);

      // 2. Visible Upper Coilover Strut Group (placed on chassis)
      const strutGroup = new THREE.Group();
      strutGroup.position.copy(upperMountLocal);

      const springMesh = new THREE.Mesh(coilGeom, this.materials.springs);
      springMesh.castShadow = true;
      strutGroup.add(springMesh);

      const damperMesh = new THREE.Mesh(damperShaftGeom, this.materials.damperShaft);
      damperMesh.castShadow = true;
      strutGroup.add(damperMesh);

      this.chassisMesh.add(strutGroup);

      // 3. Lower Wishbone A-Arm (spans horizontally from chassis to inner knuckle)
      const armLength = Math.abs(knuckleXInChassis - innerHingeLocal.x);
      const armGeom = new THREE.BoxGeometry(armLength, 0.018 * this.scale, 0.055 * this.scale);
      armGeom.translate(signX * armLength * 0.5, 0, 0);
      const wishbone = new THREE.Mesh(armGeom, this.materials.rollcage);
      wishbone.position.copy(innerHingeLocal);
      wishbone.castShadow = true;
      this.chassisMesh.add(wishbone);

      // 4. Wheel Assembly (Wheel knuckle -> Steering pivot -> Hub -> DOUBLE-WIDE Rim & Knobby Tire)
      const wheelGroup = new THREE.Group();
      const steerPivot = new THREE.Group();
      const wheelHub = new THREE.Group();

      const wheelGeom = createDoubleWideBuggyWheelGeometry(
        this.wheelRadius,
        this.wheelWidth,
        this.wheelRadius * 0.54
      );

      const tireMesh = new THREE.Mesh(wheelGeom.tireGeom, this.materials.tires);
      tireMesh.castShadow = true;
      tireMesh.receiveShadow = true;
      wheelHub.add(tireMesh);

      const rimMesh = new THREE.Mesh(wheelGeom.rimGeom, this.materials.rims);
      rimMesh.castShadow = true;
      wheelHub.add(rimMesh);

      const hubMesh = new THREE.Mesh(wheelGeom.hubGeom, this.materials.hub);
      wheelHub.add(hubMesh);

      // Knobby tread blocks
      for (const lug of wheelGeom.lugsMerged.children) {
        const lugMesh = new THREE.Mesh(lug.geometry, this.materials.tires);
        lugMesh.position.copy(lug.position);
        lugMesh.rotation.copy(lug.rotation);
        lugMesh.castShadow = true;
        wheelHub.add(lugMesh);
      }

      steerPivot.add(wheelHub);
      wheelGroup.add(steerPivot);

      // Knuckle axle mesh extending from knuckle into the wheel hub
      const axleGeom = new THREE.CylinderGeometry(0.016 * this.scale, 0.016 * this.scale, this.wheelWidth * 0.55);
      axleGeom.rotateZ(Math.PI / 2);
      const axleMesh = new THREE.Mesh(axleGeom, this.materials.rollcage);
      axleMesh.position.set(knuckleLocalOffset.x * 0.5, 0, 0);
      steerPivot.add(axleMesh);

      this.rootGroup.add(wheelGroup);

      // Initial rest distance for spring scaling
      const initialRestDist = upperMountLocal.distanceTo(new V(knuckleXInChassis, -this.suspensionRestLength, mountZ));

      const damperRestHeight = 0.30 * this.scale;

      this.wheels.push({
        mount,
        signX,
        upperMountLocal,
        innerHingeLocal,
        knuckleXInChassis,
        knuckleLocalOffset,
        initialRestDist,
        coilRestHeight,
        damperRestHeight,
        strutGroup,
        springMesh,
        damperMesh,
        wishbone,
        steerPivot,
        wheelHub,
        wheelGroup,
        compression: 0.0,
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
      this.suspensionStiffness = 85.0; // Very soft, super bouncy
      this.suspensionDamping = 4.5;
    } else if (preset === 'stiff') {
      this.suspensionStiffness = 240.0;
      this.suspensionDamping = 14.0;
    } else { // medium
      this.suspensionStiffness = 130.0; // Active off-road bounce
      this.suspensionDamping = 7.0;
    }
  }

  reset(x = 0, y = null, z = -1.2) {
    const mountY = -this.chassisSize * 0.08;
    const staticSag = (this.chassisMass * 9.81 * 0.25) / this.suspensionStiffness;
    const initialSuspLength = this.suspensionRestLength - staticSag;
    const groundY = -this.world.box.hy;
    const targetY = y !== null ? y : groundY + this.wheelRadius + initialSuspLength - mountY;
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
    for (const w of this.wheels) {
      w.suspensionLength = initialSuspLength;
      w.compression = staticSag / this.suspensionTravel;
      w.isGrounded = true;
    }
    this.updateVisuals();
  }

  flipUpright() {
    this.body.q.set(0, 0, 0, 1);
    this.body.x.y += 0.40 * this.scale;
    this.body.px.copy(this.body.x);
    this.body.v.set(0, 1.5, 0);
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

    // Smooth steering input interpolation (steer < 0 is left, steer > 0 is right)
    const targetSteerAngle = -this.steering * this.maxSteerAngle;
    this.currentSteerAngle = THREE.MathUtils.lerp(
      this.currentSteerAngle,
      targetSteerAngle,
      Math.min(1.0, this.steerSpeed * dt)
    );

    // Chassis local orientation directions in world space
    const forwardDir = _forwardDir.set(0, 0, -1).applyQuaternion(body.q);
    const rightDir = _rightDir.set(1, 0, 0).applyQuaternion(body.q);
    const upDir = _upDir.set(0, 1, 0).applyQuaternion(body.q);

    let groundedWheelCount = 0;

    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      const mount = wheel.mount;

      // 1. World position of wheel top mount
      body.toWorld(mount.localPos, _mountWorldPos);
      const mountWorldPos = _mountWorldPos;

      // 2. Query contact surface (Floor and dynamic rigid bodies)
      let hitY = floorY;

      // Test obstacles and cubes in world
      for (const b of this.world.bodies) {
        if (b === body || b.collisionGroup === 'rccar') continue;
        const dx = Math.abs(mountWorldPos.x - b.x.x);
        const dz = Math.abs(mountWorldPos.z - b.x.z);
        if (dx < b.h + this.wheelWidth * 0.6 && dz < b.h + this.wheelRadius * 0.7) {
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

        // Bouncy Suspension Spring Force (Hooke's Law: F_s = k * delta_x)
        const springCompression = restLen - wheel.suspensionLength;
        const springForce = springCompression * this.suspensionStiffness;

        // Suspension Damper Force (F_d = -c * v_rel)
        _relMount.subVectors(mountWorldPos, body.x);
        _pointVel.crossVectors(body.w, _relMount).add(body.v);
        const compressVel = -_pointVel.dot(upDir);
        const dampingForce = compressVel * this.suspensionDamping;

        const totalSuspensionForce = Math.max(0, springForce + dampingForce);

        // Apply suspension force to chassis vertically opposing gravity
        _suspForceVec.set(0, 1, 0).multiplyScalar(totalSuspensionForce * dt * body.invM);
        body.v.add(_suspForceVec);

        // Suspension torque on chassis (produces authentic squat, dive, and body roll!)
        _suspTorque.crossVectors(_relMount, _up).multiplyScalar(totalSuspensionForce * dt);
        body.w.addScaledVector(_suspTorque, body.invI);

        // 3. Tire Traction: Longitudinal & Lateral
        _wheelHeading.copy(forwardDir);
        if (mount.isFront) {
          _wheelHeading.applyAxisAngle(upDir, this.currentSteerAngle);
        }
        _wheelSideDir.crossVectors(upDir, _wheelHeading).normalize();

        const wheelLongSpeed = _pointVel.dot(_wheelHeading);
        const wheelLatSpeed = _pointVel.dot(_wheelSideDir);

        // Longitudinal Motor / Brake Force (scaled for realistic RC speed)
        let driveThrust = 0;
        if (this.isBraking) {
          driveThrust = -Math.sign(wheelLongSpeed) * Math.min(Math.abs(wheelLongSpeed) * 20.0, this.brakeForce);
        } else if (Math.abs(this.throttle) > 0.01) {
          const currentSpeed = Math.abs(wheelLongSpeed);
          const speedGovernor = Math.max(0, 1.0 - currentSpeed / this.maxSpeed);
          driveThrust = this.throttle * (this.engineForce * 0.25) * speedGovernor;
        } else {
          driveThrust = -wheelLongSpeed * 25.0; // firm resting rolling resistance
        }

        _driveForce.copy(_wheelHeading).multiplyScalar(driveThrust);

        // Lateral Tire Grip (cornering traction)
        const sideGripForce = -wheelLatSpeed * (this.tireFrictionSide * 25.0);
        _sideForce.copy(_wheelSideDir).multiplyScalar(sideGripForce);

        // Total horizontal tire contact force
        _tireForceTotal.addVectors(_driveForce, _sideForce);

        // Linear tire acceleration
        body.v.addScaledVector(_tireForceTotal, dt * body.invM);

        // Tire yaw / steering torque on chassis (enables authentic turning and carving!)
        _tireTorque.crossVectors(_relMount, _tireForceTotal);
        body.w.addScaledVector(_tireTorque, dt * body.invI);

        // Update wheel spin rotation angle
        const angularDelta = (wheelLongSpeed / this.wheelRadius) * dt;
        this.wheelSpinAngles[i] += angularDelta;

      } else {
        // Airborne: suspension fully drooped / extended
        wheel.isGrounded = false;
        wheel.suspensionLength = restLen;
        wheel.compression = 0.0;
        this.wheelSpinAngles[i] += (this.throttle * 20.0) * dt;
      }
    }

    // Zero-velocity resting lock when no throttle is applied and buggy is settled
    if (Math.abs(this.throttle) < 0.01 && !this.isBraking && groundedWheelCount >= 2) {
      body.v.x *= 0.80;
      body.v.z *= 0.80;
      if (Math.hypot(body.v.x, body.v.z) < 0.04) {
        body.v.x = 0;
        body.v.z = 0;
        body.w.set(0, 0, 0);
      }
    }

    // Mid-air RC gyro pitch/roll stabilizer
    if (groundedWheelCount === 0) {
      const currentUp = _v1.set(0, 1, 0).applyQuaternion(body.q);
      const correctionAxis = _v2.crossVectors(currentUp, _up);
      body.w.addScaledVector(correctionAxis, 4.0 * dt);
    }
  }

  /* ================= Visual Scene Graph Synchronization ================= */
  updateVisuals(customPos = null, customQuat = null) {
    const body = this.body;

    // 1. Sync Chassis Root Transformation (supports high-refresh 120Hz interpolation)
    if (customPos) this.rootGroup.position.copy(customPos);
    else this.rootGroup.position.copy(body.x);

    if (customQuat) this.rootGroup.quaternion.copy(customQuat);
    else this.rootGroup.quaternion.copy(body.q);

    // 2. Sync Suspensions & Wheels
    const hx = this.trackWidth * 0.5;

    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      const mount = wheel.mount;
      const signX = wheel.signX;
      const currentStroke = wheel.suspensionLength;

      // Wheel assembly positioning (at base of suspension stroke, wide stance)
      wheel.wheelGroup.position.set(signX * hx, mount.localPos.y - currentStroke, mount.localPos.z);

      // Steering angle on front wheels
      if (mount.isFront) {
        wheel.steerPivot.rotation.y = this.currentSteerAngle;
      }

      // Wheel spin roll
      wheel.wheelHub.rotation.x = this.wheelSpinAngles[i];

      // Knuckle position in chassis space (on inner face of wheel)
      const knuckleChassisPos = _v1.set(wheel.knuckleXInChassis, mount.localPos.y - currentStroke, mount.localPos.z);

      // Orient wishbone arm towards knuckle
      const armDeltaY = knuckleChassisPos.y - wheel.innerHingeLocal.y;
      const armDeltaX = Math.abs(knuckleChassisPos.x - wheel.innerHingeLocal.x);
      const wishbonePitch = Math.atan2(armDeltaY, armDeltaX) * signX;
      wheel.wishbone.rotation.z = wishbonePitch;

      // Orient and scale Coilover Shock Absorber (from upper shock tower down to lower knuckle)
      const lowerShockMount = _v2.copy(knuckleChassisPos).addScaledVector(_up, 0.02 * this.scale);
      const shockVector = _v3.subVectors(lowerShockMount, wheel.upperMountLocal);
      const currentShockDist = shockVector.length();

      // Orient strut along shock vector
      const shockDir = _v4.copy(shockVector).divideScalar(currentShockDist);
      wheel.strutGroup.quaternion.setFromUnitVectors(_up, shockDir);

      // Scale helical coil spring and damper shaft along shock length
      const springScale = currentShockDist / wheel.coilRestHeight;
      wheel.springMesh.scale.set(1.0, springScale, 1.0);
      const damperScale = currentShockDist / wheel.damperRestHeight;
      wheel.damperMesh.scale.set(1.0, damperScale, 1.0);
    }

    // 3. Dynamic Flexible Antenna Simulation
    this._updateAntennaVisuals();
  }

  _updateAntennaVisuals() {
    this.body.toWorld(this.antennaBasePos, _v1);
    const basePos = _v1;

    const targetTip = _v2.copy(basePos).addScaledVector(_upDir.set(0, 1, 0).applyQuaternion(this.body.q), 0.36 * this.scale);
    targetTip.addScaledVector(this.body.v, -0.04);

    this.antennaTipPos.lerp(targetTip, 0.35);

    const lineArr = this.antennaLine.geometry.attributes.position.array;
    this.rootGroup.worldToLocal(_v3.copy(basePos));
    lineArr[0] = _v3.x; lineArr[1] = _v3.y; lineArr[2] = _v3.z;

    this.rootGroup.worldToLocal(_v4.copy(this.antennaTipPos));
    lineArr[3] = _v4.x; lineArr[4] = _v4.y; lineArr[5] = _v4.z;
    this.antennaLine.geometry.attributes.position.needsUpdate = true;

    this.flagMesh.position.copy(_v4);
    if (this.body.v.lengthSq() > 0.01) {
      this.flagMesh.rotation.y = Math.atan2(this.body.v.x, this.body.v.z);
    }
  }

  /* ================= Cleanup & Disposal ================= */
  destroy() {
    const idx = this.world.bodies.indexOf(this.body);
    if (idx !== -1) this.world.bodies.splice(idx, 1);

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
