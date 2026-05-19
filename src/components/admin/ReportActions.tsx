'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, RotateCcw, XCircle, MessageSquare, AlertTriangle, Award } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportStatus } from '@/types';

interface ReportActionsProps {
  reportId: string;
  reportStatus: ReportStatus;
  reportVersion: number;
  adminComment?: string | null;
  reviewedAt?: string | null;
}

export function ReportActions({ reportId, reportStatus, reportVersion, adminComment, reviewedAt }: ReportActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState<'revision' | 'reject' | null>(null);
  const [comment, setComment] = useState('');

  async function handleAction(status: ReportStatus, requireComment = false) {
    if (requireComment && !comment.trim()) {
      toast.error('사유를 입력해주세요');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 전이 규칙:
    // - excellent: approved → excellent
    // - under_review: approved/excellent → under_review (승인/우수상담 취소)
    // - 그 외 (approved/revision_requested/rejected): submitted/under_review → 결정
    let allowedFrom: ReportStatus[];
    if (status === 'excellent') {
      allowedFrom = ['approved'];
    } else if (status === 'under_review') {
      allowedFrom = ['approved', 'excellent'];
    } else {
      allowedFrom = ['submitted', 'under_review'];
    }

    const { data: updated, error } = await supabase
      .from('consultation_reports')
      .update({
        report_status: status,
        submitted: status === 'approved' || status === 'excellent',
        admin_comment: requireComment ? comment.trim() : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      })
      .eq('id', reportId)
      .eq('version', reportVersion)
      .in('report_status', allowedFrom)
      .select('id');

    if (error) {
      toast.error('처리에 실패했습니다');
    } else if (!updated || updated.length === 0) {
      toast.error('다른 관리자가 먼저 처리했거나 상태가 변경되었습니다. 새로고침 후 다시 시도하세요');
      router.refresh();
    } else {
      const labels: Record<string, string> = {
        approved: '승인',
        revision_requested: '수정요청',
        rejected: '반려',
        excellent: '우수상담 지정',
        under_review: '승인 취소',
      };
      toast.success(`${labels[status] || status} 처리되었습니다`);
      setActionType(null);
      setComment('');
      router.refresh();
    }
    setLoading(false);
  }

  const canReview = reportStatus === 'submitted' || reportStatus === 'under_review';

  return (
    <div className="space-y-4">
      {/* 상태별 안내 메시지 */}
      {reportStatus === 'draft' && (
        <Card className="border-0 shadow-sm bg-amber-50/50">
          <CardContent className="p-4">
            <p className="text-sm text-amber-700">
              이 일지는 아직 <span className="font-semibold">작성중</span>이며 통역사가 최종 제출하지 않은 상태입니다.
            </p>
          </CardContent>
        </Card>
      )}

      {reportStatus === 'approved' && (
        <Card className="border-0 shadow-sm bg-emerald-50/50">
          <CardContent className="p-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-sm text-emerald-700">
                <span className="font-semibold">승인됨</span>
                {reviewedAt && ` — ${new Date(reviewedAt).toLocaleString('ko-KR')}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAction('excellent')}
                disabled={loading}
                className="gap-1.5 bg-amber-500 hover:bg-amber-600"
              >
                <Award className="w-3.5 h-3.5" />
                {loading ? '처리 중...' : '우수상담으로 지정'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('under_review')}
                disabled={loading}
                className="gap-1.5 text-slate-600 border-slate-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                승인 취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {reportStatus === 'excellent' && (
        <Card className="border-0 shadow-sm bg-amber-50/60">
          <CardContent className="p-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <p className="text-sm text-amber-700">
                <span className="font-semibold">우수상담</span>
                {reviewedAt && ` — ${new Date(reviewedAt).toLocaleString('ko-KR')}`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('under_review')}
              disabled={loading}
              className="gap-1.5 text-slate-600 border-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              승인 취소
            </Button>
          </CardContent>
        </Card>
      )}

      {reportStatus === 'revision_requested' && (
        <Card className="border-0 shadow-sm bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <RotateCcw className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700">수정요청</p>
                {adminComment && (
                  <div className="flex items-start gap-1.5 mt-1">
                    <MessageSquare className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-600">{adminComment}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {reportStatus === 'rejected' && (
        <Card className="border-0 shadow-sm bg-red-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">반려됨</p>
                {adminComment && (
                  <div className="flex items-start gap-1.5 mt-1">
                    <MessageSquare className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-600">{adminComment}</p>
                  </div>
                )}
                {reviewedAt && (
                  <p className="text-xs text-red-400 mt-1">{new Date(reviewedAt).toLocaleString('ko-KR')}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 검토 결과 */}
      {canReview && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-foreground mb-3">검토 결과</p>

            {actionType ? (
              <div className="space-y-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={actionType === 'revision' ? '수정요청 사유를 입력하세요...' : '반려 사유를 입력하세요...'}
                  className="w-full p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-slate-200 bg-background"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant={actionType === 'reject' ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() => handleAction(actionType === 'revision' ? 'revision_requested' : 'rejected', true)}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    {actionType === 'revision' ? <RotateCcw className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {loading ? '처리 중...' : actionType === 'revision' ? '수정요청' : '반려'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setActionType(null); setComment(''); }}
                    disabled={loading}
                  >
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAction('approved')}
                  disabled={loading}
                  className="gap-1.5 bg-emerald-500 hover:bg-emerald-600"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {loading ? '처리 중...' : '승인'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActionType('revision')}
                  disabled={loading}
                  className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  수정요청
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActionType('reject')}
                  disabled={loading}
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  반려
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
