/**
 * The print studio: expose a frame, then choose how to print it.
 *
 * The rest of the page argues that the sensor recorded one colour per site and
 * software invented the rest. This is the last step of that argument turned into
 * something you can touch: the numbers are fixed once you expose, but the print
 * is a choice. Every treatment below maps the *same* measured bytes to a
 * different final image — the way a darkroom printer chooses paper, toner or a
 * Sabattier re-exposure rather than changing what the camera saw.
 *
 * All transforms are pure functions over RGBA bytes, so they work with no WebGL,
 * no library and no worker changes. The frame's display buffer is copied on
 * expose, so a later slider drag never rewrites a print you already made.
 */

/** Clamp to a byte. */
const byte = (value) => (value < 0 ? 0 : value > 255 ? 255 : value);

/** Rec. 709 luma: the brightness a toner preserves while replacing the colour. */
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Smoothstep S-curve: hard paper pulls the midtones apart. */
function hardPaper(v) {
  const x = v / 255;
  return byte(x * x * (3 - 2 * x) * 255);
}

/** The one ramp in a cyanotype is Prussian blue; more light makes a denser blue. */
function cyanotype(r, g, b) {
  const y = luma(r, g, b);
  return [byte(14 + y * 0.18), byte(32 + y * 0.46), byte(78 + y * 0.86)];
}

/**
 * Every treatment: a id, a label, the note printed under the controls, and a
 * pure RGB transform. The note is the explanation, not decoration — each one
 * says what physical or chemical choice the look stands for.
 */
export const TREATMENTS = [
  {
    id: 'straight',
    label: 'straight print',
    note: 'The frame as the engine made it. Nothing added. Every other treatment changes the print, not the photo.',
    apply: (r, g, b) => [r, g, b],
  },
  {
    id: 'hardPaper',
    label: 'hard paper',
    note: 'Hard paper pushes darks darker and lights lighter, so small differences become easy to see.',
    apply: (r, g, b) => [hardPaper(r), hardPaper(g), hardPaper(b)],
  },
  {
    id: 'sepia',
    label: 'sepia toned',
    note: 'Sepia turns the silver in a print into a sulphide. Brightness stays the same. Everything becomes one warm brown.',
    apply(r, g, b) {
      const y = luma(r, g, b);
      return [byte(y * 1.07), byte(y * 0.79), byte(y * 0.54)];
    },
  },
  {
    id: 'cyanotype',
    label: 'cyanotype',
    note: 'A cyanotype is an iron print. One chemical reaction makes the image, so everything turns Prussian blue.',
    apply: cyanotype,
  },
  {
    id: 'negative',
    label: 'negative',
    note: 'Every tone flips: what was bright prints dark. That is how a photographic negative works. Print it again and the scene comes back.',
    apply: (r, g, b) => [byte(255 - r), byte(255 - g), byte(255 - b)],
  },
  {
    id: 'solarise',
    label: 'solarise',
    note: 'Expose the print again while it develops. The brightest tones turn dark, and a thin bright line appears at each edge.',
    apply(r, g, b) {
      const flip = (v) => (v > 150 ? byte(255 - (v - 150) * 2.2) : v);
      return [flip(r), flip(g), flip(b)];
    },
  },
  {
    id: 'lith',
    label: 'lith print',
    note: 'Lith developer keeps almost black or almost white, with few tones between. The photo turns into a graphic.',
    apply(r, g, b) {
      const step = (v) => (v < 80 ? 12 : v < 170 ? 128 : 246);
      return [step(r), step(g), step(b)];
    },
  },
  {
    id: 'splitTone',
    label: 'split tone',
    note: 'Two toners colour one print. Darks go cool, lights go warm, and the midtones carry both.',
    apply(r, g, b) {
      const t = luma(r, g, b) / 255;
      return [byte(28 + t * 222), byte(38 + t * 176), byte(96 + t * 58)];
    },
  },
];

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   grid: HTMLElement,
 *   note: HTMLElement,
 *   status: HTMLElement,
 *   exposeButton: HTMLButtonElement,
 *   retakeButton: HTMLButtonElement,
 *   frameElement: HTMLElement,
 *   tag: HTMLElement,
 *   onExpose?: () => void,
 *   onTreatment?: (treatment: object) => void,
 * }} options
 */
