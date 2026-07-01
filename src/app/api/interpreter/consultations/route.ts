import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureRole } from '@/lib/auth/guards';

// 통역사 자가 상담 추가 (BIS@T IP2 패턴). 바이어/셀러는 기존 선택(buyer_id/seller_id) 또는
// 현장 미등록 업체 즉석 등록(new_buyer/new_seller). 생성 전체를 원자 RPC 로 처리(orphan 방지).
// interpreter_id 는 body 가 아니라 인증된 사용자로 강제.
const NAME_MAX = 200;
const COUNTRY_MAX = 80;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureRole(supabase, ['interpreter']);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const interpreterId = guard.user.id;

  const body = await request.json();
  const { event_id, time_slot_id, buyer_id, seller_id, new_buyer, new_seller } = body;
  if (!event_id || !time_slot_id) {
    return NextResponse.json({ error: '상담회·시간은 필수입니다' }, { status: 400 });
  }

  const newBuyerName = (new_buyer?.company_name ?? '').trim();
  const newBuyerCountry = (new_buyer?.country ?? '').trim();
  const newSellerName = (new_seller?.company_name ?? '').trim();

  // 각 side XOR — 기존 id 와 새 업체 동시/둘다없음 금지
  if ((buyer_id && newBuyerName) || (!buyer_id && !newBuyerName)) {
    return NextResponse.json({ error: '바이어는 선택 또는 새 업체 입력 중 하나만' }, { status: 400 });
  }
  if ((seller_id && newSellerName) || (!seller_id && !newSellerName)) {
    return NextResponse.json({ error: '셀러는 선택 또는 새 업체 입력 중 하나만' }, { status: 400 });
  }
  if (newBuyerName.length > NAME_MAX || newSellerName.length > NAME_MAX || newBuyerCountry.length > COUNTRY_MAX) {
    return NextResponse.json({ error: '업체명/국가가 너무 깁니다' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const { data, error } = await admin.rpc('interpreter_add_consultation', {
      p_event_id: event_id,
      p_interpreter_id: interpreterId,
      p_time_slot_id: time_slot_id,
      p_buyer_id: buyer_id || null,
      p_new_buyer_name: newBuyerName || null,
      p_new_buyer_country: newBuyerCountry || null,
      p_seller_id: seller_id || null,
      p_new_seller_name: newSellerName || null,
    });

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
      const m = error.message ?? '';
      if (m.includes('not_assigned')) return NextResponse.json({ error: '이 상담회에 배정된 통역사가 아닙니다' }, { status: 403 });
      if (m.includes('bad_slot')) return NextResponse.json({ error: '시간이 이 상담회 소속이 아닙니다' }, { status: 400 });
      if (m.includes('bad_buyer')) return NextResponse.json({ error: '바이어 정보가 올바르지 않습니다' }, { status: 400 });
      if (m.includes('bad_seller')) return NextResponse.json({ error: '셀러 정보가 올바르지 않습니다' }, { status: 400 });
      return NextResponse.json({ error: '상담 추가에 실패했습니다' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '상담 추가 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
