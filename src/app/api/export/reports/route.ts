import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';

const HEADER_STYLE = {
  fill: { fgColor: { rgb: '1E3A5F' } },
  font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  border: {
    top: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    left: { style: 'thin' as const },
    right: { style: 'thin' as const },
  },
};

const NUMBER_STYLE = { numFmt: '#,##0' };

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const eventId = request.nextUrl.searchParams.get('event_id');
  if (!eventId) return NextResponse.json({ error: 'event_id가 필요합니다' }, { status: 400 });

  const { data: event } = await supabase.from('events').select('name').eq('id', eventId).single();

  const { data: template } = await supabase.from('report_templates').select('fields').eq('event_id', eventId).single();
  const fields = (template?.fields ?? []) as Array<{ key: string; label: string; type?: string }>;

  const { data: consultations } = await supabase
    .from('consultations')
    .select('*, time_slot:time_slots(*), buyer:buyers(*), seller:sellers(*), interpreter:profiles!consultations_interpreter_id_fkey(name)')
    .eq('event_id', eventId);

  consultations?.sort((a, b) => {
    const dateA = a.time_slot?.date || '';
    const dateB = b.time_slot?.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.time_slot?.start_time || '').localeCompare(b.time_slot?.start_time || '');
  });

  const consultationIds = consultations?.map(c => c.id) ?? [];
  const reports: Record<string, unknown>[] = [];
  for (let i = 0; i < consultationIds.length; i += 100) {
    const batch = consultationIds.slice(i, i + 100);
    const { data } = await supabase.from('consultation_reports').select('*').in('consultation_id', batch);
    if (data) reports.push(...data);
  }
  const reportsMap = new Map(reports.map(r => [r.consultation_id, r]));

  const baseHeaders = ['날짜', '시간', '바이어', '바이어국가', '셀러', '통역사', '제출여부'];
  const dynamicHeaders = fields.map(f => f.label);
  const allHeaders = [...baseHeaders, ...dynamicHeaders];

  const rows: unknown[][] = [allHeaders];

  consultations?.forEach(c => {
    const report = reportsMap.get(c.id);
    const reportData = (report?.data ?? {}) as Record<string, unknown>;

    const status = report ? (() => {
      const rs = (report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as string;
      if (rs === 'approved') return '승인';
      if (rs === 'submitted' || rs === 'under_review') return '검토중';
      if (rs === 'revision_requested') return '수정요청';
      if (rs === 'rejected') return '반려';
      if (rs === 'draft') return '작성중';
      return '미제출';
    })() : '미제출';

    const row = [
      c.time_slot?.date ?? '',
      `${c.time_slot?.start_time}-${c.time_slot?.end_time}`,
      c.buyer?.company_name ?? '',
      c.buyer?.country ?? '',
      c.seller?.company_name_kr || c.seller?.company_name || '',
      c.interpreter?.name ?? '',
      status,
      ...fields.map(f => {
        const raw = reportData[f.key];
        if (raw === null || raw === undefined || raw === '') return '';
        if (f.type === 'number') {
          const cleaned = String(raw).replace(/,/g, '').trim();
          if (cleaned && !isNaN(Number(cleaned))) return Number(cleaned);
          return '';
        }
        return String(raw);
      }),
    ];
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 헤더 스타일
  allHeaders.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) cell.s = HEADER_STYLE;
  });

  // 숫자 컬럼 포맷
  fields.forEach((f, i) => {
    if (f.type === 'number') {
      const colIdx = baseHeaders.length + i;
      for (let r = 1; r < rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
        if (cell && typeof cell.v === 'number') cell.s = NUMBER_STYLE;
      }
    }
  });

  // 열 너비
  ws['!cols'] = allHeaders.map((h, i) => {
    let maxLen = h.length;
    rows.forEach(row => {
      const len = String(row[i] ?? '').length;
      if (len > maxLen) maxLen = Math.min(len, 50);
    });
    return { wch: maxLen + 2 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '상담일지');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`상담일지_${event?.name || eventId}.xlsx`)}`,
    },
  });
}
