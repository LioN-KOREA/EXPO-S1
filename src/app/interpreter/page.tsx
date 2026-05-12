import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  Clock,
  ChevronRight,
  FileText,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

export default async function InterpreterDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user!.id)
    .single();

  // 내 상담회 목록 조회
  const { data: myEvents } = await supabase
    .from('event_interpreters')
    .select(`
      event_id,
      events (
        id,
        name,
        description,
        start_date,
        end_date,
        status
      )
    `)
    .eq('interpreter_id', user!.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (myEvents?.map((ei: any) => ei.events).filter(Boolean) ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    start_date: string;
    end_date: string;
    status: string;
  }>;

  // 상담회별 상담/일지 통계 조회
  const eventStats = await Promise.all(
    events.map(async (event) => {
      const { data: consultations } = await supabase
        .from('consultations')
        .select('id')
        .eq('event_id', event.id)
        .eq('interpreter_id', user!.id);

      const ids = consultations?.map((c) => c.id) ?? [];
      let submitted = 0;
      let inProgress = 0;

      if (ids.length > 0) {
        const { data: reports } = await supabase
          .from('consultation_reports')
          .select('consultation_id, submitted')
          .in('consultation_id', ids);

        reports?.forEach((r) => {
          if (r.submitted) submitted++;
          else inProgress++;
        });
      }

      return {
        ...event,
        total: ids.length,
        submitted,
        inProgress,
        notStarted: ids.length - submitted - inProgress,
        rate: ids.length > 0 ? Math.round((submitted / ids.length) * 100) : 0,
      };
    })
  );

  // 전체 통계
  const totalConsultations = eventStats.reduce((sum, e) => sum + e.total, 0);
  const totalSubmitted = eventStats.reduce((sum, e) => sum + e.submitted, 0);
  const totalInProgress = eventStats.reduce((sum, e) => sum + e.inProgress, 0);
  const totalNotStarted = totalConsultations - totalSubmitted - totalInProgress;

  return (
    <div>
      {/* 환영 헤더 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">
          안녕하세요, {profile?.name || '통역사'}님
        </h2>
        <p className="text-slate-500 text-sm mt-1">배정된 상담회와 일지 작성 현황입니다</p>
      </div>

      {/* 요약 통계 카드 */}
      {totalConsultations > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{totalSubmitted}</p>
              <p className="text-xs text-slate-500 mt-0.5">제출 완료</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center mx-auto mb-2">
                <FileText className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{totalInProgress}</p>
              <p className="text-xs text-slate-500 mt-0.5">작성 중</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-5 h-5 text-slate-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{totalNotStarted}</p>
              <p className="text-xs text-slate-500 mt-0.5">미작성</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 미제출 알림 */}
      {totalNotStarted > 0 && (
        <Card className="border-0 shadow-sm mb-6 bg-amber-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">
                아직 작성하지 않은 상담일지가 <span className="font-semibold">{totalNotStarted}건</span> 있습니다.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 상담회 목록 */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" />
          내 상담회 ({events.length})
        </h3>
      </div>

      {events.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">배정된 상담회가 없습니다</p>
            <p className="text-sm text-slate-500 mt-1">관리자가 상담회에 배정하면 여기에 표시됩니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {eventStats.map((event) => (
            <Link key={event.id} href={`/interpreter/events/${event.id}`}>
              <Card className="border-0 shadow-sm hover:shadow-lg transition-all cursor-pointer group mb-3">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground group-hover:text-blue-600 transition-colors truncate">
                        {event.name}
                      </h3>
                      <Badge
                        variant={event.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs shrink-0"
                      >
                        {event.status === 'active' ? '진행중' : '종료'}
                      </Badge>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-slate-500 transition-colors shrink-0" />
                  </div>

                  {event.description && (
                    <p className="text-sm text-slate-500 mb-3">{event.description}</p>
                  )}

                  {/* 진행률 바 */}
                  {event.total > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">일지 진행률</span>
                        <span className={`text-xs font-semibold ${
                          event.rate === 100 ? 'text-emerald-600' : event.rate >= 50 ? 'text-blue-600' : 'text-slate-500'
                        }`}>
                          {event.submitted}/{event.total} ({event.rate}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-card rounded-full overflow-hidden flex">
                        {event.submitted > 0 && (
                          <div
                            className="h-full bg-emerald-400 rounded-l-full"
                            style={{ width: `${(event.submitted / event.total) * 100}%` }}
                          />
                        )}
                        {event.inProgress > 0 && (
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${(event.inProgress / event.total) * 100}%` }}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        {event.submitted > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            제출 {event.submitted}
                          </span>
                        )}
                        {event.inProgress > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-600">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            작성중 {event.inProgress}
                          </span>
                        )}
                        {event.notStarted > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="w-2 h-2 rounded-full bg-slate-200" />
                            미작성 {event.notStarted}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {event.start_date} ~ {event.end_date}
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      상담 {event.total}건
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
