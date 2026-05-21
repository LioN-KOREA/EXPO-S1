import { createClient } from '@/lib/supabase/server';
import { parseTimetableExcel } from '@/lib/excel/timetable-parser';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const eventId = formData.get('event_id') as string;
  if (!file) return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 });
  }

  try {
    // 기존 일지 현황 체크 (event_id가 있을 때만)
    let existingReports = { total: 0, submitted: 0, inProgress: 0 };
    if (eventId) {
      const { data: cons } = await supabase
        .from('consultations')
        .select('id')
        .eq('event_id', eventId);

      if (cons && cons.length > 0) {
        const { data: reports } = await supabase
          .from('consultation_reports')
          .select('submitted')
          .in('consultation_id', cons.map(c => c.id));

        if (reports) {
          existingReports.total = reports.length;
          existingReports.submitted = reports.filter(r => r.submitted).length;
          existingReports.inProgress = reports.filter(r => !r.submitted).length;
        }
      }
    }
    const buffer = await file.arrayBuffer();
    const result = await parseTimetableExcel(buffer);

    // 검증: 오류 체크
    const errors: { row: number; field: string; message: string }[] = [];

    // 바이어 검증
    const emailSet = new Set<string>();
    result.buyers.forEach((buyer, idx) => {
      if (!buyer.company_name) {
        errors.push({ row: idx, field: 'company_name', message: '회사명이 비어있습니다' });
      }
      if (!buyer.country) {
        errors.push({ row: idx, field: 'country', message: '국가가 비어있습니다' });
      }
      if (buyer.email) {
        if (emailSet.has(buyer.email.toLowerCase())) {
          errors.push({ row: idx, field: 'email', message: `중복된 이메일: ${buyer.email}` });
        }
        emailSet.add(buyer.email.toLowerCase());
      }
    });

    // 타임슬롯 검증
    result.time_slots.forEach((slot, idx) => {
      if (!slot.start_time || !slot.end_time) {
        errors.push({ row: idx, field: 'time', message: `시간 형식 오류 (슬롯 ${idx + 1})` });
      }
    });

    return NextResponse.json({
      success: true,
      preview: {
        time_slots: result.time_slots,
        buyers: result.buyers,
        sellers: result.sellers,
        consultations: result.consultations,
      },
      summary: {
        slots: result.time_slots.length,
        buyers: result.buyers.length,
        sellers: result.sellers.length,
        consultations: result.consultations.length,
      },
      errors,
      existingReports,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '파싱 오류';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
