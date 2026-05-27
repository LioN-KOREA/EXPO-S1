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
  CheckCircle2,
  Shield,
  Zap,
  BarChart3,
  Lock,
  Mail,
} from 'lucide-react';

/**
 * Variant A: "Stripe × Cal.com" — Premium Professional
 * Deep navy hero, white feature cards with blue shadows, confident typography
 */

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function RevealSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function VariantAPage() {
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
    { icon: CalendarDays, title: '스마트 스케줄링', desc: '엑셀 업로드 한 번으로 바이어-셀러 매칭과 타임테이블이 자동 생성됩니다.', color: 'from-blue-500 to-cyan-400' },
    { icon: Users, title: '통역사 배정', desc: '바이어별 통역사를 시각적으로 배정하고, 중복 방지 기능으로 실수를 예방합니다.', color: 'from-indigo-500 to-purple-400' },
    { icon: FileText, title: '실시간 상담일지', desc: '통역사가 현장에서 즉시 작성하고, 자동 저장으로 데이터 손실을 방지합니다.', color: 'from-violet-500 to-pink-400' },
    { icon: BarChart3, title: '진행률 대시보드', desc: '상담회 전체 진행 상황을 한눈에 파악하고, 엑셀로 즉시 내보낼 수 있습니다.', color: 'from-emerald-500 to-teal-400' },
  ];

  const steps = [
    { num: '01', title: '상담회 생성', desc: '이름, 기간을 입력하고 상담회를 생성합니다.' },
    { num: '02', title: '엑셀 업로드', desc: '타임테이블 엑셀을 업로드하면 모든 데이터가 자동 구성됩니다.' },
    { num: '03', title: '통역사 배정', desc: '통역사를 배정하고 상담일지 양식을 설정합니다.' },
    { num: '04', title: '상담 진행', desc: '통역사가 일지를 작성하고, 관리자가 실시간 모니터링합니다.' },
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden" style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1729] via-[#1a2744] to-[#0d2137] min-h-screen flex items-center">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-64 h-64 sm:w-96 sm:h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 -left-10 sm:-left-20 w-48 h-48 sm:w-72 sm:h-72 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[800px] lg:h-[800px] bg-gradient-to-r from-blue-600/5 to-purple-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-0 w-full">
          <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
            {/* Left - Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6 sm:mb-8">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-xs sm:text-sm text-blue-200 font-medium">엔터프라이즈급 보안</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-white leading-tight mb-5 sm:mb-6 tracking-tight">
                수출상담회를
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  스마트하게
                </span>
                <br />
                운영하세요
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed mb-6 sm:mb-8 max-w-lg" style={{ fontWeight: 300 }}>
                바이어-셀러 매칭, 통역사 배정, 상담일지 관리까지.
                <br />
                하나의 플랫폼으로 상담회 전체를 관리합니다.
              </p>

              <p className="text-xs sm:text-sm text-slate-500 uppercase tracking-wider mb-8 sm:mb-10">
                Export Consultation Management System
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <a
                  href="#login"
                  className="inline-flex items-center justify-center sm:justify-start gap-2 px-6 sm:px-7 py-3 sm:py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                >
                  시작하기
                  <ArrowRight className="w-4 h-4" />
                </a>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>설치 없이 바로 사용</span>
                </div>
              </div>
            </div>

            {/* Right - Stats/Visual */}
            <div className="hidden lg:block">
              <div className="relative">
                {/* Floating cards */}
                <div className="absolute -top-4 -left-4 px-5 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl">
                  <p className="text-xs text-slate-400">오늘 진행률</p>
                  <p className="text-2xl font-bold text-white">87%</p>
                </div>

                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center p-4 bg-white/5 rounded-xl">
                      <p className="text-3xl font-bold text-white mb-1">200+</p>
                      <p className="text-xs text-slate-400">지원 참가자</p>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-xl">
                      <p className="text-3xl font-bold text-white mb-1">4</p>
                      <p className="text-xs text-slate-400">역할 시스템</p>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-xl">
                      <p className="text-3xl font-bold text-white mb-1">실시간</p>
                      <p className="text-xs text-slate-400">자동 저장</p>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-xl">
                      <p className="text-3xl font-bold text-white mb-1">한/영</p>
                      <p className="text-xs text-slate-400">다국어 지원</p>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-4 -right-4 px-5 py-3 bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-emerald-200">일지 제출 완료</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-slate-50/50">
        <div className="max-w-6xl mx-auto">
          <RevealSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight mb-4">
                상담회 운영, 이제 더 쉽게
              </h2>
              <p className="text-base sm:text-lg text-slate-500 max-w-2xl mx-auto" style={{ fontWeight: 300 }}>
                엑셀과 종이 대신, 체계적인 디지털 플랫폼으로 운영 효율을 높이세요.
              </p>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {features.map((f, i) => (
              <RevealSection key={f.title} delay={i * 100}>
                <div className="group relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-300 border border-slate-100">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm sm:text-base text-slate-500 leading-relaxed" style={{ fontWeight: 300 }}>{f.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <RevealSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight mb-4">
                4단계로 완성하는 상담회
              </h2>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <RevealSection key={step.num} delay={i * 150}>
                <div className="text-center">
                  <div className="text-4xl sm:text-5xl font-bold text-slate-100 mb-3 sm:mb-4">{step.num}</div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">{step.title}</h4>
                  <p className="text-sm text-slate-500" style={{ fontWeight: 300 }}>{step.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* Login Section */}
      <section id="login" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-br from-[#0f1729] via-[#1a2744] to-[#0d2137]">
        <div className="max-w-md mx-auto">
          <RevealSection>
            <div className="text-center mb-8">
              <Globe2 className="w-10 h-10 text-blue-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">로그인</h2>
              <p className="text-slate-400 text-sm">계정 정보를 입력하여 시작하세요</p>
            </div>

            <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 sm:p-8">
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호를 입력하세요"
                      className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition"
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
                  className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50"
                >
                  {loading ? '로그인 중...' : '로그인'}
                </button>
              </div>
            </form>

            <p className="text-center text-xs text-slate-500 mt-6">
              계정이 없으시면 관리자에게 문의하세요
            </p>
          </RevealSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 bg-[#0a0f1a] border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-slate-400 font-medium">수출상담회 관리 시스템</span>
          </div>
          <p className="text-xs text-slate-600">Export Consultation Management</p>
        </div>
      </footer>
    </div>
  );
}
