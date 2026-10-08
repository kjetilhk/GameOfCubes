/* ================= XPBD Physics Engine: Rigid Cubes =================
   Based on Müller et al. 2020, "Detailed Rigid Body Simulation with Extended
   Position Based Dynamics": substepping, position solves (SAT contact manifold
   clipping and static friction) followed by velocity solves (Coulomb-clamped
   dynamic friction and restitution).
   SI units (meters, kilograms, seconds).
   Screen frame: x right, y up, z out of glass; box spans z ∈ [-d, 0].
   Contact normals point from body b (or wall) toward body a.
   ==================================================================== */

(function(global) {
'use strict';

const THREE = global.THREE || (typeof require !== 'undefined' ? require('three') : null);
if (!THREE) {
  throw new Error('XPBD engine requires Three.js (THREE global or require("three"))');
}

const V = THREE.Vector3, Q = THREE.Quaternion;
const SQRT3 = Math.sqrt(3);

const DEFAULTS = {
  dt: 1/60, substeps: 15,
  positionIterations: 2, velocityIterations: 2,
  muStatic: 0.55, muDynamic: 0.4, restitution: 0.35,
  density: 700,                 // kg/m³, about wood
  linearDamping: 0.3,           // 1/s
  angularDamping: 1.0,          // 1/s
  maxSpeed: 25,                 // m/s, room-scale speed guard
  maxSpin: 250,                 // rad/s
  maxPushSpeed: 5.0,            // m/s, depenetration per substep cap
  contactMargin: 0.005,         // m: near contacts collection margin
  selfCollision: false          // particle-particle / cloth self-collision toggle
};

class Body {
  constructor(size, density = 700){
    this.size = size; this.h = size/2;
    const m = density*size*size*size;
    this.invM = 1/m;
    this.invI = 6/(m*size*size);          // cube inertia is isotropic: m s²/6
    this.x = new V(); this.px = new V(); this.v = new V();
    this.q = new Q(); this.pq = new Q(); this.w = new V();
    this.qInv = new Q();
    this.axes = [new V(1,0,0), new V(0,1,0), new V(0,0,1)];  // world-space local axes
  }
  sync(){
    this.qInv.copy(this.q).conjugate();
    this.axes[0].set(1,0,0).applyQuaternion(this.q);
    this.axes[1].set(0,1,0).applyQuaternion(this.q);
    this.axes[2].set(0,0,1).applyQuaternion(this.q);
  }
  toLocal(p, out){ return out.copy(p).sub(this.x).applyQuaternion(this.qInv); }
  toWorld(l, out){ return out.copy(l).applyQuaternion(this.q).add(this.x); }
  toWorldPrev(l, out){ return out.copy(l).applyQuaternion(this.pq).add(this.px); }
}

class Particle {
  constructor(x = 0, y = 0, z = 0, mass = 0.005, radius = 0.0015){
    this.x = new V(x, y, z);
    this.px = new V(x, y, z);
    this.v = new V();
    this.invM = mass > 0 ? 1/mass : 0; // 0 = pinned / infinite mass
    this.radius = radius;
  }
}

class DistanceConstraint {
  constructor(p1, p2, compliance = 0, restLength = null){
    this.p1 = p1;
    this.p2 = p2;
    this.compliance = compliance; // m/N (0 = rigid)
    this.restLength = restLength !== null ? restLength : p1.x.distanceTo(p2.x);
    this.lambda = 0;
  }
}

class Cloth {
  constructor({
    nx = 14, ny = 14,
    width = 0.045, height = 0.045,
    center = new V(0, 0.015, -0.022),
    plane = 'xy',             // 'xy' (vertical) or 'xz' (horizontal)
    mass = 0.015,
    compliance = 0,           // stretch compliance
    shearCompliance = 0.01,   // diagonal compliance
    bendCompliance = null,    // null / 0 = soft fabric (no paper-like spring-back); > 0 = stiff paper/leather
    particleRadius = null,
    pinnedCorners = [0, nx - 1]
  } = {}){
    this.nx = nx; this.ny = ny;
    this.particles = [];
    this.constraints = [];
    this.pinned = new Set();
    const particleMass = mass / (nx * ny);
    const dx = width / (nx - 1);
    const dy = height / (ny - 1);
    const isXZ = plane === 'xz';
    const startX = center.x - width/2;
    const startY = center.y + height/2;
    const startZ = center.z - height/2;

    this.particleMass = particleMass;
    const colRadius = particleRadius !== null && particleRadius !== undefined ? particleRadius : Math.min(dx, dy) * 0.28;

    for (let j = 0; j < ny; j++){
      for (let i = 0; i < nx; i++){
        const idx = j * nx + i;
        let px, py, pz;
        if (isXZ){
          px = startX + i * dx;
          // Subtle initial perturbation to break symmetry so cloth drapes naturally into organic folds
          py = center.y + Math.sin(i / (nx - 1) * Math.PI) * Math.sin(j / (ny - 1) * Math.PI) * 0.005;
          pz = startZ + j * dy;
        } else {
          px = startX + i * dx;
          py = startY - j * dy;
          // Subtle out-of-plane catenary wave so fabric hangs with organic 3D drapery
          pz = center.z + Math.sin(i / (nx - 1) * Math.PI) * 0.025 * (j / (ny - 1));
        }
        const isPinned = Array.isArray(pinnedCorners) && pinnedCorners.includes(idx);
        const p = new Particle(px, py, pz, isPinned ? 0 : particleMass, colRadius);
        p._cloth = this;
        p._cx = i;
        p._cy = j;
        if (isPinned) this.pinned.add(idx);
        this.particles.push(p);
      }
    }

    const addC = (i1, i2, comp) => {
      this.constraints.push(new DistanceConstraint(this.particles[i1], this.particles[i2], comp));
    };

    // Structural (inextensible threads)
    for (let j = 0; j < ny; j++){
      for (let i = 0; i < nx; i++){
        const idx = j * nx + i;
        if (i < nx - 1) addC(idx, idx + 1, compliance);
        if (j < ny - 1) addC(idx, idx + nx, compliance);
      }
    }

    // Shear (diagonal drape)
    if (shearCompliance !== null && shearCompliance !== undefined){
      for (let j = 0; j < ny - 1; j++){
        for (let i = 0; i < nx - 1; i++){
          const idx = j * nx + i;
          addC(idx, idx + nx + 1, shearCompliance);
          addC(idx + 1, idx + nx, shearCompliance);
        }
      }
    }

    // Bending (2-hop distance constraints - only for stiff materials like paper, cardboard, sheet metal)
    if (bendCompliance !== null && bendCompliance !== undefined && bendCompliance > 0){
      for (let j = 0; j < ny; j++){
        for (let i = 0; i < nx; i++){
          const idx = j * nx + i;
          if (i < nx - 2) addC(idx, idx + 2, bendCompliance);
          if (j < ny - 2) addC(idx, idx + 2*nx, bendCompliance);
        }
      }
    }
  }

  togglePin(idx, mass = this.particleMass){
    if (idx < 0 || idx >= this.particles.length) return;
    const p = this.particles[idx];
    if (this.pinned.has(idx)){
      this.pinned.delete(idx);
      p.invM = 1 / (mass || 0.001);
      p.px.copy(p.x);
      p.v.set(0, 0, 0);
    } else {
      this.pinned.add(idx);
      p.invM = 0;
      p.px.copy(p.x);
      p.v.set(0, 0, 0);
    }
  }
}

class TetVolumeConstraint {
  constructor(p1, p2, p3, p4, compliance = 0){
    this.p1 = p1; this.p2 = p2; this.p3 = p3; this.p4 = p4;
    this.compliance = compliance; // m^4 / N (0 = strictly incompressible)
    this.lambda = 0;
    // ensure initial orientation has positive volume
    let v0 = this.calcV();
    if (v0 < 0){
      const tmp = this.p2; this.p2 = this.p3; this.p3 = tmp;
      v0 = -v0;
    }
    this.restVolume = Math.max(v0, 1e-12);
  }

  calcV(){
    const { p1, p2, p3, p4 } = this;
    t1.subVectors(p2.x, p1.x);
    t2.subVectors(p3.x, p1.x);
    t3.subVectors(p4.x, p1.x);
    return t4.crossVectors(t1, t2).dot(t3) / 6;
  }
}

class TetMesh {
  constructor({
    nx = 3, ny = 3, nz = 3,
    sizeX = 0.026, sizeY = 0.026, sizeZ = 0.026,
    center = new V(0, 0.015, -0.022),
    mass = 0.04,
    edgeCompliance = 0.0001,
    volCompliance = 0
  } = {}){
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.particles = [];
    this.edgeConstraints = [];
    this.volumeConstraints = [];
    this.tets = [];
    this.surfaceIndices = [];

    const totalParticles = nx * ny * nz;
    const pMass = mass / totalParticles;
    const dx = sizeX / (nx - 1);
    const dy = sizeY / (ny - 1);
    const dz = sizeZ / (nz - 1);
    const startX = center.x - sizeX/2;
    const startY = center.y + sizeY/2;
    const startZ = center.z - sizeZ/2;

    const pIdx = (i, j, k) => (k * ny + j) * nx + i;

    for (let k = 0; k < nz; k++){
      for (let j = 0; j < ny; j++){
        for (let i = 0; i < nx; i++){
          const px = startX + i * dx;
          const py = startY - j * dy;
          const pz = startZ + k * dz;
          const radius = Math.min(dx, dy, dz) * 0.28;
          const p = new Particle(px, py, pz, pMass, radius);
          p._tetMesh = this;
          p._tx = i; p._ty = j; p._tz = k;
          this.particles.push(p);
        }
      }
    }

    // Subdivide hex cells into 5 tetrahedra with alternating diagonal orientation
    for (let k = 0; k < nz - 1; k++){
      for (let j = 0; j < ny - 1; j++){
        for (let i = 0; i < nx - 1; i++){
          const v0 = pIdx(i, j, k);
          const v1 = pIdx(i+1, j, k);
          const v2 = pIdx(i+1, j+1, k);
          const v3 = pIdx(i, j+1, k);
          const v4 = pIdx(i, j, k+1);
          const v5 = pIdx(i+1, j, k+1);
          const v6 = pIdx(i+1, j+1, k+1);
          const v7 = pIdx(i, j+1, k+1);
          if ((i + j + k) % 2 === 0){
            this.tets.push([v0, v1, v3, v4]);
            this.tets.push([v1, v2, v3, v6]);
            this.tets.push([v1, v4, v5, v6]);
            this.tets.push([v3, v4, v6, v7]);
            this.tets.push([v1, v3, v4, v6]);
          } else {
            this.tets.push([v0, v1, v2, v5]);
            this.tets.push([v0, v2, v3, v7]);
            this.tets.push([v0, v4, v5, v7]);
            this.tets.push([v2, v5, v6, v7]);
            this.tets.push([v0, v2, v5, v7]);
          }
        }
      }
    }

    // Unique edges -> DistanceConstraint
    const edgeSet = new Set();
    for (const [a, b, c, d] of this.tets){
      const edges = [[a,b],[a,c],[a,d],[b,c],[b,d],[c,d]];
      for (const [u, v] of edges){
        const key = u < v ? u + ',' + v : v + ',' + u;
        if (!edgeSet.has(key)){
          edgeSet.add(key);
          this.edgeConstraints.push(new DistanceConstraint(this.particles[u], this.particles[v], edgeCompliance));
        }
      }
    }

    // Tetrahedral volume preservation constraints
    for (const [a, b, c, d] of this.tets){
      this.volumeConstraints.push(new TetVolumeConstraint(
        this.particles[a], this.particles[b], this.particles[c], this.particles[d], volCompliance
      ));
    }

    // Boundary surface extraction
    const faceMap = new Map();
    for (const tet of this.tets){
      const fList = [
        [tet[0], tet[1], tet[2], tet[3]],
        [tet[0], tet[1], tet[3], tet[2]],
        [tet[0], tet[2], tet[3], tet[1]],
        [tet[1], tet[2], tet[3], tet[0]]
      ];
      for (const [a, b, c, opp] of fList){
        const key = [a, b, c].sort((x, y) => x - y).join(',');
        if (!faceMap.has(key)) faceMap.set(key, { count: 0, a, b, c, opp });
        faceMap.get(key).count++;
      }
    }

    for (const [key, val] of faceMap){
      if (val.count === 1){
        const { a, b, c, opp } = val;
        const pa = this.particles[a].x, pb = this.particles[b].x, pc = this.particles[c].x, popp = this.particles[opp].x;
        t1.subVectors(pb, pa); t2.subVectors(pc, pa);
        t3.crossVectors(t1, t2);
        t4.subVectors(pa, popp);
        if (t3.dot(t4) > 0){
          this.surfaceIndices.push(a, b, c);
        } else {
          this.surfaceIndices.push(a, c, b);
        }
      }
    }
  }
}

// ---------- scratch vectors (hot path never allocates) ----------
const t1 = new V(), t2 = new V(), t3 = new V(), t4 = new V(), tq = new Q();
const g1 = new V(), g2 = new V(), g3 = new V(), g4 = new V();
const P1 = new V(), P2 = new V(), P1p = new V(), P2p = new V();
const r1 = new V(), r2 = new V(), dir = new V(), dp = new V(), va = new V(), dv = new V();

function solveTetVolume(c, h){
  const { p1, p2, p3, p4 } = c;
  const w1 = p1.invM, w2 = p2.invM, w3 = p3.invM, w4 = p4.invM;
  const wSum = w1 + w2 + w3 + w4;
  if (wSum <= 0) return;

  t1.subVectors(p2.x, p1.x);
  t2.subVectors(p3.x, p1.x);
  t3.subVectors(p4.x, p1.x);

  t4.crossVectors(t1, t2);
  const V = t4.dot(t3) / 6;
  const C = V - c.restVolume;

  g4.copy(t4).multiplyScalar(1/6);
  g2.crossVectors(t2, t3).multiplyScalar(1/6);
  g3.crossVectors(t3, t1).multiplyScalar(1/6);
  g1.copy(g2).add(g3).add(g4).negate();

  const denom = w1*g1.lengthSq() + w2*g2.lengthSq() + w3*g3.lengthSq() + w4*g4.lengthSq();
  if (denom < 1e-15) return;

  const alphaTilde = c.compliance / (h * h);
  const dLambda = (-C - alphaTilde * c.lambda) / (denom + alphaTilde);
  c.lambda += dLambda;

  if (w1 > 0) p1.x.addScaledVector(g1, w1 * dLambda);
  if (w2 > 0) p2.x.addScaledVector(g2, w2 * dLambda);
  if (w3 > 0) p3.x.addScaledVector(g3, w3 * dLambda);
  if (w4 > 0) p4.x.addScaledVector(g4, w4 * dLambda);
}

// ---------- particle self-collision (spatial hash) ----------
const SPATIAL_HASH_SIZE = 8192;
const SPATIAL_HASH_MASK = SPATIAL_HASH_SIZE - 1;
const hashHead = new Int32Array(SPATIAL_HASH_SIZE);
let hashNext = new Int32Array(2048);
const K1 = 73856093, K2 = 19349663, K3 = 83492791;

function solveParticleSelfCollisions(particles){
  const n = particles.length;
  if (n < 2) return;
  if (hashNext.length < n){
    hashNext = new Int32Array(Math.max(n * 2, 2048));
  }

  let maxR = 0.02;
  for (let i = 0; i < n; i++){
    if (particles[i].radius > maxR) maxR = particles[i].radius;
  }
  const cellSize = Math.max(maxR * 2.2, 0.05);
  const invCell = 1 / cellSize;

  hashHead.fill(-1);
  for (let i = 0; i < n; i++){
    const p = particles[i];
    const ix = Math.floor(p.x.x * invCell);
    const iy = Math.floor(p.x.y * invCell);
    const iz = Math.floor(p.x.z * invCell);
    const bucket = (((ix * K1) ^ (iy * K2) ^ (iz * K3)) & 0x7fffffff) & SPATIAL_HASH_MASK;
    hashNext[i] = hashHead[bucket];
    hashHead[bucket] = i;
  }

  for (let i = 0; i < n; i++){
    const p1 = particles[i];
    const ix = Math.floor(p1.x.x * invCell);
    const iy = Math.floor(p1.x.y * invCell);
    const iz = Math.floor(p1.x.z * invCell);
    const hx = ix * K1, hy = iy * K2, hz = iz * K3;

    for (let ox = -1; ox <= 1; ox++){
      const cx = hx + ox * K1;
      for (let oy = -1; oy <= 1; oy++){
        const cy = cx ^ (hy + oy * K2);
        for (let oz = -1; oz <= 1; oz++){
          const bucket = ((cy ^ (hz + oz * K3)) & 0x7fffffff) & SPATIAL_HASH_MASK;
          let j = hashHead[bucket];
          while (j !== -1){
            if (j > i){
              const p2 = particles[j];
              let skip = false;
              if (p1._cloth && p1._cloth === p2._cloth){
                if (Math.abs(p1._cx - p2._cx) <= 1 && Math.abs(p1._cy - p2._cy) <= 1) skip = true;
              } else if (p1._tetMesh && p1._tetMesh === p2._tetMesh){
                if (Math.abs(p1._tx - p2._tx) <= 1 && Math.abs(p1._ty - p2._ty) <= 1 && Math.abs(p1._tz - p2._tz) <= 1) skip = true;
              }
              if (!skip){
                const dx = p1.x.x - p2.x.x;
                const dy = p1.x.y - p2.x.y;
                const dz = p1.x.z - p2.x.z;
                const d2 = dx*dx + dy*dy + dz*dz;
                const minDist = p1.radius + p2.radius;
                if (d2 < minDist * minDist && d2 > 1e-12){
                  const d = Math.sqrt(d2);
                  const pen = minDist - d;
                  const nx = dx / d, ny = dy / d, nz = dz / d;
                  const w1 = p1.invM, w2 = p2.invM;
                  const wSum = w1 + w2;
                  if (wSum > 0){
                    const s1 = pen * (w1 / wSum);
                    const s2 = pen * (w2 / wSum);
                    p1.x.x += nx * s1; p1.x.y += ny * s1; p1.x.z += nz * s1;
                    p2.x.x -= nx * s2; p2.x.y -= ny * s2; p2.x.z -= nz * s2;
                    p1.px.x += nx * s1; p1.px.y += ny * s1; p1.px.z += nz * s1;
                    p2.px.x -= nx * s2; p2.px.y -= ny * s2; p2.px.z -= nz * s2;
                  }
                }
              }
            }
            j = hashNext[j];
          }
        }
      }
    }
  }
}

// ---------- generic position / velocity corrections ----------
function genInvMass(b, r, n){
  if (!b) return 0;
  t3.crossVectors(r, n);
  return b.invM + b.invI*t3.lengthSq();
}
function applyCorrection(b, r, p, sign){        // positional impulse p at offset r
  if (!b) return;
  b.x.addScaledVector(p, sign*b.invM);
  t3.crossVectors(r, p).multiplyScalar(sign*b.invI);
  tq.set(t3.x, t3.y, t3.z, 0).multiply(b.q);
  b.q.x += .5*tq.x; b.q.y += .5*tq.y; b.q.z += .5*tq.z; b.q.w += .5*tq.w;
  b.q.normalize();
}
function applyImpulse(b, r, p, sign){            // velocity impulse p at offset r
  if (!b) return;
  b.v.addScaledVector(p, sign*b.invM);
  t3.crossVectors(r, p).multiplyScalar(sign*b.invI);
  b.w.add(t3);
}
function pointVelocity(b, r, out){ return out.crossVectors(b.w, r).add(b.v); }

// ---------- contacts (pooled) ----------
// a: body pushed along +n; b: other body or null for a wall.
// la/lb: contact points in body-local coordinates; wp: world point on a wall.
const pool = [];
let nContacts = 0;
let margin = 0;   // contacts are collected this far before touching; solved only when penetrating
function addContact(a, b, pa, pb, n){
  if (nContacts === pool.length)
    pool.push({ a:null, b:null, n:new V(), la:new V(), lb:new V(), wp:new V(), lam:0, vn0:0, e:0, jt:new V() });
  const c = pool[nContacts++];
  c.a = a; c.b = b; c.n.copy(n); c.lam = 0;
  a.toLocal(pa, c.la);
  if (b) b.toLocal(pb, c.lb); else c.wp.copy(pb);
  // normal relative velocity before the solve, for restitution
  pointVelocity(a, r1.subVectors(pa, a.x), va);
  if (b) va.sub(pointVelocity(b, r2.subVectors(pb, b.x), t1));
  c.vn0 = va.dot(n);
}

// ---------- cube vs walls: corners against six planes ----------
const corner = new V(), wallPt = new V();
function collideWalls(a, walls){
  for (let i = 0; i < 8; i++){
    corner.set(i&1 ? a.h : -a.h, i&2 ? a.h : -a.h, i&4 ? a.h : -a.h).applyQuaternion(a.q).add(a.x);
    for (const w of walls){
      const pen = w.o - w.n.dot(corner);
      if (pen > -margin) addContact(a, null, corner, wallPt.copy(corner).addScaledVector(w.n, pen), w.n);
    }
  }
}

// ---------- cube vs cube: SAT + contact manifold ----------
// Face contacts clip the incident face against the reference face (up to 8
// points, so a resting cube gets a stable patch, not a single wobbling corner).
// Edge axes are only used when clearly better than a face axis, which keeps the
// normal from flipping between substeps.
const D = new V(), L = new V(), N = new V(), F = new V(), U = new V(), W = new V();
const absC = [[0,0,0],[0,0,0],[0,0,0]];
const bufA = Array.from({length:16}, () => new V()), bufB = Array.from({length:16}, () => new V());
const pA = new V(), pB = new V(), cA = new V(), cB = new V();
const REL_TOL = 0.95, EPS = 1e-6;

function clipPlane(src, n, dst, axis, origin, off){  // keep (p-origin)·axis <= off
  let m = 0;
  for (let i = 0; i < n; i++){
    const p = src[i], q = src[(i+1) % n];
    const dp = t1.subVectors(p, origin).dot(axis) - off;
    const dq = t1.subVectors(q, origin).dot(axis) - off;
    if (dp <= 0) dst[m++].copy(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) dst[m++].lerpVectors(p, q, dp/(dp - dq));
  }
  return m;
}

// ref: body owning the reference face (axis index k, outward normal nRef);
// inc: other body. Adds contacts with n pointing from b to a.
function faceContact(ref, k, nRef, inc, A, B, n){
  // incident face: the face of inc most anti-parallel to nRef
  let bi = 0, bd = -1;
  for (let i = 0; i < 3; i++){ const d = Math.abs(inc.axes[i].dot(nRef)); if (d > bd){ bd = d; bi = i; } }
  F.copy(inc.axes[bi]).multiplyScalar(inc.axes[bi].dot(nRef) > 0 ? -inc.h : inc.h).add(inc.x);
  U.copy(inc.axes[(bi+1)%3]).multiplyScalar(inc.h);
  W.copy(inc.axes[(bi+2)%3]).multiplyScalar(inc.h);
  bufA[0].copy(F).add(U).add(W); bufA[1].copy(F).sub(U).add(W);
  bufA[2].copy(F).sub(U).sub(W); bufA[3].copy(F).add(U).sub(W);
  let n4 = 4;
  const u = ref.axes[(k+1)%3], w = ref.axes[(k+2)%3];
  n4 = clipPlane(bufA, n4, bufB, u, ref.x, ref.h);
  U.copy(u).negate(); n4 = clipPlane(bufB, n4, bufA, U, ref.x, ref.h);
  n4 = clipPlane(bufA, n4, bufB, w, ref.x, ref.h);
  U.copy(w).negate(); n4 = clipPlane(bufB, n4, bufA, U, ref.x, ref.h);
  for (let i = 0; i < n4; i++){
    const p = bufA[i];
    const depth = ref.h - t1.subVectors(p, ref.x).dot(nRef);
    if (depth <= -margin) continue;
    t2.copy(p).addScaledVector(nRef, depth);       // projection onto reference face
    if (ref === B) addContact(A, B, p, t2, n);
    else addContact(A, B, t2, p, n);
  }
}

function collideBoxes(A, B){
  D.subVectors(A.x, B.x);                           // B → A
  const R = (A.h + B.h)*SQRT3 + margin;
  if (D.lengthSq() > R*R) return;
  const a = A.axes, b = B.axes;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) absC[i][j] = Math.abs(a[i].dot(b[j])) + EPS;

  let faceSep = -Infinity, faceBody = 0, faceIdx = 0;
  for (let i = 0; i < 3; i++){
    const s = Math.abs(D.dot(a[i])) - A.h - B.h*(absC[i][0] + absC[i][1] + absC[i][2]);
    if (s > margin) return;
    if (s > faceSep){ faceSep = s; faceBody = 0; faceIdx = i; }
  }
  for (let j = 0; j < 3; j++){
    const s = Math.abs(D.dot(b[j])) - B.h - A.h*(absC[0][j] + absC[1][j] + absC[2][j]);
    if (s > margin) return;
    if (s > REL_TOL*faceSep + 0.02*B.h){ faceSep = s; faceBody = 1; faceIdx = j; }
  }
  let edgeSep = -Infinity, ei = 0, ej = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++){
    L.crossVectors(a[i], b[j]);
    const len = L.length();
    if (len < 1e-4) continue;                      // parallel edges: covered by face axes
    L.divideScalar(len);
    const rA = A.h*(Math.abs(a[0].dot(L)) + Math.abs(a[1].dot(L)) + Math.abs(a[2].dot(L)));
    const rB = B.h*(Math.abs(b[0].dot(L)) + Math.abs(b[1].dot(L)) + Math.abs(b[2].dot(L)));
    const s = Math.abs(D.dot(L)) - rA - rB;
    if (s > margin) return;
    if (s > edgeSep){ edgeSep = s; ei = i; ej = j; }
  }

  if (edgeSep > REL_TOL*faceSep + 0.02*Math.min(A.h, B.h)){
    // edge–edge: one contact between the closest points of the two edges
    N.crossVectors(a[ei], b[ej]).normalize();
    if (N.dot(D) < 0) N.negate();
    cA.copy(A.x); cB.copy(B.x);
    for (let k = 0; k < 3; k++){
      if (k !== ei) cA.addScaledVector(a[k], a[k].dot(N) > 0 ? -A.h : A.h);  // A's edge nearest B
      if (k !== ej) cB.addScaledVector(b[k], b[k].dot(N) > 0 ? B.h : -B.h);  // B's edge nearest A
    }
    const d1 = a[ei], d2 = b[ej];
    t1.subVectors(cA, cB);
    const bb = d1.dot(d2), c = d1.dot(t1), f = d2.dot(t1);
    const den = 1 - bb*bb;
    let s = den > 1e-8 ? THREE.MathUtils.clamp((bb*f - c)/den, -A.h, A.h) : 0;
    const t = THREE.MathUtils.clamp(bb*s + f, -B.h, B.h);
    s = THREE.MathUtils.clamp(bb*t - c, -A.h, A.h);
    pA.copy(cA).addScaledVector(d1, s);
    pB.copy(cB).addScaledVector(d2, t);
    if (t1.subVectors(pB, pA).dot(N) > -margin) addContact(A, B, pA, pB, N);
    return;
  }

  if (faceBody === 1){
    N.copy(b[faceIdx]); if (N.dot(D) < 0) N.negate();     // B's face toward A
    faceContact(B, faceIdx, N, A, A, B, N);
  } else {
    N.copy(a[faceIdx]); if (N.dot(D) < 0) N.negate();     // n: B → A
    L.copy(N).negate();                                   // A's face toward B
    faceContact(A, faceIdx, L, B, A, B, N);
  }
}

