import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarDays, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReportStatus } from '@/types';
import { batchIn } from '@/lib/supabase/batch-query';
import { ConsultationScheduleCard } from '@/components/interpreter/ConsultationScheduleCard';
import { ScheduleDateFilter } from './ScheduleDateFilter';
import { ScheduleAddButton } from './ScheduleAddButton';

export default async function InterpreterSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; status?: string }>;
}) {
  const { id: eventId } = await params;
  const { date: dateFilter, status: statusFilter } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single();
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
    .eq('interpreter_id', user.id);

  consultations?.sort((a, b) => {
    const dA = a.time_slot?.date || '';
    const dB = b.time_slot?.date || '';
    if (dA !== dB) return dA.localeCompare(dB);
    return (a.time_slot?.start_time || '').localeCompare(b.time_slot?.start_time || '');
  });

  // 사용 가능 일자
  const allDates = Array.from(new Set((consultations ?? []).map((c) => c.time_slot?.date).filter(Boolean))) as string[];
  const selectedDate = dateFilter && allDates.includes(dateFilter) ? dateFilter : (allDates[0] ?? '');

  // 일자 필터 적용
  let filtered = (consultations ?? []).filter((c) => !selectedDate || c.time_slot?.date === selectedDate);
  if (statusFilter && statusFilter !== 'all') {
    filtered = filtered.filter((c) => c.status === statusFilter);
  }

  // 일지 조회
  const ids = filtered.map((c) => c.id);
  const reports = await batchIn(
    (rids) => supabase.from('consultation_reports').select('consultation_id, submitted, report_status').in('consultation_id', rids),
    ids,
  );
  const reportsMap = new Map(reports.map((r: Record<string, unknown>) => [r.consultation_id, r]));

  const total = filtered.length;
  const submittedTotal = filtered.filter((c) => {
    const r = reportsMap.get(c.id);
    if (!r) return false;
    const rs = r.report_status ?? (r.submitted ? 'submitted' : 'draft');
    return rs === 'approved' || rs === 'excellent';
  }).length;

  return (
    <div>
      <Link href={`/interpreter/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        대시보드로
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-rose-500" />
            스케줄 정보
          </h2>
          <p className="text-sm text-slate-500 mt-1">{event.name}</p>
        </div>
        <ScheduleAddButton />
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">오늘의 스케줄</p>
            <p className="text-2xl font-bold text-foreground mt-1">{total}개</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">제출된 상담일지</p>
            <p className="text-2xl font-bold text-rose-500 mt-1">
              {submittedTotal}<span className="text-sm text-slate-400">/{total}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 일자·상태 필터 */}
      <ScheduleDateFilter
        eventId={eventId}
        allDates={allDates}
        selectedDate={selectedDate}
        selectedStatus={statusFilter ?? 'all'}
      />

      {/* 스케줄 카드 리스트 */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-slate-500">해당 조건의 스케줄이 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((c) => {
            const r = reportsMap.get(c.id);
            const reportStatus = r
              ? ((r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus)
              : null;
            return (
              <ConsultationScheduleCard
                key={c.id}
                consultationId={c.id}
                eventId={eventId}
                status={c.status ?? 'scheduled'}
                startTime={c.time_slot?.start_time ?? ''}
                endTime={c.time_slot?.end_time ?? ''}
                boothNumber={c.buyer?.booth_number ?? ''}
                buyerName={c.buyer?.company_name ?? ''}
                buyerCountry={c.buyer?.country ?? ''}
                sellerName={c.seller?.company_name_kr || c.seller?.company_name || ''}
                reportStatus={reportStatus}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
