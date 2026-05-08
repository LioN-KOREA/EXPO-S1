import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Clock,
  Building2,
  User,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import type { ReportStatus } from '@/types';
import { batchIn } from '@/lib/supabase/batch-query';

export default async function InterpreterEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 이벤트 정보
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) notFound();

  // 내 상담 목록
  const { data: consultations } = await supabase
    .from('consultations')
    .select(`
      *,
      time_slot:time_slots(*),
      buyer:buyers(*),
      seller:sellers(*)
    `)
    .eq('event_id', eventId)
    .eq('interpreter_id', user!.id);

  // 날짜+시간순 정렬
  consultations?.sort((a, b) => {
    const dateA = a.time_slot?.date || '';
    const dateB = b.time_slot?.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time_slot?.start_time || '';
    const timeB = b.time_slot?.start_time || '';
    return timeA.localeCompare(timeB);
  });

  // 제출 상태 확인 (배치 조회)
  const consultationIds = consultations?.map((c) => c.id) ?? [];
  const reports = await batchIn(
    (ids) => supabase.from('consultation_reports').select('consultation_id, submitted, report_status').in('consultation_id', ids),
    consultationIds,
  );

  const reportsMap = new Map(reports.map((r: Record<string, unknown>) => [r.consultation_id, r]));

  // 5개 상태 통계
  const total = consultations?.length ?? 0;
  let approvedCount = 0;
  let submittedCount = 0;
  let revisionCount = 0;
  let inProgressCount = 0;
  reports?.forEach((r) => {
    const rs = (r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') approvedCount++;
    else if (rs === 'submitted' || rs === 'under_review') submittedCount++;
    else if (rs === 'revision_requested') revisionCount++;
    else inProgressCount++;
  });
  const notStarted = total - approvedCount - submittedCount - revisionCount - inProgressCount;
  const completedCount = approvedCount + submittedCount; // 제출 이상
  const rate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

  // 날짜별 그룹핑
  const grouped = new Map<string, NonNullable<typeof consultations>>();
  consultations?.forEach((c) => {
    const date = c.time_slot?.date || '날짜 미정';
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(c);
  });

  return (
    <div>
      <Link href="/interpreter" className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        내 상담회 목록
      </Link>

      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">{event.name}</h2>
        <p className="text-sm text-slate-500 mt-1">{event.start_date} ~ {event.end_date}</p>
      </div>

      {/* 진행률 + 요약 통계 */}
      {total > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-muted-foreground">일지 작성 현황</span>
              <span className={`text-sm font-bold ${
                rate === 100 ? 'text-emerald-600' : rate >= 50 ? 'text-blue-600' : 'text-slate-500'
              }`}>
                {approvedCount}/{total} ({rate}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-card rounded-full overflow-hidden flex mb-3">
              {approvedCount > 0 && (
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${(approvedCount / total) * 100}%` }}
                />
              )}
              {submittedCount > 0 && (
                <div
                  className="h-full bg-blue-400"
                  style={{ width: `${(submittedCount / total) * 100}%` }}
                />
              )}
              {revisionCount > 0 && (
                <div
                  className="h-full bg-red-400"
                  style={{ width: `${(revisionCount / total) * 100}%` }}
                />
              )}
              {inProgressCount > 0 && (
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${(inProgressCount / total) * 100}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {approvedCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  승인 {approvedCount}
                </span>
              )}
              {submittedCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600">
                  <Clock className="w-3.5 h-3.5" />
                  검토중 {submittedCount}
                </span>
              )}
              {revisionCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-red-600">
                  <RotateCcw className="w-3.5 h-3.5" />
                  수정요청 {revisionCount}
                </span>
              )}
              {inProgressCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600">
                  <FileText className="w-3.5 h-3.5" />
                  작성중 {inProgressCount}
                </span>
              )}
              {notStarted > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <AlertCircle className="w-3.5 h-3.5" />
                  미작성 {notStarted}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 상담 목록 (날짜별) */}
      {!consultations || consultations.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">배정된 상담이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              {/* 날짜 헤더 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  {date}
                </div>
                <span className="text-xs text-slate-500">{items.length}건</span>
                <div className="flex-1 h-px bg-card" />
              </div>

              <div className="space-y-2">
                {items.map((consultation) => {
                  const report = reportsMap.get(consultation.id);
                  const rs = report ? ((report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus) : null;

                  const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
                    approved: { label: '승인됨', variant: 'default', className: 'bg-emerald-500' },
                    submitted: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
                    under_review: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
                    revision_requested: { label: '수정요청', variant: 'outline', className: 'border-amber-200 text-amber-700 bg-amber-50' },
                    rejected: { label: '반려', variant: 'destructive' },
                    draft: { label: '작성중', variant: 'secondary' },
                  };
                  const statusInfo = rs ? statusMap[rs] : { label: '미작성', variant: 'secondary' as const };

                  return (
                    <Link
                      key={consultation.id}
                      href={`/interpreter/events/${eventId}/consultation/${consultation.id}`}
                    >
                      <Card className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer group mb-2">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              {/* 시간 + 상태 */}
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                  <Clock className="w-3 h-3" />
                                  {consultation.time_slot?.start_time} - {consultation.time_slot?.end_time}
                                </div>
                                <Badge variant={statusInfo.variant} className={`text-xs ${'className' in statusInfo ? statusInfo.className || '' : ''}`}>
                                  {statusInfo.label}
                                </Badge>
                              </div>

                              {/* 바이어 */}
                              <div className="flex items-center gap-2 mb-1">
                                <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="text-sm font-medium text-foreground truncate">
                                  {consultation.buyer?.company_name}
                                </span>
                                <span className="text-xs text-slate-500 shrink-0">
                                  ({consultation.buyer?.country})
                                </span>
                              </div>

                              {/* 셀러 */}
                              <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="text-sm text-slate-500 truncate">
                                  {consultation.seller?.company_name_kr || consultation.seller?.company_name}
                                </span>
                              </div>
                            </div>

                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-slate-500 transition-colors shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
