import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { batchIn } from '@/lib/supabase/batch-query';
import type { TemplateField, ReportStatus } from '@/types';

const HEADER_STYLE = {
  fill: { fgColor: { rgb: '1E3A5F' } },
  font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};
const NUM_STYLE = { numFmt: '#,##0' };

function applyHeaderStyle(ws: XLSX.WorkSheet, row: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
    if (cell) cell.s = HEADER_STYLE;
  }
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const eventId = request.nextUrl.searchParams.get('event_id');
  if (!eventId) return NextResponse.json({ error: 'event_id가 필요합니다' }, { status: 400 });

  const { data: event } = await supabase.from('events').select('name').eq('id', eventId).single();

  const { data: consultations } = await supabase
    .from('consultations')
    .select('*, time_slot:time_slots(*), buyer:buyers(*), seller:sellers(*), interpreter:profiles!consultations_interpreter_id_fkey(name)')
    .eq('event_id', eventId);

  const consultationIds = consultations?.map(c => c.id) ?? [];
  const reports = await batchIn(
    (ids) => supabase.from('consultation_reports').select('*').in('consultation_id', ids),
    consultationIds,
  );
  const reportsMap = new Map(reports.map((r: Record<string, unknown>) => [r.consultation_id, r]));

  const { data: template } = await supabase.from('report_templates').select('fields').eq('event_id', eventId).single();
  const fields: TemplateField[] = (template?.fields as TemplateField[]) ?? [];

  const amountKeywords = ['금액', '액', 'amount', 'contract', '계약', '추진', '상담'];
  const amountFields = fields.filter(f => f.type === 'number' && amountKeywords.some(k => f.label.toLowerCase().includes(k)));
  const possibilityField = fields.find(f => f.label.includes('거래가능성') || f.label.includes('가능성'));
  const possibilityScores: Record<string, number> = { '상': 100, '중': 50, '하': 0 };

  function getAmount(consultationId: string, field: TemplateField): number {
    const report = reportsMap.get(consultationId);
    if (!report) return 0;
    const val = (report.data as Record<string, unknown>)?.[field.key];
    const cleaned = String(val ?? '').replace(/,/g, '').trim();
    return cleaned && !isNaN(Number(cleaned)) ? Number(cleaned) : 0;
  }

  const wb = XLSX.utils.book_new();

  // ── 시트 1: 요약 통계 ──
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

  const summaryRows: unknown[][] = [['항목', '값'], ['총 상담건수', consultations?.length ?? 0]];
  amountFields.forEach(f => {
    let total = 0;
    reports.forEach(r => { total += getAmount(r.consultation_id as string, f); });
    summaryRows.push([f.label, total]);
  });
  summaryRows.push(['승인', statusCounts.approved], ['검토중', statusCounts.submitted], ['수정요청', statusCounts.revision_requested], ['반려', statusCounts.rejected], ['작성중', statusCounts.draft], ['미작성', statusCounts.not_started]);

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  applyHeaderStyle(ws1, 0, 2);
  for (let r = 1; r < summaryRows.length; r++) {
    const cell = ws1[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && typeof cell.v === 'number') cell.s = NUM_STYLE;
  }
  setColWidths(ws1, [20, 20]);
  XLSX.utils.book_append_sheet(wb, ws1, '요약 통계');

  // ── 시트 2: 바이어별 실적 ──
  const buyerHeaders = ['바이어', '국가', '상담건수', ...amountFields.map(f => f.label)];
  const buyerMap = new Map<string, { name: string; country: string; count: number; amounts: number[] }>();
  consultations?.forEach(c => {
    const existing = buyerMap.get(c.buyer_id);
    const amts = amountFields.map(f => getAmount(c.id, f));
    if (existing) { existing.count++; amts.forEach((a, i) => existing.amounts[i] += a); }
    else buyerMap.set(c.buyer_id, { name: c.buyer?.company_name ?? '', country: c.buyer?.country ?? '', count: 1, amounts: [...amts] });
  });
  const buyerRows: unknown[][] = [buyerHeaders];
  Array.from(buyerMap.values()).sort((a, b) => (b.amounts[0] || 0) - (a.amounts[0] || 0)).forEach(b => {
    buyerRows.push([b.name, b.country, b.count, ...b.amounts]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(buyerRows);
  applyHeaderStyle(ws2, 0, buyerHeaders.length);
  for (let r = 1; r < buyerRows.length; r++) {
    for (let c = 2; c < buyerHeaders.length; c++) {
      const cell = ws2[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.s = NUM_STYLE;
    }
  }
  setColWidths(ws2, buyerHeaders.map((_, i) => i < 2 ? 25 : 18));
  XLSX.utils.book_append_sheet(wb, ws2, '바이어별 실적');

  // ── 시트 3: 셀러별 실적 ──
  const sellerHeaders = ['셀러', '상담건수', ...amountFields.map(f => f.label)];
  const sellerMap = new Map<string, { name: string; count: number; amounts: number[] }>();
  consultations?.forEach(c => {
    const existing = sellerMap.get(c.seller_id);
    const amts = amountFields.map(f => getAmount(c.id, f));
    if (existing) { existing.count++; amts.forEach((a, i) => existing.amounts[i] += a); }
    else sellerMap.set(c.seller_id, { name: c.seller?.company_name_kr || c.seller?.company_name || '', count: 1, amounts: [...amts] });
  });
  const sellerRows: unknown[][] = [sellerHeaders];
  Array.from(sellerMap.values()).sort((a, b) => (b.amounts[0] || 0) - (a.amounts[0] || 0)).forEach(s => {
    sellerRows.push([s.name, s.count, ...s.amounts]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(sellerRows);
  applyHeaderStyle(ws3, 0, sellerHeaders.length);
  for (let r = 1; r < sellerRows.length; r++) {
    for (let c = 1; c < sellerHeaders.length; c++) {
      const cell = ws3[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.s = NUM_STYLE;
    }
  }
  setColWidths(ws3, sellerHeaders.map((_, i) => i < 1 ? 25 : 18));
  XLSX.utils.book_append_sheet(wb, ws3, '셀러별 실적');

  // ── 시트 4: 국가별 성과 ──
  const countryHeaders = ['국가', '상담건수', ...amountFields.map(f => f.label), '평균 거래가능성(%)'];
  const countryMap = new Map<string, { country: string; count: number; amounts: number[]; possSum: number; possCount: number }>();
  consultations?.forEach(c => {
    const country = c.buyer?.country ?? '기타';
    const existing = countryMap.get(country);
    const amts = amountFields.map(f => getAmount(c.id, f));
    let possScore = 0; let hasPoss = false;
    if (possibilityField) {
      const report = reportsMap.get(c.id);
      const val = String((report?.data as Record<string, unknown>)?.[possibilityField.key] ?? '');
      if (val in possibilityScores) { possScore = possibilityScores[val]; hasPoss = true; }
    }
    if (existing) {
      existing.count++; amts.forEach((a, i) => existing.amounts[i] += a);
      if (hasPoss) { existing.possSum += possScore; existing.possCount++; }
    } else {
      countryMap.set(country, { country, count: 1, amounts: [...amts], possSum: hasPoss ? possScore : 0, possCount: hasPoss ? 1 : 0 });
    }
  });
  const countryRows: unknown[][] = [countryHeaders];
  Array.from(countryMap.values()).sort((a, b) => b.count - a.count).forEach(c => {
    const avg = c.possCount > 0 ? Math.round(c.possSum / c.possCount) : '';
    countryRows.push([c.country, c.count, ...c.amounts, avg]);
  });
  const ws4 = XLSX.utils.aoa_to_sheet(countryRows);
  applyHeaderStyle(ws4, 0, countryHeaders.length);
  for (let r = 1; r < countryRows.length; r++) {
    for (let c = 1; c < countryHeaders.length; c++) {
      const cell = ws4[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.s = NUM_STYLE;
    }
  }
  setColWidths(ws4, countryHeaders.map((_, i) => i < 1 ? 20 : 18));
  XLSX.utils.book_append_sheet(wb, ws4, '국가별 성과');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `대시보드_${event?.name || eventId}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
