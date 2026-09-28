'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Intro from './Intro';
import MembershipForm from './MembershipForm';
import { EN_INTRO } from '../lib/i18n';
import { useLocale } from './LocaleProvider';
export default function PublicPortal({ intro, config }) {
    const { locale } = useLocale();
    const localizedIntro = locale === 'en' ? { ...intro, ...EN_INTRO } : intro;
    return _jsxs("main", { className: "portal", children: [_jsx(Intro, { t: localizedIntro }), _jsx(MembershipForm, { config: config, locale: locale })] });
}
