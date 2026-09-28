'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from 'react';
const LocaleContext = createContext({
    locale: 'de', setLocale: () => { },
});
export function LocaleProvider({ children }) {
    const [locale, setLocale] = useState('de');
    useEffect(() => {
        const saved = localStorage.getItem('portal-locale');
        if (saved === 'en' || saved === 'de')
            setLocale(saved);
    }, []);
    useEffect(() => {
        document.documentElement.lang = locale;
        localStorage.setItem('portal-locale', locale);
    }, [locale]);
    return _jsx(LocaleContext.Provider, { value: { locale, setLocale }, children: children });
}
export function useLocale() { return useContext(LocaleContext); }
