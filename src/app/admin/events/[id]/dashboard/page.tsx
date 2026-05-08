import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { EventDashboardClient } from '@/components/admin/dashboard/EventDashboardClient';
import type { TemplateField, ReportStatus } from '@/types';
import { batchIn } from '@/lib/supabase/batch-query';

export default async function EventDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single();
  if (!event) notFound();

  // 모든 상담 + 관련 데이터
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

  // 리포트 (배치 조회)
  const consultationIds = consultations?.map(c => c.id) ?? [];
  const reports = await batchIn(
    (ids) => supabase.from('consultation_reports').select('*').in('consultation_id', ids),
    consultationIds,
  );

  // 템플릿 필드
  const { data: template } = await supabase
    .from('report_templates').select('fields').eq('event_id', eventId).single();

  const fields: TemplateField[] = (template?.fields as TemplateField[]) ?? [];

  // 상태별 집계
  const reportsMap = new Map(reports.map((r: Record<string, unknown>) => [r.consultation_id, r]));
  const statusCounts: Record<string, number> = { approved: 0, submitted: 0, revision_requested: 0, draft: 0, not_started: 0 };

  (consultations ?? []).forEach(c => {
    const report = reportsMap.get(c.id);
    if (!report) { statusCounts.not_started++; return; }
    const rs = (report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') statusCounts.approved++;
    else if (rs === 'submitted' || rs === 'under_review') statusCounts.submitted++;
    else if (rs === 'revision_requested') statusCounts.revision_requested++;
    else statusCounts.draft++;
  });

  // 금액 필드 자동 감지 (number 타입 필드에서 '금액', '액', 'amount', 'contract' 포함)
  const amountKeywords = ['금액', '액', 'amount', 'contract', '계약', '추진'];
  const amountFields = fields.filter(f =>
    f.type === 'number' && amountKeywords.some(k => f.label.toLowerCase().includes(k))
  );

  // 거래가능성 필드 감지
  const possibilityField = fields.find(f =>
    f.label.includes('거래가능성') || f.label.includes('가능성') || f.label.includes('possibility')
  );

  // 금액 집계
  const amountTotals: { label: string; total: number }[] = amountFields.map(f => {
    let total = 0;
    reports?.forEach(r => {
      const val = (r.data as Record<string, unknown>)?.[f.key];
      if (val && !isNaN(Number(val))) total += Number(val);
    });
    return { label: f.label, total };
  });

  // 거래가능성 집계
  const possibilityCounts: Record<string, number> = {};
  if (possibilityField) {
    reports?.forEach(r => {
      const val = String((r.data as Record<string, unknown>)?.[possibilityField.key] ?? '');
      if (val) possibilityCounts[val] = (possibilityCounts[val] || 0) + 1;
    });
  }

  // 바이어별 상담건수 순위
  const buyerRanking: { name: string; country: string; count: number }[] = [];
  const buyerCountMap = new Map<string, number>();
  consultations?.forEach(c => {
    buyerCountMap.set(c.buyer_id, (buyerCountMap.get(c.buyer_id) || 0) + 1);
  });
  buyerCountMap.forEach((count, buyerId) => {
    const c = consultations?.find(x => x.buyer_id === buyerId);
    buyerRanking.push({ name: c?.buyer?.company_name ?? '', country: c?.buyer?.country ?? '', count });
  });
  buyerRanking.sort((a, b) => b.count - a.count);

  // 셀러별 상담건수 순위
  const sellerRanking: { name: string; count: number }[] = [];
  const sellerCountMap = new Map<string, number>();
  consultations?.forEach(c => {
    sellerCountMap.set(c.seller_id, (sellerCountMap.get(c.seller_id) || 0) + 1);
  });
  sellerCountMap.forEach((count, sellerId) => {
    const c = consultations?.find(x => x.seller_id === sellerId);
    sellerRanking.push({ name: c?.seller?.company_name_kr || c?.seller?.company_name || '', count });
  });
  sellerRanking.sort((a, b) => b.count - a.count);

  return (
    <div>
      <Link href={`/admin/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 상세로
      </Link>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">{event.name} - 대시보드</h2>
        <p className="text-slate-500 text-sm mt-1">{event.start_date} ~ {event.end_date}</p>
      </div>

      <EventDashboardClient
        totalConsultations={consultations?.length ?? 0}
        statusCounts={statusCounts}
        amountTotals={amountTotals}
        possibilityCounts={possibilityCounts}
        possibilityLabel={possibilityField?.label ?? '거래가능성'}
        buyerRanking={buyerRanking.slice(0, 10)}
        sellerRanking={sellerRanking.slice(0, 10)}
      />
    </div>
  );
}
