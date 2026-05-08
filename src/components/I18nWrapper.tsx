'use client';

import { I18nProvider } from '@/lib/i18n/context';
import type { Locale } from '@/lib/i18n/dictionaries';

export function I18nWrapper({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  return <I18nProvider defaultLocale={locale}>{children}</I18nProvider>;
}
