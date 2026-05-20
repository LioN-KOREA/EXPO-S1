'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MessageRow } from './messageRepository';

/**
 * thread 의 messages 변경(INSERT/UPDATE)을 Realtime 으로 구독.
 * onInsert / onUpdate 콜백을 통해 클라이언트 state 갱신.
 *
 * 본인이 POST 한 메시지도 broadcast 되므로 호출 측에서 id dedupe 필요.
 */
export function useThreadRealtime(
  threadId: string | null,
  onInsert: (row: MessageRow) => void,
  onUpdate?: (row: MessageRow) => void
) {
  useEffect(() => {
    if (!threadId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          onInsert(row);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          onUpdate?.(row);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);
}
