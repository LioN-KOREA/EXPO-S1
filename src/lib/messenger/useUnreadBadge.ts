'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UnreadResult } from './unreadCounter';

const REFETCH_DEBOUNCE_MS = 400;

/**
 * 사이드메뉴·탭 제목용 unread 합계 훅.
 * 초기 1회 fetch + Realtime 으로 messages INSERT/UPDATE, message_threads UPDATE 감지 → re-fetch.
 * debounce 로 연속 이벤트 coalesce. request token 으로 응답 순서 역전 시 stale 덮어쓰기 방지.
 *
 * role 이 admin 이면 eventId 옵션 필터 가능.
 */
export function useUnreadBadge(eventId?: string): { total: number; byThread: Record<string, number> } {
  const [state, setState] = useState<UnreadResult>({ total: 0, byThread: {} });
  const tokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadOnce() {
      const myToken = ++tokenRef.current;
      try {
        const url = eventId ? `/api/messages/unread?event_id=${eventId}` : '/api/messages/unread';
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as UnreadResult;
        if (cancelled) return;
        // stale 응답 무시 (다른 fetch 가 더 최근에 시작됨)
        if (myToken !== tokenRef.current) return;
        setState({ total: json.total ?? 0, byThread: json.byThread ?? {} });
      } catch {
        // silent
      }
    }

    function scheduleLoad() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadOnce();
      }, REFETCH_DEBOUNCE_MS);
    }

    void loadOnce();

    const channel = supabase
      .channel('messenger-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleLoad)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_threads' }, scheduleLoad)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  return state;
}
