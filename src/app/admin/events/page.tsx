'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, CalendarDays, ChevronRight, Trash2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Event {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  deleted_at: string | null;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [deletedEvents, setDeletedEvents] = useState<Event[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [hardDeleting, setHardDeleting] = useState<string | null>(null);

  useEffect(() => { loadEvents(); }, []);

  async function loadEvents() {
    const supabase = createClient();
    // 활성 이벤트 (RLS가 deleted_at IS NULL만 반환)
    const { data } = await supabase
      .from('events')
      .select('*')
      .is('deleted_at', null) // Explicitly filter out deleted events to ensure that deleted events do not show up, even though RLS should already enforce this
      .order('created_at', { ascending: false });
    setEvents(data || []);
    setLoading(false);
  }

  async function loadDeletedEvents() {
    if (deletedEvents.length > 0 && showDeleted) {
      setShowDeleted(false);
      return;
    }
    const supabase = createClient();
    // RLS에서 admin은 deleted_at IS NOT NULL도 볼 수 있음
    const { data } = await supabase
      .from('events')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    setDeletedEvents(data || []);
    setShowDeleted(true);
  }

  async function handleRestore(eventId: string) {
    setRestoring(eventId);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: 'PATCH' });
      if (!res.ok) { toast.error('복구에 실패했습니다'); return; }
      toast.success('상담회가 복구되었습니다');
      setDeletedEvents(prev => prev.filter(e => e.id !== eventId));
      loadEvents();
    } catch { toast.error('복구 중 오류'); }
    finally { setRestoring(null); }
  }

  async function handleHardDelete(event: Event) {
    const warning =
      '경고: 이 작업은 되돌릴 수 없습니다.\n\n' +
      `상담회 "${event.name}" 과 그에 속한 데이터\n` +
      '(바이어, 셀러, 통역사 배정, 상담일지, 출석, 공지 등)가\n' +
      '데이터베이스에서 영구적으로 삭제됩니다.\n' +
      '(메시지 로그는 익명화되어 감사용으로 잔존)\n\n' +
      '계속하려면 상담회 이름을 정확히 입력하세요.';
    const typed = prompt(warning, '');
    if (typed === null) return;
    if (typed.trim() !== event.name) {
      toast.error('상담회 이름이 일치하지 않습니다');
      return;
    }

    setHardDeleting(event.id);
    try {
      const url = `/api/events/${event.id}?hard=true&confirmName=${encodeURIComponent(event.name)}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '완전 삭제에 실패했습니다');
        return;
      }
      toast.success('상담회가 완전 삭제되었습니다');
      setDeletedEvents(prev => prev.filter(e => e.id !== event.id));
    } catch {
      toast.error('완전 삭제 중 오류');
    } finally {
      setHardDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">상담회 관리</h2>
          <p className="text-slate-500 mt-1 text-sm">수출상담회를 생성하고 관리하세요</p>
        </div>
        <Link href="/admin/events/new" className="sm:shrink-0">
          <Button className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md">
            <Plus className="w-4 h-4 mr-2" />
            상담회 생성
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">로딩 중...</p>
      ) : !events || events.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">등록된 상담회가 없습니다</p>
            <p className="text-sm text-slate-500 mt-1">새 상담회를 생성하여 시작하세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Link key={event.id} href={`/admin/events/${event.id}`}>
              <Card className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer group mb-3">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground break-keep">{event.name}</h3>
                        <Badge
                          variant={event.status === 'active' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {event.status === 'active' ? '진행중' : '종료'}
                        </Badge>
                      </div>
                      {event.description && (
                        <p className="text-sm text-slate-500 mb-2 line-clamp-2">{event.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span className="truncate">{event.start_date} ~ {event.end_date}</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-slate-500 transition-colors shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* 삭제된 상담회 토글 */}
      <div className="mt-6">
        <button
          onClick={loadDeletedEvents}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {showDeleted ? '삭제된 상담회 숨기기' : '삭제된 상담회 보기'}
        </button>

        {showDeleted && (
          <div className="mt-3 space-y-2">
            {deletedEvents.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">삭제된 상담회가 없습니다</p>
            ) : (
              deletedEvents.map((event) => (
                <Card key={event.id} className="border-0 shadow-sm bg-muted opacity-70">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-medium text-slate-500 line-through break-keep">{event.name}</h3>
                          <Badge variant="secondary" className="text-[10px]">삭제됨</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>{event.start_date} ~ {event.end_date}</span>
                          <span>삭제: {new Date(event.deleted_at!).toLocaleDateString('ko-KR')}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 self-start sm:self-auto sm:shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(event.id)}
                          disabled={restoring === event.id || hardDeleting === event.id}
                          className="text-xs gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {restoring === event.id ? '복구 중...' : '복구'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleHardDelete(event)}
                          disabled={restoring === event.id || hardDeleting === event.id}
                          className="text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                          {hardDeleting === event.id ? '삭제 중...' : '완전 삭제'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
