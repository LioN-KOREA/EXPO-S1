// 메신저 unread 집계. 마이그 037 RPC 사용 (DB 단계 집계, N+1 제거).
// admin: 전체 thread (interpreter 가 보낸 메시지 중 last_read_at_admin 이후)
// interpreter: 본인 thread (admin 이 보낸 메시지 중 last_read_at_interpreter 이후)

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UnreadResult {
  total: number;
  byThread: Record<string, number>;
}

interface UnreadRow {
  thread_id: string;
  unread_count: number | bigint;
}

function toResult(rows: UnreadRow[] | null | undefined): UnreadResult {
  const result: UnreadResult = { total: 0, byThread: {} };
  if (!rows) return result;
  for (const r of rows) {
    const n = typeof r.unread_count === 'bigint' ? Number(r.unread_count) : r.unread_count;
    if (n > 0) {
      result.byThread[r.thread_id] = n;
      result.total += n;
    }
  }
  return result;
}

export async function unreadForAdmin(
  supabase: SupabaseClient,
  eventId?: string
): Promise<UnreadResult> {
  const { data, error } = await supabase.rpc('messenger_unread_for_admin', {
    p_event_id: eventId ?? null,
  });
  if (error) throw new Error(error.message);
  return toResult(data as UnreadRow[] | null);
}

export async function unreadForInterpreter(
  supabase: SupabaseClient,
  interpreterId: string
): Promise<UnreadResult> {
  const { data, error } = await supabase.rpc('messenger_unread_for_interpreter', {
    p_interpreter_id: interpreterId,
  });
  if (error) throw new Error(error.message);
  return toResult(data as UnreadRow[] | null);
}
