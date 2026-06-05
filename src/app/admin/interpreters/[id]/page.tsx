// PRD #16 S1 — 통역사 상세 (admin only).
// 프로필 카드 + 글로벌 필드 편집 + 참여 이벤트 + 평가 이력 표.

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { getInterpreterWithHistory } from '@/lib/interpreter/repository';
import { InterpreterGlobalFieldsForm } from '@/components/admin/InterpreterGlobalFieldsForm';
import { getCountryName } from '@/lib/constants/countries';

const MISSING_BADGE = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${rate.toLocaleString('ko-KR')}원`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InterpreterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const data = await getInterpreterWithHistory(supabase, id);
  if (!data) notFound();

  const evaluationByEvent = new Map(data.evaluations.map((e) => [e.event_id, e]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/interpreters"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          통역사 관리
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center justify-center font-bold text-lg shrink-0">
            {data.profile.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{data.profile.name}</h1>
            <p className="text-sm text-slate-500 truncate">{data.profile.email}</p>
          </div>
        </div>
      </div>

      {/* 프로필 카드 (read-only) */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500 text-xs mb-0.5">전화</dt>
              <dd className="text-foreground">{data.profile.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs mb-0.5">통역 언어</dt>
              <dd className="text-foreground">{data.profile.language || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs mb-0.5">회사</dt>
              <dd className="text-foreground">{data.profile.company_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs mb-0.5">국가</dt>
              <dd className="text-foreground">{data.profile.country ? getCountryName(data.profile.country) : '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 글로벌 운영 필드 (admin 전용) */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">글로벌 운영 정보</CardTitle>
          <p className="text-xs text-slate-500 mt-1">관리자에게만 보입니다. 통역사 본인 화면에는 노출되지 않습니다.</p>
        </CardHeader>
        <CardContent>
          <InterpreterGlobalFieldsForm
            interpreterId={data.profile.id}
            initialMeta={data.meta}
          />
        </CardContent>
      </Card>

      {/* 참여 이벤트 + 평가 이력 */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">참여 이력 ({data.events.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.events.length === 0 ? (
            <p className="text-sm text-slate-500">참여한 상담회가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b text-xs text-slate-500">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">상담회</th>
                    <th className="text-left py-2 px-3 font-medium">기간</th>
                    <th className="text-left py-2 px-3 font-medium">평가 코멘트</th>
                    <th className="text-left py-2 px-3 font-medium">특이사항</th>
                    <th className="text-right py-2 px-3 font-medium">실 지급액</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev) => {
                    const evalRow = evaluationByEvent.get(ev.event_id);
                    return (
                      <tr key={ev.event_id} className="border-b last:border-0 hover:bg-muted">
                        <td className="py-2 px-3">
                          <Link
                            href={`/admin/events/${ev.event_id}`}
                            className="text-blue-600 dark:text-blue-300 hover:underline truncate inline-block max-w-[200px]"
                          >
                            {ev.event_name}
                          </Link>
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(ev.start_date)} ~ {formatDate(ev.end_date)}
                        </td>
                        <td className="py-2 px-3 max-w-[240px]">
                          {evalRow?.comment ? (
                            <span className="text-foreground line-clamp-2">{evalRow.comment}</span>
                          ) : (
                            <Badge className={`${MISSING_BADGE} text-[10px] border-0`}>평가 없음</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 max-w-[240px]">
                          {evalRow?.notes ? (
                            <span className="text-slate-600 dark:text-slate-300 line-clamp-2">{evalRow.notes}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {formatRate(evalRow?.paid_rate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
