import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { ReportsFilter } from '@/components/admin/ReportsFilter';

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  // 상담 + 일지 조회
  const { data: consultations } = await supabase
    .from('consultations')
    .select(`
      *,
      time_slot:time_slots(*),
      buyer:buyers(*),
      seller:sellers(*),
      interpreter:profiles!consultations_interpreter_id_fkey(name, email)
    `)
    .eq('event_id', eventId);

  // 날짜+시간순 정렬
  consultations?.sort((a, b) => {
    const dateA = a.time_slot?.date || '';
    const dateB = b.time_slot?.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time_slot?.start_time || '';
    const timeB = b.time_slot?.start_time || '';
    return timeA.localeCompare(timeB);
  });

  // 일지 조회 (제출/미제출 모두)
  const consultationIds = consultations?.map((c) => c.id) ?? [];
  const { data: reports } = consultationIds.length > 0
    ? await supabase
        .from('consultation_reports')
        .select('*')
        .in('consultation_id', consultationIds)
    : { data: [] };

  const reportsMap = new Map(reports?.map((r) => [r.consultation_id, r]) ?? []);

  const submitted = reports?.filter((r) => r.submitted).length ?? 0;
  const inProgress = reports?.filter((r) => !r.submitted).length ?? 0;
  const total = consultations?.length ?? 0;
  const notStarted = total - submitted - inProgress;

  // 클라이언트 컴포넌트용 데이터 직렬화
  const items = (consultations ?? []).map((c) => {
    const report = reportsMap.get(c.id);
    const status: 'submitted' | 'in_progress' | 'not_started' = report?.submitted
      ? 'submitted'
      : report
        ? 'in_progress'
        : 'not_started';

    return {
      id: c.id,
      buyer_name: c.buyer?.company_name ?? '',
      seller_name: c.seller?.company_name_kr || c.seller?.company_name || '',
      interpreter_name: c.interpreter?.name ?? '',
      date: c.time_slot?.date || '날짜 미정',
      start_time: c.time_slot?.start_time ?? '',
      end_time: c.time_slot?.end_time ?? '',
      status,
    };
  });

  return (
    <div>
      <Link href={`/admin/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 상세로
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">상담일지 조회</h2>
          <p className="text-slate-500 mt-1">
            {submitted}/{total}건 제출 완료
          </p>
        </div>
        <a href={`/api/export/reports?event_id=${eventId}`}>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            엑셀 다운로드
          </Button>
        </a>
      </div>

      <ReportsFilter
        eventId={eventId}
        items={items}
        counts={{ total, submitted, inProgress, notStarted }}
      />
    </div>
  );
}
