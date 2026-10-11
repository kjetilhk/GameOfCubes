/**
 * XPBD Virtual Analog Joystick Controller
 * Lightweight, zero-dependency touch/pointer analog joystick with progressive exponential response.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VirtualJoystick = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Creates an interactive virtual analog joystick.
   *
   * @param {Object} options Configuration options:
   *   - container: HTMLElement or selector (optional, container element)
   *   - base: HTMLElement or selector (optional)
   *   - thumb: HTMLElement or selector (optional)
   *   - maxRadius: number (default 28) maximum deflection in px
   *   - exponent: number (default 1.6) exponential response curve for steering/x-axis
   *   - onMove: function({ x, y, rawX, rawY, throttle, steer })
   *   - onRelease: function()
   *   - hint: string (optional caption text)
   * @returns {Object} Joystick controller instance
   */
  function createVirtualJoystick(options) {
    const opts = options || {};
    const maxRadius = opts.maxRadius || 28;
    const exponent = opts.exponent !== undefined ? opts.exponent : 1.6;
    const onMove = typeof opts.onMove === 'function' ? opts.onMove : null;
    const onRelease = typeof opts.onRelease === 'function' ? opts.onRelease : null;

    let container = typeof opts.container === 'string'
      ? document.querySelector(opts.container)
      : opts.container;

    let base = typeof opts.base === 'string'
      ? document.querySelector(opts.base)
      : opts.base;

    let thumb = typeof opts.thumb === 'string'
      ? document.querySelector(opts.thumb)
      : opts.thumb;

    if (!base && container) {
      base = container.querySelector('#joystick-base, .joystick-base');
    }
    if (!thumb && container) {
      thumb = container.querySelector('#joystick-thumb, .joystick-thumb');
    }

    // Auto-create DOM if no elements were found
    if (!base) {
      if (!container) {
        container = document.createElement('div');
        container.id = 'joystick-container';
        container.className = 'virtual-joystick-container';
        document.body.appendChild(container);
      }
      base = document.createElement('div');
      base.id = 'joystick-base';
      base.className = 'virtual-joystick-base';

      thumb = document.createElement('div');
      thumb.id = 'joystick-thumb';
      thumb.className = 'virtual-joystick-thumb';

      base.appendChild(thumb);
      container.appendChild(base);

      if (opts.hint) {
        const hintEl = document.createElement('div');
        hintEl.id = 'joystick-hint';
        hintEl.className = 'virtual-joystick-hint';
        hintEl.textContent = opts.hint;
        container.appendChild(hintEl);
      }
    }

    let activePointerId = null;
    let baseCenterX = 0;
    let baseCenterY = 0;
    let currentX = 0;
    let currentY = 0;
    let currentRawX = 0;
    let currentRawY = 0;

    function update(clientX, clientY) {
      let dx = clientX - baseCenterX;
      let dy = clientY - baseCenterY;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      if (thumb) {
        thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }

      currentRawX = dx / maxRadius;      // -1 (left) to +1 (right)
      currentRawY = -dy / maxRadius;     // -1 (down/reverse) to +1 (up/forward)

      // Progressive exponential response: gentle center precision, full reach at edges
      currentX = Math.sign(currentRawX) * Math.pow(Math.abs(currentRawX), exponent);
      currentY = currentRawY;

      const state = {
        x: currentX,
        y: currentY,
        rawX: currentRawX,
        rawY: currentRawY,
        steer: currentX,
        throttle: currentY
      };

      if (onMove) onMove(state);
      return state;
    }

    function reset() {
      if (thumb) {
        thumb.style.transform = 'translate(-50%, -50%)';
      }
      currentX = 0;
      currentY = 0;
      currentRawX = 0;
      currentRawY = 0;

      if (onRelease) onRelease();
      if (onMove) {
        onMove({
          x: 0,
          y: 0,
          rawX: 0,
          rawY: 0,
          steer: 0,
          throttle: 0
        });
      }
    }

    function onPointerDown(e) {
      e.preventDefault();
      activePointerId = e.pointerId;
      const rect = base.getBoundingClientRect();
      baseCenterX = rect.left + rect.width / 2;
      baseCenterY = rect.top + rect.height / 2;
      if (typeof base.setPointerCapture === 'function') {
        base.setPointerCapture(e.pointerId);
      }
      update(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
      if (e.pointerId === activePointerId) {
        update(e.clientX, e.clientY);
      }
    }

    function onPointerEnd(e) {
      if (e.pointerId === activePointerId) {
        activePointerId = null;
        if (typeof base.releasePointerCapture === 'function') {
          try { base.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        reset();
      }
    }

    base.addEventListener('pointerdown', onPointerDown);
    base.addEventListener('pointermove', onPointerMove);
    base.addEventListener('pointerup', onPointerEnd);
    base.addEventListener('pointercancel', onPointerEnd);

    return {
      baseEl: base,
      thumbEl: thumb,
      containerEl: container,
      reset: reset,
      destroy: function () {
        base.removeEventListener('pointerdown', onPointerDown);
        base.removeEventListener('pointermove', onPointerMove);
        base.removeEventListener('pointerup', onPointerEnd);
        base.removeEventListener('pointercancel', onPointerEnd);
        reset();
      },
      getValue: function () {
        return {
          x: currentX,
          y: currentY,
          rawX: currentRawX,
          rawY: currentRawY,
          steer: currentX,
          throttle: currentY
        };
      }
    };
  }

  return {
    create: createVirtualJoystick
  };
}));
