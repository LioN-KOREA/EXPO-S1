'use client';

// S2 텍스트 메시지 + S3 Realtime + S4 읽음 표시.
// 첨부 S5, soft delete S6, 종료 가드 S7.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Check, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/context';
import { createClient } from '@/lib/supabase/client';
import { MESSAGE_BODY_MAX, type MessageRow } from '@/lib/messenger/messageRepository';
import { useThreadRealtime } from '@/lib/messenger/useThreadRealtime';
import type { ThreadRow } from '@/lib/messenger/threadRepository';

interface ChatPaneProps {
  threadId: string;
  currentUserId: string;
  currentUserRole: 'admin' | 'interpreter';
  initialMessages?: MessageRow[];
}

const MARK_READ_DEBOUNCE_MS = 1000;

export function ChatPane({
  threadId,
  currentUserId,
  currentUserRole,
  initialMessages = [],
}: ChatPaneProps) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [loading, setLoading] = useState(initialMessages.length === 0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [thread, setThread] = useState<ThreadRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLastReadAt = useMemo(() => {
    if (!thread) return null;
    return currentUserRole === 'admin'
      ? thread.last_read_at_interpreter
      : thread.last_read_at_admin;
  }, [thread, currentUserRole]);

  // threadId 변경 시 state reset — 이전 thread 잔존 데이터로 markRead/✓✓ 잘못 처리 방지
  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setThread(null);
    if (markReadTimerRef.current) {
      clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = null;
    }
  }, [threadId]);

  // 메시지 로드 (snapshot race 보존)
  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/threads/${threadId}/messages`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || t.interpreter.messengerLoadError);
      }
      const json = await res.json();
      const serverItems = (json.items as MessageRow[]) ?? [];
      setMessages((prev) => {
        const byId = new Map<string, MessageRow>();
        for (const m of serverItems) byId.set(m.id, m);
        for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m);
        return Array.from(byId.values()).sort((a, b) =>
          a.created_at === b.created_at
            ? a.id.localeCompare(b.id)
            : a.created_at.localeCompare(b.created_at)
        );
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.interpreter.messengerLoadError);
    } finally {
      setLoading(false);
    }
  }, [threadId, t.interpreter.messengerLoadError]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // thread row 직접 fetch + realtime UPDATE 구독 → otherLastReadAt 갱신
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data } = await supabase
        .from('message_threads')
        .select('id, event_id, interpreter_id, last_read_at_admin, last_read_at_interpreter, created_at')
        .eq('id', threadId)
        .maybeSingle();
      if (!cancelled) setThread((data as ThreadRow | null) ?? null);
    })();

    const channel = supabase
      .channel(`thread-row:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_threads', filter: `id=eq.${threadId}` },
        (payload) => {
          if (cancelled) return;
          setThread((payload.new as ThreadRow) ?? null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  // realtime messages
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
        // ignore
      }
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === enriched.id)) return prev;
      return [...prev, enriched];
    });
  }, []);

  const onRealtimeUpdate = useCallback((row: MessageRow) => {
    setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
  }, []);

  useThreadRealtime(threadId, onRealtimeInsert, onRealtimeUpdate);

  // 새 메시지 들어오면 하단으로 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // markRead: thread 진입 + 새 메시지 도착 시 debounce.
  // 서버가 now() 사용하므로 client 시각 전송 X (클럭 스큐 방지).
  useEffect(() => {
    if (!threadId || messages.length === 0) return;
    const currentThread = threadId;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      void fetch(`/api/messages/threads/${currentThread}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
    }, MARK_READ_DEBOUNCE_MS);
    return () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    };
  }, [threadId, messages.length]);

  async function send() {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || t.interpreter.messengerSendError);
      }
      setMessages((prev) => {
        const next = (json as { message: MessageRow }).message;
        if (prev.some((m) => m.id === next.id)) return prev;
        return [...prev, next];
      });
      setText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.interpreter.messengerSendError);
    } finally {
      setSending(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function isMessageReadByOther(m: MessageRow): boolean {
    if (!otherLastReadAt) return false;
    const a = Date.parse(m.created_at);
    const b = Date.parse(otherLastReadAt);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return a <= b;
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <p className="text-center text-sm text-slate-500 py-8">{t.interpreter.messengerLoading}</p>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">{t.interpreter.messengerEmpty}</p>
        )}
        {!loading &&
          messages.map((m) => {
            const isMine = m.sender_id === currentUserId;
            const senderLabel =
              m.sender_role === 'admin'
                ? m.sender_name ?? t.interpreter.messengerSenderAdmin
                : m.sender_name ?? '';
            const readByOther = isMine && isMessageReadByOther(m);
            return (
              <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                {!isMine && senderLabel && (
                  <span className="text-[11px] text-slate-500 mb-0.5 px-1">{senderLabel}</span>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}
                >
                  {m.body}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5 px-1">
                  <span>{formatTime(m.created_at)}</span>
                  {isMine && (
                    readByOther ? (
                      <CheckCheck className="w-3 h-3 text-blue-500" aria-label="읽음" />
                    ) : (
                      <Check className="w-3 h-3" aria-label="전송됨" />
                    )
                  )}
                </div>
              </div>
            );
          })}
      </div>

      <div className="border-t p-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t.interpreter.messengerInputPlaceholder}
          maxLength={MESSAGE_BODY_MAX}
          rows={2}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button onClick={send} disabled={sending || !text.trim()} className="gap-1.5">
          <Send className="w-4 h-4" />
          {sending ? t.interpreter.messengerSending : t.interpreter.messengerSend}
        </Button>
      </div>
    </div>
  );
}
