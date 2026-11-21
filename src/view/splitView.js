/**
 * The split interaction: one draggable divider between two halves of the same
 * frame.
 *
 * This module owns the pointer, the keyboard and the ARIA state, and knows
 * nothing about pixels. A painter (WebGL or 2D canvas) owns the drawing. Keeping
 * them apart is what makes the fallback honest: with no WebGL the same
 * interaction runs unchanged over a different renderer.
 *
 * The same pointer stream does two jobs, which is a deliberate compromise on this
 * page: a horizontal drag wipes the divider, a click without movement selects a
 * pixel for the explanation panel. The 4 px threshold is what separates "click"
 * from "the hand shook while clicking".
 */

/** Distance the pointer must travel before a press counts as a drag, in pixels. */
const DRAG_THRESHOLD = 4;

/** The divider never fully disappears: a 2 px sliver keeps it grabbable. */
const MIN_SPLIT = 2;
const MAX_SPLIT = 98;

/**
 * @param {{
 *   container: HTMLElement,
 *   divider: HTMLElement,
 *   painter: {setFrame: Function, setSplit: Function, paint: Function, dispose: Function, kind: string},
 *   onPick: (pixel: {x: number, y: number}) => void,
 *   onHover: (pixel: {x: number, y: number} | null, event: PointerEvent | null) => void,
 * }} options
 */
