'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Search, Calendar, Plus, MessageSquare, QrCode } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { QrIssueButton } from './QrIssueButton';

type AccountType = 'INTERPRETER' | 'SELLER';
type WorkType = 'REGULAR' | 'RESERVE';
type AttendanceStatus = 'NONE' | 'WAITING' | 'COMING' | 'ABSENT' | 'IN_CONSULT' | 'DONE' | 'LEAVE_OK' | 'LEAVE';
type EvalType = 'NORMAL' | 'ABSENT' | 'LATE' | 'UNAUTHORIZED' | 'OTHER' | null;

interface AttendanceUser {
  id: string;
  name: string;
  language?: string;
}

interface AttendanceRow {
  id: string;
  event_id: string;
  user_id: string;
  date: string;
  account_type: AccountType;
  work_type: WorkType;
  status: AttendanceStatus;
  eval: EvalType;
  memo: string | null;
  user: AttendanceUser;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  NONE: '상태없음',
  WAITING: '대기중',
  COMING: '오는중',
  ABSENT: '불참',
  IN_CONSULT: '상담중',
  DONE: '상담완료',
  LEAVE_OK: '퇴근충족',
  LEAVE: '퇴근',
};

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  NONE: 'bg-slate-100 text-slate-600',
  WAITING: 'bg-amber-100 text-amber-700',
  COMING: 'bg-blue-100 text-blue-700',
  ABSENT: 'bg-red-100 text-red-700',
  IN_CONSULT: 'bg-violet-100 text-violet-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  LEAVE_OK: 'bg-teal-100 text-teal-700',
  LEAVE: 'bg-slate-200 text-slate-700',
};

const EVAL_LABEL: Record<NonNullable<EvalType>, string> = {
  NORMAL: '정상',
  ABSENT: '결근',
  LATE: '지각',
  UNAUTHORIZED: '무단',
  OTHER: '기타',
};

const STATUS_ORDER: AttendanceStatus[] = ['NONE', 'WAITING', 'COMING', 'ABSENT', 'IN_CONSULT', 'DONE', 'LEAVE_OK', 'LEAVE'];

export default function AttendancePage() {
  const params = useParams();
  const eventId = params.id as string;

  const [accountTab, setAccountTab] = useState<AccountType>('INTERPRETER');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [workFilter, setWorkFilter] = useState<'ALL' | WorkType>('ALL');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/attendance', window.location.origin);
      url.searchParams.set('event_id', eventId);
      url.searchParams.set('date', date);
      url.searchParams.set('account_type', accountTab);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('출석 조회 실패');
      const json = await res.json();
      setRows(json.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [eventId, date, accountTab]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (workFilter !== 'ALL') list = list.filter(r => r.work_type === workFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.user.name?.toLowerCase().includes(q)
        || (r.memo ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, workFilter, search]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      NONE: 0, WAITING: 0, COMING: 0, ABSENT: 0,
      IN_CONSULT: 0, DONE: 0, LEAVE_OK: 0, LEAVE: 0,
    };
    rows.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  async function createAttendances() {
    setCreating(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, date, account_type: accountTab }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      toast.success(`${json.inserted}명 추가 / ${json.skipped ?? 0}명 기존`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setCreating(false);
    }
  }

  async function updateRow(rowId: string, patch: Partial<{ status: AttendanceStatus; eval: EvalType; memo: string }>) {
    // optimistic
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...patch } : r));
    try {
      const res = await fetch(`/api/attendance/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '수정 실패');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수정 실패');
      await load();
    }
  }

  return (
    <div>

      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">출석표</h2>
          <p className="text-slate-500 text-sm mt-1">통역사·셀러 출석 상태 관리</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <QrIssueButton eventId={eventId} />
          <Button variant="outline" size="sm" onClick={() => setMessageOpen(true)}>
            <MessageSquare className="w-4 h-4 mr-1" />
            메시지 전송 예약
          </Button>
          <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
            <QrCode className="w-4 h-4 mr-1" />
            QR코드 촬영
          </Button>
        </div>
      </div>

      {/* 상태별 카운트 배지 */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 flex flex-wrap gap-2">
          {STATUS_ORDER.map(s => (
            <Badge key={s} variant="outline" className={`${STATUS_COLOR[s]} border-0`}>
              {STATUS_LABEL[s]} {counts[s]}
            </Badge>
          ))}
          <Badge variant="outline" className="ml-auto">전체 {rows.length}</Badge>
        </CardContent>
      </Card>

      {/* 컨트롤 바 */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Tabs value={accountTab} onValueChange={(v) => setAccountTab(v as AccountType)}>
            <TabsList>
              <TabsTrigger value="INTERPRETER">통역사</TabsTrigger>
              <TabsTrigger value="SELLER">셀러</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
          </div>

          <select
            value={workFilter}
            onChange={(e) => setWorkFilter(e.target.value as 'ALL' | WorkType)}
            className="h-9 px-2 text-sm border rounded-md bg-background"
          >
            <option value="ALL">전체 근무</option>
            <option value="REGULAR">정규</option>
            <option value="RESERVE">예비</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="이름·메모 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button onClick={createAttendances} disabled={creating} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            출석표 생성/추가
          </Button>
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-3 font-medium">근무형태</th>
                <th className="px-3 py-3 font-medium">이름</th>
                <th className="px-3 py-3 font-medium">언어</th>
                <th className="px-3 py-3 font-medium">상태</th>
                <th className="px-3 py-3 font-medium">근태평가</th>
                <th className="px-3 py-3 font-medium">메모</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">불러오는 중...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  데이터가 없습니다. &quot;출석표 생성/추가&quot;를 눌러 일자별 출석 행을 만드세요.
                </td></tr>
              )}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                  <td className="px-3 py-2">
                    <Badge variant={r.work_type === 'REGULAR' ? 'default' : 'secondary'}>
                      {r.work_type === 'REGULAR' ? '정규' : '예비'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.user.name}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.user.language ?? '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      onChange={(e) => updateRow(r.id, { status: e.target.value as AttendanceStatus })}
                      className={`text-xs px-2 py-1 rounded-md border-0 ${STATUS_COLOR[r.status]}`}
                    >
                      {STATUS_ORDER.map(s => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.eval ?? ''}
                      onChange={(e) => updateRow(r.id, { eval: (e.target.value || null) as EvalType })}
                      className="text-xs px-2 py-1 rounded-md border bg-background"
                    >
                      <option value="">—</option>
                      {(Object.keys(EVAL_LABEL) as Array<keyof typeof EVAL_LABEL>).map(k => (
                        <option key={k} value={k}>{EVAL_LABEL[k]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={r.memo ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (r.memo ?? '')) void updateRow(r.id, { memo: v });
                      }}
                      placeholder="메모"
                      className="h-8 text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 메시지 전송 예약 모달 (스텁) */}
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>메시지 전송 예약</DialogTitle>
            <DialogDescription>
              해당 일자({date}) {accountTab === 'INTERPRETER' ? '통역사' : '셀러'} 출석 대상자에게 메시지 발송을 예약합니다.
              실제 발송 기능은 Phase E에서 연동될 예정입니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageOpen(false)}>닫기</Button>
            <Button
              onClick={async () => {
                toast.info('메시지 발송 예약은 Phase E에서 구현됩니다');
                setMessageOpen(false);
              }}
            >
              예약하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR 촬영 모달 (스텁) */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR코드 촬영</DialogTitle>
            <DialogDescription>
              QR 스캔으로 빠른 출석 처리를 합니다. 카메라 연동은 Phase E에서 구현됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
