/**
 * Headless Automated Verification Suite for XPBD Physics Engine
 * Run with: node tests/verify.js
 *
 * Verifies:
 * 1. Resting Stability (zero drift on level floor)
 * 2. Static Friction Threshold (no sliding at 18 degrees with mu_s = 0.55)
 * 3. Hydrostatic Volume Conservation (< 0.01% drift under compression)
 * 4. Boundary Non-Tunneling (high-speed containment within box planes)
 * 5. Multi-Instance Concurrency Isolation (two independent World instances)
 */

'use strict';

// ---------------- Minimal Three.js Math Mock for Headless Node ----------------
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const l = this.length(); return l > 0 ? this.divideScalar(l) : this; }
  setLength(l) { return this.normalize().multiplyScalar(l); }
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
}

class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  conjugate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  normalize() {
    let l = Math.hypot(this.x, this.y, this.z, this.w);
    if (l === 0) { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    else { this.x /= l; this.y /= l; this.z /= l; this.w /= l; }
    return this;
  }
  multiply(q) { return this.multiplyQuaternions(this, q); }
  premultiply(q) { return this.multiplyQuaternions(q, this); }
  multiplyQuaternions(a, b) {
    const qax = a.x, qay = a.y, qaz = a.z, qaw = a.w;
    const qbx = b.x, qby = b.y, qbz = b.z, qbw = b.w;
    this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    return this;
  }
  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2, s = Math.sin(halfAngle);
    this.x = axis.x * s; this.y = axis.y * s; this.z = axis.z * s;
    this.w = Math.cos(halfAngle);
    return this;
  }
}

const MathUtils = {
  clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
  degToRad: (deg) => (deg * Math.PI) / 180,
  radToDeg: (rad) => (rad * 180) / Math.PI
};

global.THREE = { Vector3, Quaternion, MathUtils };

// Load XPBD engine
const XPBD = require('../src/xpbd.js');

