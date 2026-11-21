// Take WebGL away before the page's own modules run, so the fallback is the first
// thing the page sees rather than a path it might have grown out of.
const realGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
  if (String(type).startsWith('webgl')) return null;
  return realGetContext.call(this, type, ...rest);
};
