// Scroll the sensor stack into the middle of the viewport so ScrollTrigger gets a
// chance to separate the layers, then report how far apart they actually are.
const stage = document.getElementById('stack-stage');
const top = stage.getBoundingClientRect().top + window.scrollY;
window.scrollTo(0, Math.round(top - window.innerHeight * 0.25));
await new Promise((resolve) => setTimeout(resolve, 900));
return {
  spread: stage.dataset.spread,
  scrollY: Math.round(window.scrollY),
  readout: document.getElementById('stack-readout').textContent,
};
