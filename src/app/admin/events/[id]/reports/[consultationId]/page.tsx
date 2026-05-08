import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, User, Building2, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { TemplateField } from '@/types';

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
            <Badge variant={report.submitted ? 'default' : 'secondary'} className="text-xs">
              {report.submitted ? '제출완료' : '작성중'}
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

      {/* 작성중 안내 */}
      {!report.submitted && (
        <Card className="border-0 shadow-sm mb-6 bg-amber-50/50">
          <CardContent className="p-4">
            <p className="text-sm text-amber-700">
              이 일지는 아직 <span className="font-semibold">작성중</span>이며 통역사가 최종 제출하지 않은 상태입니다.
            </p>
          </CardContent>
        </Card>
      )}

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
