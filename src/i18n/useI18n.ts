import { useContext, createContext } from 'react';
import { translations, type Locale, type TranslationKeys } from './translations';

export type I18nContext = {
  locale: Locale;
  t: TranslationKeys;
  dir: 'ltr' | 'rtl';
};

export const I18nCtx = createContext<I18nContext>({
  locale: 'en',
  t: translations.en,
  dir: 'ltr',
});

export function useI18n(): I18nContext {
  return useContext(I18nCtx);
}

export function getI18nForLocale(locale: Locale): I18nContext {
  return {
    locale,
    t: translations[locale],
    dir: locale === 'he' ? 'rtl' : 'ltr',
  };
}