// ---------- solver passes ----------
// Contacts are swept in alternating order each substep. With one Gauss–Seidel
// pass, a fixed order makes resting cubes creep or slowly roll one way.
let flip = false;
function solveNormals(maxPush, fwd){
  for (let k = 0; k < nContacts; k++){
    const c = pool[fwd ? k : nContacts - 1 - k], a = c.a, b = c.b, n = c.n;
    a.toWorld(c.la, P1);
    if (b) b.toWorld(c.lb, P2); else P2.copy(c.wp);
    let d = t1.subVectors(P2, P1).dot(n);
    if (d <= 0) continue;
    d = Math.min(d, maxPush);                      // deep overlaps separate over several substeps
    r1.subVectors(P1, a.x); if (b) r2.subVectors(P2, b.x);
    const dl = d/(genInvMass(a, r1, n) + genInvMass(b, r2, n));
    c.lam += dl;
    dir.copy(n).multiplyScalar(dl);
    applyCorrection(a, r1, dir, +1);
    applyCorrection(b, r2, dir, -1);
  }
}

// static friction: undo tangential slip of contact points this substep,
// clamped to mu_s * normal correction
function solveStaticFriction(muS, fwd){
  for (let k = 0; k < nContacts; k++){
    const c = pool[fwd ? k : nContacts - 1 - k], a = c.a, b = c.b, n = c.n;
    if (c.lam <= 0) continue;
    a.toWorld(c.la, P1); a.toWorldPrev(c.la, P1p);
    if (b){ b.toWorld(c.lb, P2); b.toWorldPrev(c.lb, P2p); }
    else { P2.copy(c.wp); P2p.copy(c.wp); }
    dp.subVectors(P1, P1p).sub(P2).add(P2p);
    dp.addScaledVector(n, -dp.dot(n));
    const len = dp.length();
    if (len < 1e-12) continue;
    dir.copy(dp).divideScalar(len);
    r1.subVectors(P1, a.x); if (b) r2.subVectors(P2, b.x);
    const lt = len/(genInvMass(a, r1, dir) + genInvMass(b, r2, dir));
    if (lt < muS*c.lam){
      dir.multiplyScalar(lt);
      applyCorrection(a, r1, dir, -1);
      applyCorrection(b, r2, dir, +1);
    }
  }
}

