/**
 * Sound, kept to what carries meaning.
 *
 * Procedural Web Audio — no files, no network, nothing to break on deploy.
 * Every sound is optional and off by default until the visitor turns it on,
 * because a silent page is the default and a noisy page is a barrier.
 *
 * The palette is mechanical and darkroom: a shutter click, a safelight tap,
 * a soft develop hum. Nothing game-like.
 */

let audioCtx = null;
let enabled = false;

/** Ensure we have an AudioContext. Browsers require a user gesture first. */
function context() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/** Play one short procedural tone. */
function tone({
  type = 'sine',
  freq = 440,
  duration = 0.08,
  ramp = 0.01,
  vol = 0.05,
  when = 0,
} = {}) {
  const ctx = context();
  if (!ctx || !enabled) return;

  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + ramp);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + duration + 0.05);
}

const SFX = {
  /** Soft mechanical tap — clicking a pixel, toggling a control. */
  tap: () => tone({ type: 'sine', freq: 900, duration: 0.05, ramp: 0.01, vol: 0.04 }),
  /** Camera shutter — a new frame is captured / first paint. */
  shutter: () => {
    tone({ type: 'sine', freq: 650, duration: 0.06, ramp: 0.01, vol: 0.05 });
    tone({ type: 'sine', freq: 520, duration: 0.06, ramp: 0.01, vol: 0.04 }, 0.04);
  },
  /** Soft develop hum — the frame has finished reconstructing. */
  develop: () => tone({ type: 'triangle', freq: 200, duration: 0.25, ramp: 0.04, vol: 0.02 }),
  /** Very soft low buzz — an engine error. */
  error: () => tone({ type: 'sawtooth', freq: 100, duration: 0.18, ramp: 0.02, vol: 0.03 }),
};

export function createSound() {
  const stored = localStorage.getItem('mosaic:sound');
  enabled = stored === null ? false : stored === '1';

  function isEnabled() {
    return enabled;
  }

  function enable() {
    enabled = true;
    localStorage.setItem('mosaic:sound', '1');
  }

  function disable() {
    enabled = false;
    localStorage.setItem('mosaic:sound', '0');
  }

  function toggle() {
    enabled ? disable() : enable();
  }

  function play(name) {
    const fn = SFX[name];
    if (fn) fn();
  }

  // On first interaction, resume the context (required by browsers).
  function ensureStarted() {
    const ctx = context();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  document.addEventListener('pointerdown', ensureStarted, { once: true, passive: true });
  document.addEventListener('keydown', ensureStarted, { once: true, passive: true });

  return { isEnabled, enable, disable, toggle, play };
}
