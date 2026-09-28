'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment } from 'react';
import { useLocale } from './LocaleProvider';
import { usePathname } from 'next/navigation';
import { UI } from '../lib/i18n';
/** Renders line breaks. The space before <br> keeps words apart where CSS hides the break. */
export function Lines({ text }) {
    return _jsx(_Fragment, { children: text.split('\n').map((line, i) => _jsxs(Fragment, { children: [i > 0 && _jsxs(_Fragment, { children: [' ', _jsx("br", {})] }), line] }, i)) });
}
const previewLink = { target: '_blank', rel: 'noreferrer' };
export function SiteHeader({ clubName, headerNote, preview = false }) {
    const { locale, setLocale } = useLocale();
    const pathname = usePathname();
    const shownLocale = pathname.startsWith('/admin') ? 'de' : locale;
    const ui = UI[shownLocale];
    return _jsxs("header", { className: "header", children: [_jsxs("a", { className: "brand", href: "/", ...(preview ? previewLink : {}), children: [_jsx("span", { className: "brand-icon", "aria-hidden": "true", children: "M" }), _jsxs("span", { children: [clubName || (shownLocale === 'en' ? 'Our Association' : 'Unser Verein'), _jsx("small", { children: ui.portal })] })] }), _jsxs("div", { className: "header-actions", children: [headerNote && _jsx("span", { className: "header-note", children: headerNote }), !pathname.startsWith('/admin') && _jsxs("div", { className: "locale-switch", role: "group", "aria-label": "Language / Sprache", children: [_jsx("button", { type: "button", className: locale === 'de' ? 'active' : '', onClick: () => setLocale('de'), children: "DE" }), _jsx("button", { type: "button", className: locale === 'en' ? 'active' : '', onClick: () => setLocale('en'), children: "EN" })] })] })] });
}
export function SiteFooter({ footerNote, privacyUrl, imprintUrl, preview = false }) {
    const { locale } = useLocale();
    const pathname = usePathname();
    const shownLocale = pathname.startsWith('/admin') ? 'de' : locale;
    const ui = UI[shownLocale];
    const extra = preview ? previewLink : {};
    return _jsxs("footer", { children: [_jsx("span", { children: shownLocale === 'en' ? 'Membership. Simply organised.' : footerNote }), _jsxs("nav", { "aria-label": shownLocale === 'en' ? 'Legal and administration' : 'Rechtliches und Verwaltung', children: [_jsx("a", { href: privacyUrl || '/documents', ...extra, children: ui.privacy }), _jsx("a", { href: imprintUrl || '/documents', ...extra, children: ui.imprint }), _jsx("a", { href: "/admin", ...extra, children: ui.admin })] })] });
}
