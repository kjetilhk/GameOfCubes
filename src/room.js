/* ================= Shared Room Environment & Utilities =================
   3.0m studio room setup, 3-point lighting, wall meshes, DeviceMotion sensors,
   drag-to-tilt desktop fallback, FPS meter, particle dragger, cube spawner,
   procedural fabric textures, orbit camera, and notification toasts.
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
  if (oldGroup) {
    oldGroup.traverse(child => {
      if (child.isMesh && child.geometry) child.geometry.dispose();
    });
    scene.remove(oldGroup);
  }

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

function createViewCube(opts) {
  if (global.ViewCube && typeof global.ViewCube.create === 'function') {
    return global.ViewCube.create(opts);
  }
  return null;
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

/* ================= 9. Reusable Cube Spawner Utility ================= */
function createCubeSpawner(optsOrWorld, sceneArg = null, optsArg = {}) {
  let opts;
  if (optsOrWorld && optsOrWorld.scene && optsOrWorld.world) {
    opts = optsOrWorld;
  } else if (optsOrWorld && sceneArg) {
    if (optsOrWorld.bodies) {
      opts = Object.assign({}, optsArg, { world: optsOrWorld, scene: sceneArg });
    } else {
      opts = Object.assign({}, optsArg, { scene: optsOrWorld, world: sceneArg });
    }
  } else {
    opts = optsOrWorld || {};
  }

  const {
    scene,
    world,
    palette = [0x2a5bd7, 0xf2b632, 0xef6f6c, 0x4fbf9f, 0xf3efe6, 0x7a5cc4, 0xff9f43],
    maxCubes = 30,
    sizeRange = [0.36, 0.50],
    spawnPos = null,
    materialProps = { roughness: 0.28, metalness: 0.04, clearcoat: 0.25, clearcoatRoughness: 0.15 }
  } = opts;
  const meshes = [];
  const geometryCache = new Map();

  function getGeometry(s) {
    const key = Math.round(s * 1000) / 1000;
    if (!geometryCache.has(key)) {
      geometryCache.set(key, roundedCube(s, s * 0.12, 4));
    }
    return geometryCache.get(key);
  }

  function spawnCube(customSize = null, customPos = null) {
    if (world.bodies.length >= maxCubes) return null;
    const s = customSize !== null ? customSize : (
      typeof sizeRange === 'number' ? sizeRange : sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0])
    );
    const pos = customPos ? customPos.clone() : new V();
    if (!customPos) {
      if (spawnPos) {
        pos.copy(spawnPos(world.box, s));
      } else {
        for (let tries = 0; tries < 20; tries++) {
          pos.set(
            (Math.random() - 0.5) * 2 * (world.box.hx - s * 0.8),
            world.box.hy * (0.6 * Math.random() - 0.1),
            -world.box.d * 0.5
          );
          if (!world.crowded(pos, s)) break;
        }
      }
    }
    const body = world.addCube(
      s,
      pos,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random()*6, Math.random()*6, Math.random()*6)),
      new V((Math.random() - 0.5) * 0.8, 0, 0)
    );

    const geom = getGeometry(s);
    const mat = new THREE.MeshPhysicalMaterial(Object.assign({
      color: palette[world.bodies.length % palette.length]
    }, materialProps));

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(pos);
    scene.add(mesh);
    meshes.push(mesh);
    return { body, mesh };
  }

  function sync() {
    if (!world) return;
    for (let i = 0; i < meshes.length; i++) {
      const b = meshes[i].userData.body;
      if (b) {
        meshes[i].position.copy(b.x);
        meshes[i].quaternion.copy(b.q);
      } else if (world.bodies[i]) {
        meshes[i].position.copy(world.bodies[i].x);
        meshes[i].quaternion.copy(world.bodies[i].q);
      }
    }
  }

  function clear() {
    for (const m of meshes) {
      scene.remove(m);
      m.material.dispose();
    }
    meshes.length = 0;
  }

  function dispose() {
    clear();
    for (const g of geometryCache.values()) g.dispose();
    geometryCache.clear();
  }

  return {
    meshes,
    spawnCube,
    sync,
    clear,
    dispose
  };
}

