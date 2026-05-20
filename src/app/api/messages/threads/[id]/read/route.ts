// PATCH /api/messages/threads/[id]/read body { at?: ISO }
// 호출자 역할에 따라 last_read_at_admin / last_read_at_interpreter 만 갱신.
// RLS + threads_write_guard 가 컬럼 단위 권한 강제.

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';
import { markRead } from '@/lib/messenger/threadRepository';

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: threadId } = await ctx.params;
  if (!threadId) return NextResponse.json({ error: 'thread id 필수' }, { status: 400 });

  // 서버 시각 강제 — 클라이언트 클럭 스큐 무시
  const at = new Date().toISOString();
  void request;

  try {
    await markRead(supabase, threadId, guard.user.role, at);
    return NextResponse.json({ ok: true, at });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '읽음 처리 실패' },
      { status: 500 }
    );
  }
}
