import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // 인증 + Admin 확인
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

  // Admin-confirmed — use service-role client for the mutations to bypass RLS
  const admin = createAdminClient();

  const body = await request.json();
  const allowedFields = ['buyer_id', 'seller_id', 'interpreter_id', 'memo'];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
  }

  // 통역사 배정 시 event_interpreters에도 자동 등록
  if (updateData.interpreter_id) {
    const { data: consultation } = await admin
      .from('consultations')
      .select('event_id')
      .eq('id', id)
      .single();

    if (consultation) {
      await admin.from('event_interpreters').upsert(
        { event_id: consultation.event_id, interpreter_id: updateData.interpreter_id as string },
        { onConflict: 'event_id,interpreter_id' }
      );
    }
  }

  const { error } = await admin
    .from('consultations')
    .update(updateData)
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이 통역사는 같은 시간에 다른 상담이 배정되어 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: '수정에 실패했습니다' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
