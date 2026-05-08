import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseTimetableExcel } from '@/lib/excel/timetable-parser';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 전화번호에서 뒤 4자리 추출 (초기 비밀번호용)
 * 최초 로그인 시 must_change_password로 강제 변경됨
 */
function getLast4Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-4) || '0000';
}

/**
 * 이메일로 기존 계정 찾거나 새로 생성
 */
async function findOrCreateAccount(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  name: string,
  phone: string,
  role: 'buyer' | 'seller',
  linkedId: string,
  linkedField: 'linked_buyer_id' | 'linked_seller_id'
) {
  if (!email) return;

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    await admin.from('profiles').update({ [linkedField]: linkedId }).eq('id', existing.id);
    return;
  }

  const password = getLast4Digits(phone);
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    console.warn(`계정 생성 실패 (${email}):`, authErr.message);
    return;
  }

  const { error: profileErr } = await admin.from('profiles').insert({
    id: authData.user.id,
    email,
    name,
    role,
    phone,
    [linkedField]: linkedId,
    must_change_password: true,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id);
    console.warn(`프로필 생성 실패 (${email}):`, profileErr.message);
  }
}

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

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // 업로드 잠금 체크
    const { data: event } = await admin.from('events').select('is_uploading').eq('id', eventId).single();
    if (event?.is_uploading) {
      return NextResponse.json({ error: '다른 업로드가 진행 중입니다. 잠시 후 다시 시도해주세요.' }, { status: 409 });
    }

    // 잠금 설정
    await admin.from('events').update({ is_uploading: true }).eq('id', eventId);

    const buffer = await file.arrayBuffer();
    const result = parseTimetableExcel(buffer);

    // 행 수 제한 (DoS 방지)
    if (result.buyers.length > 5000) {
      await admin.from('events').update({ is_uploading: false }).eq('id', eventId);
      return NextResponse.json({ error: '바이어 수가 5,000건을 초과합니다. 파일을 분할해주세요.' }, { status: 400 });
    }

    // 셀러에 인덱스 매핑 (RPC에서 seller_index로 참조)
    const uniqueSellers = result.sellers;
    const consultationsWithSellerIndex = result.consultations.map((c) => {
      const sellerIdx = uniqueSellers.findIndex(
        (s) => s.email === c.seller.email ||
          (s.company_name === c.seller.company_name && s.contact_name === c.seller.contact_name)
      );
      return {
        buyer_index: c.buyer_index,
        slot_index: c.slot_index,
        seller_index: sellerIdx >= 0 ? sellerIdx : 0,
      };
    });

    // RPC 호출 (트랜잭션으로 실행)
    const { data: rpcResult, error: rpcError } = await admin.rpc('upload_timetable', {
      p_event_id: eventId,
      p_time_slots: result.time_slots,
      p_buyers: result.buyers,
      p_sellers: uniqueSellers,
      p_consultations: consultationsWithSellerIndex,
    });

    if (rpcError) {
      throw new Error(`트랜잭션 실패: ${rpcError.message}`);
    }

    // RPC 결과에서 생성된 ID 추출
    const buyerIds: string[] = rpcResult?.buyer_ids || [];
    const sellerIds: string[] = rpcResult?.seller_ids || [];

    // 바이어 계정 자동 생성 (Auth는 JS에서만 가능)
    let buyerAccounts = 0;
    for (let i = 0; i < result.buyers.length; i++) {
      const buyer = result.buyers[i];
      if (buyer.email && buyerIds[i]) {
        await findOrCreateAccount(
          admin, buyer.email, buyer.company_name, buyer.phone || '',
          'buyer', buyerIds[i], 'linked_buyer_id'
        );
        buyerAccounts++;
      }
    }

    // 셀러 계정 자동 생성
    let sellerAccounts = 0;
    for (let i = 0; i < uniqueSellers.length; i++) {
      const seller = uniqueSellers[i];
      if (seller.email && sellerIds[i]) {
        await findOrCreateAccount(
          admin, seller.email, seller.company_name_kr || seller.company_name,
          seller.contact_phone || '', 'seller', sellerIds[i], 'linked_seller_id'
        );
        sellerAccounts++;
      }
    }

    // 잠금 해제
    await admin.from('events').update({ is_uploading: false }).eq('id', eventId);

    return NextResponse.json({
      success: true,
      summary: {
        time_slots: rpcResult?.time_slots || 0,
        buyers: rpcResult?.buyers || 0,
        sellers: rpcResult?.sellers || 0,
        consultations: consultationsWithSellerIndex.length,
        buyer_accounts: buyerAccounts,
        seller_accounts: sellerAccounts,
      },
    });
  } catch (err) {
    // 실패 시에도 잠금 해제
    await admin.from('events').update({ is_uploading: false }).eq('id', eventId);
    const message = err instanceof Error ? err.message : '파싱 오류';
    console.error('Timetable upload error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
