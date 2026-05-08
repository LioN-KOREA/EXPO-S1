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
  BarChart3,
  Lock,
  Mail,
  Layers,
  Download,
} from 'lucide-react';

/**
 * Variant B: "Cal.com × Vercel" — Minimal Modern
 * White/light with bold black accents, geometric typography, grid background
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

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-600 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function VariantBPage() {
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
    if (error) { setError('Invalid email or password.'); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role, must_change_password').eq('id', user.id).single();
      if (profile?.must_change_password) { router.push('/change-password'); return; }
      const homes: Record<string, string> = { admin: '/admin', interpreter: '/interpreter', buyer: '/buyer', seller: '/seller' };
      router.push(homes[profile?.role || ''] || '/');
    }
  }

  const stats = [
    { value: '200+', label: '참가자 지원' },
    { value: '4', label: '역할 시스템' },
    { value: '99.9%', label: '데이터 안정성' },
    { value: '< 3s', label: '자동 저장' },
  ];

  const features = [
    { icon: Layers, title: '엑셀 기반 자동 구성', desc: '타임테이블 엑셀을 업로드하면 바이어, 셀러, 스케줄이 자동으로 생성됩니다.' },
    { icon: Users, title: '역할별 맞춤 화면', desc: '관리자, 통역사, 셀러, 바이어 각각 최적화된 대시보드를 제공합니다.' },
    { icon: FileText, title: '동적 상담일지', desc: '상담회마다 다른 양식을 엑셀로 설정하고, 통역사가 즉시 작성합니다.' },
    { icon: Download, title: '원클릭 내보내기', desc: '모든 상담일지를 한 번에 엑셀로 다운로드합니다.' },
  ];

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Pretendard', -apple-system, sans-serif" }}>
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Globe2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 tracking-tight">수출상담회</span>
          </div>
          <a href="#login" className="px-5 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition">
            로그인
          </a>
        </div>
      </nav>

      {/* Hero - Split */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left text */}
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-full mb-6">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-600 font-medium">운영 중인 상담회에 최적화</span>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <h1 className="text-5xl lg:text-6xl font-bold text-black leading-[1.1] tracking-tight mb-6" style={{ letterSpacing: '-0.03em' }}>
                상담회 운영의
                <br />
                새로운 기준.
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="text-xl text-slate-500 leading-relaxed mb-8" style={{ fontWeight: 300 }}>
                엑셀 업로드부터 일지 다운로드까지.
                <br />
                수출상담회의 모든 과정을 하나로.
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div className="flex items-center gap-4">
                <a href="#login" className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white font-medium rounded-lg hover:bg-slate-800 transition">
                  시작하기 <ArrowRight className="w-4 h-4" />
                </a>
                <span className="text-sm text-slate-400">설치 불필요 · 즉시 사용</span>
              </div>
            </Reveal>
          </div>

          {/* Right - Mockup */}
          <Reveal delay={200}>
            <div className="relative">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
                {/* Mini dashboard mockup */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-300" />
                  <div className="w-3 h-3 rounded-full bg-yellow-300" />
                  <div className="w-3 h-3 rounded-full bg-green-300" />
                  <div className="flex-1" />
                  <span className="text-xs text-slate-400">대시보드</span>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <p className="text-xs text-slate-400">상담</p>
                      <p className="text-lg font-bold text-slate-900">48건</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <p className="text-xs text-slate-400">제출</p>
                      <p className="text-lg font-bold text-emerald-600">32건</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <p className="text-xs text-slate-400">진행률</p>
                      <p className="text-lg font-bold text-blue-600">67%</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500">전체 진행률</span>
                      <span className="text-xs font-medium text-blue-600">67%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full">
                      <div className="w-2/3 h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full" />
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-100 space-y-2">
                    {['ABC Corp × 삼성전자', 'XYZ Ltd × LG화학', 'DEF Inc × 현대모비스'].map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-xs text-slate-700">{item}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${i === 0 ? 'bg-emerald-50 text-emerald-600' : i === 1 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                          {i === 0 ? '제출완료' : i === 1 ? '작성중' : '미작성'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-y border-slate-100">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="text-center">
                <p className="text-3xl font-bold text-black tracking-tight" style={{ letterSpacing: '-0.02em' }}>{s.value}</p>
                <p className="text-sm text-slate-400 mt-1">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <h2 className="text-3xl font-bold text-black tracking-tight mb-12" style={{ letterSpacing: '-0.02em' }}>
              핵심 기능
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <div className="group p-6 border border-slate-100 rounded-xl hover:border-slate-200 hover:bg-slate-50/50 transition-all">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed" style={{ fontWeight: 300 }}>{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Login */}
      <section id="login" className="py-24 px-6 bg-slate-50 border-t border-slate-100">
        <div className="max-w-sm mx-auto">
          <Reveal>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-black tracking-tight" style={{ letterSpacing: '-0.02em' }}>로그인</h2>
              <p className="text-sm text-slate-500 mt-2">계정 정보를 입력하세요</p>
            </div>

            <form onSubmit={handleLogin} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-700 font-medium mb-1.5 block">이메일</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-700 font-medium mb-1.5 block">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition"
                      required
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {loading ? '로그인 중...' : '로그인'}
                </button>
              </div>
            </form>

            <p className="text-center text-xs text-slate-400 mt-4">
              계정이 없으시면 관리자에게 문의하세요
            </p>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
              <Globe2 className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-slate-600 font-medium">수출상담회</span>
          </div>
          <p className="text-xs text-slate-400">Export Consultation Management</p>
        </div>
      </footer>
    </div>
  );
}
