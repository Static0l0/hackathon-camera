document.getElementById('guess').scrollIntoView({ block: 'start', behavior: 'instant' });
await new Promise((resolve) => setTimeout(resolve, 700));
return {
  scrollY: Math.round(window.scrollY),
  top: Math.round(document.getElementById('guess').getBoundingClientRect().top),
};
