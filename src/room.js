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
  // 1. Key Light: warm primary light from the front-right side, reduced by 50% (0.56)
  const key = new THREE.DirectionalLight(0xfff4e6, 0.56);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2.5;
  const sc = key.shadow.camera;
  sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4;
  sc.near = 0.1; sc.far = 15;
  scene.add(key, key.target);

  // 2. Fill Light 1: cool directional fill shining into the room, reduced by 50% (0.28)
  const fill1 = new THREE.DirectionalLight(0xcfe0f5, 0.28);
  scene.add(fill1, fill1.target);

  // 3. Fill Light 2: ambient studio room light, reduced by 50% (0.21)
  const fill2 = new THREE.AmbientLight(0xdde5f0, 0.21);
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
      f1.position.set(-world.box.hx * 0.7, world.box.hy * 0.7, 0.35);
      if (f1.target) f1.target.position.set(-world.box.hx * 0.3, -world.box.hy * 0.25, -world.box.d * 0.5);
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

  // Desktop ViewCube widget
  let viewCube = null;

  function onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    gotMotion = true;
    if (viewCube) viewCube.hide();
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

  // Create desktop ViewCube
  if (typeof document !== 'undefined') {
    viewCube = createViewCube({
      world,
      onGravityChange: (accel) => {
        const g = 9.81;
        const gz = THREE.MathUtils.clamp(-accel.z / g, -0.999, 0.999);
        tiltY = Math.asin(gz);
        const cosY = Math.cos(tiltY);
        if (Math.abs(cosY) > 0.001) {
          const gx = THREE.MathUtils.clamp(accel.x / (g * cosY), -0.999, 0.999);
          tiltX = Math.asin(gx);
        }
      }
    });
  }

  window.addEventListener('pointerdown', e => {
    if (e.target && e.target.closest && (e.target.closest('#viewcube-container') || e.target.closest('#hud') || e.target.closest('#intro'))) return;
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
    if (viewCube) viewCube.syncFromWorld();
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
          const msg = denied ? 'Motion access denied. Use ViewCube or drag to steer gravity.'
            : embedded ? 'Viewer blocks motion sensors. Use ViewCube or drag to steer gravity.'
            : !window.isSecureContext ? 'Motion sensors require HTTPS. Use ViewCube or drag to steer gravity.'
            : 'Motion sensors inactive. Use ViewCube or drag to steer gravity.';
          showNote(msg, 6000);
          if (viewCube) viewCube.show();
        } else {
          if (viewCube) viewCube.hide();
        }
      }, 1200);
    });
  }

  return {
    isMotionActive: () => gotMotion,
    getTilt: () => ({ tiltX, tiltY }),
    viewCube
  };
}

