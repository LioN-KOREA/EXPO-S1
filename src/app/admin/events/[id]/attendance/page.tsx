'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { QrIssueButton } from './QrIssueButton';

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
  account_type: 'INTERPRETER';
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

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'eval'>('name');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus>('ALL');
  const [evalFilter, setEvalFilter] = useState<'ALL' | NonNullable<EvalType>>('ALL');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/attendance', window.location.origin);
      url.searchParams.set('event_id', eventId);
      url.searchParams.set('date', date);
      url.searchParams.set('account_type', 'INTERPRETER');
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('출석 조회 실패');
      const json = await res.json();
      setRows(json.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [eventId, date]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'ALL') list = list.filter(r => r.status === statusFilter);
    if (evalFilter !== 'ALL') list = list.filter(r => r.eval === evalFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => r.user.name?.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.user.name.localeCompare(b.user.name, 'ko');
      if (sortBy === 'status') {
        const idxA = STATUS_ORDER.indexOf(a.status);
        const idxB = STATUS_ORDER.indexOf(b.status);
        if (idxA !== idxB) return idxA - idxB;
        return a.user.name.localeCompare(b.user.name, 'ko');
      }
      // eval: null 후순위, 그 다음 EVAL_LABEL 키 순서
      const evalOrder = ['NORMAL', 'LATE', 'ABSENT', 'UNAUTHORIZED', 'OTHER'];
      const idxA = a.eval ? evalOrder.indexOf(a.eval) : 99;
      const idxB = b.eval ? evalOrder.indexOf(b.eval) : 99;
      if (idxA !== idxB) return idxA - idxB;
      return a.user.name.localeCompare(b.user.name, 'ko');
    });
  }, [rows, search, sortBy, statusFilter, evalFilter]);

  async function createAttendances() {
    setCreating(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, date, account_type: 'INTERPRETER' }),
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

  async function updateRow(rowId: string, patch: Partial<{ status: AttendanceStatus; eval: EvalType }>) {
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
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">출석표</h2>
          <p className="text-slate-500 text-sm mt-1">통역사 출석 상태 관리</p>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <QrIssueButton eventId={eventId} />
        </div>
      </div>

      {/* 컨트롤 바 */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="이름 검색"
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

        <CardContent className="px-4 pb-4 pt-0 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="text-slate-500">정렬</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'status' | 'eval')}
            className="h-8 px-2 border rounded-md bg-background text-xs"
          >
            <option value="name">이름순</option>
            <option value="status">출석상태순</option>
            <option value="eval">근태평가순</option>
          </select>

          <span className="text-slate-500 ml-2">출석상태</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | AttendanceStatus)}
            className="h-8 px-2 border rounded-md bg-background text-xs"
          >
            <option value="ALL">전체</option>
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>

          <span className="text-slate-500 ml-2">근태평가</span>
          <select
            value={evalFilter}
            onChange={(e) => setEvalFilter(e.target.value as 'ALL' | NonNullable<EvalType>)}
            className="h-8 px-2 border rounded-md bg-background text-xs"
          >
            <option value="ALL">전체</option>
            {(Object.keys(EVAL_LABEL) as Array<keyof typeof EVAL_LABEL>).map(k => (
              <option key={k} value={k}>{EVAL_LABEL[k]}</option>
            ))}
          </select>

          <span className="ml-auto text-slate-500">{filtered.length} 건</span>
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-3 font-medium">이름</th>
                <th className="px-3 py-3 font-medium">출석 상태</th>
                <th className="px-3 py-3 font-medium">근태평가</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">불러오는 중...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                  데이터가 없습니다. &quot;출석표 생성/추가&quot;를 눌러 일자별 출석 행을 만드세요.
                </td></tr>
              )}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.user.name}</div>
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

    </div>
  );
}
