// PATCH /api/messages/[id]/delete
// sender 본인: deleted_by_role='sender'
// admin 가 남의 메시지 삭제: deleted_by_role='admin'
// admin 가 본인 메시지 삭제: 기본 'sender'
// 권한·위장 차단은 messages_update_guard 트리거가 강제.

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';
import { markMessageDeleted } from '@/lib/messenger/messageRepository';

export async function PATCH(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: messageId } = await ctx.params;
  if (!messageId) return NextResponse.json({ error: 'message id 필수' }, { status: 400 });

  // 대상 메시지 sender 확인 (auth 분기용). RLS·trigger 가 권한 위장 차단.
  const { data: msg } = await supabase
    .from('messages')
    .select('id, sender_id, deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: '메시지 없음' }, { status: 404 });
  if (msg.deleted_at) return NextResponse.json({ error: '이미 삭제된 메시지' }, { status: 400 });

  const isMine = msg.sender_id === guard.user.id;
  const deletedByRole = guard.user.role === 'admin' && !isMine ? 'admin' : 'sender';

  try {
    const updated = await markMessageDeleted(supabase, messageId, deletedByRole);
    if (!updated) return NextResponse.json({ error: '삭제 실패' }, { status: 403 });
    return NextResponse.json({ ok: true, deleted_by_role: deletedByRole });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '삭제 실패' }, { status: 403 });
  }
}
