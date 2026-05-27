'use client';

// thread 단일 채널 (`thread:{id}`) 구독.
// messages INSERT/UPDATE + message_threads UPDATE 모두 한 채널.
// 전역 unread 뱃지용 별도 채널은 useUnreadBadge 가 보유.
//
// handlers 객체는 매 렌더 새로 생성되므로 ref 로 안정화 — 채널 재구독 회피 + stale closure 방지.

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MessageRow } from './messageRepository';
import type { ThreadRow } from './threadRepository';

export interface ThreadRealtimeHandlers {
  onMessageInsert?: (row: MessageRow) => void;
  onMessageUpdate?: (row: MessageRow) => void;
  onMessageDelete?: (id: string) => void;
  onThreadUpdate?: (row: ThreadRow) => void;
}

export function useThreadRealtime(
  threadId: string | null,
  handlers: ThreadRealtimeHandlers
): void {
  const handlersRef = useRef<ThreadRealtimeHandlers>(handlers);
  handlersRef.current = handlers;

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
        (payload) => handlersRef.current.onMessageInsert?.(payload.new as MessageRow)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => handlersRef.current.onMessageUpdate?.(payload.new as MessageRow)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const oldId = (payload.old as { id?: string } | undefined)?.id;
          if (oldId) handlersRef.current.onMessageDelete?.(oldId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_threads',
          filter: `id=eq.${threadId}`,
        },
        (payload) => handlersRef.current.onThreadUpdate?.(payload.new as ThreadRow)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId]);
}
