'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { dictionaries, type Locale, type Dictionary } from './dictionaries';

interface I18nContextType {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'ko',
  t: dictionaries.ko,
  setLocale: () => {},
});

export function I18nProvider({
  children,
  defaultLocale = 'ko',
}: {
  children: React.ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
  }, []);

  return (
    <I18nContext value={{ locale, t: dictionaries[locale] as Dictionary, setLocale }}>
      {children}
    </I18nContext>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

// 서버 컴포넌트용: locale에 따라 딕셔너리 반환
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

// 역할에 따른 기본 locale 결정
export function getDefaultLocale(role?: string): Locale {
  if (role === 'buyer') return 'en';
  return 'ko';
}
