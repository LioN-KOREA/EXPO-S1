import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { batchIn } from '@/lib/supabase/batch-query';
import type { TemplateField, ReportStatus } from '@/types';

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

  // 금액 필드
  const amountKeywords = ['금액', '액', 'amount', 'contract', '계약', '추진', '상담'];
  const amountFields = fields.filter(f => f.type === 'number' && amountKeywords.some(k => f.label.toLowerCase().includes(k)));
  const possibilityField = fields.find(f => f.label.includes('거래가능성') || f.label.includes('가능성'));

  function applyHeaderStyle(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const workbook = new ExcelJS.Workbook();

  // ── 시트 1: 요약 통계 ──
  const summarySheet = workbook.addWorksheet('요약 통계');
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

  summarySheet.addRow(['항목', '값']);
  applyHeaderStyle(summarySheet.getRow(1));
  summarySheet.addRow(['총 상담건수', consultations?.length ?? 0]);
  amountFields.forEach(f => {
    let total = 0;
    reports.forEach(r => {
      const val = (r.data as Record<string, unknown>)?.[f.key];
      const cleaned = String(val ?? '').replace(/,/g, '').trim();
      if (cleaned && !isNaN(Number(cleaned))) total += Number(cleaned);
    });
    summarySheet.addRow([f.label, total]);
  });
  summarySheet.addRow(['승인', statusCounts.approved]);
  summarySheet.addRow(['검토중', statusCounts.submitted]);
  summarySheet.addRow(['수정요청', statusCounts.revision_requested]);
  summarySheet.addRow(['반려', statusCounts.rejected]);
  summarySheet.addRow(['작성중', statusCounts.draft]);
  summarySheet.addRow(['미작성', statusCounts.not_started]);
  summarySheet.getColumn(1).width = 20;
  summarySheet.getColumn(2).width = 20;
  summarySheet.getColumn(2).numFmt = '#,##0';

  // ── 시트 2: 바이어별 실적 ──
  const buyerSheet = workbook.addWorksheet('바이어별 실적');
  const buyerHeaders = ['바이어', '국가', '상담건수', ...amountFields.map(f => f.label)];
  applyHeaderStyle(buyerSheet.addRow(buyerHeaders));

  const buyerMap = new Map<string, { name: string; country: string; count: number; amounts: number[] }>();
  consultations?.forEach(c => {
    const existing = buyerMap.get(c.buyer_id);
    const amts = amountFields.map(f => {
      const report = reportsMap.get(c.id);
      const val = (report?.data as Record<string, unknown>)?.[f.key];
      const cleaned = String(val ?? '').replace(/,/g, '').trim();
      return cleaned && !isNaN(Number(cleaned)) ? Number(cleaned) : 0;
    });
    if (existing) {
      existing.count++;
      amts.forEach((a, i) => existing.amounts[i] += a);
    } else {
      buyerMap.set(c.buyer_id, { name: c.buyer?.company_name ?? '', country: c.buyer?.country ?? '', count: 1, amounts: [...amts] });
    }
  });
  Array.from(buyerMap.values()).sort((a, b) => (b.amounts[0] || 0) - (a.amounts[0] || 0)).forEach(b => {
    buyerSheet.addRow([b.name, b.country, b.count, ...b.amounts]);
  });
  buyerSheet.columns.forEach((col, i) => { col.width = i < 2 ? 25 : 18; if (i >= 2) col.numFmt = '#,##0'; });

  // ── 시트 3: 셀러별 실적 ──
  const sellerSheet = workbook.addWorksheet('셀러별 실적');
  const sellerHeaders = ['셀러', '상담건수', ...amountFields.map(f => f.label)];
  applyHeaderStyle(sellerSheet.addRow(sellerHeaders));

  const sellerMap = new Map<string, { name: string; count: number; amounts: number[] }>();
  consultations?.forEach(c => {
    const existing = sellerMap.get(c.seller_id);
    const amts = amountFields.map(f => {
      const report = reportsMap.get(c.id);
      const val = (report?.data as Record<string, unknown>)?.[f.key];
      const cleaned = String(val ?? '').replace(/,/g, '').trim();
      return cleaned && !isNaN(Number(cleaned)) ? Number(cleaned) : 0;
    });
    if (existing) {
      existing.count++;
      amts.forEach((a, i) => existing.amounts[i] += a);
    } else {
      sellerMap.set(c.seller_id, { name: c.seller?.company_name_kr || c.seller?.company_name || '', count: 1, amounts: [...amts] });
    }
  });
  Array.from(sellerMap.values()).sort((a, b) => (b.amounts[0] || 0) - (a.amounts[0] || 0)).forEach(s => {
    sellerSheet.addRow([s.name, s.count, ...s.amounts]);
  });
  sellerSheet.columns.forEach((col, i) => { col.width = i < 1 ? 25 : 18; if (i >= 1) col.numFmt = '#,##0'; });

  // ── 시트 4: 국가별 성과 ──
  const countrySheet = workbook.addWorksheet('국가별 성과');
  const countryHeaders = ['국가', '상담건수', ...amountFields.map(f => f.label), '평균 거래가능성(%)'];
  applyHeaderStyle(countrySheet.addRow(countryHeaders));

  const possibilityScores: Record<string, number> = { '상': 100, '중': 50, '하': 0 };
  const countryMap = new Map<string, { country: string; count: number; amounts: number[]; possSum: number; possCount: number }>();
  consultations?.forEach(c => {
    const country = c.buyer?.country ?? '기타';
    const existing = countryMap.get(country);
    const amts = amountFields.map(f => {
      const report = reportsMap.get(c.id);
      const val = (report?.data as Record<string, unknown>)?.[f.key];
      const cleaned = String(val ?? '').replace(/,/g, '').trim();
      return cleaned && !isNaN(Number(cleaned)) ? Number(cleaned) : 0;
    });
    let possScore = 0; let hasPoss = false;
    if (possibilityField) {
      const report = reportsMap.get(c.id);
      const val = String((report?.data as Record<string, unknown>)?.[possibilityField.key] ?? '');
      if (val in possibilityScores) { possScore = possibilityScores[val]; hasPoss = true; }
    }
    if (existing) {
      existing.count++;
      amts.forEach((a, i) => existing.amounts[i] += a);
      if (hasPoss) { existing.possSum += possScore; existing.possCount++; }
    } else {
      countryMap.set(country, { country, count: 1, amounts: [...amts], possSum: hasPoss ? possScore : 0, possCount: hasPoss ? 1 : 0 });
    }
  });
  Array.from(countryMap.values()).sort((a, b) => b.count - a.count).forEach(c => {
    const avg = c.possCount > 0 ? Math.round(c.possSum / c.possCount) : '';
    countrySheet.addRow([c.country, c.count, ...c.amounts, avg]);
  });
  countrySheet.columns.forEach((col, i) => { col.width = i < 1 ? 20 : 18; if (i >= 1) col.numFmt = '#,##0'; });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `대시보드_${event?.name || eventId}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
