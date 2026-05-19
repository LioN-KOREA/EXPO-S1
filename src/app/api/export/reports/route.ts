import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

const STATUS_LABEL: Record<string, string> = {
  approved: '승인',
  submitted: '검토중',
  under_review: '검토중',
  revision_requested: '수정요청',
  rejected: '반려',
  draft: '작성중',
  excellent: '우수상담',
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const eventId = request.nextUrl.searchParams.get('event_id');
  if (!eventId) {
    return NextResponse.json({ error: 'event_id가 필요합니다' }, { status: 400 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();

  const { data: template } = await supabase
    .from('report_templates')
    .select('fields')
    .eq('event_id', eventId)
    .single();

  const fields = (template?.fields ?? []) as Array<{
    key: string;
    label: string;
    type?: string;
    source?: string;
  }>;

  // 통역사 또는 관리자 작성 필드만 export (auto 채움 필드는 좌측 컬럼에 이미 포함됨)
  const exportFields = fields.filter((f) => (f.source ?? 'interpreter') !== 'auto');

  const { data: consultations } = await supabase
    .from('consultations')
    .select(`
      *,
      time_slot:time_slots(*),
      buyer:buyers(*),
      seller:sellers(*),
      interpreter:profiles!consultations_interpreter_id_fkey(name)
    `)
    .eq('event_id', eventId);

  consultations?.sort((a, b) => {
    const dateA = a.time_slot?.date || '';
    const dateB = b.time_slot?.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time_slot?.start_time || '';
    const timeB = b.time_slot?.start_time || '';
    return timeA.localeCompare(timeB);
  });

  const consultationIds = consultations?.map((c) => c.id) ?? [];
  const reports: Record<string, unknown>[] = [];
  for (let i = 0; i < consultationIds.length; i += 100) {
    const batch = consultationIds.slice(i, i + 100);
    const { data } = await supabase
      .from('consultation_reports')
      .select('*')
      .in('consultation_id', batch);
    if (data) reports.push(...data);
  }
  const reportsMap = new Map(reports.map((r) => [r.consultation_id, r]));

  // 엑셀 생성
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('상담일지');

  // BIS@T 스타일 좌측 자동 채움 컬럼 (C~Q 대응)
  const baseHeaders = [
    'No',
    '일지번호',
    '날짜',
    '시간',
    '현황',
    '부스',
    '바이어 회사명',
    '바이어명',
    '바이어 국가',
    '바이어 연락처',
    '바이어 이메일',
    '국내기업명',
    '국내기업 영문명',
    '국내기업 대표자',
    '국내기업 이메일',
    '통역사',
  ];
  const dynamicHeaders = exportFields.map((f) => f.label);
  const tailHeaders = ['작성일시'];
  const allHeaders = [...baseHeaders, ...dynamicHeaders, ...tailHeaders];

  const headerRow = worksheet.addRow(allHeaders);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };

  consultations?.forEach((c, idx) => {
    const report = reportsMap.get(c.id);
    const reportData = (report?.data ?? {}) as Record<string, unknown>;
    const rs = (report?.report_status ??
      (report ? (report.submitted ? 'submitted' : 'draft') : '')) as string;
    const statusLabel = report ? (STATUS_LABEL[rs] ?? '미제출') : '미제출';
    const submitTime = report?.updated_at || report?.created_at || '';

    const baseValues = [
      idx + 1,
      String(c.id).slice(0, 8),
      c.time_slot?.date ?? '',
      c.time_slot ? `${c.time_slot.start_time}-${c.time_slot.end_time}` : '',
      statusLabel,
      c.buyer?.booth_number ?? '',
      c.buyer?.company_name ?? '',
      c.buyer?.buyer_name ?? '',
      c.buyer?.country ?? '',
      c.buyer?.phone ?? '',
      c.buyer?.email ?? '',
      c.seller?.company_name_kr ?? '',
      c.seller?.company_name ?? '',
      c.seller?.representative ?? '',
      c.seller?.email ?? '',
      c.interpreter?.name ?? '',
    ];

    const dynamicValues = exportFields.map((f) => {
      const raw = reportData[f.key];
      if (raw === null || raw === undefined || raw === '') return '';
      if (f.type === 'number') {
        const cleaned = String(raw).replace(/,/g, '').trim();
        if (cleaned && !isNaN(Number(cleaned))) return Number(cleaned);
        return '';
      }
      return String(raw);
    });

    worksheet.addRow([...baseValues, ...dynamicValues, submitTime]);
  });

  // 숫자 컬럼 콤마 포맷
  const numberColIndices = exportFields
    .map((f, i) => (f.type === 'number' ? baseHeaders.length + i : -1))
    .filter((i) => i >= 0);
  numberColIndices.forEach((colIdx) => {
    worksheet.getColumn(colIdx + 1).numFmt = '#,##0';
  });

  // 열 너비 자동 조절 (한글은 2배 너비로 카운트)
  const visualWidth = (raw: unknown): number => {
    const s = String(raw ?? '');
    let w = 0;
    for (const ch of s) {
      w += /[ㄱ-ㆎ가-힣　-〿＀-￯]/.test(ch) ? 2 : 1;
    }
    return w;
  };
  worksheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.((cell) => {
      const len = visualWidth(cell.value);
      if (len > maxLen) maxLen = Math.min(len, 60);
    });
    col.width = maxLen + 3;
  });

  headerRow.height = 22;

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        `상담일지_${event?.name || eventId}.xlsx`,
      )}`,
    },
  });
}
