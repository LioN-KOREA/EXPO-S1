import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, User, Building2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { TemplateField } from '@/types';

export default async function SellerReportViewPage({
  params,
}: {
  params: Promise<{ consultationId: string }>;
}) {
  const { consultationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 셀러 본인 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('linked_seller_id, name')
    .eq('id', user!.id)
    .single();

  if (!profile?.linked_seller_id) redirect('/seller');

  // 상담 정보 조회 (본인 상담인지 확인)
  const { data: consultation } = await supabase
    .from('consultations')
    .select(`
      *,
      time_slot:time_slots(*),
      buyer:buyers(company_name, buyer_name, country),
      seller:sellers(company_name, company_name_kr, contact_name),
      event:events(id, name)
    `)
    .eq('id', consultationId)
    .eq('seller_id', profile.linked_seller_id)
    .single();

  if (!consultation) redirect('/seller');

  // 제출된 상담일지 조회
  const { data: report } = await supabase
    .from('consultation_reports')
    .select('*')
    .eq('consultation_id', consultationId)
    .eq('submitted', true)
    .single();

  if (!report) redirect('/seller');

  // 양식 필드 조회 (라벨 표시용)
  const eventData = consultation.event as Record<string, string>;
  const { data: template } = await supabase
    .from('report_templates')
    .select('fields')
    .eq('event_id', eventData.id)
    .single();

  const fields: TemplateField[] = (template?.fields as TemplateField[]) ?? [];
  const reportData = (report.data ?? {}) as Record<string, unknown>;
  const ts = consultation.time_slot as Record<string, string> | null;
  const buyer = consultation.buyer as Record<string, string> | null;
  const seller = consultation.seller as Record<string, string> | null;

  return (
    <div>
      <Link
        href="/seller"
        className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        스케줄로 돌아가기
      </Link>

      {/* 상담 정보 */}
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Clock className="w-3 h-3" />
              {ts?.start_time} - {ts?.end_time}
            </div>
            <Badge variant="secondary" className="text-xs">{ts?.date}</Badge>
            <Badge variant="default" className="text-xs">제출완료</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <p className="text-xs text-slate-500">셀러 (참가업체)</p>
                <p className="text-sm font-medium text-foreground">
                  {seller?.company_name_kr || seller?.company_name}
                </p>
                <p className="text-xs text-slate-500">{seller?.contact_name}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 상담일지 내용 */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">상담일지</CardTitle>
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

          {report.submitted_at && (
            <p className="text-xs text-slate-500 mt-4 pt-3 border-t">
              제출일시: {new Date(report.submitted_at).toLocaleString('ko-KR')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
