(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Playblast = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  /* ============================================================================
   * QuickTime (.mov) Binary Container Muxer (ISO/Apple QuickTime 'qt  ' Format)
   * Supports:
   *   1. Hardware H.264 ('avc1') via WebCodecs VideoEncoder (primary)
   *   2. Motion-JPEG ('jpeg') via Canvas JPEG encoding (universal fallback)
   * ============================================================================ */

  function u32(v) {
    return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  }
  function u16(v) {
    return [(v >>> 8) & 0xff, v & 0xff];
  }
  function str4(s) {
    return [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)];
  }
  function concatArrays(chunks) {
    let total = 0;
    for (let i = 0; i < chunks.length; i++) total += chunks[i].byteLength;
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      const arr = chunks[i] instanceof Uint8Array ? chunks[i] : new Uint8Array(chunks[i]);
      out.set(arr, offset);
      offset += arr.byteLength;
    }
    return out;
  }
  function box(type, ...payloads) {
    let size = 8;
    for (let i = 0; i < payloads.length; i++) {
      size += payloads[i].length;
    }
    const out = new Uint8Array(size);
    out[0] = (size >>> 24) & 0xff;
    out[1] = (size >>> 16) & 0xff;
    out[2] = (size >>> 8) & 0xff;
    out[3] = size & 0xff;
    out[4] = type.charCodeAt(0);
    out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2);
    out[7] = type.charCodeAt(3);
    let pos = 8;
    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];
      for (let j = 0; j < p.length; j++) out[pos++] = p[j];
    }
    return out;
  }

  /**
   * Muxes encoded video frames into a standards-compliant Apple QuickTime (.mov) file.
   * @param {Object} opts
   * @param {number} opts.width
   * @param {number} opts.height
   * @param {number} opts.fps
   * @param {'avc1'|'jpeg'} opts.codec
   * @param {Uint8Array[]} opts.samples - Array of encoded frame byte arrays
   * @param {boolean[]} opts.keyframes  - Array of keyframe flags per sample
   * @param {Uint8Array} [opts.avcC]    - Raw AVCDecoderConfigurationRecord for 'avc1'
   * @returns {Uint8Array} Complete QuickTime .mov binary buffer
   */
  function muxQuickTimeMov(opts) {
    const width = opts.width;
    const height = opts.height;
    const fps = opts.fps;
    const codec = opts.codec;
    const samples = opts.samples;
    const keyframes = opts.keyframes;
    const avcCBytes = opts.avcC;
    const numFrames = samples.length;

    const timescale = Math.round(fps * 1000);
    const sampleDelta = 1000;
    const totalDuration = numFrames * sampleDelta;

    // 1. ftyp atom: Apple QuickTime ('qt  ') major brand + compatible brands
    const ftypBox = box(
      'ftyp',
      str4('qt  '),
      u32(0x00000200),
      str4('qt  '),
      str4('isom'),
      str4('mp42'),
      str4('avc1')
    );

    // 2. Calculate mdat size and per-sample file offsets
    let mdatPayloadSize = 0;
    for (let i = 0; i < numFrames; i++) mdatPayloadSize += samples[i].byteLength;
    const mdatHeaderSize = 8;
    const mdatStartOffset = ftypBox.byteLength;
    const sampleOffsets = new Array(numFrames);
    const sampleSizes = new Array(numFrames);
    let runningOffset = mdatStartOffset + mdatHeaderSize;
    for (let i = 0; i < numFrames; i++) {
      sampleOffsets[i] = runningOffset;
      sampleSizes[i] = samples[i].byteLength;
      runningOffset += samples[i].byteLength;
    }

    // 3. Build VisualSampleEntry ('avc1' or 'jpeg') inside stsd
    const compNameStr = codec === 'avc1' ? 'H.264' : 'Photo - JPEG';
    const compName = new Uint8Array(32);
    compName[0] = compNameStr.length;
    for (let i = 0; i < compNameStr.length; i++) compName[1 + i] = compNameStr.charCodeAt(i);

    const visualEntryHeader = [
      0, 0, 0, 0, 0, 0,       // 6 bytes reserved
      ...u16(1),              // data_reference_index = 1
      ...u16(0),              // version = 0
      ...u16(0),              // revision_level = 0
      ...str4('appl'),        // vendor
      ...u32(0x00000200),     // temporal_quality
      ...u32(0x000003ff),     // spatial_quality
      ...u16(width),          // width
      ...u16(height),         // height
      ...u32(0x00480000),     // horizresolution = 72 dpi
      ...u32(0x00480000),     // vertresolution = 72 dpi
      ...u32(0),              // data_size = 0
      ...u16(1),              // frame_count = 1
      ...compName,            // 32-byte Pascal compressor name
      ...u16(0x0018),         // depth = 24
      ...u16(0xffff)          // color_table_id = -1
    ];

    // QuickTime 'colr' ('nclc') atom: ITU-R BT.709 (1 = BT.709 primaries, 1 = BT.709 transfer, 1 = BT.709 matrix)
    const colrBox = box('colr', str4('nclc'), u16(1), u16(1), u16(1));
    const fielBox = box('fiel', [1, 0]);
    const paspBox = box('pasp', u32(1), u32(1));
    let sampleEntryBox;
    if (codec === 'avc1' && avcCBytes && avcCBytes.byteLength > 0) {
      const avcCBox = box('avcC', avcCBytes);
      sampleEntryBox = box('avc1', visualEntryHeader, avcCBox, colrBox, fielBox, paspBox);
    } else {
      sampleEntryBox = box('jpeg', visualEntryHeader, colrBox, fielBox, paspBox);
    }

    const stsdBox = box('stsd', u32(0), u32(1), sampleEntryBox);

    // stts: Time-to-Sample
    const sttsBox = box('stts', u32(0), u32(1), u32(numFrames), u32(sampleDelta));

    // stss: Sync Sample (Keyframe) Table
    const syncIndices = [];
    for (let i = 0; i < numFrames; i++) {
      if (keyframes[i]) syncIndices.push(...u32(i + 1));
    }
    const stssBox = box('stss', u32(0), u32(syncIndices.length / 4), syncIndices);

    // stsc: Sample-to-Chunk (1 sample per chunk)
    const stscBox = box('stsc', u32(0), u32(1), u32(1), u32(1), u32(1));

    // stsz: Sample Size Table
    const stszEntries = new Uint8Array(numFrames * 4);
    for (let i = 0; i < numFrames; i++) {
      const s = sampleSizes[i];
      const o = i * 4;
      stszEntries[o] = (s >>> 24) & 0xff;
      stszEntries[o + 1] = (s >>> 16) & 0xff;
      stszEntries[o + 2] = (s >>> 8) & 0xff;
      stszEntries[o + 3] = s & 0xff;
    }
    const stszBox = box('stsz', u32(0), u32(0), u32(numFrames), stszEntries);

    // stco: Chunk Offset Table
    const stcoEntries = new Uint8Array(numFrames * 4);
    for (let i = 0; i < numFrames; i++) {
      const off = sampleOffsets[i];
      const o = i * 4;
      stcoEntries[o] = (off >>> 24) & 0xff;
      stcoEntries[o + 1] = (off >>> 16) & 0xff;
      stcoEntries[o + 2] = (off >>> 8) & 0xff;
      stcoEntries[o + 3] = off & 0xff;
    }
    const stcoBox = box('stco', u32(0), u32(numFrames), stcoEntries);

    const stblBox = codec === 'avc1'
      ? box('stbl', stsdBox, sttsBox, stssBox, stscBox, stszBox, stcoBox)
      : box('stbl', stsdBox, sttsBox, stscBox, stszBox, stcoBox);

    // vmhd + dinf + minf
    const vmhdBox = box('vmhd', u32(0x00000001), u16(0), u16(0), u16(0), u16(0));
    const urlBox  = box('url ', u32(0x00000001));
    const drefBox = box('dref', u32(0), u32(1), urlBox);
    const dinfBox = box('dinf', drefBox);
    const minfBox = box('minf', vmhdBox, dinfBox, stblBox);

    // mdhd + hdlr + mdia
    const mdhdBox = box(
      'mdhd',
      u32(0),                 // version & flags
      u32(0),                 // creation_time
      u32(0),                 // modification_time
      u32(timescale),         // timescale
      u32(totalDuration),     // duration
      u16(0x55c4),            // language = 'und'
      u16(0)                  // pre_defined
    );
    const titleBytes = [12, ...Array.from('VideoHandler').map(c => c.charCodeAt(0)), 0];
    const hdlrBox = box(
      'hdlr',
      u32(0),                 // version & flags
      str4('mhlr'),           // QuickTime component type
      str4('vide'),           // handler_type = video
      u32(0), u32(0), u32(0), // reserved
      titleBytes
    );
    const mdiaBox = box('mdia', mdhdBox, hdlrBox, minfBox);

    // tkhd + trak
    const unityMatrix = [
      ...u32(0x00010000), ...u32(0), ...u32(0),
      ...u32(0), ...u32(0x00010000), ...u32(0),
      ...u32(0), ...u32(0), ...u32(0x40000000)
    ];
    const tkhdBox = box(
      'tkhd',
      u32(0x0000000f),        // flags: track_enabled | track_in_movie | track_in_preview
      u32(0),                 // creation_time
      u32(0),                 // modification_time
      u32(1),                 // track_ID = 1
      u32(0),                 // reserved
      u32(totalDuration),     // duration
      u32(0), u32(0),         // reserved
      u16(0),                 // layer
      u16(0),                 // alternate_group
      u16(0),                 // volume (0 for video)
      u16(0),                 // reserved
      unityMatrix,
      u32(width << 16),       // width (16.16 fixed point)
      u32(height << 16)       // height (16.16 fixed point)
    );
    const trakBox = box('trak', tkhdBox, mdiaBox);

    // mvhd + moov
    const mvhdBox = box(
      'mvhd',
      u32(0),                 // version & flags
      u32(0),                 // creation_time
      u32(0),                 // modification_time
      u32(timescale),         // timescale
      u32(totalDuration),     // duration
      u32(0x00010000),        // rate = 1.0
      u16(0x0100),            // volume = 1.0
      u16(0), u32(0), u32(0), // reserved
      unityMatrix,
      u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), // pre_defined
      u32(2)                  // next_track_ID = 2
    );
    const moovBox = box('moov', mvhdBox, trakBox);

    // 4. Assemble final QuickTime (.mov) binary: [ftyp][mdat][moov]
    const mdatHeader = new Uint8Array(8);
    const mdatSize = mdatHeaderSize + mdatPayloadSize;
    mdatHeader[0] = (mdatSize >>> 24) & 0xff;
    mdatHeader[1] = (mdatSize >>> 16) & 0xff;
    mdatHeader[2] = (mdatSize >>> 8) & 0xff;
    mdatHeader[3] = mdatSize & 0xff;
    mdatHeader[4] = 'm'.charCodeAt(0);
    mdatHeader[5] = 'd'.charCodeAt(0);
    mdatHeader[6] = 'a'.charCodeAt(0);
    mdatHeader[7] = 't'.charCodeAt(0);

    return concatArrays([ftypBox, mdatHeader, ...samples, moovBox]);
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * Draws an Autodesk Maya-style Playblast HUD slate overlay onto the 2D composite canvas.
   */
  function drawMayaHudSlate(ctx, w, h, info) {
    const padX = Math.round(w * 0.022);
    const padY = Math.round(h * 0.032);
    const fontSize = Math.max(12, Math.round(h * 0.019));
    ctx.save();
    ctx.font = `600 ${fontSize}px "Bricolage Grotesque", "Consolas", monospace`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#5ce6a0'; // Classic Maya Playblast HUD green-cyan tint

    // Top-Left: Scene & Division Info
    ctx.textAlign = 'left';
    ctx.fillText(info.title || 'GameOfCubes — Playblast', padX, padY);
    if (info.subtitle) {
      ctx.fillStyle = 'rgba(210, 235, 225, 0.88)';
      ctx.fillText(info.subtitle, padX, padY + fontSize * 1.45);
    }

    // Top-Right: Frame Counter & Timecode
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5ce6a0';
    const fStr = String(info.frame).padStart(4, '0') + ' / ' + String(info.totalFrames).padStart(4, '0');
    ctx.fillText(`Frame: ${fStr}`, w - padX, padY);
    const sec = ((info.frame - 1) / info.fps).toFixed(2);
    ctx.fillStyle = 'rgba(210, 235, 225, 0.88)';
    ctx.fillText(`Time: ${sec}s  (${info.fps} fps)`, w - padX, padY + fontSize * 1.45);

    // Bottom-Left: Camera / Action Label
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(210, 235, 225, 0.85)';
    if (info.bottomLeft) {
      ctx.fillText(info.bottomLeft, padX, h - padY);
    }

    // Bottom-Right: Resolution & Solver Info
    ctx.textAlign = 'right';
    ctx.fillText(`${w}×${h}  |  QuickTime .mov`, w - padX, h - padY);
    ctx.restore();
  }

  /**
   * Creates a Maya-style Playblast controller that steps the simulation deterministically
   * at fixed dt = 1/fps and outputs a downloadable QuickTime (.mov) video file.
   */
  function createPlayblastController(config) {
    const {
      renderer,
      scene,
      camera,
      stepSimulation,
      onStartPlayblast,
      onFinishPlayblast,
      getHudInfo,
      showNote
    } = config;

    let active = false;
    let stopRequested = false;

    async function runPlayblast(opts = {}) {
      if (active) {
        stopRequested = true;
        return;
      }
      active = true;
      stopRequested = false;

      const fps = opts.fps || 30;
      const durationSec = opts.duration || 8;
      const totalFrames = Math.max(1, Math.round(fps * durationSec));
      const hudBurnIn = opts.hudBurnIn !== undefined ? opts.hudBurnIn : true;
      const resetFirst = opts.resetFirst !== undefined ? opts.resetFirst : true;

      // Determine target even dimensions (required by H.264)
      const srcCanvas = renderer.domElement;
      const aspect = srcCanvas.width / Math.max(1, srcCanvas.height);
      let outW, outH;
      if (opts.resolution === '1080p') {
        outH = 1080;
        outW = Math.round((outH * aspect) / 2) * 2;
      } else if (opts.resolution === '720p') {
        outH = 720;
        outW = Math.round((outH * aspect) / 2) * 2;
      } else {
        outW = Math.max(2, Math.floor(srcCanvas.width / 2) * 2);
        outH = Math.max(2, Math.floor(srcCanvas.height / 2) * 2);
      }

      const compCanvas = document.createElement('canvas');
      compCanvas.width = outW;
      compCanvas.height = outH;
      const compCtx = compCanvas.getContext('2d', {
        alpha: false,
        colorSpace: 'srgb',
        willReadFrequently: true
      });
      const i420Buffer = new Uint8Array((outW * outH * 3) >> 1);

      // Exact ITU-R BT.709 studio-range (16..235 Y, 16..240 CbCr) RGBA -> I420 conversion
      // Eliminates browser/GPU RGB->YUV BT.601 matrix & full-range VUI mismatches in QuickTime .mov
      function rgbaToI420Bt709(rgba, width, height, out) {
        const ySize = width * height;
        const uvWidth = width >> 1;
        const uvHeight = height >> 1;
        const uOffset = ySize;
        const vOffset = ySize + uvWidth * uvHeight;

        for (let j = 0; j < height; j++) {
          const rowOff = j * width;
          const rgbaRow = rowOff << 2;
          for (let i = 0; i < width; i++) {
            const idx = rgbaRow + (i << 2);
            const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];
            out[rowOff + i] = ((47 * r + 157 * g + 16 * b + 128) >> 8) + 16;
          }
        }

        let uvIdx = 0;
        for (let j = 0; j < height; j += 2) {
          const row0 = (j * width) << 2;
          const row1 = ((j + 1) * width) << 2;
          for (let i = 0; i < width; i += 2) {
            const p00 = row0 + (i << 2), p01 = p00 + 4;
            const p10 = row1 + (i << 2), p11 = p10 + 4;
            const r = (rgba[p00] + rgba[p01] + rgba[p10] + rgba[p11] + 2) >> 2;
            const g = (rgba[p00 + 1] + rgba[p01 + 1] + rgba[p10 + 1] + rgba[p11 + 1] + 2) >> 2;
            const b = (rgba[p00 + 2] + rgba[p01 + 2] + rgba[p10 + 2] + rgba[p11 + 2] + 2) >> 2;
            out[uOffset + uvIdx] = ((-26 * r - 86 * g + 112 * b + 128) >> 8) + 128;
            out[vOffset + uvIdx] = ((112 * r - 102 * g - 10 * b + 128) >> 8) + 128;
            uvIdx++;
          }
        }
      }

      // Initialize WebCodecs H.264 VideoEncoder if supported, else fallback to Motion-JPEG
      let codec = 'jpeg';
      let videoEncoder = null;
      let avcCConfig = null;
      const samples = [];
      const keyframes = [];

      if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
        const candidateCodecs = ['avc1.640028', 'avc1.4d0028', 'avc1.420028', 'avc1.42001f'];
        for (let i = 0; i < candidateCodecs.length; i++) {
          try {
            const support = await VideoEncoder.isConfigSupported({
              codec: candidateCodecs[i],
              width: outW,
              height: outH,
              bitrate: 14_000_000,
              framerate: fps,
              avc: { format: 'avc' }
            });
            if (support && support.supported) {
              codec = 'avc1';
              videoEncoder = new VideoEncoder({
                output: (chunk, meta) => {
                  if (meta && meta.decoderConfig && meta.decoderConfig.description) {
                    avcCConfig = new Uint8Array(meta.decoderConfig.description);
                  }
                  const buf = new Uint8Array(chunk.byteLength);
                  chunk.copyTo(buf);
                  samples.push(buf);
                  keyframes.push(chunk.type === 'key');
                },
                error: (err) => {
                  console.warn('WebCodecs VideoEncoder error:', err);
                }
              });
              videoEncoder.configure(support.config);
              break;
            }
          } catch (_) {
            // Try next profile or fallback to Motion-JPEG
          }
        }
      }

      if (onStartPlayblast) onStartPlayblast({ resetFirst, fps, totalFrames, outW, outH, codec });

      // Temporarily render at exact Playblast resolution for crisp supersampled quality
      const prevPixelRatio = renderer.getPixelRatio();
      const prevW = window.innerWidth;
      const prevH = window.innerHeight;
      renderer.setPixelRatio(1);
      renderer.setSize(outW, outH, false);
      camera.aspect = outW / outH;
      camera.updateProjectionMatrix();

      const stepDt = 1 / fps;

      for (let f = 1; f <= totalFrames; f++) {
        if (stopRequested) break;

        // 1. Advance simulation by exact fixed 1/fps timestep
        stepSimulation(stepDt, f);

        // 2. Render 3D scene
        renderer.render(scene, camera);

        // 3. Composite onto capture canvas + optional Maya Playblast HUD burn-in
        compCtx.drawImage(srcCanvas, 0, 0, outW, outH);
        if (hudBurnIn) {
          const extra = getHudInfo ? getHudInfo(f, totalFrames, fps) : {};
          drawMayaHudSlate(compCtx, outW, outH, {
            frame: f,
            totalFrames,
            fps,
            ...extra
          });
        }

        // 4. Encode frame with explicit ITU-R BT.709 studio-range I420 colorSpace
        if (codec === 'avc1' && videoEncoder && videoEncoder.state === 'configured') {
          const imgData = compCtx.getImageData(0, 0, outW, outH);
          rgbaToI420Bt709(imgData.data, outW, outH, i420Buffer);
          const timestampUs = Math.round(((f - 1) * 1_000_000) / fps);
          const vFrame = new VideoFrame(i420Buffer, {
            format: 'I420',
            codedWidth: outW,
            codedHeight: outH,
            timestamp: timestampUs,
            duration: Math.round(1_000_000 / fps),
            colorSpace: {
              primaries: 'bt709',
              transfer: 'bt709',
              matrix: 'bt709',
              fullRange: false
            }
          });
          const isKey = (f === 1) || ((f - 1) % fps === 0);
          videoEncoder.encode(vFrame, { keyFrame: isKey });
          vFrame.close();
        } else {
          const jpegBytes = dataUrlToUint8Array(compCanvas.toDataURL('image/jpeg', 0.92));
          samples.push(jpegBytes);
          keyframes.push(true);
        }

        if (opts.onProgress) {
          opts.onProgress(f, totalFrames);
        }

        // Yield briefly to browser UI so the live viewport & progress counter update smoothly
        await new Promise(r => setTimeout(r, 0));
      }

      // Restore viewport renderer size
      renderer.setPixelRatio(prevPixelRatio);
      renderer.setSize(prevW, prevH, false);
      camera.aspect = prevW / Math.max(1, prevH);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      if (codec === 'avc1' && videoEncoder) {
        try {
          if (videoEncoder.state === 'configured') {
            await videoEncoder.flush();
          }
          videoEncoder.close();
        } catch (e) {
          console.warn('VideoEncoder flush warning:', e);
        }
      }

      if (samples.length > 0) {
        const movBytes = muxQuickTimeMov({
          width: outW,
          height: outH,
          fps,
          codec,
          samples,
          keyframes,
          avcC: avcCConfig
        });

        const blob = new Blob([movBytes], { type: 'video/quicktime' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `playblast_${stamp}.mov`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 5000);

        if (showNote) {
          const mb = (movBytes.byteLength / (1024 * 1024)).toFixed(2);
          showNote(`Playblast saved: ${samples.length} frames (${outW}×${outH} @ ${fps}fps, ${mb} MB QuickTime .mov)`, 3600);
        }
      }

      active = false;
      stopRequested = false;
      if (onFinishPlayblast) onFinishPlayblast();
    }

    return {
      runPlayblast,
      stop: () => { if (active) stopRequested = true; },
      isActive: () => active
    };
  };

  return {
    muxQuickTimeMov,
    createPlayblastController
  };
});
