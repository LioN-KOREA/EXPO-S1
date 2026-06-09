'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Globe2,
  CalendarDays,
  Users,
  FileText,
  ArrowRight,
  Sparkles,
  BarChart3,
  Lock,
  Mail,
  Zap,
  Shield,
  Languages,
} from 'lucide-react';

/**
 * Variant C: "Stripe × Framer" — Bold & Trendy
 * Dark with animated gradient glow, glassmorphism, oversized typography
 */

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-800 ease-out ${visible ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-10 blur-[2px]'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function VariantCPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError('이메일 또는 비밀번호가 올바르지 않습니다.'); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const homes: Record<string, string> = { admin: '/admin', interpreter: '/interpreter', buyer: '/buyer', seller: '/seller' };
      router.push(homes[profile?.role || ''] || '/');
    }
  }

  const features = [
    { icon: CalendarDays, title: '자동 스케줄링', desc: '엑셀 한 장으로 전체 타임테이블 구성', gradient: 'from-cyan-400 to-blue-500' },
    { icon: Users, title: '스마트 배정', desc: '통역사 중복 배정 방지 자동 체크', gradient: 'from-purple-400 to-pink-500' },
    { icon: FileText, title: '실시간 일지', desc: '3초 자동 저장, 어디서든 이어쓰기', gradient: 'from-amber-400 to-orange-500' },
    { icon: Languages, title: '다국어 UI', desc: '바이어는 영어, 셀러는 한국어 자동 전환', gradient: 'from-emerald-400 to-cyan-500' },
  ];

  const highlights = [
    { value: '200+', label: '참가자', icon: Users },
    { value: '실시간', label: '자동 저장', icon: Zap },
    { value: '100%', label: '데이터 보호', icon: Shield },
    { value: 'EN/KO', label: '다국어', icon: Languages },
  ];

  return (
    <div className="min-h-screen bg-[#08090d] overflow-x-hidden" style={{ fontFamily: "'Pretendard', -apple-system, sans-serif" }}>
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] lg:w-[600px] lg:h-[600px] bg-blue-600/10 rounded-full blur-[100px] sm:blur-[150px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-[260px] h-[260px] sm:w-[420px] sm:h-[420px] lg:w-[500px] lg:h-[500px] bg-purple-600/10 rounded-full blur-[100px] sm:blur-[150px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] sm:w-[340px] sm:h-[340px] lg:w-[400px] lg:h-[400px] bg-cyan-600/5 rounded-full blur-[90px] sm:blur-[120px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Globe2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white tracking-tight">contEXT</span>
            </div>
            <a href="#login" className="px-4 sm:px-5 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-slate-100 transition">
              로그인
            </a>
          </div>
        </div>
      </nav>

      {/* Hero - Full screen */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 pt-24 sm:pt-0">
        <div className="text-center max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm mb-6 sm:mb-8">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-xs sm:text-sm text-slate-300">수출상담회의 새로운 패러다임</span>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] tracking-tight mb-6 sm:mb-8" style={{ letterSpacing: '-0.04em' }}>
              상담회 운영,
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                완전히 새롭게.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={300}>
            <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed" style={{ fontWeight: 300 }}>
              엑셀 업로드 한 번이면 타임테이블, 바이어-셀러 매칭, 통역사 배정까지.
              <br className="hidden md:block" />
              상담일지는 실시간 자동 저장. 결과는 원클릭 다운로드.
            </p>
          </Reveal>

          <Reveal delay={450}>
            <div className="flex items-center justify-center gap-4">
              <a
                href="#login"
                className="group inline-flex items-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-black font-semibold rounded-xl hover:scale-105 transition-transform shadow-2xl shadow-white/10"
              >
                시작하기
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </Reveal>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/20 rounded-full flex items-start justify-center pt-2">
            <div className="w-1.5 h-3 bg-white/40 rounded-full" />
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <section className="py-20 sm:py-32 px-4 sm:px-6 relative">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-12 sm:mb-20">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4" style={{ letterSpacing: '-0.03em' }}>
                모든 기능, 하나의 플랫폼
              </h2>
              <p className="text-base sm:text-lg text-slate-500">복잡한 상담회 운영을 심플하게</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 120}>
                <div className="group relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-2xl p-6 sm:p-7 hover:bg-white/[0.06] hover:border-white/[0.15] transition-all duration-300">
                  {/* Glow on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-[0.03] rounded-2xl transition-opacity duration-300`} />

                  <div className="relative">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 shadow-lg`}>
                      <f.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">{f.title}</h3>
                    <p className="text-sm sm:text-base text-slate-400 leading-relaxed" style={{ fontWeight: 300 }}>{f.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-3xl p-6 sm:p-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
              {highlights.map((h, i) => (
                <Reveal key={h.label} delay={i * 100}>
                  <div className="text-center">
                    <h.icon className="w-6 h-6 text-slate-500 mx-auto mb-3" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight">{h.value}</p>
                    <p className="text-sm text-slate-500 mt-1">{h.label}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Login Section */}
      <section id="login" className="py-20 sm:py-32 px-4 sm:px-6 relative">
        <div className="max-w-md mx-auto relative z-10">
          <Reveal>
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-purple-500/20">
                <Globe2 className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                시작하기
              </h2>
              <p className="text-slate-400 mt-2">계정 정보를 입력하세요</p>
            </div>

            <form onSubmit={handleLogin} className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.1] rounded-2xl p-6 sm:p-7">
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400 mb-1.5 block">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/[0.1] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-400/50 focus:bg-white/[0.06] transition"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-1.5 block">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호"
                      className="w-full pl-11 pr-4 py-3 bg-white/[0.04] border border-white/[0.1] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-400/50 focus:bg-white/[0.06] transition"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-slate-100 transition shadow-lg shadow-white/5 disabled:opacity-50"
                >
                  {loading ? '로그인 중...' : '로그인'}
                </button>
              </div>
            </form>

            <p className="text-center text-xs text-slate-600 mt-6">
              계정이 없으시면 관리자에게 문의하세요
            </p>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center">
              <Globe2 className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-slate-500 font-medium">contEXT</span>
          </div>
          <p className="text-xs text-slate-700">Export Consultation Management System</p>
        </div>
      </footer>
    </div>
  );
}
