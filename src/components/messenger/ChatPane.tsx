'use client';

// S2 슬라이스: 텍스트 메시지 채팅창. realtime 은 S3, 첨부 S5, soft delete S6, 종료 가드 S7.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/context';
import { createClient } from '@/lib/supabase/client';
import { MESSAGE_BODY_MAX, type MessageRow } from '@/lib/messenger/messageRepository';
import { useThreadRealtime } from '@/lib/messenger/useThreadRealtime';

interface ChatPaneProps {
  threadId: string;
  currentUserId: string;
  currentUserRole: 'admin' | 'interpreter';
  initialMessages?: MessageRow[];
}

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/threads/${threadId}/messages`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.interpreter.messengerLoadError);
      }
      const json = await res.json();
      const serverItems = (json.items as MessageRow[]) ?? [];
      // realtime 으로 먼저 도착한 메시지 보존 (snapshot race 방지)
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

  // Realtime: INSERT/UPDATE 들어오면 dedupe 후 state 갱신. sender_name 은 raw payload 에 없으니 enrich.
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
    setMessages((prev) => {
      if (prev.some((m) => m.id === enriched.id)) return prev;
      return [...prev, enriched];
    });
  }, []);

  const onRealtimeUpdate = useCallback((row: MessageRow) => {
    setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
  }, []);

  useThreadRealtime(threadId, onRealtimeInsert, onRealtimeUpdate);

  useEffect(() => {
    // 새 메시지 들어오면 하단으로 스크롤
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

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
      setMessages((prev) => [...prev, (json as { message: MessageRow }).message]);
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
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
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
                <span className="text-[10px] text-slate-400 mt-0.5 px-1">{formatTime(m.created_at)}</span>
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
      {/* role 차이 가시화는 후속 슬라이스에서. 현재 visual 동일. */}
      <span className="sr-only">{currentUserRole}</span>
    </div>
  );
}
