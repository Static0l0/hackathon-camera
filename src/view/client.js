/**
 * A very small client for the engine worker.
 *
 * The problem this solves: a slider drag fires dozens of change events, but a
 * frame takes ~150 ms. Queueing them all would make the image lag seconds behind
 * the thumb. So requests are *coalesced* — at most one frame is in flight, and
 * if settings change while it runs, only the newest settings are sent when it
 * returns. Intermediate settings are dropped on purpose: the user cannot see
 * them anyway.
 *
 * Patch requests (the little window the sensor-stack view draws) are coalesced
 * the same way, and for the same reason: the stack only wants the newest window.
 *
 * Comparison requests (four methods scored on one capture) are coalesced too, but
 * the caller is expected to debounce them: they cost about four reconstructions.
 *
 * This is a callback interface rather than promises for the same reason: the
 * page always wants the newest frame, never a particular one.
 */

/**
 * @param {{
 *   onFrame: (frame: object) => void,
 *   onExplain: (explanation: object) => void,
 *   onGuess: (guess: object) => void,
 *   onPatch: (patch: object) => void,
 *   onCompare: (rows: object[]) => void,
 *   onFailure: (message: string) => void,
 * }} handlers
 */
export function createEngineClient({ onFrame, onExplain, onGuess, onPatch, onCompare, onFailure }) {
  const worker = new Worker(new URL('../worker/engine.worker.js', import.meta.url), {
    type: 'module',
  });

  let nextId = 1;
  /** Settings we most want computed, or null when the screen is up to date. */
  let wanted = null;
  let inFlight = false;

  /** A patch request waiting for the previous one, or null. */
  let wantedPatch = null;
  let patchInFlight = false;

  /** A comparison waiting for the previous one, or null. */
  let wantedCompare = null;
  let compareInFlight = false;

  worker.addEventListener('message', ({ data }) => {
    if (!data) return;

    if (data.type === 'frame') {
      inFlight = false;
      onFrame(data.frame);
      // Anything that arrived while we were busy still needs computing.
      if (wanted) {
        const { settings, metrics } = wanted;
        wanted = null;
        send(settings, metrics);
      }
      return;
    }

    if (data.type === 'explain') {
      onExplain(data.explanation);
      return;
    }

    if (data.type === 'guess') {
      onGuess(data.guess);
      return;
    }

    if (data.type === 'patch') {
      patchInFlight = false;
      onPatch(data.patch);
      if (wantedPatch) {
        const request = wantedPatch;
        wantedPatch = null;
        sendPatch(request);
      }
      return;
    }

    if (data.type === 'compare') {
      compareInFlight = false;
      onCompare(data.rows);
      if (wantedCompare) {
        const settings = wantedCompare;
        wantedCompare = null;
        sendCompare(settings);
      }
      return;
    }

    if (data.type === 'failed') {
      // A failed frame must not wedge the queue, or the page would freeze behind
      // a permanent "computing" label.
      inFlight = false;
      patchInFlight = false;
      compareInFlight = false;
      onFailure(data.message);
      if (wanted) {
        const { settings, metrics } = wanted;
        wanted = null;
        send(settings, metrics);
      }
    }
  });

  worker.addEventListener('error', (event) => {
    inFlight = false;
    patchInFlight = false;
    compareInFlight = false;
    onFailure(event.message || 'the engine worker failed to load');
  });

  /**
   * @param {object} settings
   * @param {boolean} metrics
   */
  function send(settings, metrics) {
    inFlight = true;
    worker.postMessage({ type: 'frame', id: nextId, settings, metrics });
    nextId += 1;
  }

  /**
   * @param {{x: number, y: number, size: number}} request
   */
  function sendPatch({ x, y, size }) {
    patchInFlight = true;
    worker.postMessage({ type: 'patch', id: nextId, x, y, size });
    nextId += 1;
  }

  /**
   * @param {object} settings
   */
  function sendCompare(settings) {
    compareInFlight = true;
    worker.postMessage({ type: 'compare', id: nextId, settings });
    nextId += 1;
  }

  /**
   * @param {number} x @param {number} y
   */
  function sendGuess({ x, y }) {
    worker.postMessage({ type: 'guess', id: nextId, x, y });
    nextId += 1;
  }

  return {
    /**
     * Ask for a frame. Safe to call on every input event.
     *
     * `metrics: false` is the dragging case — publish the picture but skip the
     * PSNR and the error map, which are about to be recomputed anyway. The
     * settled request that follows must ask for them.
     *
     * @param {object} settings the complete settings object, not a patch
     * @param {{metrics?: boolean}} [options]
     */
    requestFrame(settings, options = {}) {
      const metrics = options.metrics !== false;
      if (inFlight) {
        wanted = { settings, metrics };
        return;
      }
      send(settings, metrics);
    },

    /**
     * Ask what happened at one pixel of the frame currently displayed.
     * @param {number} x
     * @param {number} y
     */
    requestExplain(x, y) {
      worker.postMessage({ type: 'explain', id: nextId, x, y });
      nextId += 1;
    },

    /**
     * Ask for a small window of the frame's photon counts.
     * @param {number} x centre pixel @param {number} y centre pixel
     * @param {number} size side length in pixels
     */
    requestPatch(x, y, size) {
      if (patchInFlight) {
        wantedPatch = { x, y, size };
        return;
      }
      sendPatch({ x, y, size });
    },

    /**
     * Ask for all four methods to be scored on the current settings.
     *
     * Call this on a delay, not on every input event: it costs one capture plus
     * four reconstructions, roughly four times a frame.
     * @param {object} settings
     */
    requestCompare(settings) {
      if (compareInFlight) {
        wantedCompare = settings;
        return;
      }
      sendCompare(settings);
    },

    /**
     * Ask what one pixel's missing green should be, and what it really was.
     * Cheap enough to answer on every click, so it is not queued.
     * @param {number} x @param {number} y
     */
    requestGuess(x, y) {
      sendGuess({ x, y });
    },

    dispose() {
      worker.terminate();
    },
  };
}
