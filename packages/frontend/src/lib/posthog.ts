import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string) || 'https://us.i.posthog.com';

export function initPostHog(): void {
  if (!import.meta.env.PROD) return;
  if (!POSTHOG_KEY) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    disable_session_recording: false,
    session_recording: {
      maskTextSelector: '[data-ph-mask], [data-ph-mask-filenames]',
      maskTextFn: (text: string, element?: HTMLElement) => {
        if (element?.hasAttribute?.('data-ph-mask-filenames')) {
          let masked = text;
          const maskValue = element.getAttribute('data-ph-mask-value');
          if (maskValue) {
            masked = masked.replace(maskValue, '*'.repeat(maskValue.length));
          }
          return masked.replace(
            /[\w\s\-().]+\.(mp3|wav|flac|aac|ogg|oga|opus|weba|webm|m4a|m4b|3gp)\b/gi,
            (match, ext: string) => '*'.repeat(match.length - ext.length - 1) + '.' + ext,
          );
        }
        return '*'.repeat(text.length);
      },
    },
  });
}
