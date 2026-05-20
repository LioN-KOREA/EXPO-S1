// GET  /api/messages/threads/[id]/messages?limit=50
// POST /api/messages/threads/[id]/messages  body { body?: string, attachments?: [] }
//
// S2: 텍스트만. 첨부는 S5, cursor 페이지네이션은 S4, soft delete 는 S6, 종료 가드는 S7.

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';
import {
  insertMessage,
  listMessages,
  MESSAGE_PAGE_SIZE,
  validateMessageInput,
} from '@/lib/messenger/messageRepository';
import { getThreadEvent } from '@/lib/messenger/threadRepository';
import { isEventClosed } from '@/lib/messenger/eventGate';
import { validateAttachmentMetaList } from '@/lib/messenger/attachmentValidator';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: threadId } = await ctx.params;
  if (!threadId) return NextResponse.json({ error: 'thread id 필수' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get('limit');
  const limit = Math.min(parseInt(limitRaw ?? '', 10) || MESSAGE_PAGE_SIZE, MESSAGE_PAGE_SIZE);

  try {
    const items = await listMessages(supabase, threadId, limit);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: threadId } = await ctx.params;
  if (!threadId) return NextResponse.json({ error: 'thread id 필수' }, { status: 400 });

  let body: { body?: unknown; attachments?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문 필요' }, { status: 400 });
  }

  // 이벤트 종료 가드 — readonly thread 발송 차단
  try {
    const event = await getThreadEvent(supabase, threadId);
    if (isEventClosed(event)) {
      return NextResponse.json({ error: '이벤트 종료된 채널' }, { status: 403 });
    }
  } catch {
    // event lookup 실패 시 통상 진행 (404 등은 후속 처리)
  }

  const text = typeof body.body === 'string' ? body.body : null;

  const metaCheck = validateAttachmentMetaList(body.attachments, threadId);
  if (!metaCheck.ok) {
    return NextResponse.json({ error: metaCheck.error }, { status: 400 });
  }
  const attachments = metaCheck.metas;

  const validation = validateMessageInput({
    threadId,
    senderId: guard.user.id,
    senderRole: guard.user.role,
    body: text,
    attachments,
  });
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  try {
    const message = await insertMessage(supabase, {
      threadId,
      senderId: guard.user.id,
      senderRole: guard.user.role,
      body: text,
      attachments,
    });
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '발송 실패' },
      { status: 500 }
    );
  }
}
