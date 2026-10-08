/* ================= Shared Room Environment & Utilities =================
   3.0m studio room setup, 3-point lighting, wall meshes, DeviceMotion sensors,
   drag-to-tilt desktop fallback, FPS meter, and notification toasts.
   ======================================================================== */

(function(global) {
'use strict';

const THREE = global.THREE;
if (!THREE) {
  throw new Error('RoomEnv requires Three.js (THREE global)');
}

const V = THREE.Vector3;

/* ================= 1. Standard Dark Room Palette & PBR Materials ================= */
const ROOM_MATERIALS = {
  wall: new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.85, metalness: 0.05 }),
  back: new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 0.90, metalness: 0.04 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.65, metalness: 0.10 })
};

/* ================= 2. Studio Lighting (1 Key Light, 2 Fill Lights) ================= */
function createLighting(scene) {
  // 1. Key Light: warm primary light from the front-right side, reduced to 70% intensity (1.12)
  const key = new THREE.DirectionalLight(0xfff4e6, 1.12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  const sc = key.shadow.camera;
  sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4;
  sc.near = 0.1; sc.far = 15;
  scene.add(key, key.target);

  // 2. Fill Light 1: cool directional fill from the opposite (left) side to soften shadows
  const fill1 = new THREE.DirectionalLight(0xcde0f8, 0.25);
  scene.add(fill1, fill1.target);

  // 3. Fill Light 2: ambient studio room fill so ceiling and shadows have gentle bounce light
  const fill2 = new THREE.HemisphereLight(0x363d4a, 0x16191f, 0.25);
  scene.add(fill2);

  return {
    key,
    fill1,
    fill2,
    fill: fill1,      // backwards compatibility alias
    rim: fill2,       // backwards compatibility alias
    light1: key,
    light2: fill1,
    light3: fill2
  };
}

/* ================= 3. Room Wall Meshes ================= */
function buildWallMeshes(scene, box, oldGroup = null) {
  if (oldGroup) scene.remove(oldGroup);
  const wallGroup = new THREE.Group();
  const { hx, hy, d } = box;

  const mk = (w, hh, mat, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
    m.position.copy(pos);
    m.rotation.set(...rot);
    m.receiveShadow = true;
    wallGroup.add(m);
  };

  mk(2*hx, 2*hy, ROOM_MATERIALS.back, new V(0, 0, -d), [0, 0, 0]);
  mk(d, 2*hy, ROOM_MATERIALS.wall, new V(-hx, 0, -d/2), [0, Math.PI/2, 0]);
  mk(d, 2*hy, ROOM_MATERIALS.wall, new V( hx, 0, -d/2), [0, -Math.PI/2, 0]);
  mk(2*hx, d, ROOM_MATERIALS.floor, new V(0, -hy, -d/2), [-Math.PI/2, 0, 0]); // floor
  mk(2*hx, d, ROOM_MATERIALS.wall, new V(0,  hy, -d/2), [ Math.PI/2, 0, 0]); // ceiling

  scene.add(wallGroup);
  return wallGroup;
}

/* ================= 4. Responsive Viewport & 3m Room Calibration ================= */
function updateRoom(camera, renderer, world, lights, oldWallGroup, scene) {
  const W = window.innerWidth, H = window.innerHeight;
  const aspect = W / H;
  renderer.setSize(W, H, false);
  camera.aspect = aspect;

  // Standard room is exactly 3.0 meters tall
  const roomHeight = 3.0;
  const hy = roomHeight / 2; // 1.5 m
  const hx = hy * aspect;
  const roomDepth = 2.4;
  world.setBox(hx, hy, roomDepth);

  const newWallGroup = buildWallMeshes(scene, world.box, oldWallGroup);

  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(world.box.hy / tanH, world.box.hx / (tanH * aspect));
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, -world.box.d * 0.3);
  camera.updateProjectionMatrix();

  // Studio lighting: Key light from front-right, Fill light 1 from front-left
  if (lights) {
    if (lights.key) {
      lights.key.position.set(world.box.hx * 1.35, world.box.hy * 0.85, 0.05);
      lights.key.target.position.set(-world.box.hx * 0.1, -world.box.hy * 0.25, -world.box.d * 0.45);

      const maxDim = Math.max(world.box.hx, world.box.hy, world.box.d);
      const sc = lights.key.shadow.camera;
      sc.left = -maxDim * 1.6;
      sc.right = maxDim * 1.6;
      sc.top = maxDim * 1.6;
      sc.bottom = -maxDim * 1.6;
      sc.near = 0.1;
      sc.far = Math.max(15, maxDim * 5);
      sc.updateProjectionMatrix();
    }

    const f1 = lights.fill1 || lights.fill;
    if (f1) {
      f1.position.set(-world.box.hx * 1.35, world.box.hy * 0.6, 0.05);
      if (f1.target) f1.target.position.set(world.box.hx * 0.1, -world.box.hy * 0.25, -world.box.d * 0.45);
    }
  }

  // Configure tone mapping and ensure zero ambient/fill environment lighting
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }
  if (scene) {
    scene.environment = null;
  }

  return newWallGroup;
}

