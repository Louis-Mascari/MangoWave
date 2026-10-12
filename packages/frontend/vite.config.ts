import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';

// The visualizer is a lazy chunk so the start screen does not wait for it, but nearly
// every visit needs it moments later. Preloading it lets the download run alongside the
// entry chunk instead of starting only after the entry has downloaded and run. Low
// priority, so it does not take bandwidth from what the start screen itself needs.
function preloadVisualizerChunk(): Plugin {
  return {
    name: 'mangowave:preload-visualizer',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const chunk = Object.values(ctx.bundle ?? {}).find(
          (file) => file.type === 'chunk' && file.name === 'Visualizer',
        );
        // Without the link the chunk only starts downloading after the entry has run,
        // which is a large, silent slowdown. Fail the build if the chunk is ever renamed.
        if (!chunk) {
          if (ctx.bundle) throw new Error('preloadVisualizerChunk: no chunk named "Visualizer"');
          return [];
        }
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'modulepreload',
              crossorigin: true,
              fetchpriority: 'low',
              href: `/${chunk.fileName}`,
            },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    // Workspace packages containing vendored CJS bundles — force pre-bundling
    // so Vite's dev server converts them to ESM instead of serving raw CJS.
    include: [
      'butterchurn',
      'butterchurn-presets',
      'milkdrop-preset-converter > milkdrop-preset-utils',
      'milkdrop-preset-converter > lodash',
      'milkdrop-presets',
      'milkdrop-presets/names',
      'milkdrop-textures',
    ],
  },
  worker: {
    format: 'es',
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(),
    tailwindcss(),
    preloadVisualizerChunk(),
    // Upload source maps to Sentry for readable stack traces in production.
    // No-op without SENTRY_AUTH_TOKEN — local dev and CI without secrets work fine.
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          telemetry: false,
          sourcemaps: {
            filesToDeleteAfterUpload: ['./dist/**/*.map'],
          },
        })
      : null,
  ].filter(Boolean),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
  },
  server: {
    host: true,
    allowedHosts: true,
  },
});
