'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { MultiStepReportForm } from '@/components/interpreter/MultiStepReportForm';
import { ArrowLeft, Save, User, Building2, Clock, CheckCircle2, Loader2, AlertTriangle, MessageSquare, Play, Square } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { TemplateField, Consultation, ConsultationReport, ReportStatus } from '@/types';

export default function ConsultationReportPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useI18n();
  const eventId = params.id as string;
  const consultationId = params.consultationId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [report, setReport] = useState<ConsultationReport | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

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
          setError(t.interpreter.loadError);
          setLoading(false);
          return;
        }

        // HIGH#3: URL eventId가 실제 consultation.event_id와 일치하는지 검증
        const actualEventId = (consultationData as { event_id?: string })?.event_id;
        if (actualEventId && actualEventId !== eventId) {
          setError(t.interpreter.urlEventMismatch);
          setLoading(false);
          return;
        }

        setConsultation(consultationData as Consultation);

        const { data: template, error: templateError } = await supabase
          .from('report_templates')
          .select('fields')
          .eq('event_id', actualEventId ?? eventId)
          .single();

        if (templateError && templateError.code !== 'PGRST116') {
          setError(t.interpreter.templateError);
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
        setError(t.interpreter.genericError);
      } finally {
        setLoading(false);
        // 초기 로드 후 잠시 대기 (자동저장 트리거 방지)
        setTimeout(() => { isInitialLoad.current = false; }, 500);
      }
    }
    load();
  }, [eventId, consultationId, t]);

  // 자동 저장 실행
  const executeAutoSave = useCallback(async () => {
    const currentReport = reportRef.current;
    const currentFormData = formDataRef.current;

    // 제출/승인/우수상담된 일지는 자동저장 안 함
    const status = currentReport?.report_status;
    if (status === 'submitted' || status === 'under_review' || status === 'approved' || status === 'excellent') return;


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
    let updatedRow: ConsultationReport | null = null;
    if (currentReport) {
      // 낙관적 락: select로 결과 반환받아 업데이트 성공 여부 명확화 (HIGH#1 수정)
      const { data, error: updateError } = await supabase
        .from('consultation_reports')
        .update(payload)
        .eq('id', currentReport.id)
        .eq('version', currentReport.version || 1)
        .select('*')
        .maybeSingle();

      if (updateError) {
        error = updateError;
      } else if (!data) {
        // 행 매칭 0 = 버전 충돌 또는 RLS 거부
        setAutoSaveStatus('error');
        toast.error(t.interpreter.concurrentEditError);
        return;
      } else {
        updatedRow = data as ConsultationReport;
      }
    } else {
      const { error: insertError, data: newReport } = await supabase
        .from('consultation_reports')
        .insert(payload)
        .select('*')
        .single();
      error = insertError;
      if (newReport) updatedRow = newReport as ConsultationReport;
    }

    if (error) {
      setAutoSaveStatus('error');
    } else {
      if (updatedRow) setReport(updatedRow);
      setAutoSaveStatus('saved');
      setLastSavedAt(new Date());
      // 상담 상태 업데이트 — scheduled에서만 in_progress로 (HIGH#2 수정: completed 다운그레이드 방지)
      if (consultation?.status === 'scheduled' || !consultation?.status) {
        const { error: csErr } = await supabase
          .from('consultations')
          .update({ status: 'in_progress' })
          .eq('id', consultationId)
          .eq('status', 'scheduled');
        if (!csErr) {
          setConsultation((prev) => prev ? { ...prev, status: 'in_progress' } : prev);
        }
      }
    }
  }, [consultationId, consultation?.status, t]);

  // formData 변경 시 1초 debounce 자동 저장
  useEffect(() => {
    if (isInitialLoad.current) return;
    const rs = report?.report_status;
    if (rs === 'submitted' || rs === 'under_review' || rs === 'approved' || rs === 'excellent') return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(() => {
      executeAutoSave();
    }, 1000);

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

  async function handleConsultationStatusChange(next: 'in_progress' | 'completed') {
    setStatusBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('consultations')
      .update({ status: next })
      .eq('id', consultationId);
    if (error) {
      toast.error(t.interpreter.statusChangeFailedPrefix + error.message);
    } else {
      toast.success(next === 'in_progress' ? t.interpreter.consultStarted : t.interpreter.consultFinishedToast);
      setConsultation((prev) => prev ? { ...prev, status: next } : prev);
    }
    setStatusBusy(false);
  }

  async function handleSave(submit = false) {
    // 자동 저장 타이머 취소
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error(t.interpreter.loginRequired);
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
      // HIGH#1: select 반환받아 행 매칭 확인
      const { data, error: updateError } = await supabase
        .from('consultation_reports')
        .update(payload)
        .eq('id', report.id)
        .eq('version', (report as unknown as { version: number }).version || 1)
        .select('id')
        .maybeSingle();

      if (updateError) {
        error = updateError;
      } else if (!data) {
        toast.error(t.interpreter.concurrentEditError);
        setSaving(false);
        return;
      }
    } else {
      ({ error } = await supabase
        .from('consultation_reports')
        .insert(payload));
    }

    if (error) {
      toast.error(t.interpreter.saveFailed);
      setSaving(false);
      return;
    }

    await supabase
      .from('consultations')
      .update({ status: submit ? 'completed' : 'in_progress' })
      .eq('id', consultationId);

    toast.success(submit ? t.interpreter.submittedToast : t.interpreter.savedToast);

    if (submit) {
      fetch('/api/interpreter/stats-revalidate', { method: 'POST' }).catch(() => {});
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
        <p className="text-slate-500">{t.common.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          {t.interpreter.retry}
        </Button>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{t.interpreter.notFound}</p>
      </div>
    );
  }

  const reportStatus: ReportStatus = report?.report_status ?? (report?.submitted ? 'submitted' : 'draft');
  // 편집 가능: draft, revision_requested, rejected
  const isEditable = !report || reportStatus === 'draft' || reportStatus === 'revision_requested' || reportStatus === 'rejected';
  // 읽기 전용: submitted, under_review, approved, excellent
  const isReadOnly = !isEditable;

  const statusConfig: Record<ReportStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
    draft: { label: report ? t.interpreter.statusDraft : t.interpreter.notStarted, variant: 'secondary' },
    submitted: { label: t.interpreter.statusUnderReview, variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    under_review: { label: t.interpreter.statusUnderReview, variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    approved: { label: t.interpreter.statusApprovedDone, variant: 'default', className: 'bg-emerald-500' },
    excellent: { label: t.interpreter.excellent, variant: 'default', className: 'bg-amber-500' },
    revision_requested: { label: t.interpreter.statusRevisionRequested, variant: 'outline', className: 'border-amber-200 text-amber-700 bg-amber-50' },
    rejected: { label: t.interpreter.statusRejected, variant: 'destructive' },
  };

  const currentStatus = statusConfig[reportStatus];

  return (
    <div>
      <Link
        href={`/interpreter/events/${eventId}`}
        className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        {t.interpreter.backToList}
      </Link>

      {/* 수정요청 알림 */}
      {(reportStatus === 'revision_requested' || reportStatus === 'rejected') && report?.admin_comment && (
        <Card className="border-0 shadow-sm mb-4 bg-red-50/50 border-red-100">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">{t.interpreter.adminRevisionTitle}</p>
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
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Clock className="w-3 h-3" />
              {consultation.time_slot?.start_time} - {consultation.time_slot?.end_time}
            </div>
            <Badge variant={currentStatus.variant} className={`text-xs ${currentStatus.className || ''}`}>
              {currentStatus.label}
            </Badge>
            {/* 상담 진행 상태 */}
            {!isReadOnly && consultation.status !== 'completed' && (
              <div className="ml-auto flex gap-2">
                {consultation.status !== 'in_progress' ? (
                  <Button
                    size="sm"
                    onClick={() => handleConsultationStatusChange('in_progress')}
                    disabled={statusBusy}
                    className="bg-blue-500 hover:bg-blue-600 gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {t.interpreter.startConsult}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleConsultationStatusChange('completed')}
                    disabled={statusBusy}
                    className="bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5" />
                    {t.interpreter.endConsult}
                  </Button>
                )}
              </div>
            )}
            {consultation.status === 'completed' && (
              <span className="ml-auto text-xs font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t.interpreter.consultEnded}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">{t.seller.buyerLabel}</p>
                <p className="text-sm font-medium text-foreground">{consultation.buyer?.company_name}</p>
                <p className="text-xs text-slate-500">{consultation.buyer?.country}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">{t.seller.sellerLabel}</p>
                <p className="text-sm font-medium text-foreground">
                  {consultation.seller?.company_name_kr || consultation.seller?.company_name}
                </p>
                <p className="text-xs text-slate-500">{consultation.seller?.contact_name}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 안내 */}
      {isEditable && (
        <p className="text-xs text-slate-500 mb-3 px-1">
          {t.interpreter.reportInfoNotice}
        </p>
      )}

      {/* 상담일지 폼 */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t.interpreter.reportTitle}</CardTitle>
            {/* 자동 저장 상태 표시 */}
            {isEditable && fields.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                {autoSaveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t.interpreter.autoSaving}
                  </span>
                )}
                {autoSaveStatus === 'saved' && lastSavedAt && (
                  <span className="flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="w-3 h-3" />
                    {t.interpreter.autoSaved.replace('{time}', lastSavedAt.toLocaleTimeString(locale === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' }))}
                  </span>
                )}
                {autoSaveStatus === 'error' && (
                  <span className="text-red-400">{t.interpreter.autoSaveFailed}</span>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t.interpreter.noForm}
            </p>
          ) : (
            <>
              <MultiStepReportForm
                fields={fields}
                values={formData}
                onChange={handleFieldChange}
                disabled={isReadOnly}
                onSubmit={() => setSubmitOpen(true)}
                submitting={saving}
                submitLabel={reportStatus === 'revision_requested' ? t.interpreter.resubmit : t.interpreter.submit}
              />

              {isEditable && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="gap-2"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? t.interpreter.saving : t.interpreter.tempSave}
                  </Button>
                  <p className="text-[11px] text-slate-500 hidden sm:block">
                    {t.interpreter.autoSaveInterval}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 제출 확인 모달 */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.interpreter.reportSubmitTitle}</DialogTitle>
            <DialogDescription>
              {t.interpreter.reportSubmitDesc}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={saving}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={async () => {
                setSubmitOpen(false);
                await handleSave(true);
              }}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {saving ? t.interpreter.submitting : t.interpreter.submitConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
