import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  Clock,
  User,
  FileText,
  CheckCircle2,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export default async function SellerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('linked_seller_id, name')
    .eq('id', user!.id)
    .single();

  if (!profile?.linked_seller_id) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="w-14 h-14 text-foreground/80 mx-auto mb-4" />
        <p className="text-slate-500 font-medium">배정된 상담이 없습니다</p>
        <p className="text-sm text-slate-500 mt-1">상담이 배정되면 여기에 표시됩니다</p>
      </div>
    );
  }

  // 셀러 회사 정보
  const { data: sellerInfo } = await supabase
    .from('sellers')
    .select('company_name, company_name_kr')
    .eq('id', profile.linked_seller_id)
    .single();

  const { data: consultations } = await supabase
    .from('consultations')
    .select(`
      *,
      time_slot:time_slots(*),
      buyer:buyers(company_name, buyer_name, country),
      interpreter:profiles!consultations_interpreter_id_fkey(name),
      event:events(name)
    `)
    .eq('seller_id', profile.linked_seller_id);

  // 날짜+시간순 정렬
  consultations?.sort((a, b) => {
    const dateA = a.time_slot?.date || '';
    const dateB = b.time_slot?.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time_slot?.start_time || '';
    const timeB = b.time_slot?.start_time || '';
    return timeA.localeCompare(timeB);
  });

  // 제출된 상담일지 조회
  const consultationIds = consultations?.map((c) => c.id) ?? [];
  const { data: reports } = consultationIds.length > 0
    ? await supabase
        .from('consultation_reports')
        .select('consultation_id, submitted')
        .in('consultation_id', consultationIds)
    : { data: [] };

  const reportsMap = new Map(reports?.map((r) => [r.consultation_id, r]) ?? []);
  const submittedCount = reports?.filter((r) => r.submitted).length ?? 0;
  const totalCount = consultations?.length ?? 0;

  // 날짜별 그룹핑
  const grouped = new Map<string, typeof consultations>();
  consultations?.forEach((c) => {
    const ts = c.time_slot as Record<string, string> | null;
    const date = ts?.date || '날짜 미정';
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(c);
  });

  const companyDisplay = sellerInfo?.company_name_kr || sellerInfo?.company_name || profile.name;

  return (
    <div>
      {/* 환영 헤더 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">내 상담 현황</h2>
        <p className="text-slate-500 text-sm mt-1">{companyDisplay}</p>
      </div>

      {/* 요약 통계 */}
      {totalCount > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">총 상담</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{submittedCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">일지 완료</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center mx-auto mb-2">
                <CalendarDays className="w-5 h-5 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{grouped.size}</p>
              <p className="text-xs text-slate-500 mt-0.5">상담 일수</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 상담 목록 (날짜별) */}
      {!consultations || consultations.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">배정된 상담이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              {/* 날짜 헤더 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  {date}
                </div>
                <span className="text-xs text-slate-500">{items!.length}건</span>
                <div className="flex-1 h-px bg-card" />
              </div>

              <div className="space-y-2">
                {items!.map((c) => {
                  const ts = c.time_slot as Record<string, string> | null;
                  const buyer = c.buyer as Record<string, string> | null;
                  const interp = c.interpreter as Record<string, string> | null;
                  const event = c.event as Record<string, string> | null;
                  const report = reportsMap.get(c.id);
                  const hasReport = report?.submitted;

                  return (
                    <Card key={c.id} className={`border-0 shadow-sm ${hasReport ? 'hover:shadow-lg transition-shadow' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                <Clock className="w-3 h-3" />
                                {ts?.start_time} - {ts?.end_time}
                              </div>
                              {event && <span className="text-xs text-slate-500 truncate">{event.name}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-500 shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate">{buyer?.company_name}</span>
                              <span className="text-xs text-slate-500 shrink-0">({buyer?.country})</span>
                            </div>
                            {interp && (
                              <p className="text-xs text-slate-500 mt-1 ml-6">통역: {interp.name}</p>
                            )}
                          </div>
                          <div className="ml-3 shrink-0">
                            {hasReport ? (
                              <Badge className="text-xs bg-emerald-100 text-emerald-700 border-0">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                완료
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                {report ? '작성중' : '대기'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
