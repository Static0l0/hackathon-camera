/**
 * The theme switch.
 *
 * Dark is the default because this page is read at night, beside the screen it
 * is about; the paper version is one click away and the choice survives a reload.
 * The attribute is set by an inline script in the document head, before the first
 * paint, so this module only has to keep the button and the storage in step.
 */

const STORAGE_KEY = 'mosaic-theme';

/** @returns {'light' | 'dark'} */
export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * @param {'light' | 'dark'} theme
 * @param {{ persist?: boolean }} [options]
 */
export function setTheme(theme, { persist = true } = {}) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;

  if (!persist) return;

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the switch still works for this visit.
  }
}

/**
 * Wire the masthead switch. `onChange` runs after the attribute has moved, so a
 * caller can repaint whatever canvas was drawn in the old colours.
 *
 * @param {{ button: HTMLButtonElement, onChange?: (theme: 'light' | 'dark') => void }} options
 */
export function createThemeToggle({ button, onChange }) {
  const sync = () => {
    button.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
    button.title = currentTheme() === 'dark' ? 'Dark theme on' : 'Dark theme off';
  };

  sync();

  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    sync();
    onChange?.(next);
  });

  return { sync };
}
