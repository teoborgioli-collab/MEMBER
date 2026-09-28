'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Locale } from '../lib/i18n';

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: 'de', setLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('de');
  useEffect(() => {
    const saved = localStorage.getItem('portal-locale');
    if (saved === 'en' || saved === 'de') setLocale(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem('portal-locale', locale);
  }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() { return useContext(LocaleContext); }
