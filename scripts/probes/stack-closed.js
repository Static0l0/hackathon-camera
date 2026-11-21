// Capture the stack in its closed state: sit just before the section's trigger
// point so the layers are still stacked, then report the spread.
window.scrollTo(0, 0);
await new Promise((resolve) => setTimeout(resolve, 700));
return { spread: document.getElementById('stack-stage')?.dataset.spread };
