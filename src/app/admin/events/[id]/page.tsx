import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Clock, Users, FileText, Download } from 'lucide-react';
import Link from 'next/link';
import { DeleteEventButton } from '@/components/admin/DeleteEventButton';

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
  const [slotsRes, interpretersRes, consultationsRes, reportsRes, templateRes] = await Promise.all([
    supabase.from('time_slots').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('event_interpreters').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('consultations').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('consultations')
      .select('id')
      .eq('event_id', id)
      .then(async ({ data: cons }) => {
        if (!cons || cons.length === 0) return { count: 0 };
        return supabase.from('consultation_reports')
          .select('*', { count: 'exact', head: true })
          .in('consultation_id', cons.map(c => c.id))
          .eq('submitted', true);
      }),
    supabase.from('report_templates').select('fields').eq('event_id', id).single(),
  ]);

  const managementItems = [
    {
      title: '타임테이블',
      description: '상담 스케줄 엑셀 업로드 및 관리',
      href: `/admin/events/${id}/timetable`,
      icon: Clock,
      count: slotsRes.count ?? 0,
      countLabel: '타임슬롯',
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: '통역사 배정',
      description: '통역사 계정 엑셀 업로드 및 배정',
      href: `/admin/events/${id}/interpreters`,
      icon: Users,
      count: interpretersRes.count ?? 0,
      countLabel: '명 배정',
      color: 'from-emerald-500 to-emerald-600',
    },
    {
      title: '상담일지 양식',
      description: '상담일지 양식 엑셀 업로드 및 설정',
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
      count: reportsRes.count ?? 0,
      countLabel: '건 제출',
      color: 'from-purple-500 to-purple-600',
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
                    <p className="text-xs text-slate-500 mt-2">
                      {item.count} {item.countLabel}
                    </p>
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
