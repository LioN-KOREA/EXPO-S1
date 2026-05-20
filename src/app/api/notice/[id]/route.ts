import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { INTERPRETER_STATS_TAG } from '@/lib/cache/interpreter-stats';

async function ensureAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '인증 필요', status: 401 as const };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: '권한 없음', status: 403 as const };
  return { user };
}

/** 공지 수정 (admin) — message 만 갱신, edited_at 자동 기록 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문이 필요합니다' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '본문 형식 오류' }, { status: 400 });
  }
  if (typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: '메시지 필수' }, { status: 400 });
  }
  if (body.message.length > 2000) {
    return NextResponse.json({ error: '메시지는 2000자 이내' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notices')
    .update({ message: body.message.trim(), edited_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, target_roles')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '공지 없음' }, { status: 404 });

  if (Array.isArray(data.target_roles) && data.target_roles.includes('interpreter')) {
    revalidateTag(INTERPRETER_STATS_TAG, 'max');
  }

  return NextResponse.json({ ok: true });
}

/** 공지 삭제 (admin) — CASCADE 로 notice_reads 자동 삭제 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const admin = createAdminClient();
  const { data: deleted, error } = await admin
    .from('notices')
    .delete()
    .eq('id', id)
    .select('target_roles')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: '공지 없음' }, { status: 404 });

  if (Array.isArray(deleted.target_roles) && deleted.target_roles.includes('interpreter')) {
    revalidateTag(INTERPRETER_STATS_TAG, 'max');
  }

  return NextResponse.json({ ok: true });
}
