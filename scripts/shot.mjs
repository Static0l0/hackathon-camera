/**
 * A dev-only headless browser harness, built on the Chrome DevTools Protocol.
 *
 * Why it exists: this page renders inside a worker and draws on canvas, so
 * "does it work" cannot be answered by looking at the HTML. This script opens
 * the page in a real Chromium, waits for a JavaScript condition that only
 * becomes true once a frame has actually been drawn, screenshots the result, and
 * prints every console message and exception. It is the difference between
 * guessing and knowing.
 *
 * It uses only what Node 22 already provides (`fetch` and a global `WebSocket`),
 * so it adds no dependency to the project.
 *
 * Usage:
 *   node scripts/shot.mjs --out=shot.png
 *   node scripts/shot.mjs --wait="document.querySelector('#readouts-grid dd').textContent.length > 0"
 *   node scripts/shot.mjs --click=640,420 --out=explain.png --after=1200
 *
 * Flags:
 *   --url     page to open            (default http://127.0.0.1:5173/)
 *   --out     png path                (default shot.png)
 *   --wait    JS expression polled for truthiness before capturing
 *   --click   "x,y" in CSS pixels, dispatched as a real mouse click
 *   --click-el  selector: click the centre of that element instead of x,y
 *   --hover-el  selector: move the mouse to that element's centre and leave it there
 *   --hover-offset "x,y"  nudge the hover point, e.g. to reach a particular pixel
 *   --after   ms to wait after the click  (default 600)
 *   --setup   expression run before any interaction, e.g. to change a control
 *   --drag    "x1,y1,x2,y2": press, move, release — tests the divider wipe
 *   --eval    expression to evaluate last and print; use it to assert on state
 *   --script  async page script, awaited; use it to drive several interactions,
 *             whose result is printed (and can be a list of assertions)
 *   --script-file  same, read from a file — the reliable form for multi-line code
 *   --width   viewport width in CSS pixels  (default 1280)
 *   --height  viewport height in CSS pixels (default 900)
 *   --full    capture the whole document, not just the viewport
 *   --clip    selector: capture just that element (scrolled into view first)
 *   --scale   device scale for --clip / --full captures (default 1)
 *   --timeout ms to wait for --wait      (default 20000)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const flags = parseFlags(process.argv.slice(2));
const port = 9333;

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserPath = process.env.BROWSER_PATH ?? BROWSERS.find((candidate) => exists(candidate));
if (!browserPath) {
  console.error('No Chromium browser found. Set BROWSER_PATH.');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'mosaic-shot-'));
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let socket;
const pending = new Map();
let nextId = 1;
const consoleLines = [];

try {
  const target = await waitForTarget(port, 15000);
  socket = await connect(target.webSocketDebuggerUrl);

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const text = message.params.args
        .map((argument) => argument.value ?? argument.description ?? argument.type)
        .join(' ');
      consoleLines.push(`[${message.params.type}] ${text}`);
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      consoleLines.push(
        `[exception] ${details.exception?.description ?? details.text}`,
      );
    }

    if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      consoleLines.push(`[${entry.level}] ${entry.text} ${entry.url ?? ''}`);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(flags.width ?? 1280),
    height: Number(flags.height ?? 900),
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Accessibility checks need to be able to ask the page what it does when the
  // visitor has turned motion off, and the only honest way to ask is to tell the
  // browser to report the media query as true.
  if (flags.media) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: String(flags.media) }],
    });
  }

  // Fallback paths can only be tested by taking the capability away before the
  // page's own modules run, which means injecting on the new document rather than
  // after load.
  if (flags['pre-script-file'] || flags['pre-script']) {
    const source = flags['pre-script-file']
      ? readFileSync(String(flags['pre-script-file']), 'utf8')
      : String(flags['pre-script']);
    await send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  await send('Page.navigate', { url: flags.url ?? 'http://127.0.0.1:5173/' });
  await waitForLoad();

  if (flags.wait) {
    const ok = await poll(flags.wait, Number(flags.timeout ?? 20000));
    if (!ok) consoleLines.push(`[harness] --wait never became true: ${flags.wait}`);
  }

  if (flags.setup) {
    const value = await evaluate(String(flags.setup));
    console.log(`setup => ${JSON.stringify(value)}`);
    // Controls coalesce frames, so give the worker time to answer with the new
    // settings before anything is clicked or captured.
    await sleep(Number(flags['setup-wait'] ?? 1200));
  }

  if (flags['hover-el']) {
    const point = await centreOf(String(flags['hover-el']), flags['hover-offset']);
    await move(point.x, point.y);
    await sleep(400);
  }

  if (flags.click || flags['click-el']) {
    const point = flags['click-el']
      ? await centreOf(String(flags['click-el']), flags['click-offset'])
      : (() => {
          const [x, y] = String(flags.click).split(',').map(Number);
          return { x, y };
        })();
    await click(point.x, point.y);
    await sleep(Number(flags.after ?? 600));
  }

  if (flags.drag) {
    const [x1, y1, x2, y2] = String(flags.drag).split(',').map(Number);
    await drag(x1, y1, x2, y2);
    await sleep(Number(flags.after ?? 400));
  }

  if (flags.eval) {
    const value = await evaluate(String(flags.eval));
    console.log(`eval ${flags.eval} => ${JSON.stringify(value)}`);
  }

  const pageScript = flags['script-file']
    ? readFileSync(String(flags['script-file']), 'utf8')
    : flags.script;

  if (pageScript) {
    const result = await send('Runtime.evaluate', {
      expression: `(async () => { ${pageScript} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      console.log(`script threw: ${result.exceptionDetails.exception?.description}`);
    } else {
      console.log(`script => ${JSON.stringify(result.result?.value, null, 2)}`);
    }
  }

  const shot = await capture(Boolean(flags.full), flags.clip, Number(flags.scale ?? 1));
  writeFileSync(flags.out ?? 'shot.png', Buffer.from(shot.data, 'base64'));
  console.log(`saved ${flags.out ?? 'shot.png'}`);
} catch (error) {
  console.error(`harness failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (consoleLines.length > 0) {
    console.log('--- console ---');
    for (const line of consoleLines) console.log(line);
  }
  socket?.close();
  browser.kill();
  // The profile directory holds locked files for a moment after the process
  // dies; a failed cleanup must not turn a good capture into a failed run.
  await sleep(400);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Windows keeps a handle briefly; the OS cleans temp up later.
  }
}

/* ------------------------------------------------------------------ bits -- */

