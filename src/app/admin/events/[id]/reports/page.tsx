import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { ReportsFilter } from '@/components/admin/ReportsFilter';
import type { ReportStatus } from '@/types';
import { batchIn } from '@/lib/supabase/batch-query';

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

  // 일지 조회 (배치 처리 — ID 많으면 URI too long 방지)
  const consultationIds = consultations?.map((c) => c.id) ?? [];
  const reports = await batchIn(
    (ids) => supabase.from('consultation_reports').select('*').in('consultation_id', ids),
    consultationIds,
  );

  const reportsMap = new Map(reports?.map((r) => [r.consultation_id, r]) ?? []);

  // 5개 상태 집계
  type ItemStatus = 'submitted' | 'approved' | 'revision_requested' | 'rejected' | 'in_progress' | 'not_started';
  let submittedCount = 0;
  let approvedCount = 0;
  let revisionCount = 0;
  let rejectedCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;

  // 클라이언트 컴포넌트용 데이터 직렬화
  const items = (consultations ?? []).map((c) => {
    const report = reportsMap.get(c.id);

    let status: ItemStatus;
    if (!report) {
      status = 'not_started';
      notStartedCount++;
    } else {
      const rs = (report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus;
      if (rs === 'approved') {
        status = 'approved';
        approvedCount++;
      } else if (rs === 'submitted' || rs === 'under_review') {
        status = 'submitted';
        submittedCount++;
      } else if (rs === 'revision_requested') {
        status = 'revision_requested';
        revisionCount++;
      } else if (rs === 'rejected') {
        status = 'rejected';
        rejectedCount++;
      } else {
        status = 'in_progress';
        inProgressCount++;
      }
    }

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

  const total = consultations?.length ?? 0;

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
            {approvedCount}/{total}건 승인 완료
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
        counts={{
          total,
          submitted: submittedCount,
          approved: approvedCount,
          revisionRequested: revisionCount,
          rejected: rejectedCount,
          inProgress: inProgressCount,
          notStarted: notStartedCount,
        }}
      />
    </div>
  );
}