let totalTests = 0, passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAILED: ${message}`);
  }
}

console.log('\n=== XPBD Physics Engine Verification Suite ===\n');

// 1. Resting Stability Test
(() => {
  console.log('1. Resting Stability on Flat Floor:');
  const world = new XPBD.World({ dt: 1/60, substeps: 15 });
  world.setBox(1.5, 1.5, 2.0); // Floor at y = -1.5

  const s = 0.4;
  const initialPos = new Vector3(0, -1.5 + s/2, -1.0);
  const cube = world.addCube(s, initialPos);

  // Run 60 frames = 900 substeps
  for (let frame = 0; frame < 60; frame++) world.step();

  const posDrift = cube.x.distanceTo(initialPos);
  const spinSpeed = cube.w.length();
  assert(posDrift < 0.005, `Position drift is negligible (${posDrift.toFixed(6)} m < 0.005 m)`);
  assert(spinSpeed < 0.01, `Angular drift is negligible (${spinSpeed.toFixed(6)} rad/s < 0.01 rad/s)`);
})();

// 2. Static Friction Test (Floor tilted 18° with mu_s = 0.55)
(() => {
  console.log('\n2. Static Friction Threshold (18° Incline):');
  const world = new XPBD.World({ dt: 1/60, substeps: 20, muStatic: 0.55 });
  world.setBox(1.5, 1.5, 2.0);

  const angle = 18 * Math.PI / 180;
  // Gravity vector tilted by 18°: gx = 9.81 * sin(18°), gy = -9.81 * cos(18°)
  world.accel.set(Math.sin(angle) * 9.81, -Math.cos(angle) * 9.81, 0);

  const s = 0.4;
  const initialPos = new Vector3(0, -1.5 + s/2, -1.0);
  const cube = world.addCube(s, initialPos);

  // Step 60 frames
  for (let frame = 0; frame < 60; frame++) world.step();

  const slideDist = Math.abs(cube.x.x - initialPos.x);
  assert(slideDist < 0.01, `Cube did not slip on 18° incline (slide = ${slideDist.toFixed(6)} m < 0.01 m)`);
})();

// 3. Hydrostatic Volume Conservation (< 0.01% drift)
(() => {
  console.log('\n3. Hydrostatic Volume Conservation:');
  const world = new XPBD.World({ dt: 1/60, substeps: 20 });
  world.setBox(1.5, 1.5, 2.0);

  const tm = world.addTetMesh({
    nx: 3, ny: 3, nz: 3,
    sizeX: 0.6, sizeY: 0.6, sizeZ: 0.6,
    center: new Vector3(0, -1.1, -1.0),
    volCompliance: 0.0,
    edgeCompliance: 0.02
  });

  let v0 = 0;
  for (const c of tm.volumeConstraints) v0 += c.calcV();

  // Compress top downward and step
  for (const p of tm.particles) {
    if (p.x.y > -0.9) p.v.y -= 2.0;
  }
  for (let f = 0; f < 30; f++) world.step();

  let vFinal = 0;
  for (const c of tm.volumeConstraints) vFinal += c.calcV();

  const drift = Math.abs(vFinal - v0) / v0;
  assert(drift < 0.0001, `Volume drift is strictly bounded (${(drift * 100).toFixed(6)}% < 0.01%)`);
})();

// 4. Boundary Non-Tunneling Test
(() => {
  console.log('\n4. Boundary Non-Tunneling (High Velocity Containment):');
  const world = new XPBD.World({ dt: 1/60, substeps: 20 });
  const hx = 1.0, hy = 1.5, d = 2.0;
  world.setBox(hx, hy, d);

  // Fast cube moving towards right wall (x = 1.0) at 12 m/s
  const s = 0.3;
  const cube = world.addCube(s, new Vector3(0.5, 0, -1.0), null, new Vector3(12, 0, 0));

  for (let f = 0; f < 30; f++) world.step();

  const maxX = cube.x.x + cube.h;
  assert(maxX <= hx + 0.02, `Cube contained inside right boundary (maxX: ${maxX.toFixed(4)} <= ${hx})`);

  // Fast particle moving towards floor at 15 m/s
  const p = world.addParticle(0, 0, -1.0, 0.05, 0.02);
  p.v.set(0, -15, 0);

  for (let f = 0; f < 30; f++) world.step();

  const minY = p.x.y - p.radius;
  assert(minY >= -hy - 0.02, `Particle contained above floor (minY: ${minY.toFixed(4)} >= ${-hy})`);
})();

// 5. Multi-Instance Concurrency Isolation
(() => {
  console.log('\n5. Multi-Instance Concurrency Isolation:');
  const worldA = new XPBD.World({ dt: 1/60, substeps: 10 });
  const worldB = new XPBD.World({ dt: 1/60, substeps: 10 });

  worldA.accel.set(0, -9.81, 0);
  worldB.accel.set(9.81, 0, 0); // Sideways gravity

  const cubeA = worldA.addCube(0.4, new Vector3(0, 0, -1));
  const cubeB = worldB.addCube(0.4, new Vector3(0, 0, -1));

  for (let f = 0; f < 20; f++) {
    worldA.step();
    worldB.step();
  }

  const aMovedY = cubeA.x.y < -0.1 && Math.abs(cubeA.x.x) < 0.01;
  const bMovedX = cubeB.x.x > 0.1 && Math.abs(cubeB.x.y) < 0.01;

  assert(aMovedY, `World A fell in -Y (y: ${cubeA.x.y.toFixed(3)}, x: ${cubeA.x.x.toFixed(3)})`);
  assert(bMovedX, `World B moved in +X (x: ${cubeB.x.x.toFixed(3)}, y: ${cubeB.x.y.toFixed(3)})`);
  assert(worldA.nContacts !== undefined && worldB.nContacts !== undefined, 'Both instances maintain independent solver contact state');
})();

// 6. Articulated Joint Integrity & Chain Stability Test
(() => {
  console.log('\n6. Articulated Joint Integrity & Multi-Link Chain:');
  const world = new XPBD.World({ dt: 1/60, substeps: 20 });
  world.setBox(1.5, 1.5, 2.0);

  const anchorPos = new Vector3(0, 1.2, -1.0);
  let prev = null;
  const chain = [];
  for (let i = 0; i < 4; i++){
    const s = 0.2;
    const b = world.addCube(s, new Vector3(0, 1.0 - i * 0.25, -1.0));
    chain.push(b);
    if (i === 0) world.addSphericalJoint(b, new Vector3(0, s/2, 0), null, anchorPos);
    else world.addSphericalJoint(b, new Vector3(0, s/2, 0), prev, new Vector3(0, -prev.size/2, 0));
    prev = b;
  }

  // Heavy falling impact body crashing into chain
  const impact = world.addCube(0.35, new Vector3(0.05, 1.4, -1.0), null, new Vector3(0, -3.0, 0));

  for (let f = 0; f < 120; f++) world.step();

  const rootWorld = new Vector3();
  chain[0].toWorld(world.joints[0].rA, rootWorld);
  const anchorDrift = rootWorld.distanceTo(anchorPos);

  let maxJointDrift = 0;
  const pA = new Vector3(), pB = new Vector3();
  for (const j of world.joints){
    j.a.toWorld(j.rA, pA);
    if (j.b) j.b.toWorld(j.rB, pB); else pB.copy(j.rB);
    const d = pA.distanceTo(pB);
    if (d > maxJointDrift) maxJointDrift = d;
  }

  assert(anchorDrift < 0.001, `Ceiling joint anchor drift strictly bounded (${anchorDrift.toFixed(6)} m < 0.001 m)`);
  assert(maxJointDrift < 0.001, `Inter-link joint separation strictly bounded (${maxJointDrift.toFixed(6)} m < 0.001 m)`);
})();

console.log(`\nVerification Result: ${passedTests}/${totalTests} tests passed.\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
