/**
 * Smooth scrolling, and the one thing it is used for: pulling the sensor stack
 * apart as the page moves.
 *
 * The stack is **pinned** for the length of the separation, because a stack that
 * merely animates while it scrolls past is a stack the visitor watches leave the
 * screen before it has finished opening. Held in place, the scroll bar becomes
 * the control for the explosion and nothing else moves until it is done.
 *
 * Lenis and GSAP are animation tools; they move things on screen and decide
 * nothing about the image. The number they hand over (`progress`, 0..1) is the
 * only thing the renderer hears, and it is also what the "1 dot = n electrons"
 * annotation reads.
 *
 * If the visitor asked their system for reduced motion, none of this runs: the
 * stack sits open, which is the state that carries the information anyway. The
 * motion is the explanation's delivery, not its content.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Below this height the pinned block would be taller than the screen, and part
 * of it would sit under the fold for the whole pin. On those screens the stack
 * separates as it scrolls instead — the older behaviour, which shows everything.
 */
const PIN_MIN_HEIGHT = 640;

/**
 * @param {{
 *   pin: HTMLElement,
 *   onProgress: (progress: number) => void,
 * }} options
 * @returns {{ destroy: () => void, reduced: boolean }}
 */
export function createScroll({ pin, onProgress }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) {
    // Fully open, no listeners, no scroll hijacking.
    onProgress(1);
    return { destroy() {}, reduced };
  }

  // Lenis drives window scroll; ScrollTrigger reads it. The documented pairing is
  // to let Lenis own the animation frame and forward its scroll events, so the
  // two never disagree about where the page is.
  const lenis = new Lenis({ duration: 0.9, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);

  const tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // One progress source, two ways of holding the block: pinned when it fits the
  // screen, scrolling past when it does not. matchMedia re-runs on resize, so a
  // window dragged shorter drops the pin instead of cropping the legend.
  const media = gsap.matchMedia();

  const build = (pinned) => () => {
    const trigger = ScrollTrigger.create({
      // The whole block is the trigger, not just the canvas: pinning has to start
      // when the heading arrives, or the heading is already above the fold by the
      // time the stack stops moving.
      trigger: pin,
      // Start as the block's top reaches the upper tenth of the screen: heading,
      // stack and legend are all on screen before anything moves.
      start: 'top 10%',
      // Hold it for a little over one screen of scrolling — long enough to look
      // at each layer, short enough not to feel stuck.
      end: pinned ? '+=135%' : 'bottom 25%',
      pin: pinned ? pin : false,
      // antialias the jump when the pin engages under Lenis smoothing.
      anticipatePin: pinned ? 1 : 0,
      invalidateOnRefresh: true,
      scrub: true,
      onUpdate: (self) => onProgress(self.progress),
    });

    return () => trigger.kill();
  };

  media.add(`(min-height: ${PIN_MIN_HEIGHT}px)`, build(true));
  media.add(`(max-height: ${PIN_MIN_HEIGHT - 1}px)`, build(false));

  return {
    reduced,
    destroy() {
      media.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    },
  };
}
