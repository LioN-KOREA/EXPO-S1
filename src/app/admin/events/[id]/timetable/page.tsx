'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { ArrowLeft, Upload, RefreshCw, UserPlus, Search, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { toast } from 'sonner';

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

interface TimeSlot { id: string; start_time: string; end_time: string; slot_order: number; date: string; }
interface Buyer { id: string; company_name: string; country: string; booth_number: string; }
interface ConsultationData { id: string; time_slot_id: string; buyer_id: string; interpreter_id: string | null; seller: { company_name: string; company_name_kr: string; contact_name: string } | null; }
interface Interpreter { id: string; name: string; email: string; }

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

  // 프리뷰 관련
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewErrors, setPreviewErrors] = useState<PreviewError[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{ slots: number; buyers: number; sellers: number; consultations: number } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [existingReports, setExistingReports] = useState<{ total: number; submitted: number; inProgress: number }>({ total: 0, submitted: 0, inProgress: 0 });

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [consultations, setConsultations] = useState<ConsultationData[]>([]);
  const [interpreters, setInterpreters] = useState<Interpreter[]>([]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    const supabase = createClient();

    // 이 상담회에 배정된 통역사만 조회
    const [slotsRes, buyersRes, consRes, eventInterpRes] = await Promise.all([
      supabase.from('time_slots').select('*').eq('event_id', eventId).order('slot_order'),
      supabase.from('buyers').select('id, company_name, country, booth_number').eq('event_id', eventId),
      supabase.from('consultations').select('id, time_slot_id, buyer_id, interpreter_id, seller:sellers(company_name, company_name_kr, contact_name)').eq('event_id', eventId),
      supabase.from('event_interpreters').select('interpreter_id, interpreter:profiles!event_interpreters_interpreter_id_fkey(id, name, email)').eq('event_id', eventId),
    ]);

    setTimeSlots(slotsRes.data || []);
    setBuyers(buyersRes.data || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConsultations((consRes.data || []).map((c: any) => ({ ...c, seller: c.seller })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interps = (eventInterpRes.data || []).map((ei: any) => ei.interpreter).filter(Boolean) as Interpreter[];
    setInterpreters(interps);
    setDataLoading(false);
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 1단계: 프리뷰 (파싱만)
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

  // 2단계: 확인 후 실제 저장
  async function handleConfirmUpload() {
    if (!previewFile) return;

    // 기존 일지가 있으면 최종 확인
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

  // 개별 셀 통역사 배정
  async function assignOne(consultationId: string, interpreterId: string | null) {
    const supabase = createClient();
    const { error } = await supabase.from('consultations').update({ interpreter_id: interpreterId }).eq('id', consultationId);
    if (error) {
      if (error.code === '23505') {
        toast.error('이 통역사는 같은 시간에 다른 상담이 배정되어 있습니다');
      } else {
        toast.error('배정에 실패했습니다');
      }
      return;
    }
    setConsultations(prev => prev.map(c => c.id === consultationId ? { ...c, interpreter_id: interpreterId } : c));
  }

  // 바이어별 일괄 배정: 해당 바이어의 모든 타임슬롯에 같은 통역사 배정
  async function assignBuyer(buyerId: string, interpreterId: string | null) {
    const targets = consultations.filter(c => c.buyer_id === buyerId);
    const supabase = createClient();
    for (const c of targets) {
      await supabase.from('consultations').update({ interpreter_id: interpreterId }).eq('id', c.id);
    }
    setConsultations(prev => prev.map(c =>
      c.buyer_id === buyerId ? { ...c, interpreter_id: interpreterId } : c
    ));
    const name = interpreters.find(i => i.id === interpreterId)?.name || '미배정';
    toast.success(`${targets.length}건 → ${name}`);
  }

  function findConsultation(buyerId: string, slotId: string) {
    return consultations.find(c => c.buyer_id === buyerId && c.time_slot_id === slotId);
  }

  // 바이어의 대표 통역사 (가장 많이 배정된 통역사)
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

  const hasData = timeSlots.length > 0;

  return (
    <div>
      <Link href={`/admin/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 상세로
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">타임테이블</h2>
          {hasData && (
            <p className="text-slate-500 text-sm mt-1">
              {timeSlots.length}개 타임슬롯 · {buyers.length}명 바이어 · {consultations.length}건 매칭
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
                <Button
                  size="sm"
                  onClick={handleConfirmUpload}
                  disabled={confirming}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  {confirming ? '저장 중...' : '확인 후 저장'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* 요약 */}
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

            {/* 기존 일지 경고 */}
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

            {/* 오류 표시 */}
            {previewErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">{previewErrors.length}건의 문제가 발견되었습니다</span>
                </div>
                <ul className="space-y-1">
                  {previewErrors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600">
                      행 {err.row + 1}: {err.message}
                    </li>
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

            {/* 바이어 테이블 미리보기 */}
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
                          <td className={`px-3 py-1.5 font-medium ${!b.company_name ? 'text-red-500' : 'text-foreground'}`}>
                            {b.company_name || '(비어있음)'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">{b.buyer_name}</td>
                          <td className={`px-3 py-1.5 ${!b.country ? 'text-red-500' : 'text-slate-500'}`}>
                            {b.country || '(비어있음)'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">{b.email}</td>
                          <td className="px-3 py-1.5 text-slate-500">{b.phone}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 타임슬롯 미리보기 */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">타임슬롯</h4>
              <div className="flex flex-wrap gap-2">
                {preview.time_slots.map((slot, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {slot.date} {slot.start_time}~{slot.end_time}
                  </Badge>
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
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[900px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-3 text-left font-medium sticky left-0 bg-slate-800 z-10 min-w-[160px]">바이어</th>
                      {assignMode && (
                        <th className="px-2 py-3 text-center font-medium w-[130px] bg-violet-900">
                          <div className="text-xs">담당 통역사</div>
                          <div className="text-[10px] text-violet-300">(바이어별 일괄)</div>
                        </th>
                      )}
                      <th className="px-2 py-3 text-center font-medium w-14">부스</th>
                      {timeSlots.map(slot => (
                        <th key={slot.id} className="px-2 py-3 text-center font-medium min-w-[160px]">
                          <div>{slot.start_time}</div>
                          <div className="text-xs text-blue-200">~{slot.end_time}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buyers.map((buyer, idx) => {
                      const bgColor = idx % 2 === 0 ? 'var(--card)' : 'var(--muted)';
                      const buyerInterp = getBuyerInterpreter(buyer.id);
                      return (
                        <tr key={buyer.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                          <td className="px-3 py-2 font-medium text-foreground sticky left-0 z-10 border-r" style={{ backgroundColor: bgColor }}>
                            <div className="truncate max-w-[150px]" title={buyer.company_name}>{buyer.company_name}</div>
                            <div className="text-[10px] text-slate-500">{buyer.country}</div>
                          </td>
                          {assignMode && (
                            <td className="px-2 py-2 border-r bg-violet-50/50">
                              <InterpreterPicker
                                interpreters={interpreters}
                                value={buyerInterp}
                                onChange={(id) => assignBuyer(buyer.id, id)}
                              />
                            </td>
                          )}
                          <td className="px-2 py-2 text-center">
                            {buyer.booth_number && <Badge variant="secondary" className="text-xs">{buyer.booth_number}</Badge>}
                          </td>
                          {timeSlots.map(slot => {
                            const cons = findConsultation(buyer.id, slot.id);
                            const interpName = cons?.interpreter_id ? interpreters.find(i => i.id === cons.interpreter_id)?.name : null;
                            return (
                              <td key={slot.id} className="px-2 py-1.5 border-l">
                                {cons ? (
                                  <div className="text-xs space-y-0.5">
                                    <div className="font-medium text-foreground/80 truncate max-w-[140px]">
                                      {cons.seller?.company_name_kr || cons.seller?.company_name}
                                    </div>
                                    <div className="text-slate-500 truncate max-w-[140px]">{cons.seller?.contact_name}</div>
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
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
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
      )}
    </div>
  );
}