/**
 * @param {string[]} argv
 * @returns {Record<string, string|boolean>}
 */
function parseFlags(argv) {
  const result = {};
  for (const argument of argv) {
    const match = argument.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) continue;
    result[match[1]] = match[2] ?? true;
  }
  return result;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function exists(path) {
  return existsSync(path);
}

/**
 * The DevTools endpoint comes up a moment after the process starts, so retry
 * rather than sleep a fixed amount.
 *
 * @param {number} port
 * @param {number} timeout
 */
async function waitForTarget(port, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // not listening yet
    }
    await sleep(120);
  }
  throw new Error('DevTools endpoint never appeared');
}

/**
 * @param {string} url
 * @returns {Promise<WebSocket>}
 */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('websocket failed')));
  });
}

/**
 * @param {string} method
 * @param {object} [params]
 * @returns {Promise<any>}
 */
function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

/** Wait for the load event, or give up after a few seconds and let --wait decide. */
async function waitForLoad() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const state = await evaluate('document.readyState');
    if (state === 'complete') return;
    await sleep(100);
  }
}

/**
 * @param {string} expression
 * @returns {Promise<any>}
 */
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  return result.result?.value;
}

/**
 * @param {string} expression
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
async function poll(expression, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(150);
  }
  return false;
}

/**
 * Dispatch a press and a release at the same point: a real click as far as the
 * page's pointer handlers are concerned.
 *
 * @param {number} x
 * @param {number} y
 */
async function click(x, y) {
  const base = { x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' };
  await send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' });
  await send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
}

/**
 * Press, move in steps (a pointer handler that only sees the endpoints would
 * still work, but stepping is what a hand does), release.
 *
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 */
async function drag(x1, y1, x2, y2) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x1,
    y: y1,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
  });

  const steps = 8;
  for (let step = 1; step <= steps; step += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x1 + ((x2 - x1) * step) / steps,
      y: y1 + ((y2 - y1) * step) / steps,
      button: 'left',
      buttons: 1,
      pointerType: 'mouse',
    });
    await sleep(16);
  }

  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x2,
    y: y2,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
  });
}

/**
 * A pointer move with no button held: this is what makes the page's hover
 * handlers fire, and the loupe is entirely a hover behaviour.
 *
 * @param {number} x
 * @param {number} y
 */
async function move(x, y) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });
}

/**
 * Centre of an element in CSS pixels, optionally nudged, so a test can aim at a
 * specific part of the page without hard-coding coordinates that break the
 * moment the layout moves.
 *
 * @param {string} selector
 * @param {string|boolean|undefined} offset "dx,dy"
 * @returns {Promise<{x: number, y: number}>}
 */
async function centreOf(selector, offset) {
  const rect = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);

  if (!rect) throw new Error(`no element for ${selector}`);

  if (typeof offset === 'string') {
    const [dx, dy] = offset.split(',').map(Number);
    return { x: rect.x + dx, y: rect.y + dy };
  }

  return rect;
}

/**
 * @param {boolean} full
 * @param {string|boolean|undefined} clipSelector
 * @param {number} scale
 * @returns {Promise<{data: string}>}
 */
async function capture(full, clipSelector, scale) {
  if (typeof clipSelector === 'string') {
    // Scroll first, measure second: a rect taken in the same tick as the scroll
    // still describes the old position.
    await evaluate(
      `document.querySelector(${JSON.stringify(clipSelector)})` +
        `?.scrollIntoView({ block: 'center' })`,
    );
    await sleep(320);
    const rect = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(clipSelector)});
      if (!element) return null;
      const box = element.getBoundingClientRect();
      // The clip is in page coordinates, not viewport coordinates, so the
      // scroll offset has to be added or a scrolled-to element captures blank.
      return {
        x: box.x + window.scrollX,
        y: box.y + window.scrollY,
        width: box.width,
        height: box.height,
      };
    })()`);

    if (!rect) throw new Error(`no element for ${clipSelector}`);

    return send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...rect, scale },
    });
  }

  if (!full) return send('Page.captureScreenshot', { format: 'png', clip: undefined });

  const metrics = await send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize;
  return send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale },
  });
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