// Normals first (a few sweeps so a cube's corners agree), then friction, then
// one more normal sweep to clean up what the friction step pushed in.
function solvePositions(h, maxPush, iters){
  for (let it = 0; it < iters; it++) solveNormals(maxPush, (it & 1) === 0 ? !flip : flip);
  solveStaticFriction(this.muStatic, !flip);
  solveNormals(maxPush, flip);
}

// Velocity pass: dynamic friction and restitution. A cube's 4–8 contact points
// are coupled (friction at bottom corners also tips cube), so this runs a few
// interleaved sweeps. Each contact's friction impulse is accumulated and kept
// within Coulomb limit mu * (normal impulse lam/h).
function relVel(c){
  contactArms(c);
  pointVelocity(c.a, r1, va);
  if (c.b) va.sub(pointVelocity(c.b, r2, t1));
  return va;
}

function solveVelocities(h, gmag){
  for (let k = 0; k < nContacts; k++){
    const c = pool[k];
    c.jt.set(0, 0, 0);
    if (c.lam <= 0) continue;
    // restitution only for real impacts, so resting cubes don't hop
    c.e = Math.abs(relVel(c).dot(c.n)) < 2*gmag*h ? 0 : this.restitution;
  }
  for (let it = 0; it < this.velocityIterations; it++){
    const fwd = (it & 1) === 0 ? !flip : flip;
    for (let k = 0; k < nContacts; k++){
      const c = pool[fwd ? k : nContacts - 1 - k];
      if (c.lam <= 0) continue;
      const a = c.a, b = c.b, n = c.n;
      // friction
      relVel(c);
      t2.copy(va).addScaledVector(n, -va.dot(n));
      const vt = t2.length();
      if (vt > 1e-9){
        dv.copy(t2).divideScalar(vt);
        dp.copy(c.jt).addScaledVector(dv, -vt/(genInvMass(a, r1, dv) + genInvMass(b, r2, dv)));
        const maxJ = this.muDynamic*c.lam/h;
        if (dp.lengthSq() > maxJ*maxJ) dp.setLength(maxJ);
        dir.subVectors(dp, c.jt);
        c.jt.copy(dp);
        applyImpulse(a, r1, dir, +1);
        applyImpulse(b, r2, dir, -1);
      }
      // normal: drive normal velocity to zero, or to bounce velocity
      relVel(c);
      const dvn = -va.dot(n) + Math.max(-c.e*c.vn0, 0);
      if (Math.abs(dvn) < 1e-9) continue;
      dir.copy(n).multiplyScalar(dvn/(genInvMass(a, r1, n) + genInvMass(b, r2, n)));
      applyImpulse(a, r1, dir, +1);
      applyImpulse(b, r2, dir, -1);
    }
  }
}

