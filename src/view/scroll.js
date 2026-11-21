/**
 * Smooth scrolling, and the one thing it is used for: pulling the sensor stack
 * apart as it crosses the viewport.
 *
 * Lenis and GSAP are animation tools; they move things on screen and decide
 * nothing about the image. The number they hand over (`progress`, 0..1) is the
 * only thing the renderer hears, and it is also what the "1 of 4 layers
 * separated" annotation reads.
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
 * @param {{
 *   stage: HTMLElement,
 *   onProgress: (progress: number) => void,
 * }} options
 * @returns {{ destroy: () => void, reduced: boolean }}
 */
export function createScroll({ stage, onProgress }) {
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

  const trigger = ScrollTrigger.create({
    trigger: stage,
    // Start when the stage's top reaches 85% of the viewport, finish when its
    // bottom has climbed to 25%: the whole separation happens while the stack is
    // comfortably on screen, not while it is sliding off.
    start: 'top 85%',
    end: 'bottom 25%',
    scrub: true,
    onUpdate: (self) => onProgress(self.progress),
  });

  return {
    reduced,
    destroy() {
      trigger.kill();
      gsap.ticker.remove(tick);
      lenis.destroy();
    },
  };
}
