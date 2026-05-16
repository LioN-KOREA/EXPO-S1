'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MapPin, User2, X, Building2, Maximize, Minimize } from 'lucide-react';
import type { InfodeskEntry } from '../infodesk-client';

interface Props {
  entries: InfodeskEntry[];
  eventName: string;
  eventId: string;
  target: 'buyer' | 'seller' | 'all';
}

export function InfodeskKioskClient({ entries, eventName, eventId, target }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'buyer' | 'seller'>('ALL');
  const [selected, setSelected] = useState<InfodeskEntry | null>(null);
  const [isFs, setIsFs] = useState(false);

  // 사이드바 + admin layout 가림 (body class)
  useEffect(() => {
    document.body.classList.add('kiosk-mode');
    return () => document.body.classList.remove('kiosk-mode');
  }, []);

  // 자동 검색 초기화 (60초 무입력)
  useEffect(() => {
    if (!search && !selected) return;
    const t = setTimeout(() => {
      setSearch('');
      setSelected(null);
    }, 60_000);
    return () => clearTimeout(t);
  }, [search, selected]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== 'ALL') list = list.filter((e) => e.kind === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) =>
        e.company.toLowerCase().includes(q)
        || e.contact.toLowerCase().includes(q)
        || e.phone.toLowerCase().includes(q)
        || e.booth.toLowerCase().includes(q),
      );
    }
    return list;
  }, [entries, filter, search]);

  async function toggleFs() {
    if (!isFs) {
      try {
        await document.documentElement.requestFullscreen();
        setIsFs(true);
      } catch { /* ignore */ }
    } else {
      try {
        await document.exitFullscreen();
        setIsFs(false);
      } catch { /* ignore */ }
    }
  }

  function exitKiosk() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push(`/admin/events/${eventId}/infodesk`);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 overflow-y-auto">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 bg-rose-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{eventName}</h1>
            <p className="text-sm text-rose-100 mt-0.5">현장 인포데스크</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFs}
              className="text-white hover:bg-white/20"
              aria-label={isFs ? '전체화면 종료' : '전체화면'}
            >
              {isFs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exitKiosk}
              className="text-white hover:bg-white/20 gap-1.5"
            >
              <X className="w-5 h-5" />
              <span className="hidden md:inline">관리자</span>
            </Button>
          </div>
        </div>
      </header>

      {/* 검색 + 필터 */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-card rounded-2xl shadow-lg p-6 mb-6">
          <div className="relative mb-4">
            <Search className="w-7 h-7 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="회사명·담당자·부스번호·연락처 검색"
              className="h-16 text-xl pl-16 pr-6 rounded-xl border-2"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {(['ALL', 'buyer', 'seller'] as const).filter(f => target === 'all' || f === 'ALL' || f === target).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${
                  filter === f
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {f === 'ALL' ? '전체' : f === 'buyer' ? '바이어' : '셀러'}
              </button>
            ))}
            <span className="ml-auto text-base text-slate-500">총 {filtered.length}건</span>
          </div>
        </div>

        {/* 결과 그리드 */}
        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-lg p-16 text-center">
            <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-2xl text-slate-500">
              {search ? '검색 결과가 없습니다' : '검색어를 입력해주세요'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((e) => (
              <button
                key={`${e.kind}-${e.id}`}
                onClick={() => setSelected(e)}
                className="text-left bg-card rounded-2xl shadow-md hover:shadow-xl transition-all p-5 border-2 border-transparent hover:border-rose-300"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    e.kind === 'buyer'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  }`}>
                    {e.kind === 'buyer' ? '바이어' : '셀러'}
                  </span>
                  {e.booth && (
                    <span className="text-base font-bold text-rose-600 inline-flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> {e.booth}
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold text-foreground mb-1.5 line-clamp-2">
                  {e.company}
                </div>
                {e.contact && (
                  <div className="text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 mb-1">
                    <User2 className="w-4 h-4" /> {e.contact}
                  </div>
                )}
                {e.country && (
                  <div className="text-sm text-slate-500 mb-1">{e.country}</div>
                )}
                {/* 개인정보(이메일/전화) 노출 안 함 — 인포데스크 직원에게 별도 문의 */}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 상세 모달 — 풀스크린 카드 */}
      {selected && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card rounded-3xl shadow-2xl max-w-2xl w-full p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  selected.kind === 'buyer'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {selected.kind === 'buyer' ? '바이어' : '셀러'}
                </span>
                <h2 className="text-3xl font-bold mt-3">{selected.company}</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                <X className="w-6 h-6" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {selected.contact && (
                <KioskInfoRow icon={User2} label="담당자" value={selected.contact} />
              )}
              {selected.booth && (
                <KioskInfoRow icon={MapPin} label="부스번호" value={selected.booth} highlight />
              )}
              {selected.country && (
                <KioskInfoRow icon={Building2} label="국가" value={selected.country} />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-4 text-center">
              연락처가 필요하시면 인포데스크 직원에게 문의해주세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function KioskInfoRow({
  icon: Icon,
  label,
  value,
  highlight = false,
  className = '',
}: {
  icon: typeof User2;
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`p-4 rounded-xl bg-muted ${className}`}>
      <div className="text-xs text-slate-500 mb-1 inline-flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`text-lg font-bold ${highlight ? 'text-rose-600' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}
