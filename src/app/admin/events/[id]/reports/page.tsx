import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, FileText, CheckCircle2, Wallet, FileSignature } from 'lucide-react';
import { ReportsFilter } from '@/components/admin/ReportsFilter';
import type { ReportStatus, TemplateField } from '@/types';
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

  // 양식 필드 + 금액 자동 감지 (BIS@T P9 패턴)
  const { data: template } = await supabase
    .from('report_templates').select('fields').eq('event_id', eventId).single();
  const fields: TemplateField[] = (template?.fields as TemplateField[]) ?? [];

  const numberFields = fields.filter((f) => f.type === 'number');
  const consultAmountField = numberFields.find((f) =>
    /상담|수출/.test(f.label) && !/계약/.test(f.label)
  ) ?? numberFields[0];
  const contractAmountField = numberFields.find((f) =>
    /계약|추진|성사/.test(f.label)
  );

  function sumField(field: TemplateField | undefined): number {
    if (!field) return 0;
    let sum = 0;
    reports?.forEach((r) => {
      const val = (r.data as Record<string, unknown>)?.[field.key];
      const cleaned = String(val ?? '').replace(/,/g, '').trim();
      if (cleaned && !isNaN(Number(cleaned))) sum += Number(cleaned);
    });
    return sum;
  }

  const totalConsultAmount = sumField(consultAmountField);
  const totalContractAmount = sumField(contractAmountField);

  function formatKRW(n: number): string {
    return n.toLocaleString('ko-KR');
  }

  // 상태 집계 (excellent 포함)
  type ItemStatus = 'submitted' | 'approved' | 'excellent' | 'revision_requested' | 'rejected' | 'in_progress' | 'not_started';
  let submittedCount = 0;
  let approvedCount = 0;
  let excellentCount = 0;
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
      } else if (rs === 'excellent') {
        status = 'excellent';
        excellentCount++;
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
      booth_number: c.buyer?.booth_number ?? '',
      date: c.time_slot?.date || '날짜 미정',
      start_time: c.time_slot?.start_time ?? '',
      end_time: c.time_slot?.end_time ?? '',
      status,
    };
  });

  const total = consultations?.length ?? 0;

  return (
    <div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">상담일지 조회</h2>
          <p className="text-slate-500 mt-1">
            {approvedCount + excellentCount}/{total}건 승인 완료
            {excellentCount > 0 && <span className="text-amber-600"> · 우수상담 {excellentCount}건</span>}
          </p>
        </div>
        <a href={`/api/export/reports?event_id=${eventId}`}>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            엑셀 다운로드
          </Button>
        </a>
      </div>

      {/* KPI 4종 (BIS@T P9 패턴) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 truncate">{consultAmountField?.label ?? '수출상담액'}</p>
                <p className="text-lg font-bold text-foreground truncate">
                  {formatKRW(totalConsultAmount)}
                  <span className="text-xs text-slate-400 ml-1">USD</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <FileSignature className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 truncate">{contractAmountField?.label ?? '계약추진액'}</p>
                <p className="text-lg font-bold text-foreground truncate">
                  {formatKRW(totalContractAmount)}
                  <span className="text-xs text-slate-400 ml-1">USD</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 truncate">총 상담일지</p>
                <p className="text-lg font-bold text-foreground">
                  {(submittedCount + approvedCount + excellentCount + revisionCount + rejectedCount)}
                  <span className="text-sm text-slate-400">/{total}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 truncate">승인 · 우수 · 미작성</p>
                <p className="text-lg font-bold text-foreground">
                  <span className="text-emerald-600">{approvedCount}</span>
                  <span className="text-sm text-slate-400 mx-1">·</span>
                  <span className="text-amber-500">{excellentCount}</span>
                  <span className="text-sm text-slate-400 mx-1">·</span>
                  <span className="text-slate-500">{notStartedCount}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ReportsFilter
        eventId={eventId}
        items={items}
        counts={{
          total,
          submitted: submittedCount,
          approved: approvedCount,
          excellent: excellentCount,
          revisionRequested: revisionCount,
          rejected: rejectedCount,
          inProgress: inProgressCount,
          notStarted: notStartedCount,
        }}
      />
    </div>
  );
}
