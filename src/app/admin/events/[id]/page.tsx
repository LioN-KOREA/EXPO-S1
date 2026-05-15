import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Users,
  FileText,
  Download,
  ClipboardList,
  BarChart3,
  SlidersHorizontal,
  ClipboardCheck,
  Activity,
  Info,
  Megaphone,
} from 'lucide-react';
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
  const reportStatusCounts = { approved: 0, excellent: 0, submitted: 0, revision_requested: 0, rejected: 0, draft: 0 };
  reports.forEach((r: Record<string, unknown>) => {
    const rs = (r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') reportStatusCounts.approved++;
    else if (rs === 'excellent') reportStatusCounts.excellent++;
    else if (rs === 'submitted' || rs === 'under_review') reportStatusCounts.submitted++;
    else if (rs === 'revision_requested') reportStatusCounts.revision_requested++;
    else if (rs === 'rejected') reportStatusCounts.rejected++;
    else reportStatusCounts.draft++;
  });
  const totalCons = consultationsRes.count ?? 0;
  const notStarted = totalCons - reports.length;

  // 추가 통계
  const [noticesRes, attendancesRes] = await Promise.all([
    supabase.from('notices').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('attendances').select('*', { count: 'exact', head: true }).eq('event_id', id),
  ]);

  // 이벤트 옵션 활성 토글 개수
  const options = (event.options ?? {}) as Record<string, unknown>;
  const optionToggles = ['prior_match', 'greeting', 'onsite_match', 'ai_interpret', 'video_call'];
  const activeOptionCount = optionToggles.filter((k) => options[k] === true).length;

  type MenuItem = {
    title: string;
    description: string;
    href: string;
    icon: typeof BarChart3;
    count?: number;
    countLabel?: string;
    color: string;
    statusSummary?: typeof reportStatusCounts & { not_started: number };
  };

  const groups: { title: string; items: MenuItem[] }[] = [
    {
      title: '분석',
      items: [
        {
          title: '대시보드',
          description: '상담 통계, 실적 순위, 성과 지표',
          href: `/admin/events/${id}/dashboard`,
          icon: BarChart3,
          color: 'from-indigo-500 to-indigo-600',
        },
      ],
    },
    {
      title: '준비',
      items: [
        {
          title: '데이터 업로드',
          description: '엑셀로 타임테이블·참가자·통역사·양식 일괄 등록',
          href: `/admin/events/${id}/registration`,
          icon: ClipboardList,
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
          title: '옵션',
          description: '사전주선·영접·현장매칭·AI통역·화상상담·인포데스크 대상',
          href: `/admin/events/${id}/settings`,
          icon: SlidersHorizontal,
          count: activeOptionCount,
          countLabel: '/ 5 활성',
          color: 'from-cyan-500 to-cyan-600',
        },
      ],
    },
    {
      title: '운영',
      items: [
        {
          title: '출석표',
          description: '통역사·셀러 출석 상태 + 근태평가',
          href: `/admin/events/${id}/attendance`,
          icon: ClipboardCheck,
          count: attendancesRes.count ?? 0,
          countLabel: '건 기록',
          color: 'from-teal-500 to-teal-600',
        },
        {
          title: '현장운영',
          description: '통역사 기준 실시간 매트릭스 (10초 갱신)',
          href: `/admin/events/${id}/operate`,
          icon: Activity,
          color: 'from-orange-500 to-orange-600',
        },
        {
          title: '인포데스크',
          description: '참가자 검색/조회 (옵션에 따라 대상 결정)',
          href: `/admin/events/${id}/infodesk`,
          icon: Info,
          color: 'from-sky-500 to-sky-600',
        },
        {
          title: '공지사항',
          description: '인앱 공지 발송 + 보낸 공지함',
          href: `/admin/events/${id}/notice`,
          icon: Megaphone,
          count: noticesRes.count ?? 0,
          countLabel: '건 발송',
          color: 'from-fuchsia-500 to-fuchsia-600',
        },
      ],
    },
    {
      title: '기록',
      items: [
        {
          title: '상담일지 조회',
          description: '전체 상담일지 조회 및 엑셀 다운로드',
          href: `/admin/events/${id}/reports`,
          icon: Download,
          color: 'from-purple-500 to-purple-600',
          statusSummary: { ...reportStatusCounts, not_started: notStarted },
        },
      ],
    },
  ];

  return (
    <div>
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

      {/* 카테고리별 메뉴 그리드 (접기/펼치기) */}
      <div className="space-y-4">
        {groups.map((group) => (
          <details
            key={group.title}
            open
            className="group/details border-b border-slate-200 dark:border-slate-800 pb-4"
          >
            <summary className="flex items-center gap-3 cursor-pointer list-none py-2 mb-3 select-none hover:opacity-80 transition-opacity">
              <svg
                className="w-5 h-5 text-slate-500 transition-transform group-open/details:rotate-90"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-xl font-bold text-foreground">{group.title}</h3>
              <span className="text-sm text-slate-400">({group.items.length})</span>
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map((item) => (
                <Link key={item.title} href={item.href}>
                  <Card className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer group h-full">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                          <item.icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                          {item.countLabel && (
                            <p className="text-xs text-slate-500 mt-2">
                              {item.count} {item.countLabel}
                            </p>
                          )}
                          {item.statusSummary && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                              {item.statusSummary.approved > 0 && <span className="text-xs text-emerald-600">승인 {item.statusSummary.approved}</span>}
                              {item.statusSummary.excellent > 0 && <span className="text-xs text-amber-500">우수 {item.statusSummary.excellent}</span>}
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
          </details>
        ))}
      </div>
    </div>
  );
}
