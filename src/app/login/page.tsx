'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';
import { Globe } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<Locale>('ko');
  const router = useRouter();

  const t = dictionaries[locale];

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(t.login.error);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const roleHome: Record<string, string> = {
        admin: '/admin',
        interpreter: '/interpreter',
        buyer: '/buyer',
        seller: '/seller',
      };
      router.push(roleHome[profile?.role || ''] || '/login');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-x-hidden overflow-y-auto" style={{ background: '#06070b' }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] left-[5%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full opacity-100" style={{ background: 'radial-gradient(circle, rgba(56,120,246,0.09) 0%, transparent 65%)', animation: 'drift1 8s ease-in-out infinite' }} />
        <div className="absolute -bottom-[10%] right-[5%] w-[280px] h-[280px] sm:w-[450px] sm:h-[450px] rounded-full opacity-100" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 65%)', animation: 'drift2 10s ease-in-out infinite' }} />
      </div>

      {/* Noise texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[1]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")" }} />

      {/* Language toggle */}
      <button
        onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs text-slate-500 border border-white/[0.08] bg-white/[0.03] hover:text-slate-300 hover:border-white/[0.15] transition-all"
      >
        <Globe className="w-3.5 h-3.5" />
        {locale === 'ko' ? 'English' : '한국어'}
      </button>

      {/* Login container */}
      <div className="relative z-[2] w-full max-w-md px-4 sm:px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative w-[72px] h-[72px] mx-auto mb-5">
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent" style={{ borderTopColor: '#60a5fa', borderRightColor: '#818cf8' }} />
            {/* Inner ring */}
            <div className="absolute inset-[8px] rounded-full border-2 border-transparent" style={{ borderBottomColor: '#c084fc', borderLeftColor: '#22d3ee' }} />
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full" style={{ background: 'linear-gradient(135deg, #60a5fa, #c084fc)', boxShadow: '0 0 14px rgba(96,165,250,0.6)' }} />
          </div>
          <h1 className="text-[30px] font-bold tracking-wider" style={{ fontFamily: "'Space Grotesk', sans-serif", background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            contEXT
          </h1>
          <p className="text-[15px] text-slate-500 mt-1.5 font-light">
            {locale === 'ko' ? '수출상담회 관리 시스템' : 'Export Consultation Management'}
          </p>
        </div>

        {/* Login form card */}
        <div className="relative rounded-3xl p-7 sm:p-9" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          {/* Gradient border glow */}
          <div className="absolute inset-[-1px] rounded-3xl pointer-events-none" style={{ padding: '1px', background: 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(139,92,246,0.1), rgba(192,132,252,0.08))', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />

          <form onSubmit={handleLogin} className="relative">
            {/* Email */}
            <div className="mb-5">
              <label className="block text-[13px] text-slate-400 mb-2 font-medium tracking-wider uppercase">
                {t.login.email}
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-[20px] h-[20px] text-slate-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M22 7l-10 6L2 7"/></svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.login.emailPlaceholder}
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/[0.06] rounded-[14px] text-white text-base placeholder-slate-700 outline-none transition-all focus:border-blue-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(96,165,250,0.06),0_4px_12px_rgba(0,0,0,0.2)]"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-5">
              <label className="block text-[13px] text-slate-400 mb-2 font-medium tracking-wider uppercase">
                {t.login.password}
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-[20px] h-[20px] text-slate-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.login.passwordPlaceholder}
                  required
                  className="w-full pl-12 pr-12 py-4 bg-white/[0.03] border border-white/[0.06] rounded-[14px] text-white text-base placeholder-slate-700 outline-none transition-all focus:border-blue-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(96,165,250,0.06),0_4px_12px_rgba(0,0,0,0.2)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-600 hover:text-slate-400 transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-[14px] text-black font-semibold text-[16px] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,255,255,0.08)] disabled:opacity-50 disabled:hover:translate-y-0"
              style={{ background: 'linear-gradient(135deg, #fff, #f1f5f9)', boxShadow: '0 4px 16px rgba(255,255,255,0.05)' }}
            >
              {loading ? t.login.submitting : t.login.submit}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[13px] text-slate-600 mt-6">
          {t.login.noAccount}
        </p>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes drift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(30px,20px); } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-20px,-25px); } }
      `}</style>
    </div>
  );
}
