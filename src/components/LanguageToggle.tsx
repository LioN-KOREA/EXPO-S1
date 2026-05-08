'use client';

import { useI18n } from '@/lib/i18n/context';
import { Globe } from 'lucide-react';

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-white/[0.03] text-slate-500 hover:text-muted-foreground hover:border-white/[0.15] transition-all"
      title={locale === 'ko' ? 'Switch to English' : '한국어로 전환'}
    >
      <Globe className="w-3.5 h-3.5" />
      {locale === 'ko' ? 'EN' : '한국어'}
    </button>
  );
}
