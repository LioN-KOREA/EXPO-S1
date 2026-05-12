'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<Locale>('ko');
  const router = useRouter();

  const t = dictionaries[locale];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError(t.changePassword.errorMinLength); return; }
    if (newPassword !== confirmPassword) { setError(t.changePassword.errorMismatch); return; }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) { setError(t.changePassword.errorFailed); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id);
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const roleHome: Record<string, string> = { admin: '/admin', interpreter: '/interpreter', buyer: '/buyer', seller: '/seller' };
      router.push(roleHome[profile?.role || ''] || '/login');
    }
  }

  const EyeOpen = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  const EyeClosed = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#06070b' }}>
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-[20%] left-[5%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 65%)', animation: 'drift1 8s ease-in-out infinite' }} />
        <div className="absolute -bottom-[10%] right-[5%] w-[280px] h-[280px] sm:w-[450px] sm:h-[450px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(234,88,12,0.06) 0%, transparent 65%)', animation: 'drift2 10s ease-in-out infinite' }} />
      </div>

      <button onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')} className="absolute top-6 right-6 z-10 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs text-slate-500 border border-white/[0.08] bg-white/[0.03] hover:text-slate-300 transition-all">
        <Globe className="w-3.5 h-3.5" />{locale === 'ko' ? 'English' : '한국어'}
      </button>

      <div className="relative z-[2] w-full max-w-sm px-4 sm:px-6">
        <div className="text-center mb-9">
          <div className="relative w-[52px] h-[52px] mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent" style={{ borderTopColor: '#f59e0b', borderRightColor: '#f97316' }} />
            <div className="absolute inset-[6px] rounded-full border-2 border-transparent" style={{ borderBottomColor: '#ef4444', borderLeftColor: '#fbbf24' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', boxShadow: '0 0 14px rgba(245,158,11,0.6)' }} />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">{t.changePassword.title}</h1>
          <p className="text-[13px] text-slate-500 font-light">{t.changePassword.subtitle}</p>
        </div>

        <div className="relative rounded-3xl p-8" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div className="absolute inset-[-1px] rounded-3xl pointer-events-none" style={{ padding: '1px', background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.1))', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />

          <form onSubmit={handleSubmit} className="relative">
            <div className="mb-5">
              <label className="block text-[12px] text-slate-500 mb-2 font-medium tracking-wider uppercase">{t.changePassword.newPassword}</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
                <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.changePassword.newPasswordPlaceholder} required minLength={6} className="w-full pl-11 pr-12 py-3.5 bg-white/[0.03] border border-white/[0.06] rounded-[14px] text-white text-sm placeholder-slate-700 outline-none transition-all focus:border-amber-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(245,158,11,0.06)]" />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-600 hover:text-slate-400 transition-colors">
                  {showNew ? <EyeClosed /> : <EyeOpen />}
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[12px] text-slate-500 mb-2 font-medium tracking-wider uppercase">{t.changePassword.confirmPassword}</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
                <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.changePassword.confirmPlaceholder} required className="w-full pl-11 pr-12 py-3.5 bg-white/[0.03] border border-white/[0.06] rounded-[14px] text-white text-sm placeholder-slate-700 outline-none transition-all focus:border-amber-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(245,158,11,0.06)]" />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-600 hover:text-slate-400 transition-colors">
                  {showConfirm ? <EyeClosed /> : <EyeOpen />}
                </button>
              </div>
            </div>

            {error && <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</div>}

            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-[14px] text-black font-semibold text-[15px] transition-all hover:-translate-y-0.5 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #fff, #f1f5f9)', boxShadow: '0 4px 16px rgba(255,255,255,0.05)' }}>
              {loading ? t.changePassword.submitting : t.changePassword.submit}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes drift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(30px,20px); } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-20px,-25px); } }
      `}</style>
    </div>
  );
}
