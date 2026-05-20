'use client';

// thread row 상태 동기화 — last_read_at_* (✓✓ 표시용) + event end_date (종료 가드용).
// 초기 fetch + 외부 hook 이 전달한 realtime onThreadUpdate 콜백으로 갱신.
// ChatPane 의 thread row useEffect / supabase channel 인라인 코드 격리.

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ThreadRow } from './threadRepository';

export interface UseThreadReadStateResult {
  thread: ThreadRow | null;
  eventEndDate: string | null;
  otherLastReadAt: string | null;
  /** useMessageSync onThreadUpdate 옵션에 그대로 전달. */
  applyThreadUpdate: (row: ThreadRow) => void;
}

export function useThreadReadState(
  threadId: string | null,
  currentUserRole: 'admin' | 'interpreter'
): UseThreadReadStateResult {
  const [thread, setThread] = useState<ThreadRow | null>(null);
  const [eventEndDate, setEventEndDate] = useState<string | null>(null);

  useEffect(() => {
    setThread(null);
    setEventEndDate(null);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('message_threads')
        .select('id, event_id, interpreter_id, last_read_at_admin, last_read_at_interpreter, created_at, events(end_date)')
        .eq('id', threadId)
        .maybeSingle();
      if (cancelled || !data) return;
      const evRel = (data as { events?: { end_date?: string | null } | { end_date?: string | null }[] | null }).events;
      const ev = Array.isArray(evRel) ? evRel[0] : evRel;
      setEventEndDate(ev?.end_date ?? null);
      setThread(data as ThreadRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const applyThreadUpdate = useCallback((row: ThreadRow) => {
    setThread((prev) => (prev ? { ...prev, ...row } : row));
  }, []);

  const otherLastReadAt = thread
    ? currentUserRole === 'admin'
      ? thread.last_read_at_interpreter
      : thread.last_read_at_admin
    : null;

  return { thread, eventEndDate, otherLastReadAt, applyThreadUpdate };
}
