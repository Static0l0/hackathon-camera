// Jump straight to the last section — the case that used to leave a heading
// masked — then wait for the tween to finish and read the transforms back.
document.getElementById('lab').scrollIntoView({ block: 'start' });
await new Promise((resolve) => setTimeout(resolve, 1400));

const heading = document.querySelector('#lab [data-reveal]');
const lines = [...heading.querySelectorAll('div, span')].filter((element) =>
  element.style.transform,
);

return {
  text: heading.textContent.trim().slice(0, 40),
  lines: lines.map((element) => ({
    tag: element.tagName,
    transform: element.style.transform,
  })),
  revealVisible: getComputedStyle(heading).opacity,
};
