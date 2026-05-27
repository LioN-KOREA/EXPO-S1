// PATCH /api/messages/[id]/delete
// 즉시 hard delete (운영자 요구). sender 본인 또는 admin 만 삭제 가능.
// 권한 검증은 라우트에서 수행, 실제 DELETE 는 service-role 로 수행
// (RLS FOR DELETE 정책이 없는 messages 테이블 호환).

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';

export async function PATCH(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: messageId } = await ctx.params;
  if (!messageId) return NextResponse.json({ error: 'message id 필수' }, { status: 400 });

  // 대상 메시지 sender 확인 (auth 분기용).
  const { data: msg } = await supabase
    .from('messages')
    .select('id, sender_id, thread_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: '메시지 없음' }, { status: 404 });

  const isMine = msg.sender_id === guard.user.id;
  const isAdmin = guard.user.role === 'admin';
  if (!isMine && !isAdmin) {
    return NextResponse.json({ error: '본인 또는 관리자만 삭제 가능' }, { status: 403 });
  }

  // service-role 로 hard delete. cascade 첨부 storage 정리는 별도 슬라이스.
  const admin = createAdminClient();
  const { error } = await admin.from('messages').delete().eq('id', messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
