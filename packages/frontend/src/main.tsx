import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initPostHog } from './lib/posthog.ts';
import { initSentry } from './lib/sentry.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import App from './App.tsx';

initSentry();
initPostHog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