/* ================= 5. Toast Notifications ================= */
let noteTimeout = null;
function showNote(text, ms = 5000) {
  const note = document.getElementById('note');
  if (!note) return;
  note.textContent = text;
  note.classList.add('show');
  clearTimeout(noteTimeout);
  if (ms) noteTimeout = setTimeout(() => note.classList.remove('show'), ms);
}

/* ================= 6. Real-Time FPS Meter ================= */
function createFpsMeter() {
  const fpsEl = document.getElementById('fps');
  let count = 0, lastTime = performance.now();
  return function tick(now) {
    count++;
    if (now - lastTime >= 400) {
      if (fpsEl) {
        fpsEl.textContent = `${Math.round((count * 1000) / (now - lastTime))} FPS`;
      }
      count = 0;
      lastTime = now;
    }
  };
}

/* ================= 7. DeviceMotion Sensors & Drag Tilt Fallback ================= */
function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

function toScreen(x, y, z, out) {
  const a = THREE.MathUtils.degToRad(screenAngle()), c = Math.cos(a), s = Math.sin(a);
  return out.set(x*c - y*s, x*s + y*c, z);
}

function setupMotionSensors({ world, onStart = null, onPointerDrag = null }) {
  let gotMotion = false, lastT = 0;
  const prevOmega = new V(), tmpO = new V(), rawA = new V(), dO = new V();

  function onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    gotMotion = true;
    toScreen(-g.x, -g.y, -g.z, rawA);
    const L = rawA.length();
    if (L > 80) rawA.multiplyScalar(80 / L);
    world.accel.copy(rawA);

    const r = e.rotationRate;
    if (r && r.alpha != null) {
      const k = Math.PI / 180;
      toScreen(r.beta*k, r.gamma*k, r.alpha*k, tmpO);
      const now = performance.now() / 1000;
      const dt = lastT ? Math.min(Math.max(now - lastT, 0.005), 0.1) : 0;
      lastT = now;
      world.omega.lerp(tmpO, 0.6);
      if (dt) {
        dO.copy(world.omega).sub(prevOmega).divideScalar(dt);
        if (dO.length() > 200) dO.setLength(200);
        world.omegaDot.lerp(dO, 0.35);
      }
      prevOmega.copy(world.omega);
    }
  }

  // Drag tilt desktop fallback
  let tiltX = 0, tiltY = 0, dragging = false, lx = 0, ly = 0;
  function dragGravity() {
    const g = 9.81;
    world.accel.set(
      Math.sin(tiltX) * Math.cos(tiltY) * g,
      -Math.cos(tiltX) * Math.cos(tiltY) * g,
      -Math.sin(tiltY) * g
    );
  }

  window.addEventListener('pointerdown', e => {
    dragging = true; lx = e.clientX; ly = e.clientY;
    if (onPointerDrag) onPointerDrag(e, 'down');
  });

  window.addEventListener('pointerup', e => {
    dragging = false;
    if (onPointerDrag) onPointerDrag(e, 'up');
  });

  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (onPointerDrag) {
      const handled = onPointerDrag(e, 'move');
      if (handled) return;
    }
    if (gotMotion) return;
    tiltX = THREE.MathUtils.clamp(tiltX + (e.clientX - lx) * 0.008, -1.5, 1.5);
    tiltY = THREE.MathUtils.clamp(tiltY + (e.clientY - ly) * 0.008, -1.5, 1.5);
    lx = e.clientX; ly = e.clientY;
    dragGravity();
  });

  // Start button handler (handles iOS sensor permission prompt)
  const goBtn = document.getElementById('go');
  if (goBtn) {
    goBtn.addEventListener('click', async () => {
      let denied = false;
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          const res = await DeviceMotionEvent.requestPermission();
          if (res !== 'granted') throw new Error('denied');
        }
        window.addEventListener('devicemotion', onMotion);
      } catch (err) {
        denied = true;
      }
      const intro = document.getElementById('intro');
      if (intro) intro.remove();
      if (onStart) onStart();

      setTimeout(() => {
        if (!gotMotion) {
          const shakeBtn = document.getElementById('shake');
          if (shakeBtn) shakeBtn.classList.remove('hidden');
          let embedded = false;
          try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
          const msg = denied ? 'Motion access denied. Drag on screen to tilt or interact.'
            : embedded ? 'Viewer blocks motion sensors. Drag to tilt or interact.'
            : !window.isSecureContext ? 'Motion sensors require HTTPS. Drag to tilt or interact.'
            : 'Motion sensors inactive. Drag on screen to tilt or interact.';
          showNote(msg, 6000);
        }
      }, 1200);
    });
  }

  return {
    isMotionActive: () => gotMotion,
    getTilt: () => ({ tiltX, tiltY })
  };
}

/* ================= 8. Beveled Rounded Cube Geometry ================= */
function roundedCube(size, radius, segments = 4) {
  const g = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const v = new V(), c = new V(), k = size/2 - radius;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(THREE.MathUtils.clamp(v.x, -k, k), THREE.MathUtils.clamp(v.y, -k, k), THREE.MathUtils.clamp(v.z, -k, k));
    v.sub(c).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
    v.multiplyScalar(radius).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Export to global scope
global.RoomEnv = {
  ROOM_MATERIALS,
  createLighting,
  buildWallMeshes,
  updateRoom,
  showNote,
  createFpsMeter,
  setupMotionSensors,
  roundedCube
};

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
