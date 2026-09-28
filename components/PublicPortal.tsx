'use client';
import Intro, { type IntroTexts } from './Intro';
import MembershipForm from './MembershipForm';
import type { FormConfig } from '../lib/form-settings';
import { EN_INTRO } from '../lib/i18n';
import { useLocale } from './LocaleProvider';

export default function PublicPortal({ intro, config }: { intro: IntroTexts; config: FormConfig }) {
  const { locale } = useLocale();
  const localizedIntro = locale === 'en' ? { ...intro, ...EN_INTRO } : intro;
  return <main className="portal"><Intro t={localizedIntro} /><MembershipForm config={config} locale={locale} /></main>;
}