export function createSplitView({ container, divider, painter, onPick, onHover }) {
  /** @type {object|null} */
  let frame = null;
  let split = 50;
  let drag = null;
  /** The live painter. Replaced once, when the WebGL renderer finishes loading. */
  let current = painter;

  /**
   * @param {number} percent 0..100, the share of the width showing the mosaic
   */
  function setSplit(percent) {
    split = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, percent));
    // One variable drives the divider's position and, in the 2D fallback, the
    // mosaic canvas's clip. The WebGL painter reads `split` instead, because a
    // shader can mix two textures without clipping a second element.
    container.style.setProperty('--split', `${split}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(split)));
    current.setSplit(split);
  }

  /**
   * Map a pointer event to an image pixel, clamped to the frame.
   *
   * @param {PointerEvent} event
   * @returns {{x: number, y: number}|null}
   */
  function toPixel(event) {
    if (!frame) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;

    return {
      x: Math.min(frame.width - 1, Math.max(0, Math.floor(fx * frame.width))),
      y: Math.min(frame.height - 1, Math.max(0, Math.floor(fy * frame.height))),
    };
  }

  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    container.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startSplit: split,
      moved: false,
    };
    event.preventDefault();
  });

  container.addEventListener('pointermove', (event) => {
    if (drag) {
      const rect = container.getBoundingClientRect();
      const dx = event.clientX - drag.startX;

      if (Math.abs(dx) > DRAG_THRESHOLD) drag.moved = true;
      if (drag.moved) {
        setSplit(drag.startSplit + (dx / rect.width) * 100);
        onHover(null, null);
      }
      return;
    }

    onHover(toPixel(event), event);
  });

  container.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasDrag = drag.moved;
    drag = null;
    container.releasePointerCapture(event.pointerId);

    if (!wasDrag) {
      const pixel = toPixel(event);
      if (pixel) onPick(pixel);
    }
  });

  container.addEventListener('pointercancel', () => {
    drag = null;
  });

  container.addEventListener('pointerleave', () => {
    if (!drag) onHover(null, null);
  });

  // Keyboard operation for the divider: it is a real control, not decoration.
  divider.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') setSplit(split - step);
    else if (event.key === 'ArrowRight') setSplit(split + step);
    else if (event.key === 'Home') setSplit(MIN_SPLIT);
    else if (event.key === 'End') setSplit(MAX_SPLIT);
    else return;
    event.preventDefault();
  });

  /*
   * Keyboard operation for the image itself.
   *
   * "Click any pixel" is the depth feature of this page, and a mouse-only feature
   * is a feature half the audience cannot reach. The container takes focus, arrow
   * keys walk a selected pixel across the image (shift: eight at a time), Enter or
   * Space explains it, Escape puts it away. The marker is a real element so the
   * selection is visible, not just announced.
   */
  const cursor = document.createElement('div');
  cursor.className = 'pick-cursor';
  cursor.hidden = true;
  container.append(cursor);

  // Make the viewer reachable and self-describing. It is a labelled, focusable
  // region rather than an "application" role: the arrow keys are a convenience
  // on top of a normal document, not a mode that swallows the reader's own keys.
  container.tabIndex = 0;
  if (!container.hasAttribute('aria-label')) {
    container.setAttribute(
      'aria-label',
      'Image viewer: raw sensor data on the left, developed photograph on the right. ' +
        'Arrow keys select a pixel and Enter explains it. The divider above is a separate control.',
    );
  }

  /** @type {{x: number, y: number}|null} */
  let selected = null;

  /**
   * @param {number} x @param {number} y
   */
  function moveSelection(x, y) {
    if (!frame) return;
    const next = {
      x: Math.min(frame.width - 1, Math.max(0, x)),
      y: Math.min(frame.height - 1, Math.max(0, y)),
    };
    selected = next;
    cursor.hidden = false;
    cursor.style.left = `${((next.x + 0.5) / frame.width) * 100}%`;
    cursor.style.top = `${((next.y + 0.5) / frame.height) * 100}%`;
    // The loupe is positioned from a pointer event; give it the pixel's centre so
    // a keyboard user gets the same magnified numbers a mouse user gets.
    const box = container.getBoundingClientRect();
    onHover(next, {
      clientX: box.left + ((next.x + 0.5) / frame.width) * box.width,
      clientY: box.top + ((next.y + 0.5) / frame.height) * box.height,
    });
  }

  /**
   * Where the selection starts before the first arrow press: a quarter of the way
   * across, because the default divider sits at half and a marker under the grip
   * would look like part of the divider.
   */
  const startPixel = () => ({ x: Math.floor(frame.width * 0.25), y: Math.floor(frame.height / 2) });

  container.addEventListener('keydown', (event) => {
    // The divider owns its own arrow keys, and it sits inside this element.
    if (event.target === divider) return;
    if (!frame) return;

    const step = event.shiftKey ? 8 : 1;
    const start = selected ?? startPixel();

    switch (event.key) {
      case 'ArrowLeft':
        moveSelection(start.x - step, start.y);
        break;
      case 'ArrowRight':
        moveSelection(start.x + step, start.y);
        break;
      case 'ArrowUp':
        moveSelection(start.x, start.y - step);
        break;
      case 'ArrowDown':
        moveSelection(start.x, start.y + step);
        break;
      case 'Enter':
      case ' ':
        if (!selected) moveSelection(start.x, start.y);
        onPick(selected ?? start);
        break;
      case 'Escape':
        selected = null;
        cursor.hidden = true;
        onHover(null, null);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // Focus ring behaviour: a keyboard visitor should meet the selected pixel the
  // first time they reach the image, not an empty box with no explanation. A
  // pointer click also focuses this element, so the auto-select is limited to
  // `:focus-visible` — otherwise clicking would move the selection away from the
  // pixel the visitor actually clicked.
  container.addEventListener('focus', () => {
    if (selected || !frame) return;
    if (!container.matches(':focus-visible')) return;
    moveSelection(startPixel().x, startPixel().y);
  });

  // Leaving the image puts the magnifier away but keeps the selection, so tabbing
  // back returns to the same pixel instead of starting over.
  container.addEventListener('blur', () => {
    onHover(null, null);
  });

  setSplit(50);

  return {
    /**
     * Show a new frame. Both halves come from this one call, so they can never
     * drift out of sync.
     * @param {object} nextFrame
     */
    setFrame(nextFrame) {
      frame = nextFrame;
      container.style.aspectRatio = `${frame.width} / ${frame.height}`;
      current.setFrame(nextFrame);
    },

    /**
     * Hand over to a different renderer without losing the picture or the split.
     *
     * The page starts on the 2D canvas because it needs no library, and upgrades
     * to WebGL when that chunk arrives. Doing it this way means the fallback is
     * the *default* path rather than the one that only runs when something has
     * already broken — which is exactly how the z-order bug survived a phase.
     *
     * @param {object} nextPainter
     */
    setPainter(nextPainter) {
      const previous = current;
      current = nextPainter;
      current.setSplit(split);
      if (frame) current.setFrame(frame);
      current.paint();
      previous.dispose();
    },

    getFrame() {
      return frame;
    },

    setSplit,
    getSplit: () => split,
    get painterKind() {
      return current.kind;
    },
    dispose() {
      current.dispose();
    },
  };
}
