import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

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

  // 상담회 이름 조회
  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', eventId)
    .single();

  // 양식 필드 조회
  const { data: template } = await supabase
    .from('report_templates')
    .select('fields')
    .eq('event_id', eventId)
    .single();

  const fields = (template?.fields ?? []) as Array<{ key: string; label: string }>;

  // 상담 + 일지 데이터 조회
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

  // 날짜+시간순 정렬
  consultations?.sort((a, b) => {
    const dateA = a.time_slot?.date || '';
    const dateB = b.time_slot?.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time_slot?.start_time || '';
    const timeB = b.time_slot?.start_time || '';
    return timeA.localeCompare(timeB);
  });

  const consultationIds = consultations?.map((c) => c.id) ?? [];
  const { data: reports } = consultationIds.length > 0
    ? await supabase
        .from('consultation_reports')
        .select('*')
        .in('consultation_id', consultationIds)
    : { data: [] };

  const reportsMap = new Map(reports?.map((r) => [r.consultation_id, r]) ?? []);

  // 엑셀 생성
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('상담일지');

  // 헤더 구성: 기본 정보 + 동적 필드
  const baseHeaders = ['날짜', '시간', '바이어', '바이어국가', '셀러', '통역사', '제출여부'];
  const dynamicHeaders = fields.map((f) => f.label);
  const allHeaders = [...baseHeaders, ...dynamicHeaders];

  // 헤더 행 스타일
  const headerRow = worksheet.addRow(allHeaders);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // 데이터 행
  consultations?.forEach((c) => {
    const report = reportsMap.get(c.id);
    const reportData = (report?.data ?? {}) as Record<string, unknown>;

    const baseValues = [
      c.time_slot?.date ?? '',
      `${c.time_slot?.start_time}-${c.time_slot?.end_time}`,
      c.buyer?.company_name ?? '',
      c.buyer?.country ?? '',
      c.seller?.company_name_kr || c.seller?.company_name || '',
      c.interpreter?.name ?? '',
      report?.submitted ? '제출완료' : '미제출',
    ];

    const dynamicValues = fields.map((f) => String(reportData[f.key] ?? ''));

    worksheet.addRow([...baseValues, ...dynamicValues]);
  });

  // 열 너비 자동 조절
  worksheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.((cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = Math.min(len, 50);
    });
    col.width = maxLen + 2;
  });

  // Buffer 생성
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`상담일지_${event?.name || eventId}.xlsx`)}`,
    },
  });
}