function contactArms(c){            // r1, r2: contact offsets from body centers
  c.a.toWorld(c.la, P1); r1.subVectors(P1, c.a.x);
  if (c.b){ c.b.toWorld(c.lb, P2); r2.subVectors(P2, c.b.x); }
}

// ---------- World ----------
class World {
  constructor(opts){
    Object.assign(this, DEFAULTS, opts);
    this.bodies = [];
    this.particles = [];
    this.constraints = [];
    this.volumeConstraints = [];
    this.cloths = [];
    this.tetMeshes = [];
    this.spheres = [];
    this.walls = [];
    this.box = { hx:1.0, hy:1.5, d:2.2 };   // 3 meters tall (hy = 1.5m), 2.2m depth
    this.accel = new V(0, -9.81, 0);   // apparent acceleration felt inside the box
    this.omega = new V();              // phone angular velocity
    this.omegaDot = new V();           // phone angular acceleration
    this.center = new V();
    this.setBox(this.box.hx, this.box.hy, this.box.d);
  }
  setBox(hx, hy, d){
    Object.assign(this.box, { hx, hy, d });
    // inward normal n, offset o: inside when n·p >= o
    this.walls = [
      { n:new V( 1,0,0), o:-hx }, { n:new V(-1,0,0), o:-hx },
      { n:new V(0, 1,0), o:-hy }, { n:new V(0,-1,0), o:-hy },
      { n:new V(0,0, 1), o:-d },  { n:new V(0,0,-1), o:0 }      // back wall, glass
    ];
    this.center.set(0, 0, -d/2);
  }
  addSphere(radius, center, friction = 0.25){
    const s = { radius, center: center.clone(), friction };
    this.spheres.push(s);
    return s;
  }
  addCube(size, pos, quat, vel){
    const b = new Body(size, this.density);
    b.x.copy(pos); if (quat) b.q.copy(quat); if (vel) b.v.copy(vel);
    b.sync();
    this.bodies.push(b);
    return b;
  }
  addCloth(opts){
    const c = new Cloth(opts);
    this.cloths.push(c);
    this.particles.push(...c.particles);
    this.constraints.push(...c.constraints);
    return c;
  }
  addTetMesh(opts){
    const tm = new TetMesh(opts);
    this.tetMeshes.push(tm);
    this.particles.push(...tm.particles);
    this.constraints.push(...tm.edgeConstraints);
    this.volumeConstraints.push(...tm.volumeConstraints);
    return tm;
  }
  addParticle(x, y, z, mass, radius){
    const p = new Particle(x, y, z, mass, radius);
    this.particles.push(p);
    return p;
  }
  addDistanceConstraint(p1, p2, compliance, restLength){
    const c = new DistanceConstraint(p1, p2, compliance, restLength);
    this.constraints.push(c);
    return c;
  }
  clear(){
    this.bodies.length = 0;
    this.particles.length = 0;
    this.constraints.length = 0;
    this.volumeConstraints.length = 0;
    this.cloths.length = 0;
    this.tetMeshes.length = 0;
    this.spheres.length = 0;
  }
  // true if a cube of this size at pos overlaps an existing cube's bounding sphere
  crowded(pos, size){
    for (const b of this.bodies){
      const r = (b.h + size/2)*SQRT3;
      if (b.x.distanceToSquared(pos) < r*r) return true;
    }
    return false;
  }

