/**
 * The loupe: a magnified patch of the *sensor data* that follows the cursor.
 *
 * Everything it shows is the frame's own numbers — the DN the ADC produced and
 * the colour filter that pixel was under. That is the whole argument of the page
 * in one widget: a red pixel really did record only red, and the other two
 * channels in that cell do not exist anywhere in the file.
 *
 * It tints each cell with the colour of the filter it sat under and prints `dn`
 * for the value, so the patch reads as sensor data rather than as a screenshot.
 */

import { cssRgb, luminance, readColour } from './cssColor.js';

/** Pixels shown either side of the cursor: a 7x7 patch. */
const RADIUS = 3;

/** Screen pixels per sensor pixel. Big enough to fit four digits with a margin. */
const CELL = 26;

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
    const { width, height, dn, mask } = frame;

    // Unhide before measuring: a hidden element reports a zero size, which would
    // make `place` believe the loupe fits anywhere and push it off screen.
    root.hidden = false;

    // Read the theme at draw time: the reader can switch it between two hovers.
    const paper = readColour('--paper', [242, 239, 230]);
    const ink = readColour('--ink', [25, 24, 20]);
    const channels = [
      readColour('--data-r', [200, 68, 44]),
      readColour('--data-g', [63, 140, 74]),
      readColour('--data-b', [47, 95, 176]),
    ];

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

        // Each cell is a tint of the page in its own filter's colour, not the raw
        // `rgb(dn, 0, 0)` triple: a full-strength primary glares against the rest
        // of the page, and the reading is carried by how far the tint has gone.
        const channel = channels[mask[i]];
        const t = Math.min(1, dn[i] / 4095);
        const tint = (base, colour) => Math.round(base + (colour - base) * t);
        const cell = [tint(paper[0], channel[0]), tint(paper[1], channel[1]), tint(paper[2], channel[2])];

        context.fillStyle = cssRgb(cell);
        context.fillRect(left, top, CELL, CELL);

        // Numbers on the cells, not in a legend: the value is the evidence.
        context.fillStyle = cssRgb(luminance(cell) > 0.45 ? ink : paper);
        context.fillText(String(dn[i]), left + CELL / 2, top + CELL / 2);

        if (dx === 0 && dy === 0) {
          context.strokeStyle = cssRgb(ink);
          context.lineWidth = 2;
          context.strokeRect(left + 1, top + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // Hairlines between cells, drawn last so they sit above the fills.
    context.strokeStyle = `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, 0.45)`;
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
    // Short enough to sit in three lines under a 154px grid. The full sentence
    // ("the other two colours have no reading here") is already in the status
    // line, where there is room to say it.
    caption.textContent = `row ${y} · col ${x}\n${channelName} only, ${dn[y * width + x]} DN`;

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
