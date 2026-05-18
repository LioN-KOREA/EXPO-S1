import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  Users,
  FileText,
  TrendingUp,
  ChevronRight,
  Clock,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import type { ReportStatus } from '@/types';
import { batchIn } from '@/lib/supabase/batch-query';

export default async function AdminDashboard() {
  const supabase = await createClient();

  // 기본 통계
  const [eventsRes, interpretersRes, consultationsRes] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'interpreter'),
    supabase.from('consultations').select('*', { count: 'exact', head: true }),
  ]);

  // 전체 리포트 상태 집계
  const { data: allReports } = await supabase.from('consultation_reports').select('report_status, submitted');
  let totalApproved = 0;
  let totalSubmitted = 0;
  allReports?.forEach(r => {
    const rs = (r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus;
    if (rs === 'approved') totalApproved++;
    else if (rs === 'submitted' || rs === 'under_review') totalSubmitted++;
  });

  const totalConsultations = consultationsRes.count ?? 0;

  const stats = [
    { label: '진행중 상담회', value: eventsRes.count ?? 0, icon: CalendarDays, color: 'from-blue-500 to-blue-600' },
    { label: '등록 통역사', value: interpretersRes.count ?? 0, icon: Users, color: 'from-emerald-500 to-emerald-600' },
    { label: '총 상담 건수', value: totalConsultations, icon: TrendingUp, color: 'from-amber-500 to-amber-600' },
    { label: '승인된 일지', value: totalApproved, icon: FileText, color: 'from-purple-500 to-purple-600' },
  ];

  // 모든 상담회 통계 (비교용)
  const { data: events } = await supabase
    .from('events')
    .select('id, name, start_date, end_date, status')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const eventStats = await Promise.all(
    (events ?? []).map(async (event) => {
      const { count: consultationCount } = await supabase
        .from('consultations').select('*', { count: 'exact', head: true }).eq('event_id', event.id);

      const { data: consultationIds } = await supabase
        .from('consultations').select('id').eq('event_id', event.id);

      let approvedCount = 0;
      let submittedCount = 0;
      let draftCount = 0;

      if (consultationIds && consultationIds.length > 0) {
        const reports = await batchIn(
          (ids) => supabase.from('consultation_reports').select('report_status, submitted').in('consultation_id', ids),
          consultationIds.map(c => c.id),
        );

        reports.forEach((r: Record<string, unknown>) => {
          const rs = (r.report_status ?? (r.submitted ? 'submitted' : 'draft')) as ReportStatus;
          if (rs === 'approved') approvedCount++;
          else if (rs === 'submitted' || rs === 'under_review') submittedCount++;
          else draftCount++;
        });
      }

      const total = consultationCount ?? 0;
      const notStartedCount = total - approvedCount - submittedCount - draftCount;
      const rate = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

      return { ...event, consultationCount: total, approvedCount, submittedCount, draftCount, notStartedCount, rate };
    })
  );

  // 최근 제출된 상담일지 (최근 5건)
  const { data: recentReports } = await supabase
    .from('consultation_reports')
    .select(`
      id,
      submitted_at,
      report_status,
      consultation:consultations(
        buyer:buyers(company_name),
        seller:sellers(company_name, company_name_kr),
        event:events(name, id)
      ),
      interpreter:profiles!consultation_reports_interpreter_id_fkey(name)
    `)
    .eq('submitted', true)
    .order('submitted_at', { ascending: false })
    .limit(5);

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">대시보드</h2>
        <p className="text-slate-500 mt-1 text-sm">수출상담회 운영 현황을 한눈에 확인하세요</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-slate-500 truncate">{stat.label}</p>
                  <p className="text-xl sm:text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                </div>
                <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shrink-0`}>
                  <stat.icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 상담회별 진행 현황 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">상담회별 진행 현황</CardTitle>
              <Link href="/admin/events" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                전체 보기<ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {eventStats.length === 0 ? (
              <div className="text-center py-8">
                <CalendarDays className="w-10 h-10 text-foreground/80 mx-auto mb-3" />
                <p className="text-sm text-slate-500">등록된 상담회가 없습니다</p>
                <Link href="/admin/events/new" className="text-xs text-blue-600 hover:underline mt-1 inline-block">상담회 생성하기</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {eventStats.slice(0, 5).map((event) => (
                  <Link key={event.id} href={`/admin/events/${event.id}`} className="block group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate group-hover:text-blue-600 transition-colors">{event.name}</span>
                        <Badge variant={event.status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                          {event.status === 'active' ? '진행' : '종료'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-slate-500">{event.approvedCount}/{event.consultationCount}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-slate-500" />
                      </div>
                    </div>
                    <div className="w-full h-2 bg-card rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          event.rate >= 80 ? 'bg-emerald-400' : event.rate >= 50 ? 'bg-amber-400' : event.rate > 0 ? 'bg-blue-400' : 'bg-slate-200'
                        }`}
                        style={{ width: `${Math.max(event.rate, event.consultationCount > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{event.start_date} ~ {event.end_date}
                      </span>
                      <span className={`text-[11px] font-medium ${event.rate >= 80 ? 'text-emerald-500' : event.rate >= 50 ? 'text-amber-500' : 'text-slate-500'}`}>
                        {event.rate}%
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 최근 제출된 일지 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">최근 제출된 일지</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentReports || recentReports.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-foreground/80 mx-auto mb-3" />
                <p className="text-sm text-slate-500">아직 제출된 일지가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentReports.map((r) => {
                  const consultation = r.consultation as unknown as Record<string, unknown> | null;
                  const buyer = consultation?.buyer as Record<string, string> | null;
                  const seller = consultation?.seller as Record<string, string> | null;
                  const event = consultation?.event as Record<string, string> | null;
                  const interpreter = r.interpreter as unknown as Record<string, string> | null;
                  const submittedAt = r.submitted_at ? formatRelativeTime(r.submitted_at) : '';

                  return (
                    <Link key={r.id} href={event?.id ? `/admin/events/${event.id}/reports` : '#'} className="block group">
                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors -mx-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground truncate">{buyer?.company_name}</span>
                            <span className="text-xs text-muted-foreground">x</span>
                            <span className="text-sm text-slate-500 truncate">{seller?.company_name_kr || seller?.company_name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">통역: {interpreter?.name}</span>
                            {event?.name && <><span className="text-xs text-muted-foreground">|</span><span className="text-xs text-slate-500 truncate">{event.name}</span></>}
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0 mt-0.5">{submittedAt}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
