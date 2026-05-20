'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, MessageSquare, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChatPane } from '@/components/messenger/ChatPane';
import type { ThreadListItem } from '@/lib/messenger/threadRepository';

interface AdminMessengerClientProps {
  eventId: string;
  currentUserId: string;
}

export function AdminMessengerClient({ eventId, currentUserId }: AdminMessengerClientProps) {
  const [items, setItems] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ThreadListItem | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/messages/threads?event_id=${eventId}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || '명단 조회 실패');
        }
        const json = await res.json();
        if (!cancelled) {
          setItems((json.items as ThreadListItem[]) ?? []);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : '명단 조회 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function openThread(item: ThreadListItem) {
    if (item.id) {
      setSelected(item);
      return;
    }
    // thread 없으면 admin 가 명시 upsert
    try {
      const res = await fetch('/api/messages/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, interpreter_id: item.interpreter_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'thread 생성 실패');
      const updated: ThreadListItem = { ...item, id: json.thread.id };
      setItems((prev) =>
        prev.map((it) => (it.interpreter_id === item.interpreter_id ? updated : it))
      );
      setSelected(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'thread 생성 실패');
    }
  }

  const filtered = items.filter((i) =>
    query
      ? i.interpreter_name.toLowerCase().includes(query.toLowerCase()) ||
        (i.interpreter_email ?? '').toLowerCase().includes(query.toLowerCase())
      : true
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] sm:h-[calc(100vh-160px)] -mx-4 sm:-mx-6">
      <div className="flex h-full">
        {/* 좌측: 통역사 명단 (모바일에선 선택 시 숨김) */}
        <aside
          className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r bg-card`}
        >
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름·이메일 검색"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {loading && (
              <p className="text-center text-sm text-slate-500 py-8">불러오는 중…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-8">통역사 명단이 비어 있습니다</p>
            )}
            {!loading &&
              filtered.map((item) => {
                const active = selected?.interpreter_id === item.interpreter_id;
                return (
                  <button
                    key={item.interpreter_id}
                    onClick={() => openThread(item)}
                    className={`w-full text-left p-3 hover:bg-muted transition-colors ${
                      active ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.interpreter_name}</p>
                        <p className="text-xs text-slate-500 truncate">{item.interpreter_email}</p>
                        {item.interpreter_language && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{item.interpreter_language}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {item.unread_count > 0 && (
                          <Badge className="bg-red-500 text-white border-0 px-1.5 py-0">
                            {item.unread_count > 9 ? '9+' : item.unread_count}
                          </Badge>
                        )}
                        {item.last_message_at && (
                          <span className="text-[10px] text-slate-400">
                            {new Date(item.last_message_at).toLocaleString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </aside>

        {/* 우측: 채팅창 */}
        <section className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
          {!selected && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <MessageSquare className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm">왼쪽에서 통역사를 선택하세요</p>
            </div>
          )}
          {selected && selected.id && (
            <>
              <header className="border-b px-4 py-3 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{selected.interpreter_name}</p>
                  <p className="text-xs text-slate-500 truncate">{selected.interpreter_email}</p>
                </div>
              </header>
              <div className="flex-1 min-h-0">
                <ChatPane
                  threadId={selected.id}
                  currentUserId={currentUserId}
                  currentUserRole="admin"
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
