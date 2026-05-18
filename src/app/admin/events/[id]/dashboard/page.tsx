import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
  const statusCounts: Record<string, number> = { approved: 0, submitted: 0, revision_requested: 0, rejected: 0, draft: 0, not_started: 0 };

  (consultations ?? []).forEach(c => {
    const report = reportsMap.get(c.id);
    if (!report) { statusCounts.not_started++; return; }
    const rs = (report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') statusCounts.approved++;
    else if (rs === 'submitted' || rs === 'under_review') statusCounts.submitted++;
    else if (rs === 'revision_requested') statusCounts.revision_requested++;
    else if (rs === 'rejected') statusCounts.rejected++;
    else statusCounts.draft++;
  });

  // 금액 필드 자동 감지
  const amountKeywords = ['금액', '액', 'amount', 'contract', '계약', '추진', '상담'];
  const amountFields = fields.filter(f =>
    f.type === 'number' && amountKeywords.some(k => f.label.toLowerCase().includes(k))
  );

  // 수출상담액 필드 (첫 번째 금액 필드를 메인으로)
  const mainAmountField = amountFields[0];

  // 거래가능성 필드 감지
  const possibilityField = fields.find(f =>
    f.label.includes('거래가능성') || f.label.includes('가능성') || f.label.includes('possibility')
  );

  // 금액 집계
  const amountTotals: { label: string; total: number; key: string }[] = amountFields.map(f => {
    let total = 0;
    reports?.forEach(r => {
      const val = (r.data as Record<string, unknown>)?.[f.key];
      const cleaned = String(val ?? '').replace(/,/g, '').trim();
      if (cleaned && !isNaN(Number(cleaned))) total += Number(cleaned);
    });
    return { label: f.label, total, key: f.key };
  });

  // 총 수출상담액 (메인 금액)
  const totalMainAmount = amountTotals[0]?.total ?? 0;

  // 거래가능성 집계 + 평균 계산
  const possibilityCounts: Record<string, number> = {};
  const possibilityScores: Record<string, number> = { '상': 100, '중': 50, '하': 0 };
  let possibilitySum = 0;
  let possibilityCount = 0;

  if (possibilityField) {
    reports?.forEach(r => {
      const val = String((r.data as Record<string, unknown>)?.[possibilityField.key] ?? '');
      if (val) {
        possibilityCounts[val] = (possibilityCounts[val] || 0) + 1;
        if (val in possibilityScores) {
          possibilitySum += possibilityScores[val];
          possibilityCount++;
        }
      }
    });
  }
  const avgPossibility = possibilityCount > 0 ? Math.round(possibilitySum / possibilityCount) : 0;

  // ── 실적순위: 금액 기준 (바이어/셀러) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getAmountForConsultation(consultationId: string): number {
    if (!mainAmountField) return 0;
    const report = reportsMap.get(consultationId);
    if (!report) return 0;
    const val = (report.data as Record<string, unknown>)?.[mainAmountField.key];
    const cleaned = String(val ?? '').replace(/,/g, '').trim();
    return cleaned && !isNaN(Number(cleaned)) ? Number(cleaned) : 0;
  }

  // 바이어별 금액 순위
  const buyerAmountMap = new Map<string, { name: string; country: string; amount: number; count: number }>();
  consultations?.forEach(c => {
    const existing = buyerAmountMap.get(c.buyer_id);
    const amt = getAmountForConsultation(c.id);
    if (existing) {
      existing.amount += amt;
      existing.count++;
    } else {
      buyerAmountMap.set(c.buyer_id, {
        name: c.buyer?.company_name ?? '',
        country: c.buyer?.country ?? '',
        amount: amt,
        count: 1,
      });
    }
  });
  const buyerRanking = Array.from(buyerAmountMap.values()).sort((a, b) => b.amount - a.amount);

  // 셀러별 금액 순위
  const sellerAmountMap = new Map<string, { name: string; amount: number; count: number }>();
  consultations?.forEach(c => {
    const existing = sellerAmountMap.get(c.seller_id);
    const amt = getAmountForConsultation(c.id);
    if (existing) {
      existing.amount += amt;
      existing.count++;
    } else {
      sellerAmountMap.set(c.seller_id, {
        name: c.seller?.company_name_kr || c.seller?.company_name || '',
        amount: amt,
        count: 1,
      });
    }
  });
  const sellerRanking = Array.from(sellerAmountMap.values()).sort((a, b) => b.amount - a.amount);

  // ── 성과지표: 국가별 ──
  const countryStats = new Map<string, { country: string; count: number; amount: number; possibility: number; possibilityTotal: number }>();
  consultations?.forEach(c => {
    const country = c.buyer?.country ?? '기타';
    const existing = countryStats.get(country);
    const amt = getAmountForConsultation(c.id);

    let possScore = 0;
    if (possibilityField) {
      const report = reportsMap.get(c.id);
      const val = String((report?.data as Record<string, unknown>)?.[possibilityField.key] ?? '');
      if (val in possibilityScores) possScore = possibilityScores[val];
    }

    if (existing) {
      existing.count++;
      existing.amount += amt;
      if (possScore > 0) { existing.possibility += possScore; existing.possibilityTotal++; }
    } else {
      countryStats.set(country, {
        country,
        count: 1,
        amount: amt,
        possibility: possScore > 0 ? possScore : 0,
        possibilityTotal: possScore > 0 ? 1 : 0,
      });
    }
  });
  const countryMetrics = Array.from(countryStats.values()).map(c => ({
    ...c,
    avgPossibility: c.possibilityTotal > 0 ? Math.round(c.possibility / c.possibilityTotal) : 0,
  }));

  return (
    <div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground break-words">{event.name} - 대시보드</h2>
          <p className="text-slate-500 text-sm mt-1">{event.start_date} ~ {event.end_date}</p>
        </div>
        <a href={`/api/export/dashboard?event_id=${eventId}`} className="block sm:inline-block sm:self-auto">
          <Button variant="outline" className="gap-2 w-full sm:w-auto">
            <Download className="w-4 h-4" />
            엑셀 다운로드
          </Button>
        </a>
      </div>

      <EventDashboardClient
        totalConsultations={consultations?.length ?? 0}
        totalMainAmount={totalMainAmount}
        mainAmountLabel={mainAmountField?.label ?? '수출상담액'}
        statusCounts={statusCounts}
        amountTotals={amountTotals}
        possibilityCounts={possibilityCounts}
        possibilityLabel={possibilityField?.label ?? '거래가능성'}
        avgPossibility={avgPossibility}
        buyerRanking={buyerRanking.slice(0, 10)}
        sellerRanking={sellerRanking.slice(0, 10)}
        countryMetrics={countryMetrics}
      />
    </div>
  );
}
