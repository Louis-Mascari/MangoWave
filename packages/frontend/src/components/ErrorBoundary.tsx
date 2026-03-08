import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';

function ErrorFallback() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-black font-sans text-white">
      <h1 className="mb-2 text-3xl font-bold text-red-500">Something went wrong</h1>
      <p className="mb-6 opacity-60">
        A rendering error occurred — possibly a WebGL or Web Audio issue.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="cursor-pointer rounded-lg border-none bg-orange-500 px-8 py-3 text-lg font-bold text-white hover:bg-orange-400"
      >
        Reload Page
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

export function ErrorBoundary({ children }: Props) {
  return <Sentry.ErrorBoundary fallback={<ErrorFallback />}>{children}</Sentry.ErrorBoundary>;
}
