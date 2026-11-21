import { defineConfig } from 'vite';

/**
 * Build configuration.
 *
 * `base` matters for GitHub Pages: a project site is served from
 * `https://<user>.github.io/<repo>/`, so every asset URL has to carry that prefix.
 * It is read from the environment so the same config builds for pages, for a
 * local preview, and for any other host without editing a file:
 *
 *   BASE_PATH=/the-mosaic/ npm run build     # project page
 *   BASE_PATH=/            npm run build     # user page or custom domain
 *
 * The workflow in .github/workflows/deploy.yml sets it from the repository name,
 * so renaming the repo does not silently break the deploy.
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',

  build: {
    // three.js is 531 kB and it is loaded *on demand* — the hook, the numbers and
    // the whole argument run without it (see src/main.js). Warning about it on
    // every build would train us to ignore the warning that matters, so the limit
    // is set just above it and the reason is written down here instead.
    chunkSizeWarningLimit: 600,
  },
});
