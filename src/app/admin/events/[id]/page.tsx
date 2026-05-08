import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Clock, Users, FileText, Download, ClipboardList, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { DeleteEventButton } from '@/components/admin/DeleteEventButton';
import { batchIn } from '@/lib/supabase/batch-query';
import type { ReportStatus } from '@/types';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (!event) notFound();

  // 통계 조회
  const [slotsRes, interpretersRes, consultationsRes, templateRes] = await Promise.all([
    supabase.from('time_slots').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('event_interpreters').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('consultations').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('report_templates').select('fields').eq('event_id', id).single(),
  ]);

  // 상담일지 상태별 집계 (배치 조회)
  const { data: consIds } = await supabase.from('consultations').select('id').eq('event_id', id);
  const reports = await batchIn(
    (ids) => supabase.from('consultation_reports').select('report_status, submitted').in('consultation_id', ids),
    consIds?.map(c => c.id) ?? [],
  );
  const reportStatusCounts = { approved: 0, submitted: 0, revision_requested: 0, rejected: 0, draft: 0 };
  reports.forEach((r: Record<string, unknown>) => {
    const rs = (r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') reportStatusCounts.approved++;
    else if (rs === 'submitted' || rs === 'under_review') reportStatusCounts.submitted++;
    else if (rs === 'revision_requested') reportStatusCounts.revision_requested++;
    else if (rs === 'rejected') reportStatusCounts.rejected++;
    else reportStatusCounts.draft++;
  });
  const totalCons = consultationsRes.count ?? 0;
  const notStarted = totalCons - reports.length;

  const managementItems = [
    {
      title: '대시보드',
      description: '상담 통계, 실적 순위, 성과 지표',
      href: `/admin/events/${id}/dashboard`,
      icon: BarChart3,
      count: 0,
      countLabel: '',
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      title: '관리 / 등록',
      description: '타임테이블, 바이어·셀러, 통역사, 양식 등록',
      href: `/admin/events/${id}/registration`,
      icon: ClipboardList,
      count: 0,
      countLabel: '',
      color: 'from-rose-500 to-rose-600',
    },
    {
      title: '타임테이블',
      description: '상담 스케줄 조회 및 통역사 배정',
      href: `/admin/events/${id}/timetable`,
      icon: Clock,
      count: slotsRes.count ?? 0,
      countLabel: '타임슬롯',
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: '통역사 배정',
      description: '통역사 배정 및 관리',
      href: `/admin/events/${id}/interpreters`,
      icon: Users,
      count: interpretersRes.count ?? 0,
      countLabel: '명 배정',
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      title: '상담일지 양식',
      description: '상담일지 양식 조회',
      href: `/admin/events/${id}/template`,
      icon: FileText,
      count: Array.isArray(templateRes?.data?.fields) ? templateRes.data.fields.length : 0,
      countLabel: '개 필드',
      color: 'from-amber-500 to-amber-600',
    },
    {
      title: '상담일지 조회',
      description: '전체 상담일지 조회 및 엑셀 다운로드',
      href: `/admin/events/${id}/reports`,
      icon: Download,
      count: 0,
      countLabel: '',
      color: 'from-purple-500 to-purple-600',
      statusSummary: { ...reportStatusCounts, not_started: notStarted },
    },
  ];

  return (
    <div>
      <Link href="/admin/events" className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 목록으로
      </Link>

      {/* 상담회 헤더 */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-foreground">{event.name}</h2>
            <Badge variant={event.status === 'active' ? 'default' : 'secondary'}>
              {event.status === 'active' ? '진행중' : '종료'}
            </Badge>
          </div>
          {event.description && (
            <p className="text-slate-500 mb-2">{event.description}</p>
          )}
          <p className="text-sm text-slate-500">
            {event.start_date} ~ {event.end_date}
          </p>
        </div>
        <DeleteEventButton eventId={id} />
      </div>

      {/* 관리 메뉴 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {managementItems.map((item) => (
          <Link key={item.title} href={item.href}>
            <Card className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer group h-full">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                    {item.countLabel && (
                      <p className="text-xs text-slate-500 mt-2">
                        {item.count} {item.countLabel}
                      </p>
                    )}
                    {'statusSummary' in item && item.statusSummary && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {item.statusSummary.approved > 0 && <span className="text-xs text-emerald-600">승인 {item.statusSummary.approved}</span>}
                        {item.statusSummary.submitted > 0 && <span className="text-xs text-blue-600">검토중 {item.statusSummary.submitted}</span>}
                        {item.statusSummary.revision_requested > 0 && <span className="text-xs text-amber-600">수정요청 {item.statusSummary.revision_requested}</span>}
                        {item.statusSummary.rejected > 0 && <span className="text-xs text-red-600">반려 {item.statusSummary.rejected}</span>}
                        {item.statusSummary.draft > 0 && <span className="text-xs text-orange-600">작성중 {item.statusSummary.draft}</span>}
                        {item.statusSummary.not_started > 0 && <span className="text-xs text-slate-500">미작성 {item.statusSummary.not_started}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
