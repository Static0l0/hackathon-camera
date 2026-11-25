/**
 * The WebGL (three.js) painter for the split viewer.
 *
 * three.js is presentation only here: the pixels it shows were computed by
 * `src/engine`, uploaded as raw bytes, and drawn with a nearest-neighbour
 * filter so a 384 px frame stays crisp when it is stretched across the page.
 * Nothing in this file does any colour maths — the shader's entire job is to
 * pick one of two textures per pixel, which is exactly what the draggable
 * divider asks for.
 *
 * Two uploads share one quad and one draw call: the sensor's mosaic and the
 * developed photograph. The divider is a single uniform, so dragging it costs
 * one uniform write and one frame, not a re-upload.
 *
 * There is no animation loop. The scene is static, so it renders when something
 * changes (new frame, divider moved, resize) and otherwise costs nothing — the
 * "pause when offscreen" requirement falls out of that for free.
 */

import * as THREE from 'three';

/**
 * The vertex shader only passes the plane's own UVs through. PlaneGeometry gives
 * us uv (0,0) at the bottom left and (1,1) at the top right.
 */
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The fragment shader picks a texture by the divider's position.
 *
 * `1.0 - vUv.y` flips the vertical axis because a DataTexture's first row is the
 * top row of the image, while the plane's v = 0 is its bottom edge.
 *
 * The bytes are already sRGB-encoded (the engine did the gamma), so the shader
 * writes them out untouched: no colour-space conversion is applied on the way
 * out, and none should be.
 */
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMosaic;
  uniform sampler2D uDeveloped;
  uniform float uSplit;

  varying vec2 vUv;

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec3 colour = uv.x < uSplit
      ? texture2D(uMosaic, uv).rgb
      : texture2D(uDeveloped, uv).rgb;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/**
 * @param {{ container: HTMLElement, groundColour?: number }} options
 * @throws if a WebGL context cannot be created, so the caller can fall back
 */
export function createThreePainter({ container, groundColour = 0x17150f }) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });

  // Cap the device pixel ratio: a 3x phone screen would quadruple the fill cost
  // for detail nobody can see on a nearest-filtered image.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(groundColour, 1);

  // The engine hands over sRGB bytes and the shader passes them through, so the
  // renderer must not apply an output transform on top of them.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.domElement.classList.add('viewer-webgl');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);

  const uniforms = {
    uMosaic: { value: null },
    uDeveloped: { value: null },
    uSplit: { value: 0.5 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  scene.add(quad);

  /** @type {object|null} */
  let frame = null;

  /**
   * Wrap RGBA bytes as a texture that never blurs. Reuses the GPU texture when
   * the dimensions have not changed, because the worker sends a new buffer per
   * frame and re-uploading is cheaper than reallocating.
   *
   * @param {THREE.DataTexture|null} texture
   * @param {Uint8ClampedArray} bytes
   * @param {number} width
   * @param {number} height
   * @returns {THREE.DataTexture}
   */
  function upload(texture, bytes, width, height) {
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (texture && texture.image.width === width && texture.image.height === height) {
      texture.image.data = data;
      texture.needsUpdate = true;
      return texture;
    }

    if (texture) texture.dispose();

    const next = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    // The whole point of the viewer: one texel is one sensor pixel, and it stays
    // a square of colour however far you zoom in.
    next.magFilter = THREE.NearestFilter;
    next.minFilter = THREE.NearestFilter;
    next.generateMipmaps = false;
    next.colorSpace = THREE.NoColorSpace;
    next.needsUpdate = true;
    return next;
  }

  /**
   * Match the camera and the quad to the container's box, letterboxing the image
   * inside it. Called on every resize because a canvas that keeps its old width
   * after a rotation looks broken.
   */
  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    renderer.setSize(width, height, false);

    const viewAspect = width / height;
    camera.left = -viewAspect / 2;
    camera.right = viewAspect / 2;
    camera.top = 0.5;
    camera.bottom = -0.5;
    camera.updateProjectionMatrix();

    if (frame) scaleQuad(viewAspect, frame.width / frame.height);
  }

  /**
   * Fit the image inside the view without distorting it.
   *
   * @param {number} viewAspect
   * @param {number} imageAspect
   */
  function scaleQuad(viewAspect, imageAspect) {
    const width = imageAspect >= viewAspect ? viewAspect : imageAspect;
    const height = imageAspect >= viewAspect ? viewAspect / imageAspect : 1;
    quad.scale.set(width, height, 1);
  }

  /** Draw once. There is no loop: nothing here animates. */
  function paint() {
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    paint();
  });
  resizeObserver.observe(container);

  resize();

  return {
    kind: 'webgl',

    setFrame(nextFrame) {
      frame = nextFrame;
      uniforms.uMosaic.value = upload(uniforms.uMosaic.value, nextFrame.mosaicView, nextFrame.width, nextFrame.height);
      uniforms.uDeveloped.value = upload(uniforms.uDeveloped.value, nextFrame.display, nextFrame.width, nextFrame.height);
      scaleQuad(container.clientWidth / Math.max(1, container.clientHeight), nextFrame.width / nextFrame.height);
      paint();
    },

    /**
     * @param {number} percent 0..100
     */
    setSplit(percent) {
      uniforms.uSplit.value = Math.min(1, Math.max(0, percent / 100));
      paint();
    },

    paint,

    dispose() {
      resizeObserver.disconnect();
      uniforms.uMosaic.value?.dispose();
      uniforms.uDeveloped.value?.dispose();
      quad.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      frame = null;
    },
  };
}
