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

  if (Object.keys(updateData).length === 0 && !('booth_number' in body)) {
    return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
  }

  try {
    // 부스번호 변경 (buyers 테이블)
    if ('booth_number' in body) {
      const targetBuyerId = body.buyer_id || (await admin.from('consultations').select('buyer_id').eq('id', id).single()).data?.buyer_id;
      if (targetBuyerId) {
        const { error: boothErr } = await admin.from('buyers').update({ booth_number: body.booth_number }).eq('id', targetBuyerId);
        if (boothErr) return NextResponse.json({ error: '부스번호 수정 실패' }, { status: 500 });
      }
    }

    // consultations 업데이트할 항목이 없으면 여기서 종료
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true });
    }

    // 통역사 배정 시 event_interpreters에도 자동 등록
    if (updateData.interpreter_id) {
      const { data: consultation } = await admin
        .from('consultations')
        .select('event_id')
        .eq('id', id)
        .single();

      if (consultation) {
        const { error: eiErr } = await admin.from('event_interpreters').upsert(
          { event_id: consultation.event_id, interpreter_id: updateData.interpreter_id as string },
          { onConflict: 'event_id,interpreter_id' }
        );
        if (eiErr) return NextResponse.json({ error: '통역사 배정 실패' }, { status: 500 });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : '수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
