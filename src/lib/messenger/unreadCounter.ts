// unread 메시지 집계.
// admin: 전체 thread 의 unread sum (interpreter 가 보낸 메시지 중 last_read_at_admin 이후)
// interpreter: 본인 thread 의 unread (admin 이 보낸 메시지 중 last_read_at_interpreter 이후)

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UnreadResult {
  total: number;
  byThread: Record<string, number>;
}

export async function unreadForAdmin(
  supabase: SupabaseClient,
  eventId?: string
): Promise<UnreadResult> {
  let threadQuery = supabase
    .from('message_threads')
    .select('id, last_read_at_admin');
  if (eventId) threadQuery = threadQuery.eq('event_id', eventId);
  const { data: threads, error: threadsErr } = await threadQuery;
  if (threadsErr) throw new Error(threadsErr.message);

  const result: UnreadResult = { total: 0, byThread: {} };
  if (!threads || threads.length === 0) return result;

  // 각 thread 의 last_read_at_admin 이후 interpreter 메시지 count
  const threadIds = threads.map((t) => t.id as string);
  const { data: msgs, error: msgsErr } = await supabase
    .from('messages')
    .select('thread_id, created_at, sender_role')
    .in('thread_id', threadIds)
    .eq('sender_role', 'interpreter')
    .is('deleted_at', null);
  if (msgsErr) throw new Error(msgsErr.message);

  for (const t of threads) {
    const cutoff = t.last_read_at_admin as string | null;
    const count = (msgs ?? []).filter(
      (m) =>
        m.thread_id === t.id &&
        (!cutoff || (m.created_at as string) > cutoff)
    ).length;
    if (count > 0) {
      result.byThread[t.id as string] = count;
      result.total += count;
    }
  }
  return result;
}

export async function unreadForInterpreter(
  supabase: SupabaseClient,
  interpreterId: string
): Promise<UnreadResult> {
  const { data: threads, error: threadsErr } = await supabase
    .from('message_threads')
    .select('id, last_read_at_interpreter')
    .eq('interpreter_id', interpreterId);
  if (threadsErr) throw new Error(threadsErr.message);

  const result: UnreadResult = { total: 0, byThread: {} };
  if (!threads || threads.length === 0) return result;

  const threadIds = threads.map((t) => t.id as string);
  const { data: msgs, error: msgsErr } = await supabase
    .from('messages')
    .select('thread_id, created_at, sender_role')
    .in('thread_id', threadIds)
    .eq('sender_role', 'admin')
    .is('deleted_at', null);
  if (msgsErr) throw new Error(msgsErr.message);

  for (const t of threads) {
    const cutoff = t.last_read_at_interpreter as string | null;
    const count = (msgs ?? []).filter(
      (m) =>
        m.thread_id === t.id &&
        (!cutoff || (m.created_at as string) > cutoff)
    ).length;
    if (count > 0) {
      result.byThread[t.id as string] = count;
      result.total += count;
    }
  }
  return result;
}
