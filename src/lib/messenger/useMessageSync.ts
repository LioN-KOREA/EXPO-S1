'use client';

// thread 메시지 동기화 — 초기 load + realtime INSERT/UPDATE dedupe + sender_name enrich + snapshot race 보존.
// 책임 분리:
//   - 병합/정렬 = messageMerge (순수)
//   - sender_name 보강 = senderNameCache (profiles 스키마 격리)
//   - realtime 구독 = useThreadRealtime
// 본 훅은 위 3개 모듈 조합 + state 관리.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useThreadRealtime } from './useThreadRealtime';
import { mergeMessagesById, patchMessageById, upsertMessageSorted } from './messageMerge';
import { lookupSenderName } from './senderNameCache';
import type { MessageRow } from './messageRepository';

export interface UseMessageSyncResult {
  messages: MessageRow[];
  loading: boolean;
  appendLocal: (m: MessageRow) => void;
  updateLocal: (patch: Partial<MessageRow> & { id: string }) => void;
  removeLocal: (id: string) => void;
}

export interface UseMessageSyncOptions {
  /** 같은 channel 의 thread row UPDATE 콜백 (last_read_at_* 갱신 등). useThreadReadState 등 외부 hook 이 처리. */
  onThreadUpdate?: (row: import('./threadRepository').ThreadRow) => void;
}

export function useMessageSync(
  threadId: string,
  loadErrorLabel: string,
  options: UseMessageSyncOptions = {}
): UseMessageSyncResult {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/messages/threads/${threadId}/messages`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error((json as { error?: string }).error || loadErrorLabel);
        }
        const json = await res.json();
        if (cancelled) return;
        const serverItems = (json.items as MessageRow[]) ?? [];
        setMessages((prev) => mergeMessagesById(serverItems, prev));
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : loadErrorLabel);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, loadErrorLabel]);

  const appendLocal = useCallback((m: MessageRow) => {
    setMessages((prev) => upsertMessageSorted(prev, m));
  }, []);

  const updateLocal = useCallback((patch: Partial<MessageRow> & { id: string }) => {
    setMessages((prev) => patchMessageById(prev, patch));
  }, []);

  const removeLocal = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const onRealtimeInsert = useCallback(async (row: MessageRow) => {
    let enriched = row;
    if (!row.sender_name && row.sender_id) {
      const name = await lookupSenderName(row.sender_id);
      enriched = { ...row, sender_name: name };
    }
    setMessages((prev) => upsertMessageSorted(prev, enriched));
  }, []);

  const onRealtimeUpdate = useCallback((row: MessageRow) => {
    setMessages((prev) => patchMessageById(prev, row));
  }, []);

  useThreadRealtime(threadId, {
    onMessageInsert: onRealtimeInsert,
    onMessageUpdate: onRealtimeUpdate,
    onMessageDelete: removeLocal,
    onThreadUpdate: options.onThreadUpdate,
  });

  return { messages, loading, appendLocal, updateLocal, removeLocal };
}
