// messages 도메인 저장소.
// 책임: 메시지 조회 / INSERT. hard delete 는 라우트 (`/api/messages/[id]/delete`) 에서 service-role 로 직접 수행.

import type { SupabaseClient } from '@supabase/supabase-js';

export type SenderRole = 'admin' | 'interpreter';

export interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_role: SenderRole;
  body: string | null;
  attachments: AttachmentMeta[];
  created_at: string;
  sender_name?: string | null;
}

export interface AttachmentMeta {
  path: string;
  name: string;
  size: number;
  mime: string;
}

export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_BODY_MAX = 2000;

/** thread 메시지 시간 ASC 50건 (S2: cursor 없이 최근 N건). */
export async function listMessages(
  supabase: SupabaseClient,
  threadId: string,
  limit: number = MESSAGE_PAGE_SIZE
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(
      'id, thread_id, sender_id, sender_role, body, attachments, created_at, sender:profiles!messages_sender_id_fkey(name)'
    )
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((m) => {
    const senderRel = (m as { sender?: { name?: string } | { name?: string }[] | null }).sender;
    const senderObj = Array.isArray(senderRel) ? senderRel[0] : senderRel;
    return {
      id: m.id as string,
      thread_id: m.thread_id as string,
      sender_id: m.sender_id as string | null,
      sender_role: m.sender_role as SenderRole,
      body: m.body as string | null,
      attachments: (m.attachments as AttachmentMeta[]) ?? [],
      created_at: m.created_at as string,
      sender_name: senderObj?.name ?? null,
    } satisfies MessageRow;
  });

  // 시간 ASC 로 반환 (UI 자연스러운 순서)
  return rows.reverse();
}

export interface InsertMessageInput {
  threadId: string;
  senderId: string;
  senderRole: SenderRole;
  body?: string | null;
  attachments?: AttachmentMeta[];
}

export function validateMessageInput(input: InsertMessageInput): string | null {
  const hasBody = !!(input.body && input.body.trim().length > 0);
  const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
  if (!hasBody && !hasAttachments) {
    return '본문 또는 첨부가 필요합니다';
  }
  if (input.body && input.body.length > MESSAGE_BODY_MAX) {
    return `본문은 ${MESSAGE_BODY_MAX}자 이내`;
  }
  if (input.attachments && input.attachments.length > 3) {
    return '첨부는 최대 3개';
  }
  return null;
}

export async function insertMessage(
  supabase: SupabaseClient,
  input: InsertMessageInput
): Promise<MessageRow> {
  const validation = validateMessageInput(input);
  if (validation) throw new Error(validation);

  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: input.threadId,
      sender_id: input.senderId,
      sender_role: input.senderRole,
      body: input.body && input.body.trim().length > 0 ? input.body.trim() : null,
      attachments: input.attachments ?? [],
    })
    .select(
      'id, thread_id, sender_id, sender_role, body, attachments, created_at'
    )
    .single();
  if (error) throw new Error(error.message);

  return {
    id: data.id as string,
    thread_id: data.thread_id as string,
    sender_id: data.sender_id as string | null,
    sender_role: data.sender_role as SenderRole,
    body: data.body as string | null,
    attachments: (data.attachments as AttachmentMeta[]) ?? [],
    created_at: data.created_at as string,
  };
}
