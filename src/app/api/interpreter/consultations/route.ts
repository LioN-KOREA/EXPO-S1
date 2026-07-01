import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureRole } from '@/lib/auth/guards';

// 통역사 자가 상담 추가 (BIS@T IP2 패턴) — 본인을 통역사로 하는 상담 1건 생성.
// interpreter_id 는 body 가 아니라 인증된 사용자로 강제. added_by_interpreter=true 로 표시.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureRole(supabase, ['interpreter']);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const interpreterId = guard.user.id;

  const body = await request.json();
  const { event_id, time_slot_id, buyer_id, seller_id } = body;
  if (!event_id || !time_slot_id || !buyer_id || !seller_id) {
    return NextResponse.json({ error: '시간·바이어·셀러는 필수입니다' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    // 본인이 이 상담회에 배정된 통역사인지 + slot/buyer/seller 가 같은 event 소속인지 검증
    const [assigned, slotOk, buyerOk, sellerOk] = await Promise.all([
      admin.from('event_interpreters').select('interpreter_id').eq('event_id', event_id).eq('interpreter_id', interpreterId).maybeSingle(),
      admin.from('time_slots').select('id').eq('id', time_slot_id).eq('event_id', event_id).maybeSingle(),
      admin.from('buyers').select('id').eq('id', buyer_id).eq('event_id', event_id).maybeSingle(),
      admin.from('sellers').select('id').eq('id', seller_id).eq('event_id', event_id).maybeSingle(),
    ]);

    // service-role 경계 — 검증 쿼리 오류는 fail-closed(500)
    if (assigned.error || slotOk.error || buyerOk.error || sellerOk.error) {
      return NextResponse.json({ error: '검증 실패' }, { status: 500 });
    }
    if (!assigned.data) {
      return NextResponse.json({ error: '이 상담회에 배정된 통역사가 아닙니다' }, { status: 403 });
    }
    if (!slotOk.data || !buyerOk.data || !sellerOk.data) {
      return NextResponse.json({ error: '시간·바이어·셀러가 이 상담회 소속이 아닙니다' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('consultations')
      .insert({ event_id, time_slot_id, buyer_id, seller_id, interpreter_id: interpreterId, added_by_interpreter: true })
      .select('id, time_slot_id, buyer_id, seller_id, interpreter_id, status, added_by_interpreter')
      .single();

    if (error) {
      if (error.code === '23505') {
        const ctx = `${error.message} ${error.details ?? ''}`.toLowerCase();
        const msg = ctx.includes('interpreter')
          ? '이미 그 시간에 다른 상담이 있습니다'
          : ctx.includes('seller')
            ? '이 셀러는 그 시간에 다른 상담이 있습니다'
            : '그 시간에 해당 바이어 상담이 이미 있습니다';
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      return NextResponse.json({ error: '상담 추가에 실패했습니다' }, { status: 500 });
    }

    return NextResponse.json({ success: true, consultation: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '상담 추가 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
