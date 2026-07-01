import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

// 단건 상담 추가 (무손실) — 타임테이블 재업로드(전체 wipe) 없이 현장 워크인 상담 1건 생성.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createAdminClient();
  const body = await request.json();
  const { event_id, time_slot_id, buyer_id, seller_id } = body;
  const interpreter_id = body.interpreter_id || null;

  if (!event_id || !time_slot_id || !buyer_id || !seller_id) {
    return NextResponse.json({ error: '상담회·시간·바이어·셀러는 필수입니다' }, { status: 400 });
  }

  try {
    // 무결성: slot/buyer/seller 가 모두 같은 event 소속인지 + interpreter 가 실제 통역사인지 검증
    const [slotOk, buyerOk, sellerOk, interp] = await Promise.all([
      admin.from('time_slots').select('id').eq('id', time_slot_id).eq('event_id', event_id).maybeSingle(),
      admin.from('buyers').select('id').eq('id', buyer_id).eq('event_id', event_id).maybeSingle(),
      admin.from('sellers').select('id').eq('id', seller_id).eq('event_id', event_id).maybeSingle(),
      interpreter_id
        ? admin.from('profiles').select('role').eq('id', interpreter_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!slotOk.data || !buyerOk.data || !sellerOk.data) {
      return NextResponse.json({ error: '시간·바이어·셀러가 이 상담회 소속이 아닙니다' }, { status: 400 });
    }
    if (interpreter_id && interp.data?.role !== 'interpreter') {
      return NextResponse.json({ error: '유효한 통역사가 아닙니다' }, { status: 400 });
    }

    // 상담행 먼저 생성 (실패 시 event_interpreters 오염 없도록 upsert 는 성공 후)
    const { data, error } = await admin
      .from('consultations')
      .insert({ event_id, time_slot_id, buyer_id, seller_id, interpreter_id })
      .select('id, time_slot_id, buyer_id, seller_id, interpreter_id, memo, status, buyer_status')
      .single();

    if (error) {
      if (error.code === '23505') {
        const ctx = `${error.message} ${error.details ?? ''}`.toLowerCase();
        const msg = ctx.includes('interpreter')
          ? '이 통역사는 같은 시간에 다른 상담이 배정되어 있습니다'
          : ctx.includes('seller')
            ? '이 셀러는 같은 시간에 다른 상담이 배정되어 있습니다'
            : '이 시간대에 해당 바이어 상담이 이미 있습니다';
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      return NextResponse.json({ error: '상담 추가에 실패했습니다' }, { status: 500 });
    }

    // 통역사 배정 시 event_interpreters 등록 (상담 생성 성공 후)
    if (interpreter_id) {
      await admin.from('event_interpreters').upsert(
        { event_id, interpreter_id },
        { onConflict: 'event_id,interpreter_id' }
      );
    }

    return NextResponse.json({ success: true, consultation: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '상담 추가 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