export function createPrintStudio({
  canvas,
  grid,
  note,
  status,
  exposeButton,
  retakeButton,
  frameElement,
  tag,
  onExpose,
  onTreatment,
}) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('createPrintStudio: no 2d context');

  /** @type {object|null} The newest frame from the engine, shown live. */
  let liveFrame = null;
  /** @type {object|null} A copy of the frame frozen at the moment of exposure. */
  let printedFrame = null;
  /** Which treatment is currently printing the frame. */
  let treatment = TREATMENTS[0];

  // Build the treatment buttons once. They are real radio-like buttons: aria-pressed
  // says which is active, and arrow keys move between them like a segmented control.
  const buttons = TREATMENTS.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'treatment';
    button.textContent = item.label;
    button.dataset.treatment = item.id;
    button.setAttribute('aria-pressed', String(item === treatment));
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = (index + step + buttons.length) % buttons.length;
      buttons[next].focus();
      select(next);
    });
    grid.append(button);
    return button;
  });

  function render() {
    const source = printedFrame ?? liveFrame;
    if (!source) return;

    const { width, height, display } = source;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const out = new Uint8ClampedArray(display.length);
    const apply = treatment.apply;
    for (let i = 0; i < display.length; i += 4) {
      const [r, g, b] = apply(display[i], display[i + 1], display[i + 2]);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
    context.putImageData(new ImageData(out, width, height), 0, 0);
  }

  function select(index) {
    treatment = TREATMENTS[index];
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    note.textContent = treatment.note;
    render();
    onTreatment?.(treatment);
  }

  function setStatus() {
    const source = printedFrame ?? liveFrame;
    if (!source) {
      status.textContent = 'Expose a frame to begin.';
      return;
    }
    const s = source.settings ?? {};
    if (printedFrame) {
      status.textContent = `Frozen · ${source.width}×${source.height} · ISO ${s.iso} · 1/${Math.round(1 / s.shutterSeconds)} s`;
    } else {
      status.textContent = 'Live. The frame follows the controls above.';
    }
  }

  function expose() {
    if (!liveFrame) return;
    // Copy the bytes so the transfer-owned buffer can be reused by the engine.
    printedFrame = {
      width: liveFrame.width,
      height: liveFrame.height,
      display: new Uint8ClampedArray(liveFrame.display),
      settings: { ...(liveFrame.settings ?? {}) },
    };
    frameElement.classList.remove('is-exposing');
    // Force a reflow so the flash animation restarts on a second exposure.
    void frameElement.offsetWidth;
    frameElement.classList.add('is-exposing');
    frameElement.dataset.printed = 'true';
    if (tag) tag.textContent = 'printed';
    retakeButton.hidden = false;
    setStatus();
    render();
    onExpose?.();
  }

  function retake() {
    printedFrame = null;
    frameElement.dataset.printed = 'false';
    if (tag) tag.textContent = 'live';
    retakeButton.hidden = true;
    setStatus();
    render();
  }

  exposeButton.addEventListener('click', expose);
  retakeButton.addEventListener('click', retake);
  frameElement.addEventListener('animationend', () => frameElement.classList.remove('is-exposing'));

  // Initial copy.
  note.textContent = treatment.note;
  setStatus();

  return {
    /** A new frame arrived from the engine. */
    setFrame(frame) {
      liveFrame = frame;
      // A print is frozen; a live preview follows every new frame.
      if (!printedFrame) render();
      setStatus();
    },
    expose,
    retake,
  };
}