  step(){
    const h = this.dt/this.substeps;
    const gmag = Math.max(this.accel.length(), 1);
    const maxPush = this.maxPushSpeed*h;
    const linK = Math.max(0, 1 - this.linearDamping*h), angK = Math.max(0, 1 - this.angularDamping*h);
    const { bodies, particles, constraints, volumeConstraints, walls, omega, omegaDot, accel, center } = this;

    for (let s = 0; s < this.substeps; s++){
      // 1. integrate rigid bodies
      for (const b of bodies){
        b.px.copy(b.x); b.pq.copy(b.q);
        t1.subVectors(b.x, center);
        t2.crossVectors(omegaDot, t1);                            // Euler
        t3.crossVectors(omega, t1); t3.crossVectors(omega, t3);   // centrifugal
        b.v.addScaledVector(accel, h).addScaledVector(t2, -h).addScaledVector(t3, -h);
        t2.crossVectors(omega, b.v); b.v.addScaledVector(t2, -2*h);  // Coriolis
        b.w.addScaledVector(omegaDot, -h);
        b.x.addScaledVector(b.v, h);
        tq.set(b.w.x, b.w.y, b.w.z, 0).multiply(b.q);
        b.q.x += .5*h*tq.x; b.q.y += .5*h*tq.y; b.q.z += .5*h*tq.z; b.q.w += .5*h*tq.w;
        b.q.normalize();
        b.sync();
      }

      // 2. integrate particles (gravity, shake, and fictitious forces)
      for (const p of particles){
        if (p.invM === 0) continue;
        p.px.copy(p.x);
        t1.subVectors(p.x, center);
        t2.crossVectors(omegaDot, t1);                            // Euler
        t3.crossVectors(omega, t1); t3.crossVectors(omega, t3);   // centrifugal
        p.v.addScaledVector(accel, h).addScaledVector(t2, -h).addScaledVector(t3, -h);
        t2.crossVectors(omega, p.v); p.v.addScaledVector(t2, -2*h);  // Coriolis
        p.x.addScaledVector(p.v, h);
      }

      // 3. solve particle constraints (XPBD compliance)
      for (const c of constraints) c.lambda = 0;
      for (const c of volumeConstraints) c.lambda = 0;
      for (let it = 0; it < this.positionIterations; it++){
        for (const c of constraints){
          const p1 = c.p1, p2 = c.p2;
          const w1 = p1.invM, w2 = p2.invM;
          const wSum = w1 + w2;
          if (wSum <= 0) continue;
          t1.subVectors(p1.x, p2.x);
          const len = t1.length();
          if (len < 1e-9) continue;
          const C = len - c.restLength;
          const alphaTilde = c.compliance / (h * h);
          const dLambda = (-C - alphaTilde * c.lambda) / (wSum + alphaTilde);
          c.lambda += dLambda;
          t1.multiplyScalar(dLambda / len);
          if (w1 > 0) p1.x.addScaledVector(t1, w1);
          if (w2 > 0) p2.x.addScaledVector(t1, -w2);
        }
        for (const c of volumeConstraints) solveTetVolume(c, h);
      }

      // 4. particle collisions (self, walls & rigid bodies)
      if (this.selfCollision){
        solveParticleSelfCollisions(particles);
      }
      for (const p of particles){
        if (p.invM === 0) continue;
        // wall collision
        for (const w of walls){
          const pen = (w.o + p.radius) - w.n.dot(p.x);
          if (pen > 0){
            p.x.addScaledVector(w.n, pen);
            // Ensure p.px is not outside the wall so depenetration does not create artificial outward kinetic bounce
            const pxPen = (w.o + p.radius) - w.n.dot(p.px);
            if (pxPen > 0) p.px.addScaledVector(w.n, pxPen);
            // Eliminate normal velocity into the wall: (p.x - p.px)·w.n must be >= 0
            const nDisp = (p.x.dot(w.n) - p.px.dot(w.n));
            if (nDisp < 0) p.px.addScaledVector(w.n, nDisp);

            // Tangential dynamic friction (smooth sliding, prevents wall sticking)
            t1.subVectors(p.x, p.px);
            const normComponent = t1.dot(w.n);
            t1.addScaledVector(w.n, -normComponent);
            const tLen = t1.length();
            if (tLen > 1e-6){
              const mu = p._tetMesh ? 0.05 : 0.25;
              const f = Math.min(0.5, mu * (pen / (tLen + 1e-5)));
              p.x.addScaledVector(t1, -f);
            }
          }
        }
        // sphere collision
        for (const s of this.spheres){
          const minR = s.radius + p.radius;
          t1.subVectors(p.x, s.center);
          const d2 = t1.lengthSq();
          if (d2 < minR * minR){
            const d = Math.sqrt(d2);
            const n = d > 1e-9 ? t1.divideScalar(d) : t1.set(0, 1, 0);
            const pen = minR - d;
            p.x.addScaledVector(n, pen);

            const pxDist = (p.px.x - s.center.x)*n.x + (p.px.y - s.center.y)*n.y + (p.px.z - s.center.z)*n.z;
            if (pxDist < minR) p.px.addScaledVector(n, minR - pxDist);

            const nDisp = (p.x.x - p.px.x)*n.x + (p.x.y - p.px.y)*n.y + (p.x.z - p.px.z)*n.z;
            if (nDisp < 0) p.px.addScaledVector(n, nDisp);

            t2.subVectors(p.x, p.px);
            const nComp = t2.dot(n);
            t2.addScaledVector(n, -nComp);
            const tLen = t2.length();
            if (tLen > 1e-6){
              const mu = s.friction !== undefined ? s.friction : 0.3;
              const f = Math.min(0.5, mu * (pen / (tLen + 1e-5)));
              p.x.addScaledVector(t2, -f);
            }
          }
        }
        // cube collision
        for (const b of bodies){
          if (p.x.distanceToSquared(b.x) > (b.h * SQRT3 + p.radius)**2) continue;
          b.toLocal(p.x, t1);
          const bh = b.h + p.radius;
          if (Math.abs(t1.x) < bh && Math.abs(t1.y) < bh && Math.abs(t1.z) < bh){
            const dx = bh - Math.abs(t1.x);
            const dy = bh - Math.abs(t1.y);
            const dz = bh - Math.abs(t1.z);
            if (dx < dy && dx < dz) t1.x = t1.x > 0 ? bh : -bh;
            else if (dy < dz) t1.y = t1.y > 0 ? bh : -bh;
            else t1.z = t1.z > 0 ? bh : -bh;
            b.toWorld(t1, p.x);
          }
        }
      }

      // 5. update particle velocities
      for (const p of particles){
        if (p.invM === 0){ p.v.set(0, 0, 0); continue; }
        p.v.subVectors(p.x, p.px).divideScalar(h);
        p.v.multiplyScalar(linK);
        if (p.v.lengthSq() > this.maxSpeed*this.maxSpeed) p.v.setLength(this.maxSpeed);
      }

      // 5b. internal constraint damping (dissipates high-frequency tension flutter in cloth)
      for (const c of constraints){
        const p1 = c.p1, p2 = c.p2;
        const w1 = p1.invM, w2 = p2.invM;
        const wSum = w1 + w2;
        if (wSum <= 0) continue;
        t1.subVectors(p1.x, p2.x);
        const len = t1.length();
        if (len < 1e-6) continue;
        t1.divideScalar(len);
        t2.subVectors(p1.v, p2.v);
        const vn = t2.dot(t1);
        const dv = -0.04 * vn;
        if (w1 > 0) p1.v.addScaledVector(t1, dv * (w1 / wSum));
        if (w2 > 0) p2.v.addScaledVector(t1, -dv * (w2 / wSum));
      }

      // 6. collide rigid bodies
      nContacts = 0;
      margin = this.contactMargin;
      for (const b of bodies) collideWalls(b, this.walls);
      for (const b of bodies){
        for (const s of this.spheres){
          const minR = s.radius + b.h;
          t1.subVectors(b.x, s.center);
          const d2 = t1.lengthSq();
          if (d2 < minR * minR){
            const d = Math.sqrt(d2);
            const n = d > 1e-9 ? t1.divideScalar(d) : t1.set(0, 1, 0);
            b.x.addScaledVector(n, minR - d);
            const vn = b.v.dot(n);
            if (vn < 0) b.v.addScaledVector(n, -vn);
          }
        }
      }
      for (let i = 0; i < bodies.length; i++)
        for (let j = i + 1; j < bodies.length; j++) collideBoxes(bodies[i], bodies[j]);

      solvePositions.call(this, h, maxPush, this.positionIterations);

      // 7. rigid body velocities from position change
      for (const b of bodies){
        b.v.subVectors(b.x, b.px).divideScalar(h);
        tq.copy(b.pq).conjugate().premultiply(b.q);
        b.w.set(tq.x, tq.y, tq.z).multiplyScalar(2/h);
        if (tq.w < 0) b.w.negate();
      }

      solveVelocities.call(this, h, gmag);
      flip = !flip;

      for (const b of bodies){
        b.v.multiplyScalar(linK); b.w.multiplyScalar(angK);
        if (b.v.lengthSq() > this.maxSpeed*this.maxSpeed) b.v.setLength(this.maxSpeed);
        if (b.w.lengthSq() > this.maxSpin*this.maxSpin) b.w.setLength(this.maxSpin);
      }
    }
  }
}

const CubePhysics = { World, Body, Particle, DistanceConstraint, Cloth, TetVolumeConstraint, TetMesh, DEFAULTS };

// Export
global.CubePhysics = CubePhysics;
global.XPBD = CubePhysics;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CubePhysics;
}

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
