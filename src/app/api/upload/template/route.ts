import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseTemplateExcel } from '@/lib/excel/template-parser';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';
import { ensureSystemFields } from '@/lib/template/defaults';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const eventId = formData.get('event_id') as string;

  if (!file || !eventId) {
    return NextResponse.json({ error: '파일과 이벤트 ID가 필요합니다' }, { status: 400 });
  }

  // 파일 검증 (10MB, 엑셀만)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 });
  }
  const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
  if (file.type && !validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
    return NextResponse.json({ error: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const buffer = await file.arrayBuffer();
    const result = await parseTemplateExcel(buffer);

    // 시스템 필드 강제 보강 (consultation_type/absence_reason 잠금)
    const enforcedFields = ensureSystemFields(result.fields);

    // 기존 템플릿 삭제 후 저장
    await admin.from('report_templates').delete().eq('event_id', eventId);

    const { error } = await admin.from('report_templates').insert({
      event_id: eventId,
      fields: enforcedFields,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      fields: enforcedFields,
      preview: result.preview,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '파싱 오류';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
