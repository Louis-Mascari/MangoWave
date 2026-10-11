import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

const SENSITIVE_KEY_PARTS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

export function initSentry(): void {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    // No tracing — 100% client-side app, no backend API calls to trace
    tracesSampleRate: 0,
    // Sentry 11 collects user IP, cookies and request/response bodies unless told
    // otherwise. Pin every category that got looser to the restrictive v10 default.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: SENSITIVE_KEY_PARTS },
        response: { deny: SENSITIVE_KEY_PARTS },
      },
      httpBodies: [],
      urlQueryParams: { deny: SENSITIVE_KEY_PARTS },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
  });
}
