/**
 * Sound, kept to what carries meaning.
 *
 * Procedural Web Audio — no files, no network, nothing to break on deploy.
 * The palette is a darkroom, not a game: a mechanical switch, a shutter's two
 * curtains, a low developer hum. Those are filtered-noise transients with soft
 * envelopes, not sine-wave beeps — a beep reads as a notification, a click with
 * a body reads as something happening in a machine.
 *
 * Sound is on by default. Browsers still require a user gesture before an
 * AudioContext may start, so the context is resumed on the first interaction;
 * until then nothing can play, which is a browser rule rather than a choice.
 * A visitor can mute at any time, and that choice is remembered.
 */

let audioCtx = null;
let noiseBuffer = null;
let master = null;
let enabled = true;

/** Ensure we have an AudioContext and a shared master gain. */
function context() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    master = audioCtx.createGain();
    master.gain.value = 0.6;
    master.connect(audioCtx.destination);
  }
  return audioCtx;
}

/** One second of white noise, reused by every transient. */
function noise(ctx) {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  return source;
}

/** A short burst of filtered noise — the mechanical part of every sound. */
function burst({ freq = 1400, q = 1, type = 'bandpass', duration = 0.04, vol = 0.1, attack = 0.002, when = 0, rate = 1 }) {
  const ctx = context();
  if (!ctx) return;

  const t = ctx.currentTime + when;
  const src = noise(ctx);
  src.playbackRate.value = rate;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
  src.stop(t + duration + 0.02);
}

/** A low body tone, used only under a click to give it weight. */
function body({ freq = 220, duration = 0.06, vol = 0.05, when = 0 }) {
  const ctx = context();
  if (!ctx) return;

  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + duration);

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

const SFX = {
  /** Mechanical switch: a dry click with a little weight behind it. */
  tap: () => {
    burst({ freq: 1900, q: 0.8, duration: 0.025, vol: 0.075 });
    body({ freq: 280, duration: 0.045, vol: 0.03 });
  },

  /** Shutter: mirror up, then the curtain — two clicks, the second softer. */
  shutter: () => {
    burst({ freq: 1100, q: 0.7, duration: 0.035, vol: 0.13 });
    body({ freq: 180, duration: 0.07, vol: 0.055 });
    burst({ freq: 1600, q: 0.6, duration: 0.045, vol: 0.085, when: 0.055 });
  },

  /** Developer: a slow low swell, like liquid moving in a tray. */
  develop: () => {
    burst({ freq: 320, q: 0.4, type: 'lowpass', duration: 0.42, vol: 0.055, attack: 0.06, rate: 0.6 });
  },

  /** Error: a muted knock, not a buzz. */
  error: () => {
    burst({ freq: 140, q: 0.7, type: 'lowpass', duration: 0.14, vol: 0.09 });
    body({ freq: 95, duration: 0.12, vol: 0.04 });
  },
};

export function createSound() {
  // On unless this visitor explicitly muted it before.
  const stored = localStorage.getItem('mosaic:sound');
  enabled = stored === null ? true : stored !== '0';

  function isEnabled() { return enabled; }

  function enable() {
    enabled = true;
    localStorage.setItem('mosaic:sound', '1');
  }

  function disable() {
    enabled = false;
    localStorage.setItem('mosaic:sound', '0');
  }

  function toggle() { enabled ? disable() : enable(); }

  function play(name) {
    if (!enabled) return;
    const fn = SFX[name];
    if (fn) fn();
  }

  // Browsers suspend the context until a real gesture. Resume it on the first
  // pointer or key interaction, then keep it running for the rest of the visit.
  function ensureStarted() {
    const ctx = context();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  document.addEventListener('pointerdown', ensureStarted, { once: true, passive: true });
  document.addEventListener('keydown', ensureStarted, { once: true, passive: true });

  return { isEnabled, enable, disable, toggle, play };
}
