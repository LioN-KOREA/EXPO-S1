'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicForm } from '@/components/interpreter/DynamicForm';
import { ArrowLeft, Save, Send, User, Building2, Clock, CheckCircle2, Loader2, AlertTriangle, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { TemplateField, Consultation, ConsultationReport, ReportStatus } from '@/types';

export default function ConsultationReportPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const consultationId = params.consultationId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [report, setReport] = useState<ConsultationReport | null>(null);

  // 자동 저장 관련
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);
  const reportRef = useRef(report);
  const formDataRef = useRef(formData);

  // ref 동기화
  useEffect(() => { reportRef.current = report; }, [report]);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();

        const { data: consultationData, error: consultationError } = await supabase
          .from('consultations')
          .select(`
            *,
            time_slot:time_slots(*),
            buyer:buyers(*),
            seller:sellers(*)
          `)
          .eq('id', consultationId)
          .single();

        if (consultationError) {
          setError('상담 정보를 불러올 수 없습니다.');
          setLoading(false);
          return;
        }

        setConsultation(consultationData as Consultation);

        const { data: template, error: templateError } = await supabase
          .from('report_templates')
          .select('fields')
          .eq('event_id', eventId)
          .single();

        if (templateError && templateError.code !== 'PGRST116') {
          setError('상담일지 양식을 불러올 수 없습니다.');
          setLoading(false);
          return;
        }

        if (template?.fields) {
          setFields(template.fields as TemplateField[]);
        }

        const { data: existingReport } = await supabase
          .from('consultation_reports')
          .select('*')
          .eq('consultation_id', consultationId)
          .single();

        if (existingReport) {
          setReport(existingReport as ConsultationReport);
          setFormData((existingReport.data as Record<string, unknown>) ?? {});
        }
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
        // 초기 로드 후 잠시 대기 (자동저장 트리거 방지)
        setTimeout(() => { isInitialLoad.current = false; }, 500);
      }
    }
    load();
  }, [eventId, consultationId]);

  // 자동 저장 실행
  const executeAutoSave = useCallback(async () => {
    const currentReport = reportRef.current;
    const currentFormData = formDataRef.current;

    // 제출/승인된 일지는 자동저장 안 함
    const status = currentReport?.report_status;
    if (status === 'submitted' || status === 'under_review' || status === 'approved') return;


    setAutoSaveStatus('saving');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAutoSaveStatus('error'); return; }

    const payload = {
      consultation_id: consultationId,
      interpreter_id: user.id,
      data: currentFormData,
      submitted: false,
      submitted_at: null,
      report_status: 'draft' as ReportStatus,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (currentReport) {
      // 낙관적 락: 현재 알고 있는 version으로 조건부 업데이트
      const { error: updateError, count } = await supabase
        .from('consultation_reports')
        .update(payload)
        .eq('id', currentReport.id)
        .eq('version', currentReport.version || 1);

      if (count === 0 && !updateError) {
        // 다른 디바이스에서 먼저 수정됨
        setAutoSaveStatus('error');
        toast.error('다른 곳에서 수정되었습니다. 페이지를 새로고침해주세요.');
        return;
      }
      error = updateError;

      // 버전 갱신 (트리거가 증가시킴)
      if (!error) {
        const { data: refreshed } = await supabase
          .from('consultation_reports')
          .select('*')
          .eq('id', currentReport.id)
          .single();
        if (refreshed) setReport(refreshed as ConsultationReport);
      }
    } else {
      const { error: insertError, data: newReport } = await supabase
        .from('consultation_reports')
        .insert(payload)
        .select('*')
        .single();
      error = insertError;
      if (newReport) setReport(newReport as ConsultationReport);
    }

    if (error) {
      setAutoSaveStatus('error');
    } else {
      setAutoSaveStatus('saved');
      setLastSavedAt(new Date());
      // 상담 상태도 업데이트
      await supabase
        .from('consultations')
        .update({ status: 'in_progress' })
        .eq('id', consultationId);
    }
  }, [consultationId]);

  // formData 변경 시 3초 debounce 자동 저장
  useEffect(() => {
    if (isInitialLoad.current) return;
    const rs = report?.report_status;
    if (rs === 'submitted' || rs === 'under_review' || rs === 'approved') return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(() => {
      executeAutoSave();
    }, 3000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [formData, executeAutoSave, report?.report_status]);

  function handleFieldChange(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // 변경 시 상태 초기화
    if (autoSaveStatus === 'saved' || autoSaveStatus === 'error') {
      setAutoSaveStatus('idle');
    }
  }

  async function handleSave(submit = false) {
    // 자동 저장 타이머 취소
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('로그인이 필요합니다');
      setSaving(false);
      return;
    }

    const payload = {
      consultation_id: consultationId,
      interpreter_id: user.id,
      data: formData,
      submitted: submit,
      submitted_at: submit ? new Date().toISOString() : null,
      report_status: (submit ? 'submitted' : 'draft') as ReportStatus,
      admin_comment: submit ? null : undefined, // 재제출 시 이전 코멘트 초기화
      updated_at: new Date().toISOString(),
    };

    let error;

    if (report) {
      const { error: updateError, count } = await supabase
        .from('consultation_reports')
        .update(payload)
        .eq('id', report.id)
        .eq('version', (report as unknown as { version: number }).version || 1);

      if (count === 0 && !updateError) {
        toast.error('다른 곳에서 수정되었습니다. 페이지를 새로고침해주세요.');
        setSaving(false);
        return;
      }
      error = updateError;
    } else {
      ({ error } = await supabase
        .from('consultation_reports')
        .insert(payload));
    }

    if (error) {
      toast.error('저장에 실패했습니다');
      setSaving(false);
      return;
    }

    await supabase
      .from('consultations')
      .update({ status: submit ? 'completed' : 'in_progress' })
      .eq('id', consultationId);

    toast.success(submit ? '상담일지가 제출되었습니다' : '임시 저장되었습니다');

    if (submit) {
      router.push(`/interpreter/events/${eventId}`);
    } else {
      const { data: updatedReport } = await supabase
        .from('consultation_reports')
        .select('*')
        .eq('consultation_id', consultationId)
        .single();
      if (updatedReport) setReport(updatedReport as ConsultationReport);
      setAutoSaveStatus('saved');
      setLastSavedAt(new Date());
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">상담 정보를 찾을 수 없습니다</p>
      </div>
    );
  }

  const reportStatus: ReportStatus = report?.report_status ?? (report?.submitted ? 'submitted' : 'draft');
  // 편집 가능: draft, revision_requested, rejected
  const isEditable = !report || reportStatus === 'draft' || reportStatus === 'revision_requested' || reportStatus === 'rejected';
  // 읽기 전용: submitted, under_review, approved
  const isReadOnly = !isEditable;

  const statusConfig: Record<ReportStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
    draft: { label: report ? '작성중' : '미작성', variant: 'secondary' },
    submitted: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    under_review: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    approved: { label: '승인됨', variant: 'default', className: 'bg-emerald-500' },
    revision_requested: { label: '수정요청', variant: 'outline', className: 'border-amber-200 text-amber-700 bg-amber-50' },
    rejected: { label: '반려', variant: 'destructive' },
  };

  const currentStatus = statusConfig[reportStatus];

  return (
    <div>
      <Link
        href={`/interpreter/events/${eventId}`}
        className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        일정표로 돌아가기
      </Link>

      {/* 수정요청 알림 */}
      {(reportStatus === 'revision_requested' || reportStatus === 'rejected') && report?.admin_comment && (
        <Card className="border-0 shadow-sm mb-4 bg-red-50/50 border-red-100">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">관리자 수정요청</p>
                <div className="flex items-start gap-1.5 mt-1">
                  <MessageSquare className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-600">{report.admin_comment}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 상담 정보 헤더 */}
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Clock className="w-3 h-3" />
              {consultation.time_slot?.start_time} - {consultation.time_slot?.end_time}
            </div>
            <Badge variant={currentStatus.variant} className={`text-xs ${currentStatus.className || ''}`}>
              {currentStatus.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">바이어</p>
                <p className="text-sm font-medium text-foreground">{consultation.buyer?.company_name}</p>
                <p className="text-xs text-slate-500">{consultation.buyer?.country}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">셀러 (참가업체)</p>
                <p className="text-sm font-medium text-foreground">
                  {consultation.seller?.company_name_kr || consultation.seller?.company_name}
                </p>
                <p className="text-xs text-slate-500">{consultation.seller?.contact_name}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 상담일지 폼 */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">상담일지 작성</CardTitle>
            {/* 자동 저장 상태 표시 */}
            {isEditable && fields.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                {autoSaveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    자동 저장 중...
                  </span>
                )}
                {autoSaveStatus === 'saved' && lastSavedAt && (
                  <span className="flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="w-3 h-3" />
                    {lastSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨
                  </span>
                )}
                {autoSaveStatus === 'error' && (
                  <span className="text-red-400">자동 저장 실패</span>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">
              상담일지 양식이 설정되지 않았습니다. 관리자에게 문의하세요.
            </p>
          ) : (
            <>
              <DynamicForm
                fields={fields}
                values={formData}
                onChange={handleFieldChange}
                disabled={isReadOnly}
              />

              {isEditable && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => handleSave(false)}
                      disabled={saving}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? '저장 중...' : '임시 저장'}
                    </Button>
                    <Button
                      onClick={() => handleSave(true)}
                      disabled={saving}
                      className="gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                    >
                      <Send className="w-4 h-4" />
                      {saving ? '제출 중...' : reportStatus === 'revision_requested' ? '재제출' : '제출'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500 hidden sm:block">
                    입력 내용은 자동으로 임시 저장됩니다
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
