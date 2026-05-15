'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, Building2, Play, CheckCircle2, FileText, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { ReportStatus } from '@/types';

interface ScheduleCardProps {
  consultationId: string;
  eventId: string;
  status: string;
  startTime: string;
  endTime: string;
  boothNumber: string;
  buyerName: string;
  buyerCountry: string;
  sellerName: string;
  reportStatus: ReportStatus | null;
}

export function ConsultationScheduleCard({
  consultationId,
  eventId,
  status,
  startTime,
  endTime,
  boothNumber,
  buyerName,
  buyerCountry,
  sellerName,
  reportStatus,
}: ScheduleCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';
  const isApproved = reportStatus === 'approved' || reportStatus === 'excellent';

  async function toggleStatus(next: 'in_progress' | 'completed') {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('consultations')
      .update({ status: next })
      .eq('id', consultationId);
    if (error) {
      toast.error('상태 변경 실패: ' + error.message);
    } else {
      toast.success(next === 'in_progress' ? '상담을 시작했어요' : '상담이 끝났어요');
      router.refresh();
    }
    setLoading(false);
  }

  const statusBadge = (() => {
    if (reportStatus === 'excellent') {
      return <Badge className="bg-amber-500 gap-1"><Award className="w-3 h-3" />우수상담</Badge>;
    }
    if (reportStatus === 'approved') {
      return <Badge className="bg-emerald-500 gap-1"><CheckCircle2 className="w-3 h-3" />상담일지 승인</Badge>;
    }
    if (isCompleted) return <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">상담완료</Badge>;
    if (isInProgress) return <Badge className="bg-blue-500">상담중</Badge>;
    return <Badge variant="outline" className="border-slate-200">상담전</Badge>;
  })();

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        {/* 상태 + 시간 */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          {statusBadge}
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Clock className="w-3.5 h-3.5 text-rose-500" />
              {startTime} ~ {endTime}
            </span>
            {boothNumber && (
              <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {boothNumber}
              </span>
            )}
          </div>
        </div>

        {/* 바이어 */}
        <div className="flex items-center gap-2 mb-1">
          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{buyerName}</span>
          {buyerCountry && <span className="text-xs text-slate-500 shrink-0">({buyerCountry})</span>}
        </div>

        {/* 셀러 */}
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-sm text-slate-500 truncate">{sellerName}</span>
        </div>

        {/* 액션 */}
        <div className="flex gap-2 flex-wrap">
          {!isCompleted && !isApproved && (
            <>
              {!isInProgress ? (
                <Button
                  size="sm"
                  onClick={() => toggleStatus('in_progress')}
                  disabled={loading}
                  className="flex-1 min-w-[100px] bg-blue-500 hover:bg-blue-600 gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  상담을 시작해요
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => toggleStatus('completed')}
                  disabled={loading}
                  className="flex-1 min-w-[100px] bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  상담이 끝났어요
                </Button>
              )}
            </>
          )}
          <Link
            href={`/interpreter/events/${eventId}/consultation/${consultationId}`}
            className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-1 h-7 px-2.5 text-[0.8rem] font-medium rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            {isApproved ? '상담일지 보기' : '상담일지 작성하기'}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
