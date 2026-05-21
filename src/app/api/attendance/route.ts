import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

// 입력 검증 헬퍼
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_ACCOUNT_TYPES_QUERY = ['INTERPRETER', 'SELLER'] as const;
const VALID_ACCOUNT_TYPES_INSERT = ['INTERPRETER', 'SELLER', 'ALL'] as const;

/**
 * 출석 리스트 조회 (admin).
 * Query: event_id (필수, UUID), date (YYYY-MM-DD), account_type (INTERPRETER|SELLER)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  const date = searchParams.get('date');
  const accountType = searchParams.get('account_type');

  if (!eventId || !UUID_RE.test(eventId)) {
    return NextResponse.json({ error: 'event_id가 올바른 UUID여야 합니다' }, { status: 400 });
  }
  if (date && !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 });
  }
  if (accountType && !VALID_ACCOUNT_TYPES_QUERY.includes(accountType as 'INTERPRETER' | 'SELLER')) {
    return NextResponse.json({ error: 'account_type은 INTERPRETER 또는 SELLER' }, { status: 400 });
  }

  const admin = createAdminClient();
  // 화면 표시에 필요한 최소 컬럼만 (PII 최소화)
  let q = admin
    .from('attendances')
    .select('*, user:profiles!attendances_user_id_fkey(id, name, language)')
    .eq('event_id', eventId)
    .order('date', { ascending: true });
  if (date) q = q.eq('date', date);
  if (accountType) q = q.eq('account_type', accountType);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

/**
 * 출석 일자별 자동 생성 (admin).
 * Body: { event_id, date, account_type?: 'INTERPRETER'|'SELLER'|'ALL' }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json();
  const { event_id, date } = body;
  const accountType = body.account_type ?? 'ALL';
  if (!event_id || !date) {
    return NextResponse.json({ error: 'event_id와 date 필수' }, { status: 400 });
  }
  if (!UUID_RE.test(event_id)) {
    return NextResponse.json({ error: 'event_id가 올바른 UUID여야 합니다' }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 });
  }
  if (!VALID_ACCOUNT_TYPES_INSERT.includes(accountType)) {
    return NextResponse.json({ error: 'account_type은 INTERPRETER | SELLER | ALL' }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows: { event_id: string; user_id: string; date: string; account_type: 'INTERPRETER' | 'SELLER' }[] = [];

  if (accountType === 'INTERPRETER' || accountType === 'ALL') {
    const { data: ints } = await admin
      .from('event_interpreters')
      .select('interpreter_id')
      .eq('event_id', event_id);
    (ints ?? []).forEach((ei: { interpreter_id?: string }) => {
      if (ei.interpreter_id) rows.push({ event_id, user_id: ei.interpreter_id, date, account_type: 'INTERPRETER' });
    });
  }

  if (accountType === 'SELLER' || accountType === 'ALL') {
    const { data: sellers } = await admin.from('sellers').select('id').eq('event_id', event_id);
    const sellerIds = (sellers ?? []).map((s: { id: string }) => s.id);
    if (sellerIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, linked_seller_id, role')
        .eq('role', 'seller')
        .in('linked_seller_id', sellerIds);
      (profs ?? []).forEach((p: { id: string }) => {
        rows.push({ event_id, user_id: p.id, date, account_type: 'SELLER' });
      });
    }
  }

  if (rows.length === 0) return NextResponse.json({ success: true, inserted: 0 });

  // UNIQUE (event_id, user_id, date) 제약 활용 — race-condition 회피
  const { data: inserted, error } = await admin
    .from('attendances')
    .upsert(rows, { onConflict: 'event_id,user_id,date', ignoreDuplicates: true })
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const insertedCount = inserted?.length ?? 0;
  return NextResponse.json({
    success: true,
    inserted: insertedCount,
    skipped: rows.length - insertedCount,
  });
}
