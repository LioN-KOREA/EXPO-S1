// PRD #16 S1 — 통역사 관리 글로벌 목록 (admin only).
// SSR + admin RLS 통과. 검색·필터는 query string + 자식 client 컴포넌트로 처리.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listInterpreters } from '@/lib/interpreter/repository';
import { InterpreterListFilter } from '@/components/admin/InterpreterListFilter';
import { Languages } from 'lucide-react';
import type { InterpreterGrade, InterpreterRehireStatus } from '@/types';

const GRADE_BADGE: Record<InterpreterGrade, string> = {
  '특급': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  '우수': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  '보통': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  '주의': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const REHIRE_BADGE: Record<InterpreterRehireStatus, string> = {
  '가능': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  '보류': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  '불가': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const MISSING_BADGE = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

const EVENT_CHIP_VISIBLE = 5;

function parseGrade(raw: string | undefined): InterpreterGrade | null {
  const allowed: InterpreterGrade[] = ['특급', '우수', '보통', '주의'];
  return allowed.find((v) => v === raw) ?? null;
}

function parseRehire(raw: string | undefined): InterpreterRehireStatus | null {
  const allowed: InterpreterRehireStatus[] = ['가능', '불가', '보류'];
  return allowed.find((v) => v === raw) ?? null;
}

function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${rate.toLocaleString('ko-KR')}원/일`;
}

interface PageProps {
  searchParams: Promise<{ q?: string; grade?: string; rehire?: string }>;
}

export default async function InterpretersListPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  // admin 확인 — layout 에서 1차 보호되지만 page 단에서도 한번 더 (RLS 의존).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const search = (params.q ?? '').trim();
  const gradeFilter = parseGrade(params.grade);
  const rehireFilter = parseRehire(params.rehire);

  const items = await listInterpreters(supabase, {
    search: search || undefined,
    gradeFilter,
    rehireFilter,
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">통역사 관리</h2>
          <p className="text-slate-500 mt-1 text-sm">등급·기준 요율·재섭외 가능 여부 및 참여 이력</p>
        </div>
        <div className="text-sm text-slate-500">총 {items.length}명</div>
      </div>

      <InterpreterListFilter
        initialSearch={search}
        initialGrade={gradeFilter}
        initialRehire={rehireFilter}
      />

      {items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            조건에 맞는 통역사가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((item) => {
                const grade = item.meta?.grade;
                const rehire = item.meta?.rehire_status;
                const baseRate = item.meta?.base_rate ?? null;
                const visibleEvents = item.events.slice(0, EVENT_CHIP_VISIBLE);
                const extra = item.events.length - visibleEvents.length;
                return (
                  <li key={item.profile.id} className="p-4 hover:bg-muted transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <Link
                        href={`/admin/interpreters/${item.profile.id}`}
                        className="flex items-center gap-3 min-w-0 sm:w-64 shrink-0"
                      >
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center justify-center font-bold shrink-0">
                          {item.profile.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{item.profile.name}</p>
                          <p className="text-xs text-slate-500 truncate">{item.profile.email}</p>
                        </div>
                      </Link>

                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <Badge className={`text-[11px] border-0 ${grade ? GRADE_BADGE[grade] : MISSING_BADGE}`}>
                          {grade ?? '미설정'}
                        </Badge>
                        <Badge className={`text-[11px] border-0 ${rehire ? REHIRE_BADGE[rehire] : MISSING_BADGE}`}>
                          재섭외 {rehire ?? '미설정'}
                        </Badge>
                        {item.profile.language && (
                          <Badge className="text-[11px] border-0 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                            {item.profile.language}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">{formatRate(baseRate)}</span>
                        <span className="text-xs text-slate-400 hidden lg:inline">평가 {item.evaluation_count}건</span>
                      </div>

                      <div className="flex flex-wrap gap-1 sm:max-w-[280px]">
                        {visibleEvents.map((ev) => (
                          <Link
                            key={ev.event_id}
                            href={`/admin/events/${ev.event_id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors max-w-[140px] truncate"
                            title={ev.event_name}
                          >
                            <Languages className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ev.event_name}</span>
                          </Link>
                        ))}
                        {extra > 0 && (
                          <Link
                            href={`/admin/interpreters/${item.profile.id}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            +{extra}
                          </Link>
                        )}
                        {item.events.length === 0 && (
                          <span className="text-[11px] text-slate-400">참여 이력 없음</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
