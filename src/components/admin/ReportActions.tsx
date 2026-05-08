'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, RotateCcw, MessageSquare, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportStatus } from '@/types';

interface ReportActionsProps {
  reportId: string;
  reportStatus: ReportStatus;
  adminComment?: string | null;
  reviewedAt?: string | null;
}

export function ReportActions({ reportId, reportStatus, adminComment, reviewedAt }: ReportActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [comment, setComment] = useState('');

  async function handleApprove() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('consultation_reports')
      .update({
        report_status: 'approved',
        submitted: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      })
      .eq('id', reportId)
      .in('report_status', ['submitted', 'under_review']);

    if (error) {
      toast.error('승인에 실패했습니다');
    } else {
      toast.success('상담일지를 승인했습니다');
      router.refresh();
    }
    setLoading(false);
  }

  async function handleRequestRevision() {
    if (!comment.trim()) {
      toast.error('수정요청 사유를 입력해주세요');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('consultation_reports')
      .update({
        report_status: 'revision_requested',
        submitted: false,
        admin_comment: comment.trim(),
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      })
      .eq('id', reportId)
      .in('report_status', ['submitted', 'under_review']);

    if (error) {
      toast.error('수정요청에 실패했습니다');
    } else {
      toast.success('수정요청을 보냈습니다');
      setShowCommentForm(false);
      setComment('');
      router.refresh();
    }
    setLoading(false);
  }

  // 승인/반려 버튼: submitted 상태에서만 표시
  const canReview = reportStatus === 'submitted' || reportStatus === 'under_review';

  return (
    <div className="space-y-4">
      {/* 현재 상태에 따른 안내 메시지 */}
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
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-sm text-emerald-700">
              <span className="font-semibold">승인됨</span>
              {reviewedAt && ` — ${new Date(reviewedAt).toLocaleString('ko-KR')}`}
            </p>
          </CardContent>
        </Card>
      )}

      {reportStatus === 'revision_requested' && (
        <Card className="border-0 shadow-sm bg-red-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">수정요청</p>
                {adminComment && (
                  <div className="flex items-start gap-1.5 mt-1">
                    <MessageSquare className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-600">{adminComment}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 승인/반려 액션 버튼 */}
      {canReview && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-foreground mb-3">검토 액션</p>

            {showCommentForm ? (
              <div className="space-y-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="수정요청 사유를 입력하세요..."
                  className="w-full p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-red-200 bg-background"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRequestRevision}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {loading ? '처리 중...' : '수정요청 보내기'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowCommentForm(false); setComment(''); }}
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
                  onClick={handleApprove}
                  disabled={loading}
                  className="gap-1.5 bg-emerald-500 hover:bg-emerald-600"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {loading ? '처리 중...' : '승인'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCommentForm(true)}
                  disabled={loading}
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  수정요청
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
