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

  // 대상 메시지 sender 확인 + 첨부 paths 추출.
  const { data: msg } = await supabase
    .from('messages')
    .select('id, sender_id, thread_id, attachments')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: '메시지 없음' }, { status: 404 });

  const isMine = msg.sender_id === guard.user.id;
  const isAdmin = guard.user.role === 'admin';
  if (!isMine && !isAdmin) {
    return NextResponse.json({ error: '본인 또는 관리자만 삭제 가능' }, { status: 403 });
  }

  const admin = createAdminClient();

  // 1) 첨부 storage 객체 cleanup (signed URL 발급 차단). messages row DELETE 전 수행 —
  //    실패 시 row 는 유지 → 재시도 가능. 성공 후 row 삭제.
  const attachments = (msg.attachments as Array<{ path?: string }> | null) ?? [];
  const paths = attachments.map((a) => a.path).filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (paths.length > 0) {
    const { error: storageErr } = await admin.storage.from('messages').remove(paths);
    if (storageErr) {
      return NextResponse.json({ error: `첨부 정리 실패: ${storageErr.message}` }, { status: 500 });
    }
  }

  // 2) row hard delete.
  const { error } = await admin.from('messages').delete().eq('id', messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
