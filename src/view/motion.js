/**
 * Motion, kept to what carries meaning.
 *
 * Two jobs only:
 *   1. headings arrive line by line as they enter the viewport — the same
 *      gesture a lab notebook makes when you turn to a new page;
 *   2. a number that changed gets a brief settle, so the eye knows which figures
 *      moved rather than having to diff the whole strip.
 *
 * Nothing floats, nothing parallaxes for its own sake, and nothing animates a
 * value that is not already true. Under `prefers-reduced-motion` both jobs are
 * skipped entirely: the headings are simply present and the numbers simply
 * change, because the motion is the delivery, not the content.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Duration and ease are shared so the page has one sense of timing. */
const REVEAL_DURATION = 0.7;
const REVEAL_STAGGER = 0.055;
const EASE_OUT = 'power3.out';

/**
 * @returns {{
 *   reduced: boolean,
 *   reveal: (elements: HTMLElement[]) => void,
 *   settle: (element: HTMLElement) => void,
 * }}
 */
export function createMotion() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * @param {HTMLElement[]} elements
   */
  function reveal(elements) {
    if (reduced) return;

    // Wait for the webfont: SplitText measures line boxes, and a fallback face
    // has different metrics, so splitting early would break lines in the wrong
    // place and leave orphans after the font swapped in.
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready.then(() => {
      for (const element of elements) {
        try {
          const split = new SplitText(element, { type: 'lines', mask: 'lines' });
          const tween = gsap.fromTo(
            split.lines,
            { yPercent: 108 },
            {
              yPercent: 0,
              duration: REVEAL_DURATION,
              ease: EASE_OUT,
              stagger: REVEAL_STAGGER,
              paused: true,
            },
          );

          let played = false;
          const play = () => {
            if (played) return;
            played = true;
            tween.play();
          };

          ScrollTrigger.create({
            trigger: element,
            start: 'top 88%',
            once: true,
            onEnter: play,
          });

          // A jump — a hash link, restored scroll position, a very fast flick —
          // can cross a trigger without it ever being evaluated, and a masked
          // heading that never animates is simply invisible. IntersectionObserver
          // does not care how the element arrived, so it plays the same tween as
          // a backstop. One tween, one guard: the line can only arrive once.
          const observer = new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                play();
                observer.disconnect();
              }
            },
            { rootMargin: '0px 0px -12% 0px' },
          );
          observer.observe(element);

          // Whatever is on screen when the page opens should just be there.
          if (element.getBoundingClientRect().top < window.innerHeight * 0.88) play();
        } catch {
          // A heading that cannot be split must still be readable, so a failure
          // here leaves the element exactly as the browser laid it out.
        }
      }

      // Layout keeps moving after this point — the fonts swap in, the sensor
      // stack measures its canvas — and a trigger whose start position was
      // measured before that shift can leave a heading masked for good. One
      // refresh once the page has settled removes that failure mode.
      window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
      window.setTimeout(() => ScrollTrigger.refresh(), 800);
    });
  }

  /**
   * @param {HTMLElement | null} element
   */
  function settle(element) {
    if (reduced || !element) return;
    gsap.fromTo(
      element,
      { opacity: 0.35 },
      { opacity: 1, duration: 0.36, ease: 'power2.out', overwrite: true },
    );
  }

  return { reduced, reveal, settle };
}
