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
  Award,
  MapPin,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import type { ReportStatus } from '@/types';
import { batchIn } from '@/lib/supabase/batch-query';
import { QrAttendButton } from '@/components/interpreter/QrAttendButton';
import { BuyerCardList } from '@/components/interpreter/BuyerCardList';
import { PendingReportsPopup } from '@/components/interpreter/PendingReportsPopup';
import { getServerDictionary } from '@/lib/i18n/server';
import { tmpl } from '@/lib/i18n/dictionaries';

export default async function InterpreterEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const t = await getServerDictionary();
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

  // 상태 통계 (excellent 포함)
  const total = consultations?.length ?? 0;
  let approvedCount = 0;
  let excellentCount = 0;
  let submittedCount = 0;
  let revisionCount = 0;
  let rejectedCount = 0;
  let inProgressCount = 0;
  reports?.forEach((r) => {
    const rs = (r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') approvedCount++;
    else if (rs === 'excellent') excellentCount++;
    else if (rs === 'submitted' || rs === 'under_review') submittedCount++;
    else if (rs === 'revision_requested') revisionCount++;
    else if (rs === 'rejected') rejectedCount++;
    else inProgressCount++;
  });
  const notStarted = total - approvedCount - excellentCount - submittedCount - revisionCount - rejectedCount - inProgressCount;
  const approvedTotal = approvedCount + excellentCount;
  const rate = total > 0 ? Math.round((approvedTotal / total) * 100) : 0;

  // 잔여 일지 = 미작성 + 작성중 + 수정요청 + 반려
  const pendingCount = notStarted + inProgressCount + revisionCount + rejectedCount;
  // 잔여 일지 중 첫 항목 (날짜순 정렬 기반)
  let firstPendingConsultationId: string | undefined;
  for (const c of consultations ?? []) {
    const r = reportsMap.get(c.id) as { report_status?: ReportStatus; submitted?: boolean } | undefined;
    const rs: ReportStatus = (r?.report_status ?? (r?.submitted ? 'submitted' : 'draft'));
    const isPending = !r || rs === 'draft' || rs === 'revision_requested' || rs === 'rejected';
    if (isPending) {
      firstPendingConsultationId = c.id as string;
      break;
    }
  }

  // 통역사 프로필
  const { data: profile } = await supabase
    .from('profiles').select('name').eq('id', user!.id).single();

  // 담당 바이어 unique 추출 (현재 buyer_status 포함)
  const buyerMap = new Map<string, {
    id: string;
    company_name: string;
    buyer_name: string;
    country: string;
    booth_number: string;
    buyer_status: string | null;
    consultation_ids: string[];
  }>();
  consultations?.forEach((c) => {
    if (!c.buyer) return;
    const existing = buyerMap.get(c.buyer.id);
    if (existing) {
      existing.consultation_ids.push(c.id);
    } else {
      buyerMap.set(c.buyer.id, {
        id: c.buyer.id,
        company_name: c.buyer.company_name,
        buyer_name: c.buyer.buyer_name ?? '',
        country: c.buyer.country ?? '',
        booth_number: c.buyer.booth_number ?? '',
        buyer_status: (c as { buyer_status?: string }).buyer_status ?? null,
        consultation_ids: [c.id],
      });
    }
  });
  const buyers = Array.from(buyerMap.values());

  // 날짜별 그룹핑
  const grouped = new Map<string, NonNullable<typeof consultations>>();
  consultations?.forEach((c) => {
    const date = c.time_slot?.date || t.interpreter.dateUndecided;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(c);
  });

  return (
    <div>
      {/* 잔여 일지 팝업 (매 진입, 잔여>0일 때만 표시) */}
      <PendingReportsPopup
        pendingCount={pendingCount}
        eventId={eventId}
        firstPendingConsultationId={firstPendingConsultationId}
        notStartedCount={notStarted}
        inProgressCount={inProgressCount}
        revisionCount={revisionCount}
        rejectedCount={rejectedCount}
      />

      <Link href="/interpreter" className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        {t.interpreter.myEventListBack}
      </Link>

      {/* 인사말 + QR 출석 */}
      <Card className="border-0 shadow-sm mb-6 bg-gradient-to-br from-rose-500 to-orange-500 text-white">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-lg font-bold">
                {tmpl(t.interpreter.greetingShort, { name: profile?.name ?? '' })}
              </p>
              <p className="text-sm opacity-90 mt-0.5">{t.interpreter.cheerMessage}</p>
            </div>
            <QrAttendButton eventId={eventId} />
          </div>
        </CardContent>
      </Card>

      {/* 상담회 메타 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">{event.name}</h2>
        {event.description && (
          <p className="text-sm text-slate-500 mt-1">{event.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-sm text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {event.start_date} ~ {event.end_date}
          </span>
        </div>
      </div>

      {/* 담당 바이어 카드 */}
      {buyers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-rose-500" />
            {tmpl(t.interpreter.buyersInChargeTitle, { count: buyers.length })}
          </h3>
          <BuyerCardList buyers={buyers} />
        </div>
      )}

      {/* 일정 관리 진입 (시작/종료 토글) */}
      {total > 0 && (
        <Link
          href={`/interpreter/events/${eventId}/schedule`}
          className="block mb-6"
        >
          <Card className="border-0 shadow-sm hover:shadow-lg transition-all bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">{t.interpreter.scheduleManage}</p>
                <p className="text-lg font-bold mt-0.5">{t.interpreter.scheduleManageDesc}</p>
              </div>
              <ChevronRight className="w-6 h-6" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* 진행률 + 요약 통계 */}
      {total > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-muted-foreground">{t.interpreter.reportStatus}</span>
              <span className={`text-sm font-bold ${
                rate === 100 ? 'text-emerald-600' : rate >= 50 ? 'text-blue-600' : 'text-slate-500'
              }`}>
                {approvedTotal}/{total} ({rate}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-card rounded-full overflow-hidden flex mb-3">
              {approvedCount > 0 && (
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${(approvedCount / total) * 100}%` }}
                />
              )}
              {excellentCount > 0 && (
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${(excellentCount / total) * 100}%` }}
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
              {rejectedCount > 0 && (
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${(rejectedCount / total) * 100}%` }}
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
                  {tmpl(t.interpreter.countApproved, { count: approvedCount })}
                </span>
              )}
              {excellentCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-500">
                  <Award className="w-3.5 h-3.5" />
                  {tmpl(t.interpreter.countExcellent, { count: excellentCount })}
                </span>
              )}
              {submittedCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600">
                  <Clock className="w-3.5 h-3.5" />
                  {tmpl(t.interpreter.countUnderReview, { count: submittedCount })}
                </span>
              )}
              {revisionCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-red-600">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {tmpl(t.interpreter.countRevision, { count: revisionCount })}
                </span>
              )}
              {rejectedCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-red-700">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {tmpl(t.interpreter.countRejected, { count: rejectedCount })}
                </span>
              )}
              {inProgressCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600">
                  <FileText className="w-3.5 h-3.5" />
                  {tmpl(t.interpreter.countInProgress, { count: inProgressCount })}
                </span>
              )}
              {notStarted > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {tmpl(t.interpreter.countNotStarted, { count: notStarted })}
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
            <p className="text-slate-500">{t.interpreter.noAssigned}</p>
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
                <span className="text-xs text-slate-500">{tmpl(t.interpreter.countItems, { count: items.length })}</span>
                <div className="flex-1 h-px bg-card" />
              </div>

              <div className="space-y-2">
                {items.map((consultation) => {
                  const report = reportsMap.get(consultation.id);
                  const rs = report ? ((report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus) : null;

                  const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
                    approved: { label: t.interpreter.statusApprovedDone, variant: 'default', className: 'bg-emerald-500' },
                    excellent: { label: t.interpreter.excellent, variant: 'default', className: 'bg-amber-500' },
                    submitted: { label: t.interpreter.statusUnderReview, variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
                    under_review: { label: t.interpreter.statusUnderReview, variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
                    revision_requested: { label: t.interpreter.statusRevisionRequested, variant: 'outline', className: 'border-amber-200 text-amber-700 bg-amber-50' },
                    rejected: { label: t.interpreter.statusRejected, variant: 'destructive' },
                    draft: { label: t.interpreter.statusDraft, variant: 'secondary' },
                  };
                  const statusInfo = rs ? statusMap[rs] : { label: t.interpreter.statusNotWritten, variant: 'secondary' as const };

                  return (
                    <Link
                      key={consultation.id}
                      href={`/interpreter/events/${eventId}/consultation/${consultation.id}`}
                    >
                      <Card className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer group mb-2">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* 시간 + 상태 */}
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
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
