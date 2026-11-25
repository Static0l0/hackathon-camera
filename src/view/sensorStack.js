/**
 * The exploded sensor: a real 24 x 24 patch of the frame, pulled apart into the
 * four physical layers that sit on top of each other in a camera.
 *
 * The rule this file lives under: three.js draws, the engine decides. Every
 * number on screen comes from `slicePatch` in the worker, which cuts the window
 * out of the frame's own `exposure.electrons` — the Poisson draws the image was
 * built from. If the light slider halves the light, half as many dots appear,
 * because there really are half as many electrons. Nothing here is a decoration
 * shaped like a statistic.
 *
 * One dot is one electron by default. At bright settings that is a lot of dots,
 * so above `POINT_BUDGET` the view samples every k-th electron instead and says
 * so in the readout — it never quietly rescales the picture.
 *
 * There is no animation loop. Scroll changes one number (`spread`) and the scene
 * is redrawn then; an offscreen section costs nothing.
 */

import * as THREE from 'three';

import { mulberry32 } from '../engine/prng.js';

/** Side length of the patch, in sensor pixels. */
export const PATCH_SIZE = 24;

/**
 * How many dots to draw at most.
 *
 * A patch of a normally exposed frame holds something like 900,000 electrons. One
 * dot each would be a solid white slab: at that density a few hundred thousand
 * two-pixel dots overlap, red dots mix with green and blue dots, and the result is
 * a neutral sheet that hides the layers underneath — the one thing this view has
 * to show. It would also read as dust rather than as light, because no one can
 * pick out a point in a fog.
 *
 * So above this budget every k-th electron gets a dot, `k` is the same for every
 * pixel (so the *pattern* of density is untouched), and the readout says what `k`
 * is. The budget is set low enough that dots stay separately visible — tens per
 * cell rather than hundreds — and the sampling is stated, not hidden.
 */
const POINT_BUDGET = 18_000;

/**
 * Only these divisors are allowed, so the readout always says something a person
 * can hold in their head — "1 dot = 10 electrons", not "1 dot = 13 electrons".
 */
const STRIDE_LADDER = [1, 2, 5, 10, 20, 50, 100, 200];

/** Filter colours. These match the CSS data colours exactly, on purpose. */
const CHANNEL_COLOURS = [0xd6452f, 0x4c9a52, 0x3566c9];

/** Vertical position of each layer when the stack is closed. Units = pixels. */
const LAYER_Y = { circuitry: -0.9, photodiode: 0, filters: 1.15, microlens: 2.1, photons: 3.2 };

/** How far each layer travels when the stack is fully open. */
const EXPLODE_STEP = 2.6;

/** Layer order from the bottom up; the index drives how far a layer travels. */
const LAYER_ORDER = ['circuitry', 'photodiode', 'filters', 'microlens', 'photons'];

/**
 * @param {{ canvas: HTMLCanvasElement, readout?: HTMLElement }} options
 */
