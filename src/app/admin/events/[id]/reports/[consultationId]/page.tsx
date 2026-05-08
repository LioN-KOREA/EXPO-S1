import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, User, Building2, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { TemplateField, ReportStatus } from '@/types';
import { ReportActions } from '@/components/admin/ReportActions';

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

  // 상담일지 조회
  const { data: report } = await supabase
    .from('consultation_reports')
    .select('*')
    .eq('consultation_id', consultationId)
    .single();

  if (!report) redirect(`/admin/events/${eventId}/reports`);

  // 양식 필드 조회
  const { data: template } = await supabase
    .from('report_templates')
    .select('fields')
    .eq('event_id', eventId)
    .single();

  const fields: TemplateField[] = (template?.fields as TemplateField[]) ?? [];
  const reportData = (report.data ?? {}) as Record<string, unknown>;
  const ts = consultation.time_slot as Record<string, string> | null;
  const buyer = consultation.buyer as Record<string, string> | null;
  const seller = consultation.seller as Record<string, string> | null;
  const interpreter = consultation.interpreter as Record<string, string> | null;
  const reportStatus = (report.report_status ?? (report.submitted ? 'submitted' : 'draft')) as ReportStatus;

  const statusLabels: Record<ReportStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
    draft: { label: '작성중', variant: 'secondary' },
    submitted: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    under_review: { label: '검토중', variant: 'outline', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    approved: { label: '승인됨', variant: 'default', className: 'bg-emerald-500' },
    revision_requested: { label: '수정요청', variant: 'destructive' },
  };

  const currentStatus = statusLabels[reportStatus];

  return (
    <div>
      <Link
        href={`/admin/events/${eventId}/reports`}
        className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        일지 목록으로
      </Link>

      {/* 상담 정보 헤더 */}
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Clock className="w-3 h-3" />
              {ts?.date} {ts?.start_time} - {ts?.end_time}
            </div>
            <Badge variant={currentStatus.variant} className={`text-xs ${currentStatus.className || ''}`}>
              {currentStatus.label}
            </Badge>
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

      {/* 상태 안내 + 승인/반려 액션 */}
      <div className="mb-6">
        <ReportActions
          reportId={report.id}
          reportStatus={reportStatus}
          adminComment={report.admin_comment}
          reviewedAt={report.reviewed_at}
        />
      </div>

      {/* 상담일지 내용 */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">상담일지 내용</CardTitle>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">양식 정보를 불러올 수 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => {
                const value = reportData[field.key];
                const displayValue = value != null && value !== '' ? String(value) : '-';

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
    </div>
  );
}
