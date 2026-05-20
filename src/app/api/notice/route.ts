import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { INTERPRETER_STATS_TAG } from '@/lib/cache/interpreter-stats';

const VALID_ROLES = ['admin', 'interpreter', 'buyer', 'seller'];

async function ensureAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '인증 필요', status: 401 as const };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: '권한 없음', status: 403 as const };
  return { user };
}

/** 보낸 공지함 (admin) */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  if (!eventId) return NextResponse.json({ error: 'event_id 필수' }, { status: 400 });

  const admin = createAdminClient();
  // 표시에 필요한 컬럼만 (내부 메타 숨김)
  const { data, error } = await admin
    .from('notices')
    .select('id, event_id, message, target_roles, sent_at, edited_at, sender:profiles!notices_sent_by_fkey(id, name)')
    .eq('event_id', eventId)
    .order('sent_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

/** 공지 발송 (admin) */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json();
  if (!body.event_id) return NextResponse.json({ error: 'event_id 필수' }, { status: 400 });
  if (typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: '메시지 필수' }, { status: 400 });
  }
  if (body.message.length > 2000) {
    return NextResponse.json({ error: '메시지는 2000자 이내' }, { status: 400 });
  }
  if (!Array.isArray(body.target_roles) || body.target_roles.length === 0) {
    return NextResponse.json({ error: '대상 역할 1개 이상 선택' }, { status: 400 });
  }
  // 역할 정규화 — 중복/공백 제거, 화이트리스트
  const normalizedRoles = Array.from(new Set(
    body.target_roles
      .filter((r: unknown) => typeof r === 'string')
      .map((r: string) => r.trim())
      .filter((r: string) => r.length > 0)
  ));
  const invalid = normalizedRoles.filter((r) => !VALID_ROLES.includes(r as string));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `유효하지 않은 역할: ${invalid.join(', ')}` }, { status: 400 });
  }
  if (normalizedRoles.length === 0) {
    return NextResponse.json({ error: '대상 역할 1개 이상 선택' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from('notices').insert({
    event_id: body.event_id,
    message: body.message.trim(),
    target_roles: normalizedRoles,
    sent_by: guard.user.id,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (normalizedRoles.includes('interpreter')) {
    revalidateTag(INTERPRETER_STATS_TAG, 'max');
  }

  return NextResponse.json({ notice: data });
}
