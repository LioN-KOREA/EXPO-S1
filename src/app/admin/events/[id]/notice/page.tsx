'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Send, Inbox, Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Role = 'admin' | 'interpreter' | 'buyer' | 'seller';

interface NoticeRow {
  id: string;
  event_id: string;
  message: string;
  target_roles: Role[];
  sent_at: string;
  edited_at?: string | null;
  sender?: { id: string; name: string };
}

interface ReadStats {
  total: number;
  read: number;
  unread: number;
}

// 현재 운영: 통역사 사이트만. 바이어/셀러 화면 추가 시 옵션 복원.
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'interpreter', label: '통역사' },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: '관리자',
  interpreter: '통역사',
  buyer: '바이어',
  seller: '셀러',
};

export default function NoticePage() {
  const params = useParams();
  const eventId = params.id as string;

  const [tab, setTab] = useState<'send' | 'sent'>('send');
  const [message, setMessage] = useState('');
  const [targetRoles, setTargetRoles] = useState<Role[]>([]);
  const [sending, setSending] = useState(false);

  const [list, setList] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, ReadStats>>({});
  const [openStatsId, setOpenStatsId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<NoticeRow | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NoticeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notice?event_id=${eventId}`);
      if (!res.ok) throw new Error('공지 조회 실패');
      const json = await res.json();
      setList(json.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (tab === 'sent') void loadList();
  }, [tab, loadList]);

  function toggleRole(role: Role) {
    setTargetRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  }

  async function send() {
    if (!message.trim()) {
      toast.error('메시지를 입력하세요');
      return;
    }
    if (targetRoles.length === 0) {
      toast.error('대상 역할을 1개 이상 선택하세요');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, message, target_roles: targetRoles }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '발송 실패');
      toast.success('공지가 발송되었습니다');
      setMessage('');
      setTargetRoles([]);
      setTab('sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패');
    } finally {
      setSending(false);
    }
  }

  function openEdit(n: NoticeRow) {
    setEditTarget(n);
    setEditMessage(n.message);
  }

  function closeEdit() {
    setEditTarget(null);
    setEditMessage('');
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (!editMessage.trim()) {
      toast.error('메시지를 입력하세요');
      return;
    }
    if (editMessage.trim() === editTarget.message) {
      closeEdit();
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/notice/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: editMessage }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '수정 실패');
      toast.success('공지가 수정되었습니다');
      closeEdit();
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수정 실패');
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/notice/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '삭제 실패');
      toast.success('공지가 삭제되었습니다');
      setDeleteTarget(null);
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setDeleting(false);
    }
  }

  async function loadStats(noticeId: string) {
    if (statsMap[noticeId]) {
      setOpenStatsId(openStatsId === noticeId ? null : noticeId);
      return;
    }
    try {
      const res = await fetch(`/api/notice/${noticeId}/read-stats`);
      if (!res.ok) throw new Error('통계 조회 실패');
      const json = await res.json();
      setStatsMap(prev => ({ ...prev, [noticeId]: { total: json.total, read: json.read, unread: json.unread } }));
      setOpenStatsId(noticeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '통계 조회 실패');
    }
  }

  return (
    <div>

      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">공지사항</h2>
        <p className="text-slate-500 text-sm mt-1">상담회 참가자에게 공지를 발송하고 읽음 통계를 확인합니다</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'send' | 'sent')}>
        <TabsList className="mb-4">
          <TabsTrigger value="send" className="gap-1.5">
            <Send className="w-3.5 h-3.5" />
            공지 보내기
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-1.5">
            <Inbox className="w-3.5 h-3.5" />
            보낸 공지함
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <Card className="border-0 shadow-sm max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">새 공지 작성</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">대상 역할</label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleRole(value)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        targetRoles.includes(value)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-background text-slate-600 border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  관리자(staff)에게는 별도 메시지 시스템(P13)을 활용하세요
                </p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">메시지</label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="공지 메시지 입력"
                  rows={5}
                />
                <p className="text-xs text-slate-500 mt-1">{message.length}자</p>
              </div>

              <div className="flex justify-end">
                <Button onClick={send} disabled={sending || !message.trim() || targetRoles.length === 0}>
                  <Send className="w-4 h-4 mr-1" />
                  {sending ? '발송 중…' : '공지 발송'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <div className="px-4 py-6 text-center text-slate-500">불러오는 중...</div>
              )}
              {!loading && list.length === 0 && (
                <div className="px-4 py-6 text-center text-slate-500">발송된 공지가 없습니다.</div>
              )}
              {!loading && list.map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {n.target_roles.map(r => (
                          <Badge key={r} variant="outline" className="text-xs">{ROLE_LABEL[r]}</Badge>
                        ))}
                        <span className="text-xs text-slate-500 ml-auto">
                          {new Date(n.sent_at).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">{n.message}</div>
                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2">
                        {n.sender?.name && <span>발신자: {n.sender.name}</span>}
                        {n.edited_at && (
                          <span className="italic">
                            (수정됨 {new Date(n.edited_at).toLocaleString('ko-KR')})
                          </span>
                        )}
                      </div>
                      {openStatsId === n.id && statsMap[n.id] && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Badge variant="outline">전체 {statsMap[n.id].total}</Badge>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-0">
                            읽음 {statsMap[n.id].read}
                          </Badge>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-0">
                            미읽음 {statsMap[n.id].unread}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 self-start sm:self-auto">
                      <Button variant="ghost" size="sm" onClick={() => loadStats(n.id)}>
                        <Eye className="w-4 h-4 mr-1" />
                        읽음 통계
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(n)} title="수정">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(n)}
                        title="삭제"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o && !editSaving) closeEdit(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>공지 수정</DialogTitle>
            <DialogDescription>메시지를 수정하면 통역사 화면에 &quot;수정됨&quot; 표시가 붙습니다.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editMessage}
            onChange={(e) => setEditMessage(e.target.value)}
            rows={6}
            maxLength={2000}
          />
          <p className="text-xs text-slate-500">{editMessage.length}자 / 2000</p>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={editSaving}>취소</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editMessage.trim()}>
              {editSaving ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>공지 삭제</DialogTitle>
            <DialogDescription>
              이 공지를 삭제하면 통역사 화면에서도 즉시 사라지고, 읽음 기록도 함께 삭제됩니다. 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="text-sm whitespace-pre-wrap break-words bg-muted p-3 rounded max-h-40 overflow-auto">
              {deleteTarget.message}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>취소</Button>
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
