import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

function ErrorFallback() {
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');
  const { t: ts } = useTranslation('start');

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-black font-sans text-white">
      <h1 className="mb-2 text-3xl font-bold text-red-500">{ts('somethingWentWrong')}</h1>
      <p className="mb-6 opacity-60">{t('errors.renderingError')}</p>
      <button
        onClick={() => window.location.reload()}
        className="cursor-pointer rounded-lg border-none bg-orange-500 px-8 py-3 text-lg font-bold text-white hover:bg-orange-400"
      >
        {tc('reloadPage')}
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
