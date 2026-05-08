import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseTemplateExcel } from '@/lib/excel/template-parser';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
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
    const result = parseTemplateExcel(buffer);

    // 기존 템플릿 삭제 후 저장
    await admin.from('report_templates').delete().eq('event_id', eventId);

    const { error } = await admin.from('report_templates').insert({
      event_id: eventId,
      fields: result.fields,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      fields: result.fields,
      preview: result.preview,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '파싱 오류';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
