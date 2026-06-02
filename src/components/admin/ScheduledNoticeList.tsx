'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  getScheduledNoticeErrorMessage,
  type ScheduledNoticeErrorCode,
  SCHEDULED_NOTICE_ERROR_CODES,
} from '@/lib/scheduled-notice/errors';
import type {
  ScheduledNoticeRow,
  ScheduledNoticeStatus,
} from '@/lib/scheduled-notice/repository';

const STATUS_LABEL: Record<ScheduledNoticeStatus, string> = {
  scheduled: '대기',
  sent: '발송됨',
  cancelled: '취소됨',
  failed: '실패',
};

const STATUS_CLASS: Record<ScheduledNoticeStatus, string> = {
  scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const KNOWN_CODE_SET = new Set<string>(SCHEDULED_NOTICE_ERROR_CODES);
const POLL_INTERVAL_MS = 30 * 1000;
const PREVIEW_LIMIT = 50;

function pickErrorMessage(raw: string | undefined): string {
  if (raw && KNOWN_CODE_SET.has(raw)) {
    return getScheduledNoticeErrorMessage(raw as ScheduledNoticeErrorCode, 'ko');
  }
  return raw || getScheduledNoticeErrorMessage('unknown', 'ko');
}

function formatKst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function preview(message: string): string {
  const single = message.replace(/\s+/g, ' ').trim();
  return single.length > PREVIEW_LIMIT ? `${single.slice(0, PREVIEW_LIMIT)}…` : single;
}

export interface ScheduledNoticeListProps {
  eventId: string;
  /** 외부에서 강제 새로고침 트리거 (값 변경 시 재fetch) */
  refreshKey?: number;
  onEdit: (row: ScheduledNoticeRow) => void;
  /** 취소 액션 완료 후 호출 */
  onCancelled?: () => void;
}

export function ScheduledNoticeList({
  eventId,
  refreshKey = 0,
  onEdit,
  onCancelled,
}: ScheduledNoticeListProps) {
  const [rows, setRows] = useState<ScheduledNoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showReasonId, setShowReasonId] = useState<string | null>(null);
  // 동시 다발 load() 호출 시 stale 응답이 최신 결과를 덮어쓰지 않도록 시퀀스 토큰.
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const mySeq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/scheduled-notices?event_id=${encodeURIComponent(eventId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json().catch(() => ({}));
      if (mySeq !== seqRef.current) return; // 더 최신 fetch 가 시작됨 → 결과 폐기
      if (!res.ok) {
        toast.error(pickErrorMessage(typeof json.error === 'string' ? json.error : undefined));
        return;
      }
      const items = Array.isArray(json.items) ? (json.items as ScheduledNoticeRow[]) : [];
      const sorted = [...items].sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
      setRows(sorted);
    } catch (err) {
      if (mySeq !== seqRef.current) return;
      toast.error(err instanceof Error ? err.message : pickErrorMessage(undefined));
    } finally {
      if (mySeq === seqRef.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    // 외부 시스템(서버) 으로부터 fetch 후 setState — 데이터 동기화 effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    // 백그라운드 탭에서는 폴링 중지 — 비용/배터리 절감.
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    };
    const t = setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) void load();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(t);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [load]);

  async function cancelRow(row: ScheduledNoticeRow) {
    if (cancellingId) return;
    if (!confirm('이 예약을 취소하시겠습니까?')) return;
    setCancellingId(row.id);
    try {
      const res = await fetch(`/api/scheduled-notices/${row.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(pickErrorMessage(typeof json.error === 'string' ? json.error : undefined));
        return;
      }
      toast.success('예약이 취소되었습니다');
      onCancelled?.();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : pickErrorMessage(undefined));
    } finally {
      setCancellingId(null);
    }
  }

  if (loading && rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">불러오는 중...</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        예약된 메시지가 없습니다.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="scheduled-notice-list">
      {rows.map((row) => {
        const editable = row.status === 'scheduled';
        const showReason = row.status === 'failed' && showReasonId === row.id;
        return (
          <li
            key={row.id}
            className="rounded-md border bg-card px-3 py-2.5 text-sm"
            data-status={row.status}
            data-testid={`scheduled-row-${row.id}`}
          >
            <div className="flex items-start gap-2 flex-wrap">
              <Badge variant="outline" className={STATUS_CLASS[row.status]}>
                {STATUS_LABEL[row.status]}
              </Badge>
              <span className="text-slate-700 dark:text-slate-200 font-medium">
                {formatKst(row.scheduled_at)}
              </span>
              <span className="text-xs text-slate-500">
                대상자 {row.recipient_user_ids.length}명
              </span>

              <div className="ml-auto flex gap-1">
                {editable && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(row)}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void cancelRow(row)}
                      disabled={cancellingId === row.id}
                    >
                      {cancellingId === row.id ? '취소 중...' : '취소'}
                    </Button>
                  </>
                )}
                {row.status === 'failed' && row.failed_reason && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowReasonId(showReason ? null : row.id)}
                  >
                    {showReason ? '사유 닫기' : '실패 사유'}
                  </Button>
                )}
              </div>
            </div>

            <p className="mt-1.5 text-slate-700 dark:text-slate-300 break-words">
              {preview(row.message)}
            </p>

            {showReason && (
              <p
                className="mt-2 rounded bg-red-50 dark:bg-red-900/20 px-2 py-1 text-xs text-red-800 dark:text-red-200"
                data-testid={`failed-reason-${row.id}`}
              >
                {row.failed_reason}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
