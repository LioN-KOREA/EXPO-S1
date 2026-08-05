'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Calendar } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';

const REFRESH_INTERVAL_MS = 10_000;

interface InterpreterInfo {
  id: string;
  name: string;
  email: string;
  language?: string;
}

interface TimeSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_order: number;
}

interface ConsultationRow {
  id: string;
  time_slot_id: string;
  interpreter_id: string | null;
  status: string | null;
  buyer_status: string | null;
  buyer: { company_name?: string; booth_number?: string; country?: string } | null;
  seller: { company_name?: string; company_name_kr?: string; contact_name?: string } | null;
}

const CONS_STATUS_LABEL: Record<string, string> = {
  scheduled: '예정',
  in_progress: '상담중',
  completed: '완료',
};

const CONS_STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

export default function OperatePage() {
  const { t } = useI18n();
  const params = useParams();
  const eventId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [interpreters, setInterpreters] = useState<InterpreterInfo[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [date, setDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      // 3개 쿼리는 서로 의존하지 않으므로 병렬 실행 (10초마다 도는 폴링이라 왕복이 곧 부하)
      const [{ data: ei }, { data: ts }, { data: cons }] = await Promise.all([
        // 통역사 (event_interpreters 기반)
        supabase
          .from('event_interpreters')
          .select('interpreter:profiles!event_interpreters_interpreter_id_fkey(id, name, email, language)')
          .eq('event_id', eventId),
        // 타임슬롯
        supabase
          .from('time_slots')
          .select('*')
          .eq('event_id', eventId)
          .order('date')
          .order('slot_order'),
        // 상담
        supabase
          .from('consultations')
          .select('id, time_slot_id, interpreter_id, status, buyer_status, buyer:buyers(company_name, booth_number, country), seller:sellers(company_name, company_name_kr, contact_name)')
          .eq('event_id', eventId),
      ]);

      // Supabase nested select는 배열/객체 어느 쪽도 올 수 있어 unknown으로 받아 안전 변환
      const rawList = (ei ?? []) as Array<{ interpreter: unknown }>;
      const ints: InterpreterInfo[] = [];
      for (const row of rawList) {
        const itp = Array.isArray(row.interpreter) ? row.interpreter[0] : row.interpreter;
        if (itp && typeof itp === 'object' && 'id' in itp) {
          ints.push(itp as InterpreterInfo);
        }
      }
      setInterpreters(ints);

      const slotList = ts ?? [];
      setSlots(slotList);
      setConsultations((cons ?? []) as unknown as ConsultationRow[]);

      // 첫 로드 시 오늘 날짜 또는 첫 슬롯 날짜로 세팅
      setDate(prev => {
        if (prev) return prev;
        const today = new Date().toISOString().slice(0, 10);
        const dates = Array.from(new Set(slotList.map(s => s.date)));
        if (dates.includes(today)) return today;
        return dates[0] ?? today;
      });

      setLastUpdate(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 자동 새로고침 (10초)
  useEffect(() => {
    const t = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  const dates = useMemo(() => Array.from(new Set(slots.map(s => s.date))).sort(), [slots]);
  const daySlots = useMemo(() => slots.filter(s => s.date === date).sort((a, b) => a.slot_order - b.slot_order), [slots, date]);

  // (interpreter_id, time_slot_id) → 상담
  const cellMap = useMemo(() => {
    const m = new Map<string, ConsultationRow>();
    consultations.forEach(c => {
      if (c.interpreter_id) m.set(`${c.interpreter_id}:${c.time_slot_id}`, c);
    });
    return m;
  }, [consultations]);

  return (
    <div>

      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">현장운영 보드</h2>
          <p className="text-slate-500 text-sm mt-1">
            통역사 기준 실시간 상담 현황 (10초마다 자동 갱신, 조회 전용)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdate && (
            <span className="text-xs text-slate-500">
              마지막 갱신: {lastUpdate.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            새로고침
          </Button>
        </div>
      </div>

      {/* 일자 선택 */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-slate-500" />
          {dates.length === 0 && <span className="text-sm text-slate-500">타임슬롯이 없습니다</span>}
          {dates.map(d => (
            <button
              key={d}
              onClick={() => setDate(d)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                date === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-background border-slate-300 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/40'
              }`}
            >
              {d}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 보드 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">불러오는 중...</div>
          ) : interpreters.length === 0 ? (
            <div className="p-8 text-center text-slate-500">배정된 통역사가 없습니다.</div>
          ) : daySlots.length === 0 ? (
            <div className="p-8 text-center text-slate-500">선택한 날짜에 타임슬롯이 없습니다.</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-left font-medium border-b border-slate-200 dark:border-slate-800 z-10 min-w-[140px]">
                    통역사 / 시간
                  </th>
                  {daySlots.map(s => (
                    <th key={s.id} className="px-2 py-2 font-normal text-slate-500 border-b border-slate-200 dark:border-slate-800 min-w-[110px]">
                      {s.start_time}<br/>{s.end_time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {interpreters.map(it => (
                  <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="sticky left-0 bg-background px-3 py-2 font-medium border-r border-slate-200 dark:border-slate-800 z-10">
                      <div>{it.name}</div>
                      {it.language && <div className="text-[10px] text-slate-500">{it.language}</div>}
                    </td>
                    {daySlots.map(s => {
                      const c = cellMap.get(`${it.id}:${s.id}`);
                      if (!c) {
                        return <td key={s.id} className="px-2 py-2 text-slate-300 text-center">—</td>;
                      }
                      const consColor = CONS_STATUS_COLOR[c.status ?? 'scheduled'] ?? CONS_STATUS_COLOR.scheduled;
                      return (
                        <td key={s.id} className="px-1 py-1 align-top">
                          <div className={`rounded-md p-1.5 ${consColor}`}>
                            <div className="font-medium truncate">
                              {c.buyer?.company_name ?? '—'}
                            </div>
                            <div className="text-[10px] opacity-80 truncate">
                              {c.seller?.company_name_kr || c.seller?.company_name || ''}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-0 bg-white/60">
                                {CONS_STATUS_LABEL[c.status ?? 'scheduled'] ?? '예정'}
                              </Badge>
                              {c.buyer_status && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-0 bg-white/60">
                                  {t.buyerStatus[c.buyer_status as keyof typeof t.buyerStatus] ?? c.buyer_status}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