/* ================= 10. Reusable Particle Raycast Dragger ================= */
function createParticleDragger({ camera, world, getTargetParticles, pickRadius = 0.25 }) {
  let grabbedParticle = null, origInvM = 0;
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();
  const planeZ = new THREE.Plane(new V(0, 0, 1), 0);
  const hitPoint = new V();

  function handlePointer(e, type) {
    mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (type === 'down') {
      raycaster.setFromCamera(mouseVec, camera);
      const particles = getTargetParticles ? getTargetParticles() : (world ? world.particles : []);
      if (particles && particles.length) {
        let closestP = null, minD = pickRadius;
        for (const p of particles) {
          const dist = raycaster.ray.distanceToPoint(p.x);
          if (dist < minD) { minD = dist; closestP = p; }
        }
        if (closestP) {
          grabbedParticle = closestP;
          origInvM = closestP.invM;
          closestP.invM = 0;
          return true;
        }
      }
    } else if (type === 'up') {
      if (grabbedParticle) {
        grabbedParticle.invM = origInvM;
        grabbedParticle = null;
        return true;
      }
    } else if (type === 'move' && grabbedParticle) {
      raycaster.setFromCamera(mouseVec, camera);
      planeZ.constant = -grabbedParticle.x.z;
      if (raycaster.ray.intersectPlane(planeZ, hitPoint)) {
        grabbedParticle.x.copy(hitPoint);
        grabbedParticle.px.copy(hitPoint);
        grabbedParticle.v.set(0, 0, 0);
      }
      return true;
    }
    return false;
  }

  return {
    handlePointer,
    getGrabbedParticle: () => grabbedParticle,
    isDragging: () => grabbedParticle !== null
  };
}

