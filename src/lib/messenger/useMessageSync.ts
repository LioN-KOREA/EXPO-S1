'use client';

// thread 메시지 동기화 — 초기 load + realtime INSERT/UPDATE dedupe + sender_name enrich + snapshot race 보존.
// ChatPane 의 상태 폭증을 줄이기 위해 deep module 로 추출.
// 외부 사용자는 messages / loading / appendLocal / updateLocal 만 본다.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useThreadRealtime } from './useThreadRealtime';
import type { MessageRow } from './messageRepository';

export interface UseMessageSyncResult {
  messages: MessageRow[];
  loading: boolean;
  /** 본인 발송 직후 즉시 반영용 (realtime broadcast 도 옴 — dedupe). */
  appendLocal: (m: MessageRow) => void;
  /** soft delete 등 로컬 UPDATE 즉시 반영. */
  updateLocal: (patch: Partial<MessageRow> & { id: string }) => void;
}

export function useMessageSync(
  threadId: string,
  loadErrorLabel: string
): UseMessageSyncResult {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  // threadId 변경 시 reset
  useEffect(() => {
    setMessages([]);
    setLoading(true);
  }, [threadId]);

  // 초기 load — realtime 으로 먼저 도착한 메시지 보존
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
        setMessages((prev) => mergeById(serverItems, prev));
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
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  const updateLocal = useCallback((patch: Partial<MessageRow> & { id: string }) => {
    setMessages((prev) => prev.map((m) => (m.id === patch.id ? { ...m, ...patch } : m)));
  }, []);

  const onRealtimeInsert = useCallback(async (row: MessageRow) => {
    let enriched = row;
    if (!row.sender_name && row.sender_id) {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', row.sender_id)
          .maybeSingle();
        enriched = { ...row, sender_name: (data?.name as string | undefined) ?? null };
      } catch {
        // ignore — name 비어도 라벨 fallback
      }
    }
    setMessages((prev) => (prev.some((m) => m.id === enriched.id) ? prev : [...prev, enriched]));
  }, []);

  const onRealtimeUpdate = useCallback((row: MessageRow) => {
    setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
  }, []);

  useThreadRealtime(threadId, onRealtimeInsert, onRealtimeUpdate);

  return { messages, loading, appendLocal, updateLocal };
}

function mergeById(serverItems: MessageRow[], local: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  for (const m of serverItems) byId.set(m.id, m);
  for (const m of local) if (!byId.has(m.id)) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) =>
    a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : a.created_at.localeCompare(b.created_at)
  );
}
