import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enStart from './locales/en/start.json';
import enSettings from './locales/en/settings.json';
import enMessages from './locales/en/messages.json';

import esCommon from './locales/es/common.json';
import esStart from './locales/es/start.json';
import esSettings from './locales/es/settings.json';
import esMessages from './locales/es/messages.json';

import zhCommon from './locales/zh/common.json';
import zhStart from './locales/zh/start.json';
import zhSettings from './locales/zh/settings.json';
import zhMessages from './locales/zh/messages.json';

import hiCommon from './locales/hi/common.json';
import hiStart from './locales/hi/start.json';
import hiSettings from './locales/hi/settings.json';
import hiMessages from './locales/hi/messages.json';

import jaCommon from './locales/ja/common.json';
import jaStart from './locales/ja/start.json';
import jaSettings from './locales/ja/settings.json';
import jaMessages from './locales/ja/messages.json';

import ptBRCommon from './locales/pt-BR/common.json';
import ptBRStart from './locales/pt-BR/start.json';
import ptBRSettings from './locales/pt-BR/settings.json';
import ptBRMessages from './locales/pt-BR/messages.json';

import koCommon from './locales/ko/common.json';
import koStart from './locales/ko/start.json';
import koSettings from './locales/ko/settings.json';
import koMessages from './locales/ko/messages.json';

import ruCommon from './locales/ru/common.json';
import ruStart from './locales/ru/start.json';
import ruSettings from './locales/ru/settings.json';
import ruMessages from './locales/ru/messages.json';

import idCommon from './locales/id/common.json';
import idStart from './locales/id/start.json';
import idSettings from './locales/id/settings.json';
import idMessages from './locales/id/messages.json';

export const supportedLanguages = {
  en: 'English',
  es: 'Español',
  zh: '中文',
  hi: 'हिन्दी',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  id: 'Bahasa Indonesia',
  'pt-BR': 'Português (BR)',
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, start: enStart, settings: enSettings, messages: enMessages },
      es: { common: esCommon, start: esStart, settings: esSettings, messages: esMessages },
      zh: { common: zhCommon, start: zhStart, settings: zhSettings, messages: zhMessages },
      hi: { common: hiCommon, start: hiStart, settings: hiSettings, messages: hiMessages },
      ja: { common: jaCommon, start: jaStart, settings: jaSettings, messages: jaMessages },
      ko: { common: koCommon, start: koStart, settings: koSettings, messages: koMessages },
      ru: { common: ruCommon, start: ruStart, settings: ruSettings, messages: ruMessages },
      id: { common: idCommon, start: idStart, settings: idSettings, messages: idMessages },
      'pt-BR': {
        common: ptBRCommon,
        start: ptBRStart,
        settings: ptBRSettings,
        messages: ptBRMessages,
      },
    },
    supportedLngs: Object.keys(supportedLanguages),
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'start', 'settings', 'messages'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    // Ensure fully synchronous init — prevents useTranslation from triggering
    // extra re-renders that can restart effects in consuming components
    initAsync: false,
    react: {
      useSuspense: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mangowave-language',
      caches: ['localStorage'],
    },
  });

export default i18n;
