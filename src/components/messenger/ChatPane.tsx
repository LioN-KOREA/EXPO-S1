'use client';

// S2 텍스트 메시지 + S3 Realtime + S4 읽음 표시.
// 첨부 S5, soft delete S6, 종료 가드 S7.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Check, CheckCheck, Paperclip, X, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/context';
import { createClient } from '@/lib/supabase/client';
import { MESSAGE_BODY_MAX, type MessageRow, type AttachmentMeta } from '@/lib/messenger/messageRepository';
import { useThreadRealtime } from '@/lib/messenger/useThreadRealtime';
import type { ThreadRow } from '@/lib/messenger/threadRepository';
import {
  validateAttachments,
  sanitizeFilename,
  MAX_ATTACHMENTS_PER_MESSAGE,
  ALLOWED_MIME_TYPES,
} from '@/lib/messenger/attachmentValidator';

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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLastReadAt = useMemo(() => {
    if (!thread) return null;
    return currentUserRole === 'admin'
      ? thread.last_read_at_interpreter
      : thread.last_read_at_admin;
  }, [thread, currentUserRole]);

  // threadId 변경 시 state reset — 이전 thread 잔존 데이터/첨부/lightbox 모두 초기화
  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setThread(null);
    setPendingFiles([]);
    setLightboxUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  function onFilesPicked(input: FileList | null) {
    if (!input) return;
    const incoming = Array.from(input);
    const total = pendingFiles.length + incoming.length;
    if (total > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast.error(`첨부는 최대 ${MAX_ATTACHMENTS_PER_MESSAGE}개까지 가능합니다 (현재 ${total}개)`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const combined = [...pendingFiles, ...incoming];
    const validation = validateAttachments(combined);
    if (!validation.ok) {
      toast.error(validation.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setPendingFiles(combined);
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadPendingFiles(): Promise<AttachmentMeta[]> {
    if (pendingFiles.length === 0) return [];
    const supabase = createClient();
    const sessionUuid = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();
    const out: AttachmentMeta[] = [];
    for (const file of pendingFiles) {
      const safe = sanitizeFilename(file.name);
      const path = `${threadId}/${sessionUuid}/${safe}`;
      const { error } = await supabase.storage
        .from('messages')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`업로드 실패: ${safe} — ${error.message}`);
      out.push({ path, name: safe, size: file.size, mime: file.type });
    }
    return out;
  }

  async function send() {
    const value = text.trim();
    if (!value && pendingFiles.length === 0) return;
    setSending(true);
    try {
      let attachments: AttachmentMeta[] = [];
      if (pendingFiles.length > 0) {
        attachments = await uploadPendingFiles();
      }
      const res = await fetch(`/api/messages/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: value || null, attachments }),
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
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.interpreter.messengerSendError);
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/messages/${deleteTargetId}/delete`, { method: 'PATCH' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || '삭제 실패');
      }
      // realtime UPDATE 가 곧 도착하지만 즉시 반영을 위해 local update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === deleteTargetId
            ? {
                ...m,
                deleted_at: new Date().toISOString(),
                deleted_by_role: (json as { deleted_by_role: 'admin' | 'sender' }).deleted_by_role,
              }
            : m
        )
      );
      setDeleteTargetId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setDeleting(false);
    }
  }

  function canDelete(m: MessageRow): boolean {
    if (m.deleted_at) return false;
    if (currentUserRole === 'admin') return true;
    return m.sender_id === currentUserId;
  }

  async function openAttachment(att: AttachmentMeta) {
    try {
      const res = await fetch('/api/messages/attachment/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: att.path }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !(json as { url?: string }).url) {
        throw new Error((json as { error?: string }).error || '파일 열기 실패');
      }
      const url = (json as { url: string }).url;
      if (att.mime.startsWith('image/')) {
        setLightboxUrl(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '파일 열기 실패');
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
            const isDeleted = !!m.deleted_at;
            const showDelete = canDelete(m);
            return (
              <div key={m.id} className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                {!isMine && senderLabel && (
                  <span className="text-[11px] text-slate-500 mb-0.5 px-1">{senderLabel}</span>
                )}
                {isDeleted ? (
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm italic text-slate-500 ${
                      isMine ? 'bg-blue-600/30 rounded-br-sm' : 'bg-muted/60 rounded-bl-sm'
                    }`}
                  >
                    {m.deleted_by_role === 'admin' ? '관리자에 의해 삭제된 메시지' : '삭제된 메시지'}
                  </div>
                ) : (
                  <div className="relative group/msg">
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                        isMine
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      }`}
                    >
                      {m.body && <p>{m.body}</p>}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className={`${m.body ? 'mt-1.5' : ''} flex flex-col gap-1.5`}>
                          {m.attachments.map((att) => (
                            <button
                              key={att.path}
                              type="button"
                              onClick={() => openAttachment(att)}
                              className={`flex items-center gap-2 text-left rounded px-2 py-1.5 text-xs ${
                                isMine ? 'bg-blue-700/60 hover:bg-blue-700/80' : 'bg-background/70 hover:bg-background'
                              }`}
                            >
                              {att.mime.startsWith('image/') ? (
                                <span className="text-base">🖼️</span>
                              ) : (
                                <FileText className="w-4 h-4 shrink-0" />
                              )}
                              <span className="truncate">{att.name}</span>
                              <span className={`shrink-0 ${isMine ? 'text-blue-200' : 'text-slate-500'}`}>
                                {(att.size / 1024).toFixed(0)}KB
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {showDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(m.id)}
                        className={`absolute top-1 ${
                          isMine ? '-left-7' : '-right-7'
                        } p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 opacity-0 group-hover/msg:opacity-100 focus:opacity-100 transition-opacity`}
                        aria-label="메시지 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5 px-1">
                  <span>{formatTime(m.created_at)}</span>
                  {isMine && !isDeleted && (
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

      {pendingFiles.length > 0 && (
        <div className="border-t px-3 py-2 flex flex-wrap gap-2 bg-muted/40">
          {pendingFiles.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="flex items-center gap-1.5 bg-background border rounded-md px-2 py-1 text-xs"
            >
              {f.type.startsWith('image/') ? (
                <span className="text-base">🖼️</span>
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span className="max-w-[140px] truncate">{f.name}</span>
              <span className="text-slate-400">{(f.size / 1024).toFixed(0)}KB</span>
              <button
                type="button"
                onClick={() => removePendingFile(idx)}
                className="text-slate-400 hover:text-red-500"
                aria-label="첨부 제거"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t p-3 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_MIME_TYPES.join(',')}
          className="hidden"
          onChange={(e) => onFilesPicked(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE}
          aria-label="첨부 추가"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
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
        <Button onClick={send} disabled={sending || (!text.trim() && pendingFiles.length === 0)} className="gap-1.5">
          <Send className="w-4 h-4" />
          {sending ? t.interpreter.messengerSending : t.interpreter.messengerSend}
        </Button>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <Dialog
        open={!!deleteTargetId}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteTargetId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>메시지 삭제</DialogTitle>
            <DialogDescription>
              {currentUserRole === 'admin'
                ? '이 메시지를 삭제하면 상대방 화면에 "삭제된 메시지" 표시가 남습니다. 본문·첨부는 운영 기록을 위해 DB 에 보존됩니다.'
                : '이 메시지를 삭제하면 상대방 화면에 "삭제된 메시지" 표시가 남습니다.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)} disabled={deleting}>
              취소
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
