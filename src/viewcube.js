/* ================= Interactive Desktop ViewCube (Gravity Controller) =================
   3D isometric CAD-style ViewCube widget for intuitive gravity orientation.
   Provides interactive trackball rotation, home button, face snaps, and 0-G float.
   ==================================================================================== */

(function(global) {
'use strict';

const THREE = global.THREE;
if (!THREE) {
  throw new Error('ViewCube requires Three.js (THREE global)');
}

const V = THREE.Vector3;

function createViewCube({ world, onGravityChange = null, parent = (typeof document !== 'undefined' ? document.body : null) }) {
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
    const x1 = p[0] * cosY + p[2] * sinY;
    const y1 = p[1];
    const z1 = -p[0] * sinY + p[2] * cosY;
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

    const projVerts = verts.map(v => {
      const worldP = quatRotate(orientation, v[0], v[1], v[2]);
      const camP = camTransform(worldP);
      return {
        x: cx + camP[0],
        y: cy - camP[1],
        z: camP[2]
      };
    });

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

    visibleFaces.sort((a, b) => a.z - b.z);

    for (const f of visibleFaces) {
      ctx.beginPath();
      ctx.moveTo(f.outerPts[0].x, f.outerPts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(f.outerPts[i].x, f.outerPts[i].y);
      ctx.closePath();
      ctx.fillStyle = '#141a22';
      ctx.fill();
    }

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

      ctx.font = 'bold 9.5px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = f.isHovered ? '#121820' : (f.isActive ? '#fff' : '#cbd5e1');
      ctx.fillText(f.label, f.cenX, f.cenY);
    }

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

const ViewCube = { create: createViewCube };
global.ViewCube = ViewCube;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ViewCube;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
