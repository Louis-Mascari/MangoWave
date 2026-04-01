import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    // Workspace packages containing vendored CJS bundles — force pre-bundling
    // so Vite's dev server converts them to ESM instead of serving raw CJS.
    include: [
      'butterchurn',
      'butterchurn-presets',
      'milkdrop-preset-converter > milkdrop-preset-utils',
      'milkdrop-eel-parser',
      'milkdrop-preset-converter > lodash',
    ],
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(),
    tailwindcss(),
    // Upload source maps to Sentry for readable stack traces in production.
    // No-op without SENTRY_AUTH_TOKEN — local dev and CI without secrets work fine.
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
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
});
