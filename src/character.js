/**
 * CharacterAsset: Hierarchical skeleton, analytical metaball SDFs,
 * PBR+SSS Human Skin Shaders, Cotton Checker textures, and CMU Mocap Walk Cycles.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('three'));
  } else {
    root.CharacterAsset = factory(root.THREE);
  }
}(typeof self !== 'undefined' ? self : this, function (THREE) {
  'use strict';

  const V = THREE.Vector3;
  const Q = THREE.Quaternion;
  const E = THREE.Euler;

  // Hips bind pose world position: (0, -0.565, -1.2) -> places feet right on the floor at y = -1.50m.
  const HIP_BIND_POS = new V(0, -0.565, -1.2);

  const BONE_DEFS = [
    { name: 'Hips',          parent: null,            pos: [0, -0.565, -1.2],   rSphere: 0.052, rCyl: 0.036 },
    // Spine & Head chain
    { name: 'Spine',         parent: 'Hips',          pos: [0, 0.11, 0],        rSphere: 0.042, rCyl: 0.036 },
    { name: 'Spine1',        parent: 'Spine',         pos: [0, 0.14, 0],        rSphere: 0.042, rCyl: 0.038 },
    { name: 'Spine2',        parent: 'Spine1',        pos: [0, 0.15, 0],        rSphere: 0.046, rCyl: 0.040 },
    { name: 'Neck',          parent: 'Spine2',        pos: [0, 0.13, 0],        rSphere: 0.032, rCyl: 0.026 },
    { name: 'Head',          parent: 'Neck',          pos: [0, 0.11, 0],        rSphere: 0.072, rCyl: 0.028 },
    { name: 'HeadTop_End',   parent: 'Head',          pos: [0, 0.14, 0],        rSphere: 0.048, rCyl: 0.036 },

    // Left Arm chain (T-Pose along +X)
    { name: 'LeftShoulder',  parent: 'Spine2',        pos: [0.045, 0.10, 0],    rSphere: 0.032, rCyl: 0.024 },
    { name: 'LeftArm',       parent: 'LeftShoulder',  pos: [0.135, 0, 0],       rSphere: 0.036, rCyl: 0.026 },
    { name: 'LeftForeArm',   parent: 'LeftArm',       pos: [0.26, 0, 0],        rSphere: 0.030, rCyl: 0.024 },
    { name: 'LeftHand',      parent: 'LeftForeArm',   pos: [0.24, 0, 0],        rSphere: 0.026, rCyl: 0.020 },
    { name: 'LeftHand_End',  parent: 'LeftHand',      pos: [0.09, 0, 0],        rSphere: 0.020, rCyl: 0.016 },

    // Right Arm chain (T-Pose along -X)
    { name: 'RightShoulder', parent: 'Spine2',        pos: [-0.045, 0.10, 0],   rSphere: 0.032, rCyl: 0.024 },
    { name: 'RightArm',      parent: 'RightShoulder', pos: [-0.135, 0, 0],      rSphere: 0.036, rCyl: 0.026 },
    { name: 'RightForeArm',  parent: 'RightArm',      pos: [-0.26, 0, 0],       rSphere: 0.030, rCyl: 0.024 },
    { name: 'RightHand',     parent: 'RightForeArm',  pos: [-0.24, 0, 0],       rSphere: 0.026, rCyl: 0.020 },
    { name: 'RightHand_End', parent: 'RightHand',     pos: [-0.09, 0, 0],       rSphere: 0.020, rCyl: 0.016 },

    // Left Leg chain (downward along -Y)
    { name: 'LeftUpLeg',     parent: 'Hips',          pos: [0.155, -0.04, 0],   rSphere: 0.044, rCyl: 0.030 },
    { name: 'LeftLeg',       parent: 'LeftUpLeg',     pos: [0, -0.42, 0],       rSphere: 0.038, rCyl: 0.032 },
    { name: 'LeftFoot',      parent: 'LeftLeg',       pos: [0, -0.41, 0],       rSphere: 0.034, rCyl: 0.026 },
    { name: 'LeftToeBase',   parent: 'LeftFoot',      pos: [0, -0.045, 0.14],   rSphere: 0.024, rCyl: 0.022 },
    { name: 'LeftToe_End',   parent: 'LeftToeBase',   pos: [0, 0, 0.06],        rSphere: 0.018, rCyl: 0.016 },

    // Right Leg chain (downward along -Y)
    { name: 'RightUpLeg',    parent: 'Hips',          pos: [-0.155, -0.04, 0],  rSphere: 0.044, rCyl: 0.030 },
    { name: 'RightLeg',      parent: 'RightUpLeg',    pos: [0, -0.42, 0],       rSphere: 0.038, rCyl: 0.032 },
    { name: 'RightFoot',     parent: 'RightLeg',      pos: [0, -0.41, 0],       rSphere: 0.034, rCyl: 0.026 },
    { name: 'RightToeBase',  parent: 'RightFoot',     pos: [0, -0.045, 0.14],   rSphere: 0.024, rCyl: 0.022 },
    { name: 'RightToe_End',  parent: 'RightToeBase',  pos: [0, 0, 0.06],        rSphere: 0.018, rCyl: 0.016 }
  ];

  const PIN_BONE_NAMES = new Set([
    'Head',
    'LeftForeArm', 'RightForeArm',
    'LeftHand', 'RightHand',
    'LeftFoot', 'RightFoot'
  ]);

  /**
   * Builds the 23-bone hierarchical skeleton with parented visual sphere & cylinder meshes.
   *
   * @param {Object} options Configuration options:
   *   - parentGroup: THREE.Group (optional, group to attach the root to)
   *   - visibleMeshes: boolean (default false)
   *   - jointSphereMat, headSphereMat, boneCylinderMat: THREE.Material (optional)
   * @returns {Object} Skeleton collection:
   *   { characterRoot, rootBone, bonesByName, boneList, boneSegments, headSphereMesh, pinAnchors }
   */
  function buildSkeleton(options) {
    const opts = options || {};
    const visibleMeshes = !!opts.visibleMeshes;

    const jointSphereMat = opts.jointSphereMat || new THREE.MeshPhysicalMaterial({
      color: 0xf2b632,
      roughness: 0.22,
      metalness: 0.18,
      clearcoat: 0.40,
      clearcoatRoughness: 0.15
    });

    const headSphereMat = opts.headSphereMat || new THREE.MeshPhysicalMaterial({
      color: 0xff9800,
      roughness: 0.18,
      metalness: 0.20,
      clearcoat: 0.60,
      clearcoatRoughness: 0.10
    });

    const boneCylinderMat = opts.boneCylinderMat || new THREE.MeshPhysicalMaterial({
      color: 0x6289b0,
      roughness: 0.30,
      metalness: 0.25,
      clearcoat: 0.25,
      clearcoatRoughness: 0.20
    });

    const unitSphereGeom = new THREE.SphereGeometry(1, 20, 16);
    const unitCylGeom = new THREE.CylinderGeometry(0.82, 1.0, 1, 16, 1);
    const upVec = new V(0, 1, 0);

    const characterRoot = new THREE.Group();
    characterRoot.name = 'CharacterRoot';
    if (opts.parentGroup) {
      opts.parentGroup.add(characterRoot);
    }

    const bonesByName = {};
    const boneList = [];
    const boneSegments = [];
    let headSphereMesh = null;

    for (const def of BONE_DEFS) {
      const bone = new THREE.Bone();
      bone.name = def.name;
      bone.position.set(def.pos[0], def.pos[1], def.pos[2]);

      // 1. Parent a poly sphere directly to the joint at its local origin (0, 0, 0)
      const isPinBone = PIN_BONE_NAMES.has(def.name);
      const sphereMesh = new THREE.Mesh(unitSphereGeom, isPinBone ? headSphereMat : jointSphereMat);
      sphereMesh.scale.setScalar(def.rSphere);
      sphereMesh.visible = visibleMeshes;
      bone.add(sphereMesh);
      bone._sphereMesh = sphereMesh;
      bone._rSphere = def.rSphere;
      if (def.name === 'Head') {
        headSphereMesh = sphereMesh;
      }

      if (def.parent) {
        const parentBone = bonesByName[def.parent];
        parentBone.add(bone);

        // 2. Parent a poly cylinder to the parent joint spanning from parent (0,0,0) to this child joint
        const offset = new V(def.pos[0], def.pos[1], def.pos[2]);
        const len = offset.length();
        if (len > 1e-4) {
          const cylMesh = new THREE.Mesh(unitCylGeom, boneCylinderMat);
          cylMesh.scale.set(def.rCyl, len, def.rCyl);
          cylMesh.position.copy(offset).multiplyScalar(0.5);
          const dir = offset.clone().normalize();
          cylMesh.quaternion.setFromUnitVectors(upVec, dir);
          cylMesh.visible = visibleMeshes;
          parentBone.add(cylMesh);

          const isCore = def.name.startsWith('Spine') || def.name.includes('Leg') || def.name.includes('Foot');
          boneSegments.push({
            boneA: parentBone,
            boneB: bone,
            radius: Math.max(def.rCyl, Math.min(parentBone._rSphere, def.rSphere)) * 1.15,
            isCore
          });
        }
      } else {
        characterRoot.add(bone);
      }

      bonesByName[def.name] = bone;
      boneList.push(bone);
    }

    const rootBone = bonesByName['Hips'];
    characterRoot.updateMatrixWorld(true);

    const pinAnchors = {
      head:   bonesByName['Head']._sphereMesh,
      lElbow: bonesByName['LeftForeArm']._sphereMesh,
      rElbow: bonesByName['RightForeArm']._sphereMesh,
      lHand:  bonesByName['LeftHand']._sphereMesh,
      rHand:  bonesByName['RightHand']._sphereMesh,
      lFoot:  bonesByName['LeftFoot']._sphereMesh,
      rFoot:  bonesByName['RightFoot']._sphereMesh
    };

    return {
      characterRoot,
      rootBone,
      bonesByName,
      boneList,
      boneSegments,
      headSphereMesh,
      pinAnchors
    };
  }

  /* ================= Analytical Metaball SDFs & Geometry Math ================= */
  function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0.0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }

  function sdSphere(px, py, pz, cx, cy, cz, r) {
    return Math.hypot(px - cx, py - cy, pz - cz) - r;
  }

  function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
    const vx = px - ax, vy = py - ay, vz = pz - az;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const lenSq = ux * ux + uy * uy + uz * uz;
    let t = lenSq > 1e-8 ? (vx * ux + vy * uy + vz * uz) / lenSq : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(vx - ux * t, vy - uy * t, vz - uz * t) - r;
  }

  function marshmallowSDF(x, y, z) {
    const ax = Math.abs(x);
    const zc = z + 1.2;

    // 1. Puffy Marshmallow Head + Neck + 3 Stacked Torso Rolls (Chest, Belly, Pelvis)
    let dTorso = sdCapsule(ax, y, zc, 0.0, 0.08, 0.0, 0.0, 0.16, 0.0, 0.150);
    dTorso = smin(dTorso, sdSphere(ax, y, zc, 0.0, -0.02, 0.0, 0.098), 0.032);
    dTorso = smin(dTorso, sdCapsule(ax, y, zc, 0.0, -0.14, 0.0, 0.10, -0.13, 0.0, 0.156), 0.024);
    dTorso = smin(dTorso, sdCapsule(ax, y, zc, 0.0, -0.32, 0.015, 0.085, -0.32, 0.01, 0.178), 0.024);
    dTorso = smin(dTorso, sdCapsule(ax, y, zc, 0.0, -0.50, 0.0, 0.095, -0.52, 0.0, 0.154), 0.024);

    // 2. T-Pose Arms: 4 plump marshmallow spheres per arm (Shoulder, Bicep, Forearm, Round Mitt Hand)
    let dArm = sdSphere(ax, y, zc, 0.23, -0.065, 0.0, 0.106);
    dArm = smin(dArm, sdSphere(ax, y, zc, 0.38, -0.065, 0.0, 0.100), 0.020);
    dArm = smin(dArm, sdSphere(ax, y, zc, 0.53, -0.065, 0.0, 0.095), 0.020);
    dArm = smin(dArm, sdSphere(ax, y, zc, 0.68, -0.065, 0.0, 0.092), 0.020);

    // 3. Legs: 3 plump marshmallow spheres per leg (Thigh, Knee, Calf) + Rounded Marshmallow Boot Foot
    let dLeg = sdSphere(ax, y, zc, 0.160, -0.73, 0.0, 0.112);
    dLeg = smin(dLeg, sdSphere(ax, y, zc, 0.165, -0.95, 0.0, 0.106), 0.020);
    dLeg = smin(dLeg, sdSphere(ax, y, zc, 0.165, -1.17, 0.0, 0.100), 0.020);
    dLeg = smin(dLeg, sdCapsule(ax, y, zc, 0.165, -1.37, 0.0, 0.165, -1.39, 0.095, 0.095), 0.020);

    let d = smin(dTorso, dArm, 0.032);
    d = smin(d, dLeg, 0.032);
    return d;
  }

  function sdfGrad(x, y, z) {
    const e = 0.002;
    const gx = marshmallowSDF(x + e, y, z) - marshmallowSDF(x - e, y, z);
    const gy = marshmallowSDF(x, y + e, z) - marshmallowSDF(x, y - e, z);
    const gz = marshmallowSDF(x, y, z + e) - marshmallowSDF(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  }

  function calcSignedTetVol(a, b, c, d) {
    const ux = b.x.x - a.x.x, uy = b.x.y - a.x.y, uz = b.x.z - a.x.z;
    const vx = c.x.x - a.x.x, vy = c.x.y - a.x.y, vz = c.x.z - a.x.z;
    const wx = d.x.x - a.x.x, wy = d.x.y - a.x.y, wz = d.x.z - a.x.z;
    return ((uy * vz - uz * vy) * wx + (uz * vx - ux * vz) * wy + (ux * vy - uy * vx) * wz) / 6;
  }

  /* ================= PBR + Subsurface Scattering (SSS) Shaders ================= */
  function createHumanSkinMaterial(options) {
    const opts = options || {};
    const mat = new THREE.MeshPhysicalMaterial({
      color: opts.color !== undefined ? opts.color : 0xe6ad90,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.45,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.0,
      reflectivity: opts.reflectivity !== undefined ? opts.reflectivity : 0.28,
      clearcoat: opts.clearcoat !== undefined ? opts.clearcoat : 0.22,
      clearcoatRoughness: opts.clearcoatRoughness !== undefined ? opts.clearcoatRoughness : 0.34
    });

    mat.onBeforeCompile = function(shader) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Pre-Integrated Dermal Subsurface Scattering (SSS), Terminator Blood Bleed & Epidermal Peach Rim
        vec3 skinN = normalize( geometry.normal );
        vec3 skinV = normalize( geometry.viewDir );
        vec3 dermisRed  = vec3( 0.92, 0.21, 0.11 );
        vec3 subPeach   = vec3( 0.97, 0.56, 0.40 );
        #if ( NUM_DIR_LIGHTS > 0 )
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            vec3 lDir = directionalLights[ i ].direction;
            vec3 lCol = directionalLights[ i ].color;
            float nDotL = dot( skinN, lDir );
            // Soft dermal wrap lighting across the shadow terminator
            float sssWrap = clamp( ( nDotL + 0.48 ) / 1.48, 0.0, 1.0 );
            // Red-coral hemoglobin scattering band concentrated right along the shadow terminator
            float termBand = smoothstep( -0.45, 0.04, nDotL ) * ( 1.0 - smoothstep( 0.02, 0.50, nDotL ) );
            // Forward-scattered ear/limb/roll translucency
            float backTrans = pow( clamp( dot( skinV, -lDir ) + 0.25 * ( 1.0 - max( 0.0, nDotL ) ), 0.0, 1.0 ), 2.6 ) * ( 1.0 - 0.65 * max( 0.0, nDotL ) );
            reflectedLight.directDiffuse += diffuseColor.rgb * lCol * (
              dermisRed * ( termBand * 0.44 + backTrans * 0.28 ) +
              subPeach * ( sssWrap * 0.20 )
            );
          }
        #endif
        // Epidermal velvet peach-fuzz Fresnel rim & subtle dermal crease bounce
        float skinRim = 1.0 - max( 0.0, dot( skinN, skinV ) );
        float peachFuzz = pow( skinRim, 3.2 );
        reflectedLight.indirectDiffuse += vec3( 1.0, 0.74, 0.62 ) * ( peachFuzz * 0.06 ) + diffuseColor.rgb * vec3( 0.86, 0.34, 0.24 ) * 0.04;
        `
      );
    };

    return mat;
  }

  function createCyanCheckerShirtTextures(options) {
    const opts = options || {};
    const size = opts.size || 512;
    const threads = opts.threads || 32;
    const repeat = opts.repeat || 6;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const bCanvas = document.createElement('canvas');
    bCanvas.width = bCanvas.height = size;
    const bCtx = bCanvas.getContext('2d');

    ctx.fillStyle = '#1498b4';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    const step = size / threads;
    const halfThreads = threads / 2;

    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const cx = Math.floor(x / step);
        const cy = Math.floor(y / step);
        const checkX = cx < halfThreads ? 0 : 1;
        const checkY = cy < halfThreads ? 0 : 1;
        const isBrightCyan = (checkX + checkY) % 2 === 0;
        const warpOnTop = (cx + cy) % 2 === 0;
        const lum = ((cx * 17 + cy * 11) % 15) - 7;

        // Crisp 2-tone Cyan Checkerboard: Vibrant Cyan (#20d6ee) vs Deep Cyan (#0b647e)
        const baseR = (isBrightCyan ? 32 : 11) + lum;
        const baseG = (isBrightCyan ? 214 : 100) + lum;
        const baseB = (isBrightCyan ? 238 : 126) + lum;

        const cDark = `rgb(${Math.max(0, baseR - 26)}, ${Math.max(0, baseG - 26)}, ${Math.max(0, baseB - 26)})`;
        const cMid  = `rgb(${Math.min(255, baseR + 5)}, ${Math.min(255, baseG + 5)}, ${Math.min(255, baseB + 5)})`;
        const cPeak = `rgb(${Math.min(255, baseR + 18)}, ${Math.min(255, baseG + 18)}, ${Math.min(255, baseB + 18)})`;

        if (warpOnTop) {
          const grad = ctx.createLinearGradient(x, 0, x + step, 0);
          grad.addColorStop(0, cDark);
          grad.addColorStop(0.2, cMid);
          grad.addColorStop(0.5, cPeak);
          grad.addColorStop(0.8, cMid);
          grad.addColorStop(1, cDark);
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
          grad.addColorStop(0, cDark);
          grad.addColorStop(0.2, cMid);
          grad.addColorStop(0.5, cPeak);
          grad.addColorStop(0.8, cMid);
          grad.addColorStop(1, cDark);
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

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, 9);

    const bump = new THREE.CanvasTexture(bCanvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(repeat * 3, 27);

    return { map: tex, bumpMap: bump };
  }

  function createShirtMaterial(textures, options) {
    const opts = options || {};
    const tex = textures || createCyanCheckerShirtTextures();
    return new THREE.MeshStandardMaterial({
      color: opts.color !== undefined ? opts.color : 0xffffff,
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.0012,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.88,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  /* ================= 3 Motion-Captured Walk Cycle Profiles ================= */
  const MOCAP_PROFILES = [
    {
      id: 'walk1',
      name: 'Mocap 1: Natural Walk (CMU 07_01)',
      duration: 1.00,
      hipBounce: 0.026,
      hipSwayX: 0.028,
      hipSurgeZ: 0.012,
      crouchOffset: -0.018,
      pelvisRoll: 0.085,
      pelvisYaw: 0.11,
      pelvisTilt: 0.04,
      spineLean: 0.045,
      spineTwist: 0.13,
      spineRoll: 0.065,
      headNod: 0.045,
      armDownZ: 1.36,
      armSwingX: 0.42,
      elbowBase: 0.38,
      elbowSwing: 0.28,
      legAbduct: 0.0,
      hipSwingFwd: 0.46,
      hipSwingBack: 0.34,
      kneeStancePeak: 0.26,
      kneeSwingPeak: 1.12,
      kneeMin: 0.06,
      anklePush: 0.34,
      ankleLift: 0.24
    },
    {
      id: 'walk2',
      name: 'Mocap 2: Brisk Stride (CMU 07_08)',
      duration: 0.74,
      hipBounce: 0.038,
      hipSwayX: 0.022,
      hipSurgeZ: 0.020,
      crouchOffset: -0.028,
      pelvisRoll: 0.105,
      pelvisYaw: 0.16,
      pelvisTilt: 0.08,
      spineLean: 0.13,
      spineTwist: 0.19,
      spineRoll: 0.08,
      headNod: 0.075,
      armDownZ: 1.30,
      armSwingX: 0.68,
      elbowBase: 0.78,
      elbowSwing: 0.42,
      legAbduct: 0.01,
      hipSwingFwd: 0.60,
      hipSwingBack: 0.46,
      kneeStancePeak: 0.32,
      kneeSwingPeak: 1.28,
      kneeMin: 0.08,
      anklePush: 0.46,
      ankleLift: 0.32
    },
    {
      id: 'walk3',
      name: 'Mocap 3: Heavy Prowl (CMU 35_01)',
      duration: 1.32,
      hipBounce: 0.034,
      hipSwayX: 0.065,
      hipSurgeZ: 0.018,
      crouchOffset: -0.095,
      pelvisRoll: 0.13,
      pelvisYaw: 0.18,
      pelvisTilt: 0.12,
      spineLean: 0.22,
      spineTwist: 0.22,
      spineRoll: 0.14,
      headNod: 0.09,
      armDownZ: 1.12,
      armSwingX: 0.52,
      elbowBase: 0.62,
      elbowSwing: 0.32,
      legAbduct: 0.075,
      hipSwingFwd: 0.56,
      hipSwingBack: 0.28,
      kneeStancePeak: 0.48,
      kneeSwingPeak: 1.22,
      kneeMin: 0.36,
      anklePush: 0.32,
      ankleLift: 0.28
    }
  ];

  function evalLegAngles(phi, p) {
    const rawHip = Math.sin(phi - 0.15) - 0.18 * Math.sin(2 * phi - 0.4);
    const hipX = rawHip < 0
      ? rawHip * p.hipSwingFwd
      : rawHip * p.hipSwingBack;

    const swingWave = Math.pow(0.5 - 0.5 * Math.cos(phi), 1.6);
    const stanceBump = Math.pow(Math.max(0, Math.cos(phi + 0.55)), 4.0);
    const kneeX = p.kneeMin + (p.kneeSwingPeak - p.kneeMin) * swingWave + p.kneeStancePeak * stanceBump;

    const ankleX = p.anklePush * Math.exp(-Math.pow(Math.sin((phi - 1.25) * 0.5), 2) / 0.12)
                 + p.ankleLift * Math.sin(phi - 0.8);

    const toeX = -0.35 * Math.exp(-Math.pow(Math.sin((phi - 1.35) * 0.5), 2) / 0.10);

    return { hipX, kneeX, ankleX, toeX };
  }

  function buildMocapWalkClip(profile, skeleton) {
    const bonesByName = skeleton.bonesByName;
    const boneList = skeleton.boneList;
    const rootBone = skeleton.rootBone;

    const numFrames = 60;
    const dur = profile.duration;
    const times = new Float32Array(numFrames + 1);
    for (let k = 0; k <= numFrames; k++) {
      times[k] = (k / numFrames) * dur;
    }

    const qTracks = {};
    for (const b of BONE_DEFS) {
      qTracks[b.name] = new Float32Array((numFrames + 1) * 4);
    }
    const hipPosTrack = new Float32Array((numFrames + 1) * 3);

    const qTmp = new Q();
    const qA = new Q();
    const qB = new Q();
    const eTmp = new E();

    function writeQuat(boneName, k, q) {
      const arr = qTracks[boneName];
      const idx = k * 4;
      arr[idx] = q.x;
      arr[idx + 1] = q.y;
      arr[idx + 2] = q.z;
      arr[idx + 3] = q.w;
    }

    const footCheckBones = [
      { bone: bonesByName['LeftFoot'],     r: 0.032 },
      { bone: bonesByName['LeftToeBase'],  r: 0.024 },
      { bone: bonesByName['LeftToe_End'],  r: 0.018 },
      { bone: bonesByName['RightFoot'],    r: 0.032 },
      { bone: bonesByName['RightToeBase'], r: 0.024 },
      { bone: bonesByName['RightToe_End'], r: 0.018 }
    ];
    const worldPt = new V();

    for (let k = 0; k <= numFrames; k++) {
      const u = (k % numFrames) / numFrames;
      const phiL = u * Math.PI * 2;
      const phiR = phiL + Math.PI;

      const pPitch = profile.pelvisTilt + 0.025 * Math.cos(2 * phiL);
      const pYaw = profile.pelvisYaw * Math.sin(phiL - 0.15);
      const pRoll = -profile.pelvisRoll * Math.cos(phiL);
      qTmp.setFromEuler(eTmp.set(pPitch, pYaw, pRoll, 'YXZ'));
      writeQuat('Hips', k, qTmp);
      bonesByName['Hips'].quaternion.copy(qTmp);

      const sPitch = profile.spineLean * 0.35 + 0.015 * Math.sin(2 * phiL);
      const sYaw = -profile.spineTwist * 0.38 * Math.sin(phiL - 0.1);
      const sRoll = profile.spineRoll * 0.35 * Math.cos(phiL);
      qTmp.setFromEuler(eTmp.set(sPitch, sYaw, sRoll, 'YXZ'));
      writeQuat('Spine', k, qTmp);
      writeQuat('Spine1', k, qTmp);
      writeQuat('Spine2', k, qTmp);

      const nPitch = -profile.spineLean * 0.25 + profile.headNod * Math.sin(2 * phiL + 0.5);
      const nYaw = profile.spineTwist * 0.42 * Math.sin(phiL - 0.1);
      const nRoll = -profile.spineRoll * 0.30 * Math.cos(phiL);
      qTmp.setFromEuler(eTmp.set(nPitch, nYaw, nRoll, 'YXZ'));
      writeQuat('Neck', k, qTmp);
      writeQuat('Head', k, qTmp);
      writeQuat('HeadTop_End', k, qTmp.identity());

      qTmp.setFromEuler(eTmp.set(0, -0.05 * Math.sin(phiL), -0.04, 'YXZ'));
      writeQuat('LeftShoulder', k, qTmp);
      qTmp.setFromEuler(eTmp.set(0, 0.05 * Math.sin(phiL), 0.04, 'YXZ'));
      writeQuat('RightShoulder', k, qTmp);

      const lArmPitch = profile.armSwingX * Math.sin(phiR - 0.15);
      qA.setFromEuler(eTmp.set(lArmPitch, 0, 0, 'XYZ'));
      qB.setFromEuler(eTmp.set(0, 0, -profile.armDownZ, 'XYZ'));
      qTmp.multiplyQuaternions(qA, qB);
      writeQuat('LeftArm', k, qTmp);

      const lElbow = profile.elbowBase + profile.elbowSwing * Math.max(-0.2, -Math.sin(phiR - 0.35));
      qTmp.setFromEuler(eTmp.set(0, -lElbow, 0, 'XYZ'));
      writeQuat('LeftForeArm', k, qTmp);
      writeQuat('LeftHand', k, qTmp.setFromEuler(eTmp.set(0, -0.08, -0.06, 'XYZ')));
      writeQuat('LeftHand_End', k, qTmp.identity());

      const rArmPitch = profile.armSwingX * Math.sin(phiL - 0.15);
      qA.setFromEuler(eTmp.set(rArmPitch, 0, 0, 'XYZ'));
      qB.setFromEuler(eTmp.set(0, 0, profile.armDownZ, 'XYZ'));
      qTmp.multiplyQuaternions(qA, qB);
      writeQuat('RightArm', k, qTmp);

      const rElbow = profile.elbowBase + profile.elbowSwing * Math.max(-0.2, -Math.sin(phiL - 0.35));
      qTmp.setFromEuler(eTmp.set(0, rElbow, 0, 'XYZ'));
      writeQuat('RightForeArm', k, qTmp);
      writeQuat('RightHand', k, qTmp.setFromEuler(eTmp.set(0, 0.08, 0.06, 'XYZ')));
      writeQuat('RightHand_End', k, qTmp.identity());

      const legL = evalLegAngles(phiL, profile);
      qTmp.setFromEuler(eTmp.set(legL.hipX, 0, profile.legAbduct + 0.04 * Math.cos(phiL), 'YXZ'));
      writeQuat('LeftUpLeg', k, qTmp);
      bonesByName['LeftUpLeg'].quaternion.copy(qTmp);
      qTmp.setFromEuler(eTmp.set(legL.kneeX, 0, 0, 'XYZ'));
      writeQuat('LeftLeg', k, qTmp);
      bonesByName['LeftLeg'].quaternion.copy(qTmp);
      qTmp.setFromEuler(eTmp.set(legL.ankleX, 0, 0, 'XYZ'));
      writeQuat('LeftFoot', k, qTmp);
      bonesByName['LeftFoot'].quaternion.copy(qTmp);
      qTmp.setFromEuler(eTmp.set(legL.toeX, 0, 0, 'XYZ'));
      writeQuat('LeftToeBase', k, qTmp);
      bonesByName['LeftToeBase'].quaternion.copy(qTmp);
      writeQuat('LeftToe_End', k, qTmp.identity());
      bonesByName['LeftToe_End'].quaternion.identity();

      const legR = evalLegAngles(phiR, profile);
      qTmp.setFromEuler(eTmp.set(legR.hipX, 0, -profile.legAbduct - 0.04 * Math.cos(phiR), 'YXZ'));
      writeQuat('RightUpLeg', k, qTmp);
      bonesByName['RightUpLeg'].quaternion.copy(qTmp);
      qTmp.setFromEuler(eTmp.set(legR.kneeX, 0, 0, 'XYZ'));
      writeQuat('RightLeg', k, qTmp);
      bonesByName['RightLeg'].quaternion.copy(qTmp);
      qTmp.setFromEuler(eTmp.set(legR.ankleX, 0, 0, 'XYZ'));
      writeQuat('RightFoot', k, qTmp);
      bonesByName['RightFoot'].quaternion.copy(qTmp);
      qTmp.setFromEuler(eTmp.set(legR.toeX, 0, 0, 'XYZ'));
      writeQuat('RightToeBase', k, qTmp);
      bonesByName['RightToeBase'].quaternion.copy(qTmp);
      writeQuat('RightToe_End', k, qTmp.identity());
      bonesByName['RightToe_End'].quaternion.identity();

      const hx = HIP_BIND_POS.x + profile.hipSwayX * Math.cos(phiL - 0.25);
      const hz = HIP_BIND_POS.z + profile.hipSurgeZ * Math.sin(2 * phiL);
      rootBone.position.set(hx, HIP_BIND_POS.y, hz);
      rootBone.updateMatrixWorld(true);

      let minFootBottomY = Infinity;
      for (let f = 0; f < footCheckBones.length; f++) {
        const fb = footCheckBones[f];
        fb.bone.getWorldPosition(worldPt);
        const bottomY = worldPt.y - fb.r;
        if (bottomY < minFootBottomY) minFootBottomY = bottomY;
      }

      const hy = HIP_BIND_POS.y + (-1.50 - minFootBottomY);
      hipPosTrack[k * 3] = hx;
      hipPosTrack[k * 3 + 1] = hy;
      hipPosTrack[k * 3 + 2] = hz;
    }

    rootBone.position.copy(HIP_BIND_POS);
    for (let i = 0; i < boneList.length; i++) {
      boneList[i].quaternion.identity();
    }
    rootBone.updateMatrixWorld(true);

    const tracks = [
      new THREE.VectorKeyframeTrack('Hips.position', times, hipPosTrack)
    ];
    for (const b of BONE_DEFS) {
      tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qTracks[b.name]));
    }

    return new THREE.AnimationClip(profile.id, dur, tracks);
  }

  function buildBindPoseClip() {
    const times = new Float32Array([0, 1.0]);
    const hipPos = new Float32Array([
      HIP_BIND_POS.x, HIP_BIND_POS.y, HIP_BIND_POS.z,
      HIP_BIND_POS.x, HIP_BIND_POS.y, HIP_BIND_POS.z
    ]);
    const tracks = [
      new THREE.VectorKeyframeTrack('Hips.position', times, hipPos)
    ];
    for (const b of BONE_DEFS) {
      const qArr = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
      tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qArr));
    }
    return new THREE.AnimationClip('bindpose', 1.0, tracks);
  }

  return {
    HIP_BIND_POS,
    BONE_DEFS,
    PIN_BONE_NAMES,
    buildSkeleton,
    smin,
    sdSphere,
    sdCapsule,
    marshmallowSDF,
    sdfGrad,
    calcSignedTetVol,
    createHumanSkinMaterial,
    createCyanCheckerShirtTextures,
    createShirtMaterial,
    MOCAP_PROFILES,
    evalLegAngles,
    buildMocapWalkClip,
    buildBindPoseClip
  };
}));
