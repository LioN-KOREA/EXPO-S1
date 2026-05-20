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
  const rawAttachments = Array.isArray(body.attachments) ? (body.attachments as unknown[]) : [];

  // attachments 형태 정규화 + 서버측 재검증
  const attachments: { path: string; name: string; size: number; mime: string }[] = [];
  for (const x of rawAttachments) {
    if (!x || typeof x !== 'object') {
      return NextResponse.json({ error: '첨부 메타 형식 오류' }, { status: 400 });
    }
    const o = x as Record<string, unknown>;
    if (
      typeof o.path !== 'string' ||
      typeof o.name !== 'string' ||
      typeof o.size !== 'number' ||
      typeof o.mime !== 'string'
    ) {
      return NextResponse.json({ error: '첨부 메타 필수 키 누락' }, { status: 400 });
    }
    // path 가 thread_id 로 시작하는지 강제 + 정규식 ({uuid}/{uuid}/{filename})
    if (!o.path.startsWith(`${threadId}/`)) {
      return NextResponse.json({ error: '첨부 경로가 thread 와 일치하지 않습니다' }, { status: 400 });
    }
    const pathRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_][A-Za-z0-9._\-+ ()]*$/;
    if (!pathRe.test(o.path)) {
      return NextResponse.json({ error: '첨부 경로 형식 오류' }, { status: 400 });
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(o.mime)) {
      return NextResponse.json({ error: '허용되지 않은 MIME' }, { status: 400 });
    }
    if (o.size <= 0 || o.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기 범위 초과' }, { status: 400 });
    }
    attachments.push({ path: o.path, name: o.name, size: o.size, mime: o.mime });
  }
  if (attachments.length > 3) {
    return NextResponse.json({ error: '첨부는 최대 3개' }, { status: 400 });
  }

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