/* ================= 11. Procedural Woven Fabric Texture Generator ================= */
function createFabricTextures({
  color = '#ede5d8',
  threads = 32,
  size = 512,
  repeat = 30,
  isTerracotta = false
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const bCanvas = document.createElement('canvas');
  bCanvas.width = bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d');

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const step = size / threads;

  if (isTerracotta) {
    for (let i = 0; i < threads; i++) {
      const pos = i * step;
      ctx.fillStyle = (i % 2 === 0) ? 'rgba(235, 120, 105, 0.28)' : 'rgba(80, 20, 16, 0.25)';
      ctx.fillRect(pos, 0, step * 0.8, size);

      ctx.fillStyle = (i % 2 === 1) ? 'rgba(235, 120, 105, 0.28)' : 'rgba(80, 20, 16, 0.25)';
      ctx.fillRect(0, pos, size, step * 0.8);

      bCtx.fillStyle = (i % 2 === 0) ? '#a0a0a0' : '#606060';
      bCtx.fillRect(pos, 0, step * 0.8, size);
      bCtx.fillStyle = (i % 2 === 1) ? '#a0a0a0' : '#606060';
      bCtx.fillRect(0, pos, size, step * 0.8);
    }
  } else {
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const cx = Math.floor(x / step);
        const cy = Math.floor(y / step);
        const warpOnTop = (cx + cy) % 2 === 0;
        const lum = ((cx * 17 + cy * 11) % 19) - 9;
        const baseR = 238 + lum, baseG = 230 + lum, baseB = 218 + lum;

        if (warpOnTop) {
          const grad = ctx.createLinearGradient(x, 0, x + step, 0);
          grad.addColorStop(0, `rgb(${baseR - 32}, ${baseG - 32}, ${baseB - 32})`);
          grad.addColorStop(0.2, `rgb(${baseR + 6}, ${baseG + 6}, ${baseB + 6})`);
          grad.addColorStop(0.5, `rgb(${baseR + 18}, ${baseG + 18}, ${baseB + 18})`);
          grad.addColorStop(0.8, `rgb(${baseR + 6}, ${baseG + 6}, ${baseB + 6})`);
          grad.addColorStop(1, `rgb(${baseR - 32}, ${baseG - 32}, ${baseB - 32})`);
          ctx.fillStyle = grad;
          ctx.fillRect(x + 1, y, step - 2, step);

          const bGrad = bCtx.createLinearGradient(x, 0, x + step, 0);
          bGrad.addColorStop(0, '#484848');
          bGrad.addColorStop(0.5, '#ffffff');
          bGrad.addColorStop(1, '#484848');
          bCtx.fillStyle = bGrad;
          bCtx.fillRect(x + 1, y, step - 2, step);
        } else {
          const grad = ctx.createLinearGradient(0, y, 0, y + step);
          grad.addColorStop(0, `rgb(${baseR - 32}, ${baseG - 32}, ${baseB - 32})`);
          grad.addColorStop(0.2, `rgb(${baseR + 6}, ${baseG + 6}, ${baseB + 6})`);
          grad.addColorStop(0.5, `rgb(${baseR + 18}, ${baseG + 18}, ${baseB + 18})`);
          grad.addColorStop(0.8, `rgb(${baseR + 6}, ${baseG + 6}, ${baseB + 6})`);
          grad.addColorStop(1, `rgb(${baseR - 32}, ${baseG - 32}, ${baseB - 32})`);
          ctx.fillStyle = grad;
          ctx.fillRect(x, y + 1, step, step - 2);

          const bGrad = bCtx.createLinearGradient(0, y, 0, y + step);
          bGrad.addColorStop(0, '#484848');
          bGrad.addColorStop(0.5, '#ffffff');
          bGrad.addColorStop(1, '#484848');
          bCtx.fillStyle = bGrad;
          bCtx.fillRect(x, y + 1, step, step - 2);
        }
      }
    }
  }

  // Micro-grain fiber fuzz
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i+1] = Math.min(255, Math.max(0, data[i+1] + n));
    data[i+2] = Math.min(255, Math.max(0, data[i+2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const bData = bCtx.getImageData(0, 0, size, size);
  const bd = bData.data;
  for (let i = 0; i < bd.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    const v = Math.min(255, Math.max(0, bd[i] + n));
    bd[i] = bd[i+1] = bd[i+2] = v;
  }
  bCtx.putImageData(bData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);

  const bump = new THREE.CanvasTexture(bCanvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(repeat, repeat);

  return { map: tex, bumpMap: bump };
}

/* ================= 12. Lightweight 3D Orbit Controls ================= */
function createOrbitControls(camera, target = new V(0, 0, -1.2), {
  dist = 3.2,
  pitch = 0.28,
  yaw = 0.0,
  minDist = 1.0,
  maxDist = 8.0,
  minPitch = -1.2,
  maxPitch = 1.4,
  onPointerDrag = null
} = {}) {
  let orbitDist = dist;
  let orbitPitch = pitch;
  let orbitYaw = yaw;
  let dragging = false;
  let lx = 0, ly = 0;

  function update() {
    const cp = Math.cos(orbitPitch), sp = Math.sin(orbitPitch);
    const cy = Math.cos(orbitYaw), sy = Math.sin(orbitYaw);
    camera.position.set(
      target.x + orbitDist * sy * cp,
      target.y + orbitDist * sp,
      target.z + orbitDist * cy * cp
    );
    camera.lookAt(target);
  }

  window.addEventListener('pointerdown', e => {
    if (e.target && e.target.closest && (e.target.closest('#hud') || e.target.closest('#intro'))) return;
    if (onPointerDrag && onPointerDrag(e, 'down')) return;
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
  });

  window.addEventListener('pointerup', e => {
    if (onPointerDrag) onPointerDrag(e, 'up');
    dragging = false;
  });

  window.addEventListener('pointermove', e => {
    if (onPointerDrag && onPointerDrag(e, 'move')) return;
    if (!dragging) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    orbitYaw -= dx * 0.007;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + dy * 0.007, minPitch, maxPitch);
    update();
  });

  window.addEventListener('wheel', e => {
    orbitDist = THREE.MathUtils.clamp(orbitDist + e.deltaY * 0.002, minDist, maxDist);
    update();
  }, { passive: true });

  update();

  return {
    update,
    getParams: () => ({ dist: orbitDist, pitch: orbitPitch, yaw: orbitYaw }),
    setParams: (d, p, y) => {
      if (d != null) orbitDist = d;
      if (p != null) orbitPitch = p;
      if (y != null) orbitYaw = y;
      update();
    }
  };
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
  roundedCube,
  createCubeSpawner,
  createParticleDragger,
  createFabricTextures,
  createOrbitControls
};

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
