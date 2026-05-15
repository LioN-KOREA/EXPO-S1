'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { PaginationSelector } from '@/components/ui/pagination-selector';
import { ConsultationEditDialog } from '@/components/admin/timetable/ConsultationEditDialog';
import { ArrowLeft, Upload, RefreshCw, UserPlus, Search, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { toast } from 'sonner';
import type { TimeSlot, BuyerData, SellerData, ConsultationData, Interpreter } from '@/components/admin/timetable/types';

interface PreviewData {
  time_slots: { date: string; start_time: string; end_time: string; slot_order: number }[];
  buyers: { company_name: string; buyer_name: string; country: string; email: string; phone: string; booth_number: string }[];
  sellers: { company_name: string; company_name_kr: string; contact_name: string; email: string }[];
  consultations: { buyer_index: number; slot_index: number }[];
}

interface PreviewError {
  row: number;
  field: string;
  message: string;
}

type ViewMode = 'buyer' | 'booth' | 'interpreter' | 'seller';

// 통역사 검색 드롭다운 컴포넌트
function InterpreterPicker({
  interpreters,
  value,
  onChange,
  compact = false,
}: {
  interpreters: Interpreter[];
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return interpreters;
    const q = search.toLowerCase();
    return interpreters.filter(i => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
  }, [interpreters, search]);

  const selected = interpreters.find(i => i.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 border rounded text-left transition-all w-full ${
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'
        } ${value ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-card border-border text-slate-500 hover:border-slate-300'}`}
      >
        <span className="truncate flex-1">{selected?.name || '통역사 선택'}</span>
        {value && (
          <X className="w-3 h-3 shrink-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); onChange(null); }} />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text"
                placeholder="이름 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs border rounded focus:outline-none focus:border-blue-300"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-muted"
            >
              미배정
            </button>
            {filtered.map(i => (
              <button
                key={i.id}
                type="button"
                onClick={() => { onChange(i.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${
                  i.id === value ? 'bg-violet-50 text-violet-700 font-medium' : 'text-muted-foreground'
                }`}
              >
                {i.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">결과 없음</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimetablePage() {
  const params = useParams();
  const eventId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('buyer');
  const [pageSize, setPageSize] = useState<number | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // 셀 편집 팝업
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingConsultation, setEditingConsultation] = useState<ConsultationData | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);

  // 프리뷰 관련
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewErrors, setPreviewErrors] = useState<PreviewError[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{ slots: number; buyers: number; sellers: number; consultations: number } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [existingReports, setExistingReports] = useState<{ total: number; submitted: number; inProgress: number }>({ total: 0, submitted: 0, inProgress: 0 });

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [buyers, setBuyers] = useState<BuyerData[]>([]);
  const [sellers, setSellers] = useState<SellerData[]>([]);
  const [consultations, setConsultations] = useState<ConsultationData[]>([]);
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  const loadData = useCallback(async () => {
    setDataLoading(true);
    const supabase = createClient();

    const [slotsRes, buyersRes, sellersRes, consRes, eventInterpRes] = await Promise.all([
      supabase.from('time_slots').select('*').eq('event_id', eventId).order('slot_order'),
      supabase.from('buyers').select('id, company_name, country, booth_number').eq('event_id', eventId),
      supabase.from('sellers').select('id, company_name, company_name_kr, contact_name').eq('event_id', eventId),
      supabase.from('consultations').select('id, time_slot_id, buyer_id, seller_id, interpreter_id, memo, status, buyer_status, seller:sellers(company_name, company_name_kr, contact_name)').eq('event_id', eventId),
      supabase.from('event_interpreters').select('interpreter_id, interpreter:profiles!event_interpreters_interpreter_id_fkey(id, name, email)').eq('event_id', eventId),
    ]);

    setTimeSlots(slotsRes.data || []);
    setBuyers(buyersRes.data || []);
    setSellers(sellersRes.data || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConsultations((consRes.data || []).map((c: any) => ({ ...c, seller: c.seller })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interps = (eventInterpRes.data || []).map((ei: any) => ei.interpreter).filter(Boolean) as Interpreter[];
    setInterpreters(interps);
    setDataLoading(false);
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 업로드 핸들러
  async function handleUpload(file: File) {
    setLoading(true);
    setPreview(null);
    setPreviewErrors([]);
    setPreviewFile(file);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('event_id', eventId);
    try {
      const res = await fetch('/api/preview/timetable', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '파싱 실패'); setPreviewFile(null); return; }
      setPreview(data.preview);
      setPreviewErrors(data.errors || []);
      setPreviewSummary(data.summary);
      setExistingReports(data.existingReports || { total: 0, submitted: 0, inProgress: 0 });
    } catch { toast.error('파싱 중 오류'); setPreviewFile(null); }
    finally { setLoading(false); }
  }

  async function handleConfirmUpload() {
    if (!previewFile) return;
    if (existingReports.total > 0) {
      const confirmed = confirm(
        `주의: 기존 상담일지 ${existingReports.total}건이 삭제됩니다.\n` +
        (existingReports.submitted > 0 ? `(제출완료 ${existingReports.submitted}건 포함)\n` : '') +
        `\n정말 재업로드하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      );
      if (!confirmed) return;
    }
    setConfirming(true);
    const fd = new FormData();
    fd.append('file', previewFile);
    fd.append('event_id', eventId);
    try {
      const res = await fetch('/api/upload/timetable', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '업로드 실패'); return; }
      toast.success(`업로드 완료: ${data.summary.buyers}명 바이어, ${data.summary.consultations}건 매칭`);
      setShowUpload(false);
      setPreview(null);
      setPreviewFile(null);
      setPreviewErrors([]);
      setPreviewSummary(null);
      loadData();
    } catch { toast.error('업로드 중 오류'); }
    finally { setConfirming(false); }
  }

  function cancelPreview() {
    setPreview(null);
    setPreviewFile(null);
    setPreviewErrors([]);
    setPreviewSummary(null);
  }

  // 통역사 배정
  async function ensureEventInterpreter(supabase: ReturnType<typeof createClient>, interpreterId: string) {
    await supabase.from('event_interpreters').upsert(
      { event_id: eventId, interpreter_id: interpreterId },
      { onConflict: 'event_id,interpreter_id' }
    );
    if (!interpreters.find(i => i.id === interpreterId)) {
      const { data: profile } = await supabase.from('profiles').select('id, name, email').eq('id', interpreterId).single();
      if (profile) setInterpreters(prev => [...prev, profile]);
    }
  }

  function dumpError(err: unknown): Record<string, unknown> {
    if (!err || typeof err !== 'object') return { value: String(err) };
    const e = err as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of ['message', 'code', 'details', 'hint', 'status', 'statusText', 'name']) {
      if (e[k] !== undefined) out[k] = e[k];
    }
    try { out._stringified = JSON.stringify(err, Object.getOwnPropertyNames(err as object)); } catch {}
    out._keys = Object.keys(e);
    out._proto = Object.getPrototypeOf(e)?.constructor?.name;
    return out;
  }

  async function assignOne(consultationId: string, interpreterId: string | null) {
    const supabase = createClient();
    const result = await supabase
      .from('consultations')
      .update({ interpreter_id: interpreterId })
      .eq('id', consultationId)
      .select('id');
    const { data, error, status, statusText } = result;
    console.log('[assignOne] result', { consultationId, interpreterId, status, statusText, dataLen: data?.length, hasError: !!error });
    if (error) {
      const dump = dumpError(error);
      console.error('[assignOne] update failed', dump);
      if ((error as { code?: string }).code === '23505') toast.error('이 통역사는 같은 시간에 다른 상담이 배정되어 있습니다');
      else {
        const msg = (error as { message?: string; code?: string }).message
          || (error as { code?: string }).code
          || statusText
          || `HTTP ${status}`
          || '알 수 없는 오류';
        toast.error(`배정 실패: ${msg}`);
      }
      return;
    }
    if (!data || data.length === 0) {
      console.error('[assignOne] update returned 0 rows (RLS denied or row missing)', { consultationId, interpreterId, status, statusText });
      toast.error(`배정 권한이 없거나 대상이 없음 (HTTP ${status})`);
      return;
    }
    if (interpreterId) await ensureEventInterpreter(supabase, interpreterId);
    setConsultations(prev => prev.map(c => c.id === consultationId ? { ...c, interpreter_id: interpreterId } : c));
  }

  async function assignBuyer(buyerId: string, interpreterId: string | null) {
    const targets = consultations.filter(c => c.buyer_id === buyerId);
    if (targets.length === 0) {
      toast.error('대상 상담이 없습니다');
      return;
    }
    const supabase = createClient();
    let successCount = 0;
    const failures: { id: string; reason: string }[] = [];
    for (const c of targets) {
      const result = await supabase
        .from('consultations')
        .update({ interpreter_id: interpreterId })
        .eq('id', c.id)
        .select('id');
      const { data, error, status, statusText } = result;
      console.log('[assignBuyer] result', { id: c.id, interpreterId, status, statusText, dataLen: data?.length, hasError: !!error });
      if (error) {
        const dump = dumpError(error);
        console.error('[assignBuyer] update failed', dump);
        const code = (error as { code?: string }).code;
        const msg = (error as { message?: string }).message;
        const reason = code === '23505'
          ? '같은 시간 다른 상담에 이미 배정됨'
          : (msg || code || statusText || `HTTP ${status}` || '알 수 없는 오류');
        failures.push({ id: c.id, reason });
        continue;
      }
      if (!data || data.length === 0) {
        failures.push({ id: c.id, reason: `RLS/대상없음 (HTTP ${status})` });
        console.error('[assignBuyer] update returned 0 rows', { id: c.id, interpreterId, status, statusText });
        continue;
      }
      successCount++;
    }
    if (successCount > 0 && interpreterId) await ensureEventInterpreter(supabase, interpreterId);
    setConsultations(prev => prev.map(c => {
      if (c.buyer_id !== buyerId) return c;
      const failed = failures.find(f => f.id === c.id);
      return failed ? c : { ...c, interpreter_id: interpreterId };
    }));
    const name = interpreters.find(i => i.id === interpreterId)?.name || '미배정';
    if (failures.length === 0) {
      toast.success(`${successCount}건 → ${name}`);
    } else if (successCount === 0) {
      toast.error(`전체 배정 실패 (${failures[0].reason})`);
    } else {
      toast.warning(`${successCount}건 성공 / ${failures.length}건 실패 (${failures[0].reason})`);
    }
  }

  function findConsultation(buyerId: string, slotId: string) {
    return consultations.find(c => c.buyer_id === buyerId && c.time_slot_id === slotId);
  }

  function getBuyerInterpreter(buyerId: string): string | null {
    const buyerCons = consultations.filter(c => c.buyer_id === buyerId && c.interpreter_id);
    if (buyerCons.length === 0) return null;
    const counts = new Map<string, number>();
    buyerCons.forEach(c => counts.set(c.interpreter_id!, (counts.get(c.interpreter_id!) || 0) + 1));
    let maxId = '';
    let maxCount = 0;
    counts.forEach((count, id) => { if (count > maxCount) { maxCount = count; maxId = id; } });
    return maxId;
  }

  // 셀 클릭 → 편집 팝업
  function handleCellClick(cons: ConsultationData) {
    if (assignMode) return; // 배정모드에서는 팝업 안 열림
    const slot = timeSlots.find(s => s.id === cons.time_slot_id) || null;
    setEditingConsultation(cons);
    setEditingSlot(slot);
    setEditDialogOpen(true);
  }

  function handleConsultationSaved(updated: Partial<ConsultationData> & { id: string }) {
    setConsultations(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  }

  // 날짜 목록 (고유값, 정렬)
  const dates = useMemo(() => {
    const set = new Set(timeSlots.map(s => s.date));
    return Array.from(set).sort();
  }, [timeSlots]);

  // 첫 로드 시 첫 날짜 선택
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  // 선택된 날짜의 타임슬롯만
  const filteredSlots = useMemo(() => {
    if (!selectedDate) return timeSlots;
    return timeSlots.filter(s => s.date === selectedDate);
  }, [timeSlots, selectedDate]);

  // 부스 뷰: 부스번호로 정렬된 바이어 배열 (그룹 헤더 표시용)
  const boothSortedBuyers = useMemo(() => {
    const sorted = [...buyers].sort((a, b) => (a.booth_number || '').localeCompare(b.booth_number || ''));
    return sorted;
  }, [buyers]);

  // 뷰 모드에 따른 행(row) 데이터 — 모든 뷰를 flat 배열로 반환
  const viewRows = useMemo(() => {
    if (viewMode === 'buyer') return buyers;
    if (viewMode === 'booth') return boothSortedBuyers;
    if (viewMode === 'interpreter') {
      const interpMap = new Map<string, ConsultationData[]>();
      const unassigned: ConsultationData[] = [];
      consultations.forEach(c => {
        if (c.interpreter_id) {
          if (!interpMap.has(c.interpreter_id)) interpMap.set(c.interpreter_id, []);
          interpMap.get(c.interpreter_id)!.push(c);
        } else {
          unassigned.push(c);
        }
      });
      const rows = interpreters.map(i => ({ interpreter: i, cons: interpMap.get(i.id) || [] }));
      return rows;
    }
    return sellers;
  }, [viewMode, buyers, boothSortedBuyers, sellers, interpreters, consultations]);

  // 페이지네이션
  const totalItems = viewRows.length;
  // 페이지 범위 보정
  const effectivePageSize = pageSize === 'all' ? totalItems : pageSize;
  const maxPage = effectivePageSize > 0 ? Math.max(1, Math.ceil(totalItems / effectivePageSize)) : 1;
  const safePage = Math.min(currentPage, maxPage);

  // 렌더링 중 상태 변경 방지 — useEffect로 이동
  useEffect(() => {
    if (safePage !== currentPage) setCurrentPage(safePage);
  }, [safePage, currentPage]);

  const paginatedData = useMemo(() => {
    if (pageSize === 'all') return viewRows;
    const start = (safePage - 1) * (pageSize as number);
    return viewRows.slice(start, start + (pageSize as number));
  }, [viewRows, pageSize, safePage]);

  const hasData = timeSlots.length > 0;

  // 셀 렌더링 함수
  function renderCell(cons: ConsultationData | undefined, slot: TimeSlot) {
    if (!cons) return <span className="text-muted-foreground text-xs">-</span>;

    const interpName = cons.interpreter_id ? interpreters.find(i => i.id === cons.interpreter_id)?.name : null;
    const buyerInfo = buyers.find(b => b.id === cons.buyer_id);

    const statusBadge = (() => {
      if (cons.status === 'in_progress') {
        return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">상담중</span>;
      }
      if (cons.status === 'completed') {
        return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">완료</span>;
      }
      return null;
    })();

    return (
      <div
        className={`text-xs space-y-0.5 ${!assignMode ? 'cursor-pointer hover:bg-blue-50/50 rounded p-1 -m-1 transition-colors' : ''}`}
        onClick={() => !assignMode && handleCellClick(cons)}
      >
        {statusBadge && <div className="mb-1">{statusBadge}</div>}
        {viewMode === 'buyer' ? (
          <>
            <div className="font-medium text-foreground/80 truncate max-w-[140px]">
              {cons.seller?.company_name_kr || cons.seller?.company_name}
            </div>
            <div className="text-slate-500 truncate max-w-[140px]">{cons.seller?.contact_name}</div>
          </>
        ) : viewMode === 'booth' ? (
          <>
            <div className="font-medium text-blue-600 truncate max-w-[140px]" title={buyerInfo?.company_name}>
              {buyerInfo?.company_name}
            </div>
            <div className="border-t border-dashed border-slate-200 my-0.5" />
            <div className="text-foreground/80 truncate max-w-[140px]">
              {cons.seller?.company_name_kr || cons.seller?.company_name}
            </div>
          </>
        ) : viewMode === 'interpreter' ? (
          <>
            <div className="font-medium text-foreground/80 truncate max-w-[140px]">
              {buyerInfo?.company_name}
            </div>
            <div className="text-slate-500 truncate max-w-[140px]">
              {cons.seller?.company_name_kr || cons.seller?.company_name}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-foreground/80 truncate max-w-[140px]">
              {buyerInfo?.company_name}
            </div>
            <div className="text-slate-500 truncate max-w-[140px]">{buyerInfo?.country}</div>
          </>
        )}
        {assignMode ? (
          <InterpreterPicker
            interpreters={interpreters}
            value={cons.interpreter_id}
            onChange={(id) => assignOne(cons.id, id)}
            compact
          />
        ) : interpName ? (
          <Badge className="text-[10px] bg-violet-100 text-violet-700 border-0">{interpName}</Badge>
        ) : null}
        {cons.memo && <div className="text-[10px] text-slate-400 truncate">📝 {cons.memo}</div>}
      </div>
    );
  }

  return (
    <div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">타임테이블</h2>
          {hasData && (
            <p className="text-slate-500 text-sm mt-1">
              {timeSlots.length}개 타임슬롯 · {buyers.length}명 바이어 · {sellers.length}명 셀러 · {consultations.length}건 매칭
              {interpreters.length > 0 && ` · ${interpreters.length}명 통역사`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {hasData && (
            <>
              <Button variant={assignMode ? 'default' : 'outline'} size="sm" onClick={() => setAssignMode(!assignMode)}>
                <UserPlus className="w-4 h-4 mr-1" />
                {assignMode ? '배정모드 종료' : '통역사 배정'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)}>
                <Upload className="w-4 h-4 mr-1" />
                {showUpload ? '닫기' : '재업로드'}
              </Button>
            </>
          )}
        </div>
      </div>

      {(showUpload || !hasData) && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader><CardTitle className="text-lg">상담 스케줄 엑셀 업로드</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">엑셀 업로드 시 바이어/셀러 계정이 자동 생성됩니다.{hasData && ' 기존 데이터는 덮어쓰기됩니다.'}</p>
            <ExcelUploader onUpload={handleUpload} loading={loading} description="상담테이블 엑셀 파일 업로드" />
          </CardContent>
        </Card>
      )}

      {/* 프리뷰 영역 */}
      {preview && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">업로드 미리보기</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelPreview}>취소</Button>
                <Button size="sm" onClick={handleConfirmUpload} disabled={confirming} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                  {confirming ? '저장 중...' : '확인 후 저장'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{previewSummary?.slots ?? 0}</p>
                <p className="text-xs text-blue-600">타임슬롯</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-emerald-700">{previewSummary?.buyers ?? 0}</p>
                <p className="text-xs text-emerald-600">바이어</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-purple-700">{previewSummary?.sellers ?? 0}</p>
                <p className="text-xs text-purple-600">셀러</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{previewSummary?.consultations ?? 0}</p>
                <p className="text-xs text-amber-600">상담 매칭</p>
              </div>
            </div>

            {existingReports.total > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-700">주의: 기존 상담일지가 삭제됩니다</span>
                </div>
                <p className="text-xs text-red-600 ml-6">
                  현재 이 상담회에 작성된 상담일지 {existingReports.total}건이 있습니다.
                  {existingReports.submitted > 0 && ` (제출완료 ${existingReports.submitted}건)`}
                  {existingReports.inProgress > 0 && ` (작성중 ${existingReports.inProgress}건)`}
                  {' '}재업로드 시 이 데이터가 모두 삭제됩니다.
                </p>
              </div>
            )}

            {previewErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">{previewErrors.length}건의 문제가 발견되었습니다</span>
                </div>
                <ul className="space-y-1">
                  {previewErrors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600">행 {err.row + 1}: {err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {previewErrors.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-emerald-700">검증 완료 - 문제가 없습니다</span>
                </div>
              </div>
            )}

            <div className="mb-4">
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">바이어 목록</h4>
              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">#</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">회사명</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">담당자</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">국가</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">이메일</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">전화</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.buyers.map((b, i) => {
                      const hasError = previewErrors.some(e => e.row === i);
                      return (
                        <tr key={i} className={hasError ? 'bg-red-50' : i % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                          <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                          <td className={`px-3 py-1.5 font-medium ${!b.company_name ? 'text-red-500' : 'text-foreground'}`}>{b.company_name || '(비어있음)'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{b.buyer_name}</td>
                          <td className={`px-3 py-1.5 ${!b.country ? 'text-red-500' : 'text-slate-500'}`}>{b.country || '(비어있음)'}</td>
                          <td className="px-3 py-1.5 text-slate-500">{b.email}</td>
                          <td className="px-3 py-1.5 text-slate-500">{b.phone}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">타임슬롯</h4>
              <div className="flex flex-wrap gap-2">
                {preview.time_slots.map((slot, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{slot.date} {slot.start_time}~{slot.end_time}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {assignMode && interpreters.length === 0 && (
        <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-sm text-amber-700">
              이 상담회에 배정된 통역사가 없습니다. <Link href={`/admin/events/${eventId}/interpreters`} className="underline font-medium">통역사 관리</Link>에서 먼저 배정하세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 타임테이블 그리드 */}
      {dataLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-500 mr-2" />
          <span className="text-slate-500">로딩 중...</span>
        </div>
      ) : hasData && (
        <>
          {/* 뷰 모드 탭 + 페이지네이션 */}
          <div className="flex items-center justify-between mb-3 gap-4">
            <Tabs value={viewMode} onValueChange={(v) => { setViewMode(v as ViewMode); setCurrentPage(1); }}>
              <TabsList>
                <TabsTrigger value="buyer">바이어</TabsTrigger>
                <TabsTrigger value="booth">부스</TabsTrigger>
                <TabsTrigger value="interpreter">통역사</TabsTrigger>
                <TabsTrigger value="seller">셀러</TabsTrigger>
              </TabsList>
            </Tabs>
            <PaginationSelector
              totalItems={totalItems}
              pageSize={pageSize}
              currentPage={currentPage}
              onPageSizeChange={setPageSize}
              onPageChange={setCurrentPage}
            />
          </div>

          {/* 날짜 탭 */}
          {dates.length >= 1 && (
            <div className="flex gap-1 mb-4">
              {dates.map(date => (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    selectedDate === date
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-card text-muted-foreground hover:bg-muted border border-border'
                  }`}
                >
                  {date}
                </button>
              ))}
            </div>
          )}

          {/* 모바일 스크롤 안내 */}
          <p className="text-xs text-slate-400 mb-2 lg:hidden">← 좌우로 스크롤하여 전체 타임테이블을 확인하세요 →</p>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <div className="min-w-[900px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="px-3 py-3 text-left font-medium sticky left-0 bg-slate-800 z-10 min-w-[160px]">
                          {viewMode === 'buyer' ? '바이어' : viewMode === 'booth' ? '부스' : viewMode === 'interpreter' ? '통역사' : '셀러'}
                        </th>
                        {assignMode && viewMode === 'buyer' && (
                          <th className="px-2 py-3 text-center font-medium w-[130px] bg-violet-900">
                            <div className="text-xs">담당 통역사</div>
                            <div className="text-[10px] text-violet-300">(바이어별 일괄)</div>
                          </th>
                        )}
                        {viewMode === 'buyer' && (
                          <th className="px-2 py-3 text-center font-medium w-14">부스</th>
                        )}
                        {filteredSlots.map(slot => (
                          <th key={slot.id} className="px-2 py-3 text-center font-medium min-w-[160px]">
                            <div>{slot.start_time}</div>
                            <div className="text-xs text-blue-200">~{slot.end_time}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewMode === 'buyer' && (paginatedData as BuyerData[]).map((buyer, idx) => {
                        const bgColor = idx % 2 === 0 ? 'var(--card)' : 'var(--muted)';
                        const buyerInterp = getBuyerInterpreter(buyer.id);
                        return (
                          <tr key={buyer.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                            <td className="px-3 py-2 font-medium text-foreground sticky left-0 z-10 border-r" style={{ backgroundColor: bgColor }}>
                              <div className="max-w-[180px]" title={buyer.company_name}>
                                <div className="text-sm text-foreground leading-tight">{buyer.company_name}</div>
                                <div className="text-[10px] text-slate-500">{buyer.country}</div>
                              </div>
                            </td>
                            {assignMode && (
                              <td className="px-2 py-2 border-r bg-violet-50/50">
                                <InterpreterPicker interpreters={interpreters} value={buyerInterp} onChange={(id) => assignBuyer(buyer.id, id)} />
                              </td>
                            )}
                            <td className="px-2 py-2 text-center">
                              {buyer.booth_number && <Badge variant="secondary" className="text-xs">{buyer.booth_number}</Badge>}
                            </td>
                            {filteredSlots.map(slot => (
                              <td key={slot.id} className="px-2 py-1.5 border-l">
                                {renderCell(findConsultation(buyer.id, slot.id), slot)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}

                      {viewMode === 'booth' && (paginatedData as BuyerData[]).map((buyer, idx) => {
                        const bgColor = idx % 2 === 0 ? 'var(--card)' : 'var(--muted)';
                        return (
                          <tr key={buyer.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                            <td className="px-3 py-2 font-medium text-foreground sticky left-0 z-10 border-r" style={{ backgroundColor: bgColor }}>
                              <div className="text-sm font-semibold text-foreground">{buyer.booth_number || '미지정'}</div>
                            </td>
                            {filteredSlots.map(slot => (
                              <td key={slot.id} className="px-2 py-1.5 border-l">
                                {renderCell(findConsultation(buyer.id, slot.id), slot)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}

                      {viewMode === 'interpreter' && (paginatedData as { interpreter: Interpreter; cons: ConsultationData[] }[]).map((row, idx) => {
                        const bgColor = idx % 2 === 0 ? 'var(--card)' : 'var(--muted)';
                        return (
                          <tr key={row.interpreter.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                            <td className="px-3 py-2 font-medium text-foreground sticky left-0 z-10 border-r" style={{ backgroundColor: bgColor }}>
                              <div className="truncate max-w-[150px]">{row.interpreter.name}</div>
                              <div className="text-[10px] text-slate-500">{row.interpreter.email}</div>
                            </td>
                            {filteredSlots.map(slot => {
                              const cons = row.cons.find(c => c.time_slot_id === slot.id);
                              return (
                                <td key={slot.id} className="px-2 py-1.5 border-l">
                                  {renderCell(cons, slot)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {viewMode === 'seller' && (paginatedData as SellerData[]).map((seller, idx) => {
                        const bgColor = idx % 2 === 0 ? 'var(--card)' : 'var(--muted)';
                        const sellerCons = consultations.filter(c => c.seller_id === seller.id);
                        return (
                          <tr key={seller.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                            <td className="px-3 py-2 font-medium text-foreground sticky left-0 z-10 border-r" style={{ backgroundColor: bgColor }}>
                              <div className="truncate max-w-[150px]" title={seller.company_name_kr || seller.company_name}>
                                {seller.company_name_kr || seller.company_name}
                              </div>
                              <div className="text-[10px] text-slate-500">{seller.contact_name}</div>
                            </td>
                            {filteredSlots.map(slot => {
                              const cons = sellerCons.find(c => c.time_slot_id === slot.id);
                              return (
                                <td key={slot.id} className="px-2 py-1.5 border-l">
                                  {renderCell(cons, slot)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      {/* 상담 편집 팝업 */}
      <ConsultationEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        consultation={editingConsultation}
        timeSlot={editingSlot}
        buyers={buyers}
        sellers={sellers}
        interpreters={interpreters}
        onSaved={handleConsultationSaved}
      />
    </div>
  );
}
