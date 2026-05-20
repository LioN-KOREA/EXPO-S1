import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { INTERPRETER_STATS_TAG } from '@/lib/cache/interpreter-stats';
import { ensureAdmin } from '@/lib/auth/guards';
import { updateNoticeMessage, deleteNotice } from '@/lib/notice/noticeRepository';

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

  try {
    const updated = await updateNoticeMessage(createAdminClient(), id, body.message.trim());
    if (!updated) return NextResponse.json({ error: '공지 없음' }, { status: 404 });
    if (updated.target_roles.includes('interpreter')) {
      revalidateTag(INTERPRETER_STATS_TAG, 'max');
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '수정 실패' }, { status: 500 });
  }
}

/** 공지 삭제 (admin) — CASCADE 로 notice_reads 자동 삭제 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  try {
    const deleted = await deleteNotice(createAdminClient(), id);
    if (!deleted) return NextResponse.json({ error: '공지 없음' }, { status: 404 });
    if (deleted.target_roles.includes('interpreter')) {
      revalidateTag(INTERPRETER_STATS_TAG, 'max');
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '삭제 실패' }, { status: 500 });
  }
}
