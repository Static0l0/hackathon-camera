/**
 * The 2D fallback painter: two canvases, the mosaic one clipped by a CSS
 * variable.
 *
 * This is what the page shows when WebGL is unavailable. It is deliberately kept
 * as the simple, boring version rather than being deleted, because "three.js is
 * for presentation only" also has to mean "the page still presents the same
 * thing without three.js".
 *
 * Dragging the divider costs one style write and no redraw here — the image data
 * never moves, only the clip does.
 */

/**
 * @param {{ container: HTMLElement, mosaicCanvas: HTMLCanvasElement, developedCanvas: HTMLCanvasElement }} options
 */
export function createCanvasPainter({ container, mosaicCanvas, developedCanvas }) {
  // One offscreen canvas is reused for both layers: upload the bytes, then blit
  // it scaled into the visible canvas with smoothing off, so a 384 px frame fills
  // a 1100 px box with hard pixel edges.
  const offscreen = document.createElement('canvas');
  const offscreenContext = offscreen.getContext('2d');
  const mosaicContext = mosaicCanvas.getContext('2d');
  const developedContext = developedCanvas.getContext('2d');

  /** @type {object|null} */
  let frame = null;

  const resizeObserver = new ResizeObserver(() => paint());
  resizeObserver.observe(container);

  /**
   * Size a canvas to its CSS box (capped at 2x) and blit the offscreen pixels
   * into it without smoothing.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} context
   */
  function blit(canvas, context) {
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.drawImage(offscreen, 0, 0, width, height);
  }

  /** Redraw both layers from the stored frame. Cheap enough for a resize drag. */
  function paint() {
    if (!frame) return;

    const { width, height, display, mosaicView } = frame;
    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width;
      offscreen.height = height;
    }

    offscreenContext.putImageData(new ImageData(display, width, height), 0, 0);
    blit(developedCanvas, developedContext);

    offscreenContext.putImageData(new ImageData(mosaicView, width, height), 0, 0);
    blit(mosaicCanvas, mosaicContext);
  }

  return {
    kind: 'canvas',
    setFrame(nextFrame) {
      frame = nextFrame;
      paint();
    },
    // The clip is CSS, so the split needs no redraw here.
    setSplit() {},
    paint,
    dispose() {
      resizeObserver.disconnect();
      frame = null;
    },
  };
}
