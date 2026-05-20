// thread 도메인 모듈.
// 책임: thread upsert (lazy 생성), 읽음 표시, 조회.
//
// last_message_at 컬럼이 없으므로 messages MAX(created_at) 서브쿼리로 정렬.
// admin 호출은 service-role client 권장 (RLS 우회 필요 시) — but RLS 정책 자체가 admin 전체 통과.

import type { SupabaseClient } from '@supabase/supabase-js';

export type Role = 'admin' | 'interpreter';

export interface ThreadRow {
  id: string;
  event_id: string;
  interpreter_id: string;
  last_read_at_admin: string | null;
  last_read_at_interpreter: string | null;
  created_at: string;
}

export interface ThreadListItem {
  id: string | null; // thread 가 없으면 null (lazy 미생성 상태)
  event_id: string;
  interpreter_id: string;
  interpreter_name: string;
  interpreter_email: string;
  interpreter_language: string | null;
  last_message_at: string | null;
  last_read_at_admin: string | null;
  last_read_at_interpreter: string | null;
  unread_count: number;
}

/** 이벤트 내 통역사 명단 + thread 정보. admin 용. RPC 없이 다중 쿼리 조합. */
export async function listThreadsForEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<ThreadListItem[]> {
  // 1) event_interpreters JOIN profiles 로 통역사 명단
  const { data: rows, error: rowsErr } = await supabase
    .from('event_interpreters')
    .select('interpreter_id, profiles!event_interpreters_interpreter_id_fkey(id, name, email, language)')
    .eq('event_id', eventId);
  if (rowsErr) throw new Error(rowsErr.message);

  type InterpreterMeta = { id: string; name: string; email: string; language: string | null };
  const interpreters: InterpreterMeta[] = (rows ?? []).map((r) => {
    const p = (r as { profiles?: InterpreterMeta | InterpreterMeta[] | null }).profiles;
    const meta = Array.isArray(p) ? p[0] : p;
    return meta ?? { id: (r as { interpreter_id: string }).interpreter_id, name: '', email: '', language: null };
  });

  if (interpreters.length === 0) return [];
  const interpreterIds = interpreters.map((i) => i.id);

  // 2) message_threads 조회 (admin 이라 모든 thread 보임)
  const { data: threadRows, error: threadsErr } = await supabase
    .from('message_threads')
    .select('id, interpreter_id, last_read_at_admin, last_read_at_interpreter')
    .eq('event_id', eventId)
    .in('interpreter_id', interpreterIds);
  if (threadsErr) throw new Error(threadsErr.message);

  const threadByInterpreter = new Map<string, { id: string; last_read_at_admin: string | null; last_read_at_interpreter: string | null }>();
  for (const t of threadRows ?? []) {
    threadByInterpreter.set(t.interpreter_id as string, {
      id: t.id as string,
      last_read_at_admin: t.last_read_at_admin as string | null,
      last_read_at_interpreter: t.last_read_at_interpreter as string | null,
    });
  }

  // 3) 각 thread 의 last_message_at + admin 시점 unread count
  // 단일 query: messages WHERE thread_id IN (...) GROUP BY thread_id
  const threadIds = Array.from(threadByInterpreter.values()).map((t) => t.id);
  const lastByThread = new Map<string, string>();
  const unreadByThread = new Map<string, number>();

  if (threadIds.length > 0) {
    const { data: msgs, error: msgsErr } = await supabase
      .from('messages')
      .select('thread_id, created_at, sender_role')
      .in('thread_id', threadIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (msgsErr) throw new Error(msgsErr.message);

    for (const m of msgs ?? []) {
      const tId = m.thread_id as string;
      if (!lastByThread.has(tId)) {
        lastByThread.set(tId, m.created_at as string);
      }
    }

    // unread: admin 입장 — interpreter 가 보낸 메시지 중 last_read_at_admin 이후
    for (const [interpreterId, t] of threadByInterpreter) {
      const cutoff = t.last_read_at_admin;
      const count = (msgs ?? []).filter(
        (m) =>
          m.thread_id === t.id &&
          (m.sender_role as string) === 'interpreter' &&
          (!cutoff || (m.created_at as string) > cutoff)
      ).length;
      unreadByThread.set(t.id, count);
      void interpreterId;
    }
  }

  // 4) 최종 조합
  const items: ThreadListItem[] = interpreters.map((meta) => {
    const t = threadByInterpreter.get(meta.id);
    return {
      id: t?.id ?? null,
      event_id: eventId,
      interpreter_id: meta.id,
      interpreter_name: meta.name,
      interpreter_email: meta.email,
      interpreter_language: meta.language,
      last_message_at: t ? (lastByThread.get(t.id) ?? null) : null,
      last_read_at_admin: t?.last_read_at_admin ?? null,
      last_read_at_interpreter: t?.last_read_at_interpreter ?? null,
      unread_count: t ? (unreadByThread.get(t.id) ?? 0) : 0,
    };
  });

  // 정렬: 마지막 메시지 시각 최신 우선, 그 다음 이름 가나다순
  items.sort((a, b) => {
    if (a.last_message_at && b.last_message_at) {
      return b.last_message_at.localeCompare(a.last_message_at);
    }
    if (a.last_message_at) return -1;
    if (b.last_message_at) return 1;
    return a.interpreter_name.localeCompare(b.interpreter_name, 'ko');
  });

  return items;
}

/** 통역사 본인 thread 1개 조회 (event 단위). 없으면 null. */
export async function getThreadForInterpreter(
  supabase: SupabaseClient,
  eventId: string,
  interpreterId: string
): Promise<ThreadRow | null> {
  const { data, error } = await supabase
    .from('message_threads')
    .select('*')
    .eq('event_id', eventId)
    .eq('interpreter_id', interpreterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ThreadRow | null) ?? null;
}

/** thread upsert. 이미 있으면 기존 row 반환. service-role 또는 정책 통과한 사용자 권한 필요. */
export async function getOrCreateThread(
  supabase: SupabaseClient,
  eventId: string,
  interpreterId: string
): Promise<ThreadRow> {
  // ON CONFLICT DO NOTHING + 재조회 패턴 — DO UPDATE 시 BEFORE INSERT trigger 가
  // EXCLUDED.last_read_at_* 을 NULL 로 만들어 기존 read marker 덮어쓸 위험 회피.
  const { error: insertError } = await supabase
    .from('message_threads')
    .insert({ event_id: eventId, interpreter_id: interpreterId })
    .select()
    .maybeSingle();
  if (insertError && insertError.code !== '23505') {
    // 23505 = unique_violation = 이미 존재 → 무시하고 재조회
    throw new Error(insertError.message);
  }
  const row = await getThreadForInterpreter(supabase, eventId, interpreterId);
  if (!row) throw new Error('thread upsert 실패');
  return row;
}

/** 읽음 표시 갱신. role 에 따라 본인 컬럼만. */
export async function markRead(
  supabase: SupabaseClient,
  threadId: string,
  role: Role,
  at: string
): Promise<void> {
  const column = role === 'admin' ? 'last_read_at_admin' : 'last_read_at_interpreter';
  const { error } = await supabase
    .from('message_threads')
    .update({ [column]: at })
    .eq('id', threadId);
  if (error) throw new Error(error.message);
}

/** thread 와 연결된 event 조회 (이벤트 종료 가드용). */
export async function getThreadEvent(
  supabase: SupabaseClient,
  threadId: string
): Promise<{ id: string; end_date: string | null } | null> {
  const { data, error } = await supabase
    .from('message_threads')
    .select('event:events(id, end_date)')
    .eq('id', threadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const ev = (data as { event?: { id: string; end_date: string | null } | { id: string; end_date: string | null }[] | null }).event;
  if (!ev) return null;
  return Array.isArray(ev) ? (ev[0] ?? null) : ev;
}
