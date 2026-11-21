/**
 * The loupe: a magnified patch of the *sensor data* that follows the cursor.
 *
 * Everything it shows is the frame's own numbers — the DN the ADC produced and
 * the colour filter that pixel was under. That is the whole argument of the page
 * in one widget: a red pixel really did record only red, and the other two
 * channels in that cell do not exist anywhere in the file.
 *
 * It reads the already-encoded `mosaicView` bytes for colour (so the tint logic
 * lives in exactly one place, the worker) and `dn` for the printed values.
 */

/** Pixels shown either side of the cursor: a 7x7 patch. */
const RADIUS = 3;

/** Screen pixels per sensor pixel. Big enough to fit four digits and a rule. */
const CELL = 22;

/** Gap between the cursor and the loupe, so the cursor never covers a cell. */
const OFFSET = 20;

/**
 * @param {{ root: HTMLElement, canvas: HTMLCanvasElement, caption: HTMLElement }} elements
 */
export function createLoupe({ root, canvas, caption }) {
  const context = canvas.getContext('2d');
  const size = (RADIUS * 2 + 1) * CELL;

  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  // Let the caption wrap to the grid's width instead of a fixed measure, so the
  // panel is one tidy square rather than a grid with dead space beside it.
  caption.style.maxWidth = `${size}px`;

  /**
   * Draw the patch centred on (x, y) and place the loupe near the cursor.
   *
   * @param {object} frame
   * @param {number} x
   * @param {number} y
   * @param {{clientX: number, clientY: number}} pointer
   */
  function show(frame, x, y, pointer) {
    const { width, height, mosaicView, dn, mask } = frame;

    // Unhide before measuring: a hidden element reports a zero size, which would
    // make `place` believe the loupe fits anywhere and push it off screen.
    root.hidden = false;

    context.clearRect(0, 0, size, size);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '600 10px "JetBrains Mono Variable", ui-monospace, monospace';

    for (let dy = -RADIUS; dy <= RADIUS; dy += 1) {
      for (let dx = -RADIUS; dx <= RADIUS; dx += 1) {
        const px = x + dx;
        const py = y + dy;

        const left = (dx + RADIUS) * CELL;
        const top = (dy + RADIUS) * CELL;

        if (px < 0 || py < 0 || px >= width || py >= height) {
          // Outside the frame: leave it empty rather than inventing an edge.
          continue;
        }

        const i = py * width + px;
        const j = i * 4;

        const r = mosaicView[j];
        const g = mosaicView[j + 1];
        const b = mosaicView[j + 2];

        context.fillStyle = `rgb(${r} ${g} ${b})`;
        context.fillRect(left, top, CELL, CELL);

        // Numbers on the cells, not in a legend: the value is the evidence.
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        context.fillStyle = luminance > 0.5 ? '#0C0C0B' : '#E8E3D6';
        context.fillText(String(dn[i]), left + CELL / 2, top + CELL / 2);

        if (dx === 0 && dy === 0) {
          context.strokeStyle = '#F5B301';
          context.lineWidth = 2;
          context.strokeRect(left + 1, top + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // Hairlines between cells, drawn last so they sit above the fills.
    context.strokeStyle = 'rgba(12, 12, 11, 0.55)';
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 1; i < RADIUS * 2 + 1; i += 1) {
      context.moveTo(i * CELL + 0.5, 0);
      context.lineTo(i * CELL + 0.5, size);
      context.moveTo(0, i * CELL + 0.5);
      context.lineTo(size, i * CELL + 0.5);
    }
    context.stroke();

    const channelName = ['red', 'green', 'blue'][mask[y * width + x]];
    caption.textContent =
      `row ${y} · col ${x} — this pixel only measured ${channelName}: ${dn[y * width + x]}. ` +
      'The other two colours were never here.';

    place(pointer);
  }

  /**
   * Position the loupe beside the cursor, flipped and clamped so it always stays
   * on screen.
   *
   * @param {{clientX: number, clientY: number}} pointer
   */
  function place(pointer) {
    const width = root.offsetWidth;
    const height = root.offsetHeight;

    let left = pointer.clientX + OFFSET;
    let top = pointer.clientY + OFFSET;

    // Flip toward the cursor's free side before clamping, so near the right or
    // bottom edge the loupe jumps to the other side instead of hugging the edge
    // and covering the pixel being described.
    if (left + width > window.innerWidth - 8) left = pointer.clientX - width - OFFSET;
    if (top + height > window.innerHeight - 8) top = pointer.clientY - height - OFFSET;

    root.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    root.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
  }

  return {
    show,
    hide() {
      root.hidden = true;
    },
  };
}