export function createSensorStack({ canvas, readout }) {
  const size = PATCH_SIZE;
  const cells = size * size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  // Looking down at the stack from the front-right, so the gaps between layers
  // are visible and the filter grid still reads as a grid. `frameCamera()` sets
  // the exact position for the current spread.

  /** @type {Record<string, THREE.Object3D>} */
  const layers = {};

  let spread = 0;
  let visible = true;
  /** Set while a patch has been received; the filter colours come from it. */
  let patch = null;

  /**
   * Centre a cell on the origin: column 0 is at -(size-1)/2, column 23 at +.
   * @param {number} index
   */
  const cell = (index) => index - (size - 1) / 2;

  /* ------------------------------------------------------------- geometry */

  /**
   * One instance per pixel, laid flat in the XZ plane.
   *
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Material} material
   * @param {(column: number, row: number) => [number, number, number]} place
   */
  function pixelGrid(geometry, material, place) {
    const mesh = new THREE.InstancedMesh(geometry, material, cells);
    const matrix = new THREE.Matrix4();

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const [x, y, z] = place(column, row);
        matrix.makeTranslation(x, y, z);
        mesh.setMatrixAt(row * size + column, matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * A comb of thin bars: `count` instances of one long geometry.
   *
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Material} material
   * @param {(index: number) => [number, number, number]} place
   */
  function comb(geometry, material, place) {
    const mesh = new THREE.InstancedMesh(geometry, material, size);
    const matrix = new THREE.Matrix4();

    for (let index = 0; index < size; index += 1) {
      const [x, y, z] = place(index);
      matrix.makeTranslation(x, y, z);
      mesh.setMatrixAt(index, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /** The four physical layers, built once because the patch size never changes. */
  function buildLayers() {
    // Circuitry: the readout wires. Two combs of thin bars, so the whole layer
    // costs two draw calls.
    const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x35352f });
    const combRows = comb(new THREE.BoxGeometry(size, 0.06, 0.14), wireMaterial, (index) => [
      0,
      0,
      cell(index),
    ]);
    const combColumns = comb(new THREE.BoxGeometry(0.14, 0.06, size), wireMaterial, (index) => [
      cell(index),
      0.01,
      0,
    ]);

    const circuitry = new THREE.Group();
    circuitry.add(combRows, combColumns);
    layers.circuitry = circuitry;

    // Photodiodes: one well per pixel, the thing that actually counts electrons.
    layers.photodiode = pixelGrid(
      new THREE.BoxGeometry(0.66, 0.5, 0.66),
      new THREE.MeshBasicMaterial({ color: 0x4a4a42 }),
      (column, row) => [cell(column), 0, cell(row)],
    );

    // Colour filters: a coloured square per pixel. This is the layer that makes
    // the point, so it gets the real data colours — set from the patch below.
    const filterGeometry = new THREE.PlaneGeometry(0.94, 0.94);
    filterGeometry.rotateX(-Math.PI / 2);

    layers.filters = pixelGrid(
      filterGeometry,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
      (column, row) => [cell(column), 0, cell(row)],
    );

    // Microlenses: a shallow dome per pixel, gathering light onto the diode
    // underneath. Its whole job is to make the pixel's dead space irrelevant —
    // which is also why the domes are smaller than their pixel: at 0.8 of a unit
    // across, the filter grid still shows between them, and a closed stack reads
    // as glass over colour rather than as a white slab.
    const lensGeometry = new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    lensGeometry.scale(1, 0.5, 1);

    layers.microlens = pixelGrid(
      lensGeometry,
      new THREE.MeshBasicMaterial({ color: 0xd8d5c6, transparent: true, opacity: 0.22 }),
      (column, row) => [cell(column), 0, cell(row)],
    );

    for (const name of LAYER_ORDER) {
      if (name !== 'photons') scene.add(layers[name]);
    }
  }

  /* -------------------------------------------------------------- photons */

  const photonGeometry = new THREE.BufferGeometry();
  photonGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  photonGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));

  const photonMaterial = new THREE.PointsMaterial({
    // Small enough that neighbouring dots stay separate where the count is low: a
    // dot you can tell apart from the next one is the whole point of counting
    // them. Bigger dots read better at a glance and worse as evidence.
    size: 1.35,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    // Normal blending, not additive. Additive looks prettier for a handful of
    // dots but hundreds of overlapping ones sum straight to white and cover the
    // layers this view exists to show. Normal blending lets the filter grid read
    // through the cloud, and dense areas become a solid colour rather than a
    // blown-out slab.
    opacity: 0.42,
    depthWrite: false,
  });

  const photons = new THREE.Points(photonGeometry, photonMaterial);
  photons.frustumCulled = false;
  layers.photons = photons;
  scene.add(photons);

  /* ---------------------------------------------------------------- input */

  /**
   * Rebuild the photon cloud from a patch of the frame.
   *
   * @param {{x: number, y: number, size: number, electrons: Float32Array, mask: Uint8Array}} next
   */
  function setPatch(next) {
    patch = next;

    const total = next.electrons.reduce((sum, value) => sum + value, 0);

    // Smallest ladder value that keeps the drawing under budget. Rounding up on
    // the ladder means we always sample *fewer* dots, never more.
    const needed = Math.max(1, total / POINT_BUDGET);
    const stride = STRIDE_LADDER.find((value) => value >= needed) ?? STRIDE_LADDER.at(-1);

    // Count first, so the buffers are allocated once at the right size.
    let dots = 0;
    for (let i = 0; i < next.electrons.length; i += 1) dots += Math.round(next.electrons[i] / stride);
    dots = Math.min(dots, POINT_BUDGET * 2);

    const positions = new Float32Array(dots * 3);
    const colours = new Float32Array(dots * 3);
    // A fixed seed: the same frame must produce the same picture, or "computed
    // from your inputs" would not be true twice in a row.
    const rand = mulberry32(0x5eed);

    let cursor = 0;
    for (let i = 0; i < next.electrons.length; i += 1) {
      const count = Math.round(next.electrons[i] / stride);
      const x = cell(i % next.size);
      const z = cell(Math.floor(i / next.size));
      const colour = CHANNEL_COLOURS[next.mask[i]] ?? 0xffffff;

      for (let d = 0; d < count && cursor < dots; d += 1) {
        positions[cursor * 3] = x + (rand() - 0.5) * 0.82;
        // Thin sheet. A deep cloud stacks its own rows behind each other in
        // projection and turns into fog; two tenths of a cell is enough to look
        // three-dimensional and little enough to keep the dots apart.
        positions[cursor * 3 + 1] = (rand() - 0.5) * 0.34;
        positions[cursor * 3 + 2] = z + (rand() - 0.5) * 0.82;
        colours[cursor * 3] = ((colour >> 16) & 0xff) / 255;
        colours[cursor * 3 + 1] = ((colour >> 8) & 0xff) / 255;
        colours[cursor * 3 + 2] = (colour & 0xff) / 255;
        cursor += 1;
      }
    }

    photonGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    photonGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    photonGeometry.setDrawRange(0, cursor);

    tintFilters(next.mask);
    describe(next, total, stride, cursor);
    render();
  }

  /**
   * Colour the filter layer from the patch's mask, so what is on screen is this
   * frame's real pattern rather than an idealised RGGB diagram.
   *
   * @param {Uint8Array} mask
   */
  function tintFilters(mask) {
    if (!mask) return;
    const colour = new THREE.Color();
    const filters = layers.filters;

    for (let i = 0; i < mask.length; i += 1) {
      filters.setColorAt(i, colour.setHex(CHANNEL_COLOURS[mask[i]] ?? 0xffffff));
    }
    if (filters.instanceColor) filters.instanceColor.needsUpdate = true;
  }

  /**
   * @param {object} next
   * @param {number} total electrons summed over the patch
   * @param {number} stride electrons per dot
   * @param {number} drawn dots actually drawn
   */
  function describe(next, total, stride, drawn) {
    if (!readout) return;
    const perDot = stride > 1 ? `1 dot = ${stride} electrons` : '1 dot = 1 electron';
    readout.textContent =
      `rows ${next.y}–${next.y + next.size - 1} · cols ${next.x}–${next.x + next.size - 1}` +
      ` · ${Math.round(total).toLocaleString('en-US')} electrons collected in this patch` +
      ` · ${drawn.toLocaleString('en-US')} dots, ${perDot}`;
  }

  /* --------------------------------------------------------------- layout */

  /**
   * @param {number} value 0 = the layers sit on top of each other, 1 = fully apart
   */
  function setSpread(value) {
    spread = Math.min(1, Math.max(0, value));

    for (let index = 0; index < LAYER_ORDER.length; index += 1) {
      const name = LAYER_ORDER[index];
      const layer = layers[name];
      if (!layer) continue;
      layer.position.y = LAYER_Y[name] + spread * EXPLODE_STEP * index;
    }

    // A closed stack is a solid object: the dots sit inside it and cover the
    // layers. Fade them in as the layers part, so the section opens on the
    // hardware and the electrons arrive when there is somewhere for them to be.
    // The counts in the readout are unaffected.
    photonMaterial.opacity = 0.42 * Math.min(1, Math.max(0, (spread - 0.04) / 0.3));

    frameCamera();
    render();
  }

  /**
   * Point the camera so the whole open stack fills the plate without spilling
   * past its edges, at any canvas shape.
   *
   * The extent is built from the layer coordinates, not by walking the scene
   * graph: an instanced sheet reports the bounds of one tile rather than of the
   * 24 × 24 array it is drawn across, so a graph walk would frame a speck.
   */
  function frameCamera() {
    const open = spread * EXPLODE_STEP * (LAYER_ORDER.length - 1);
    const half = size / 2;

    const box = new THREE.Box3(
      new THREE.Vector3(-half, LAYER_Y.circuitry - 0.6, -half),
      new THREE.Vector3(half, LAYER_Y.photons + open + 1.0, half),
    );
    const target = box.getCenter(new THREE.Vector3());

    const corners = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    // The camera drops as the layers part: looked at from high above, the gaps
    // between the layers project on top of each other and the exploded stack
    // reads as one pile. From a lower angle the gaps open up across the screen.
    const elevation = 0.74 - 0.36 * spread;
    // Corner-on rather than face-on: a 24 × 24 sheet seen square projects as a
    // narrow band across a wide plate, while a diamond fills it.
    const direction = new THREE.Vector3(0.8, elevation, 0.8).normalize();

    const ndc = new THREE.Vector3();
    const place = (distance) => {
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
    };

    // How far outside the frame the worst corner sits (1 means just inside).
    const overflow = (distance) => {
      place(distance);
      let worst = 0;
      for (const corner of corners) {
        ndc.copy(corner).project(camera);
        worst = Math.max(worst, Math.abs(ndc.x) / 0.95, Math.abs(ndc.y) / 0.9);
      }
      return worst;
    };

    // Projection size is close to inversely proportional to distance, so
    // multiplying by the overflow converges in two or three passes.
    let distance = size * 2;
    for (let pass = 0; pass < 4; pass += 1) {
      distance *= Math.min(1.8, Math.max(0.6, overflow(distance)));
    }

    // Centre what is on screen rather than what is in the box: with the camera
    // off to one side the near corner of the array is magnified and the whole
    // composition drifts up and right. Pan the aim by the projected offset, then
    // fit once more so the pan cannot push a corner out again.
    place(distance);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      ndc.copy(corner).project(camera);
      minX = Math.min(minX, ndc.x);
      maxX = Math.max(maxX, ndc.x);
      minY = Math.min(minY, ndc.y);
      maxY = Math.max(maxY, ndc.y);
    }

    const halfHeight = distance * Math.tan((camera.fov * Math.PI) / 360);
    const halfWidth = halfHeight * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, ((minX + maxX) / 2) * halfWidth);
    target.addScaledVector(up, ((minY + maxY) / 2) * halfHeight);

    for (let pass = 0; pass < 3; pass += 1) {
      distance *= Math.min(1.8, Math.max(0.6, overflow(distance)));
    }

    place(distance);
    camera.updateProjectionMatrix();
  }

  function render() {
    if (!visible) return;
    renderer.render(scene, camera);
  }

  /** Keep the projection and the drawing buffer matched to the CSS box. */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // The framing depends on the aspect ratio, so a resize has to re-frame.
    frameCamera();
    render();
  }

  const resizeObserver = new ResizeObserver(resize);

  // Drawing an offscreen canvas wastes a phone's battery. The stack is only
  // redrawn when it is on screen and something changed.
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) render();
    },
    { rootMargin: '120px' },
  );

  buildLayers();
  setSpread(0);
  resize();
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);

  // Dev only: the screenshot harness inspects the scene through this, layer by
  // layer, which is the only way to prove each one is where it claims to be.
  // Stripped from a production build by Vite's dead-code elimination.
  if (import.meta.env.DEV) {
    /** @type {any} */ (window).__stack = {
      scene,
      camera,
      renderer,
      layers,
      setSpread,
      getSpread: () => spread,
      setPatch,
    };
  }

  return {
    setPatch,
    setSpread,
    getSpread: () => spread,
    getPatch: () => patch,
    dispose() {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      photonGeometry.dispose();
      photonMaterial.dispose();
      renderer.dispose();
    },
  };
}