/* ================= 8. Interactive Desktop ViewCube (Gravity Controller) ================= */
function createViewCube({ world, onGravityChange = null, parent = document.body }) {
  if (!document || !parent) return null;

  // Root container
  const container = document.createElement('div');
  container.id = 'viewcube-container';

  // Header row: Home reset button + Active face badge
  const header = document.createElement('div');
  header.id = 'viewcube-header';

  const homeBtn = document.createElement('button');
  homeBtn.id = 'viewcube-home';
  homeBtn.title = 'Reset Gravity (Floor)';
  homeBtn.setAttribute('aria-label', 'Reset gravity to floor');
  homeBtn.innerHTML = '⌂';

  const badge = document.createElement('span');
  badge.id = 'viewcube-badge';
  badge.textContent = 'FLOOR';

  header.appendChild(homeBtn);
  header.appendChild(badge);
  container.appendChild(header);

  // 3D Isometric Canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'viewcube-canvas';
  const size = 96;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  container.appendChild(canvas);

  // Presets grid (2 rows x 3 cols + full width Zero-G)
  const presets = document.createElement('div');
  presets.id = 'viewcube-presets';
  const presetDefs = [
    { key: 'BOTTOM', label: 'Floor' },
    { key: 'LEFT',   label: 'Left' },
    { key: 'RIGHT',  label: 'Right' },
    { key: 'TOP',    label: 'Ceil' },
    { key: 'FRONT',  label: 'Front' },
    { key: 'BACK',   label: 'Back' },
    { key: 'ZEROG',  label: '0-G Float', full: true }
  ];

  const presetBtns = {};
  presetDefs.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'viewcube-btn' + (p.full ? ' full-width' : '');
    btn.textContent = p.label;
    btn.setAttribute('data-face', p.key);
    if (p.key === 'BOTTOM') btn.classList.add('active');
    presets.appendChild(btn);
    presetBtns[p.key] = btn;
  });
  container.appendChild(presets);

  parent.appendChild(container);

  // Prevent event bubbling to Three.js canvas or parent
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick'].forEach(evt => {
    container.addEventListener(evt, e => e.stopPropagation());
  });

  // Cube Geometry: half-size s = 27 (fits with margins inside 96x96 viewport)
  const s = 27;
  const verts = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]
  ];

  // Faces definitions: qTarget makes that face become the active floor / gravity direction
  const FACES = [
    { name: 'BOTTOM', label: 'FLOOR',   idx: [0, 1, 5, 4], n: new V( 0, -1,  0), qTarget: new THREE.Quaternion(0, 0, 0, 1),                                              gTarget: new V( 0, -9.81,  0) },
    { name: 'TOP',    label: 'CEILING', idx: [7, 6, 2, 3], n: new V( 0,  1,  0), qTarget: new THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), Math.PI),            gTarget: new V( 0,  9.81,  0) },
    { name: 'LEFT',   label: 'LEFT',    idx: [0, 4, 7, 3], n: new V(-1,  0,  0), qTarget: new THREE.Quaternion().setFromAxisAngle(new V(0, 0, 1),  Math.PI / 2),        gTarget: new V(-9.81,  0,  0) },
    { name: 'RIGHT',  label: 'RIGHT',   idx: [5, 1, 2, 6], n: new V( 1,  0,  0), qTarget: new THREE.Quaternion().setFromAxisAngle(new V(0, 0, 1), -Math.PI / 2),        gTarget: new V( 9.81,  0,  0) },
    { name: 'FRONT',  label: 'FRONT',   idx: [4, 5, 6, 7], n: new V( 0,  0,  1), qTarget: new THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0),  Math.PI / 2),        gTarget: new V( 0,  0,  9.81) },
    { name: 'BACK',   label: 'BACK',    idx: [1, 0, 3, 2], n: new V( 0,  0, -1), qTarget: new THREE.Quaternion().setFromAxisAngle(new V(1, 0, 0), -Math.PI / 2),        gTarget: new V( 0,  0, -9.81) }
  ];

  const faceMap = {};
  FACES.forEach(f => { faceMap[f.name] = f; });

  // Camera angles (Axonometric/Isometric CAD view)
  const pitch = 22 * Math.PI / 180;
  const yaw = -32 * Math.PI / 180;
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

  function camTransform(p) {
    // 1. Yaw around Y
    const x1 = p[0] * cosY + p[2] * sinY;
    const y1 = p[1];
    const z1 = -p[0] * sinY + p[2] * cosY;
    // 2. Pitch around X
    const x2 = x1;
    const y2 = y1 * cosP - z1 * sinP;
    const z2 = y1 * sinP + z1 * cosP;
    return [x2, y2, z2];
  }

  // Camera basis vectors in world space for intuitive trackball drag
  const camRight = new V(cosY, 0, -sinY);
  const camUp    = new V(-sinY * sinP, cosP, -cosY * sinP);

  // Directional shading lights in camera space
  const keyL = [0.5, 0.8, 0.4];
  const kLen = Math.hypot(...keyL);
  const uKey = keyL.map(v => v / kLen);

  const fillL = [-0.6, 0.3, 0.3];
  const fLen = Math.hypot(...fillL);
  const uFill = fillL.map(v => v / fLen);

  // State
  const orientation = new THREE.Quaternion();
  let targetQ = null;
  let isZeroG = false;
  let hoveredFace = null;
  let activeFace = 'BOTTOM';
  let isDragging = false;
  let dragMoved = false;
  let lastPtrX = 0, lastPtrY = 0;
  let visibleFaces = [];

  const tmpVec = new V();
  function quatRotate(q, x, y, z) {
    tmpVec.set(x, y, z).applyQuaternion(q);
    return [tmpVec.x, tmpVec.y, tmpVec.z];
  }

  function setActivePreset(key) {
    Object.keys(presetBtns).forEach(k => {
      presetBtns[k].classList.toggle('active', k === key);
    });
  }

  function applyGravity() {
    if (isZeroG) {
      world.accel.set(0, 0, 0);
      badge.textContent = '0-G FLOAT';
      setActivePreset('ZEROG');
    } else {
      tmpVec.set(0, -1, 0).applyQuaternion(orientation).multiplyScalar(9.81);
      world.accel.copy(tmpVec);

      let bestFace = 'CUSTOM';
      let maxDot = -Infinity;
      const curDir = tmpVec.clone().normalize();
      for (const f of FACES) {
        const dot = curDir.dot(f.gTarget.clone().normalize());
        if (dot > maxDot) {
          maxDot = dot;
          if (dot > 0.92) bestFace = f.name;
        }
      }
      activeFace = bestFace;
      if (bestFace !== 'CUSTOM') {
        badge.textContent = faceMap[bestFace].label;
        setActivePreset(bestFace);
      } else {
        badge.textContent = 'TILTED';
        setActivePreset(null);
      }
    }
    if (onGravityChange) onGravityChange(world.accel);
  }

  function render() {
    if (targetQ) {
      orientation.slerp(targetQ, 0.22);
      if (orientation.angleTo(targetQ) < 0.005) {
        orientation.copy(targetQ);
        targetQ = null;
      }
      applyGravity();
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;

    // Transform vertices
    const projVerts = verts.map(v => {
      const worldP = quatRotate(orientation, v[0], v[1], v[2]);
      const camP = camTransform(worldP);
      return {
        x: cx + camP[0],
        y: cy - camP[1],
        z: camP[2]
      };
    });

    // Check faces visibility & depth
    visibleFaces = [];
    for (const f of FACES) {
      const worldN = quatRotate(orientation, f.n.x, f.n.y, f.n.z);
      const camN = camTransform(worldN);
      if (camN[2] > 0.001) {
        const pts = f.idx.map(i => projVerts[i]);
        const cenX = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
        const cenY = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
        const insetPts = pts.map(p => ({
          x: cenX + (p.x - cenX) * 0.88,
          y: cenY + (p.y - cenY) * 0.88
        }));
        const dotKey = Math.max(0, camN[0]*uKey[0] + camN[1]*uKey[1] + camN[2]*uKey[2]);
        const dotFill = Math.max(0, camN[0]*uFill[0] + camN[1]*uFill[1] + camN[2]*uFill[2]);
        const light = 0.28 + 0.52 * dotKey + 0.20 * dotFill;

        visibleFaces.push({
          name: f.name,
          label: f.label,
          z: camN[2],
          outerPts: pts,
          pts: insetPts,
          cenX,
          cenY,
          light,
          isActive: !isZeroG && activeFace === f.name,
          isHovered: hoveredFace === f.name
        });
      }
    }

    // Sort back-to-front
    visibleFaces.sort((a, b) => a.z - b.z);

    // Chassis silhouette
    for (const f of visibleFaces) {
      ctx.beginPath();
      ctx.moveTo(f.outerPts[0].x, f.outerPts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(f.outerPts[i].x, f.outerPts[i].y);
      ctx.closePath();
      ctx.fillStyle = '#141a22';
      ctx.fill();
    }

    // Inset face panels
    for (const f of visibleFaces) {
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
      ctx.closePath();

      if (f.isHovered) {
        ctx.fillStyle = '#f2b632';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
      } else if (f.isActive) {
        const r = Math.round(50 * f.light + 40);
        const g = Math.round(75 * f.light + 40);
        const b = Math.round(110 * f.light + 50);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.strokeStyle = '#f2b632';
        ctx.lineWidth = 1.5;
      } else {
        const r = Math.round(40 * f.light + 15);
        const g = Math.round(52 * f.light + 18);
        const b = Math.round(72 * f.light + 25);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.0;
      }
      ctx.fill();
      ctx.stroke();

      // Label text
      ctx.font = 'bold 9.5px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = f.isHovered ? '#121820' : (f.isActive ? '#fff' : '#cbd5e1');
      ctx.fillText(f.label, f.cenX, f.cenY);
    }

    // Center glowing gravity arrow
    if (!isZeroG) {
      const gLen = world.accel.length();
      if (gLen > 0.05) {
        const gDir = world.accel.clone().normalize();
        const camG = camTransform([gDir.x, gDir.y, gDir.z]);
        const arrowLen = 34;
        const ax = cx + camG[0] * arrowLen;
        const ay = cy - camG[1] * arrowLen;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ax, ay);
        ctx.strokeStyle = '#f2b632';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = 'rgba(242, 182, 50, 0.7)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 255, 0.85)';
      ctx.shadowColor = 'rgba(150, 200, 255, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function getFaceAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    for (let i = visibleFaces.length - 1; i >= 0; i--) {
      const f = visibleFaces[i];
      if (pointInPoly(px, py, f.pts)) return f;
    }
    return null;
  }

  canvas.addEventListener('pointermove', e => {
    if (isDragging) {
      const dx = e.clientX - lastPtrX;
      const dy = e.clientY - lastPtrY;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      if (Math.hypot(dx, dy) > 1) dragMoved = true;

      isZeroG = false;
      targetQ = null;

      const qYaw = new THREE.Quaternion().setFromAxisAngle(camUp, dx * 0.022);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(camRight, dy * 0.022);
      const deltaQ = qYaw.multiply(qPitch);
      orientation.premultiply(deltaQ).normalize();
      applyGravity();
      return;
    }

    const face = getFaceAt(e.clientX, e.clientY);
    const newHover = face ? face.name : null;
    if (newHover !== hoveredFace) {
      hoveredFace = newHover;
      canvas.style.cursor = hoveredFace ? 'pointer' : 'grab';
    }
  });

  canvas.addEventListener('pointerdown', e => {
    isDragging = true;
    dragMoved = false;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointerup', e => {
    if (isDragging) {
      canvas.releasePointerCapture(e.pointerId);
      isDragging = false;
      if (!dragMoved) {
        const face = getFaceAt(e.clientX, e.clientY);
        if (face && faceMap[face.name]) {
          snapToFace(face.name);
        }
      }
    }
  });

  canvas.addEventListener('pointerleave', () => {
    if (!isDragging) {
      hoveredFace = null;
      canvas.style.cursor = 'grab';
    }
  });

  function snapToFace(faceName) {
    isZeroG = false;
    const f = faceMap[faceName];
    if (f) {
      targetQ = f.qTarget.clone();
      activeFace = faceName;
      badge.textContent = f.label;
      setActivePreset(faceName);
      applyGravity();
    }
  }

  function setZeroG() {
    isZeroG = true;
    targetQ = null;
    applyGravity();
  }

  function resetHome() {
    snapToFace('BOTTOM');
  }

  homeBtn.addEventListener('click', resetHome);

  presets.addEventListener('click', e => {
    const btn = e.target.closest('.viewcube-btn');
    if (!btn) return;
    const faceKey = btn.getAttribute('data-face') || (btn.dataset && btn.dataset.face);
    if (faceKey === 'ZEROG') {
      setZeroG();
    } else {
      snapToFace(faceKey);
    }
  });

  function syncFromWorld() {
    if (isDragging || targetQ) return;
    const g = world.accel;
    const len = g.length();
    if (len < 0.1) {
      isZeroG = true;
      setActivePreset('ZEROG');
      badge.textContent = '0-G FLOAT';
      return;
    }
    isZeroG = false;
    const dir = g.clone().normalize();
    orientation.setFromUnitVectors(new V(0, -1, 0), dir);

    let bestFace = 'CUSTOM';
    let maxDot = -Infinity;
    for (const f of FACES) {
      const dot = dir.dot(f.gTarget.clone().normalize());
      if (dot > maxDot) {
        maxDot = dot;
        if (dot > 0.92) bestFace = f.name;
      }
    }
    activeFace = bestFace;
    if (bestFace !== 'CUSTOM') {
      badge.textContent = faceMap[bestFace].label;
      setActivePreset(bestFace);
    } else {
      badge.textContent = 'TILTED';
      setActivePreset(null);
    }
  }

  return {
    container,
    canvas,
    snapToFace,
    setZeroG,
    resetHome,
    syncFromWorld,
    hide: () => { container.style.display = 'none'; },
    show: () => { container.style.display = 'flex'; }
  };
}

/* ================= 9. Beveled Rounded Cube Geometry ================= */
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
  createViewCube,
  roundedCube
};

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
