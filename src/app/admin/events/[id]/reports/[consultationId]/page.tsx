import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, Building2, UserCheck, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import type { TemplateField, ReportStatus, Consultation } from '@/types';
import { ReportActions } from '@/components/admin/ReportActions';
import { AdminFieldsEditor } from '@/components/admin/AdminFieldsEditor';
import { DataAlertCard } from '@/components/admin/DataAlertCard';
import { buildAutoValues, AUTO_SOURCE_OPTIONS } from '@/lib/template/auto-source';

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; consultationId: string }>;
}) {
  const { id: eventId, consultationId } = await params;
  const supabase = await createClient();

  // 상담 정보 조회
  const { data: consultation } = await supabase
    .from('consultations')
    .select(`
      *,
      time_slot:time_slots(*),
      buyer:buyers(*),
      seller:sellers(*),
      interpreter:profiles!consultations_interpreter_id_fkey(name, email)
    `)
    .eq('id', consultationId)
    .eq('event_id', eventId)
    .single();

  if (!consultation) redirect(`/admin/events/${eventId}/reports`);

  // 상담일지 조회 (없을 수 있음 — 데이터 알림 처리를 위해 redirect 안 함)
  const { data: report } = await supabase
    .from('consultation_reports')
    .select('*')
    .eq('consultation_id', consultationId)
    .maybeSingle();

  // 데이터 알림 (가장 최근 1건)
  const { data: dataAlert } = await supabase
    .from('consultation_data_alerts')
    .select('id, missing_keys, note, status, created_at, resolved_at')
    .eq('consultation_id', consultationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 일지도 알림도 없으면 목록으로 돌려보냄
  if (!report && !dataAlert) {
    redirect(`/admin/events/${eventId}/reports`);
  }

  // 양식 필드 조회
  const { data: template } = await supabase
    .from('report_templates')
    .select('fields')
    .eq('event_id', eventId)
    .single();

  const fields: TemplateField[] = (template?.fields as TemplateField[]) ?? [];
  const reportData = (report?.data ?? {}) as Record<string, unknown>;
  const ts = consultation.time_slot as Record<string, string> | null;
  const buyer = consultation.buyer as Record<string, string> | null;
  const seller = consultation.seller as Record<string, string> | null;
  const interpreter = consultation.interpreter as Record<string, string> | null;
  const reportStatus: ReportStatus | null = report
    ? ((report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus)
    : null;

  // 작성 주체별 필드 분리
  const interpreterFields = fields.filter((f) => (f.source ?? 'interpreter') === 'interpreter');
  const autoFields = fields.filter((f) => f.source === 'auto' && f.autoSource);
  const adminFields = fields.filter((f) => f.source === 'admin');
  const autoValues = buildAutoValues(consultation as Pick<Consultation, 'time_slot' | 'buyer' | 'seller'>, fields);

  // autoSource key → 한글 라벨 매핑
  const keyLabelMap: Record<string, string> = {};
  AUTO_SOURCE_OPTIONS.forEach((o) => { keyLabelMap[o.value] = o.label; });
  // 템플릿 필드 라벨도 (missing_keys가 autoSource 키인지 field.key인지 따라)
  fields.forEach((f) => { if (f.autoSource) keyLabelMap[f.autoSource] = f.label; keyLabelMap[f.key] = f.label; });

  const statusLabels: Record<ReportStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
    draft: { label: '작성중', variant: 'secondary' },
    submitted: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    under_review: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    approved: { label: '승인됨', variant: 'default', className: 'bg-emerald-500' },
    excellent: { label: '우수상담', variant: 'default', className: 'bg-amber-500' },
    revision_requested: { label: '수정요청', variant: 'outline', className: 'border-amber-200 text-amber-700 bg-amber-50' },
    rejected: { label: '반려', variant: 'destructive' },
  };

  const currentStatus = reportStatus ? statusLabels[reportStatus] : null;

  return (
    <div>
      {/* 상담 정보 헤더 */}
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Clock className="w-3 h-3" />
              {ts?.date} {ts?.start_time} - {ts?.end_time}
            </div>
            {currentStatus ? (
              <Badge variant={currentStatus.variant} className={`text-xs ${currentStatus.className || ''}`}>
                {currentStatus.label}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">미작성</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">바이어</p>
                <p className="text-sm font-medium text-foreground">{buyer?.company_name}</p>
                <p className="text-xs text-slate-500">{buyer?.country}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">셀러</p>
                <p className="text-sm font-medium text-foreground">
                  {seller?.company_name_kr || seller?.company_name}
                </p>
                <p className="text-xs text-slate-500">{seller?.contact_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <UserCheck className="w-4 h-4 text-slate-500 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500">통역사</p>
                <p className="text-sm font-medium text-foreground">{interpreter?.name}</p>
                <p className="text-xs text-slate-500">{interpreter?.email}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 데이터 확인 요청 알림 */}
      {dataAlert && (
        <DataAlertCard
          alert={dataAlert as { id: string; missing_keys: string[]; note: string | null; status: 'pending' | 'resolved'; created_at: string; resolved_at: string | null }}
          keyLabelMap={keyLabelMap}
        />
      )}

      {/* 상태 안내 + 승인/반려 액션 (일지가 있을 때만) */}
      {report && reportStatus && (
        <div className="mb-6">
          <ReportActions
            reportId={report.id}
            reportStatus={reportStatus}
            reportVersion={report.version ?? 1}
            adminComment={report.admin_comment}
            reviewedAt={report.reviewed_at}
          />
        </div>
      )}

      {/* 자동 채움 필드 */}
      {autoFields.length > 0 && (
        <Card className="border-0 shadow-sm mb-6 bg-emerald-50/50 border-emerald-100">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              자동 채움 필드
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {autoFields.map((f) => (
                <div key={f.key}>
                  <p className="text-xs font-medium text-slate-500 mb-1">{f.label}</p>
                  <p className="text-sm text-foreground">{autoValues[f.key] ?? '-'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 관리자 입력 필드 (일지가 있을 때만) */}
      {report && (
        <AdminFieldsEditor
          reportId={report.id}
          reportVersion={(report as { version?: number }).version ?? 1}
          initialData={reportData}
          adminFields={adminFields}
        />
      )}

      {/* 통역사 작성 내용 (일지가 있을 때만) */}
      {report && (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">통역사 작성 내용</CardTitle>
        </CardHeader>
        <CardContent>
          {interpreterFields.length === 0 ? (
            <p className="text-sm text-slate-500">통역사 작성 필드가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {interpreterFields.map((field) => {
                const value = reportData[field.key];
                const displayValue = value != null && value !== ''
                  ? (field.type === 'number' && !isNaN(Number(value)) ? Number(value).toLocaleString() : String(value))
                  : '-';

                return (
                  <div key={field.key} className="border-b border-border pb-3 last:border-0">
                    <p className="text-xs font-medium text-slate-500 mb-1">{field.label}</p>
                    <p className={`text-sm text-foreground ${field.type === 'textarea' ? 'whitespace-pre-wrap' : ''}`}>
                      {displayValue}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-slate-500 mt-4 pt-3 border-t">
            {report.submitted_at && (
              <span>제출: {new Date(report.submitted_at).toLocaleString('ko-KR')}</span>
            )}
            {report.updated_at && (
              <span>최종 수정: {new Date(report.updated_at).toLocaleString('ko-KR')}</span>
            )}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
