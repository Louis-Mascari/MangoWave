import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.replayIntegration()],
    // No tracing — 100% client-side app, no backend API calls to trace
    tracesSampleRate: 0,
    // Replay only on errors — stays well within 50 replays/month free tier
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
