'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  getScheduledNoticeErrorMessage,
  type ScheduledNoticeErrorCode,
  SCHEDULED_NOTICE_ERROR_CODES,
} from '@/lib/scheduled-notice/errors';
import type { ScheduledNoticeRow } from '@/lib/scheduled-notice/repository';

const MESSAGE_MAX = 4000;
const KNOWN_CODE_SET = new Set<string>(SCHEDULED_NOTICE_ERROR_CODES);

export interface ScheduledNoticeDialogProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  recipientUserIds: string[];
  mode: 'create' | 'edit';
  initial?: ScheduledNoticeRow | null;
  onSubmitted?: () => void;
}

/** ISO timestamptz → datetime-local 입력값 (브라우저 로컬 TZ 표현) */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickErrorMessage(raw: string | undefined): string {
  if (raw && KNOWN_CODE_SET.has(raw)) {
    return getScheduledNoticeErrorMessage(raw as ScheduledNoticeErrorCode, 'ko');
  }
  return raw || getScheduledNoticeErrorMessage('unknown', 'ko');
}

export function ScheduledNoticeDialog({
  open,
  onClose,
  eventId,
  recipientUserIds,
  mode,
  initial,
  onSubmitted,
}: ScheduledNoticeDialogProps) {
  // 다이얼로그를 open 토글마다 unmount/remount 하므로 (호출자 측에서 `open && <Dialog />`)
  // 초기값으로 모드별 prefill 을 처리 — useEffect 안의 setState 회피.
  const [message, setMessage] = useState(() =>
    mode === 'edit' && initial ? initial.message : ''
  );
  const [sendNow, setSendNow] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState(() => {
    if (mode === 'edit' && initial) return toLocalInputValue(initial.scheduled_at);
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return toLocalInputValue(d.toISOString());
  });
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function validate(): { ok: true; scheduledAt: string } | { ok: false; reason: string } {
    const trimmed = message.trim();
    if (!trimmed) return { ok: false, reason: getScheduledNoticeErrorMessage('message_empty', 'ko') };
    if (message.length > MESSAGE_MAX) {
      return { ok: false, reason: getScheduledNoticeErrorMessage('message_too_long', 'ko') };
    }
    if (recipientUserIds.length === 0) {
      return { ok: false, reason: getScheduledNoticeErrorMessage('recipient_empty', 'ko') };
    }
    let scheduledAt: string;
    if (sendNow) {
      scheduledAt = new Date(Date.now() + 5 * 1000).toISOString();
    } else {
      if (!scheduledLocal) {
        return { ok: false, reason: getScheduledNoticeErrorMessage('past_schedule', 'ko') };
      }
      const d = new Date(scheduledLocal);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, reason: getScheduledNoticeErrorMessage('past_schedule', 'ko') };
      }
      if (d.getTime() < Date.now() - 5 * 1000) {
        return { ok: false, reason: getScheduledNoticeErrorMessage('past_schedule', 'ko') };
      }
      scheduledAt = d.toISOString();
    }
    return { ok: true, scheduledAt };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const v = validate();
    if (!v.ok) {
      toast.error(v.reason);
      return;
    }
    setSaving(true);
    try {
      const url =
        mode === 'edit' && initial
          ? `/api/scheduled-notices/${initial.id}`
          : '/api/scheduled-notices';
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const body =
        mode === 'edit'
          ? {
              message: message.trim(),
              scheduled_at: v.scheduledAt,
              recipient_user_ids: recipientUserIds,
            }
          : {
              event_id: eventId,
              message: message.trim(),
              scheduled_at: v.scheduledAt,
              recipient_user_ids: recipientUserIds,
            };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(pickErrorMessage(typeof json.error === 'string' ? json.error : undefined));
        return;
      }
      toast.success(mode === 'edit' ? '예약이 수정되었습니다' : '예약이 등록되었습니다');
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : pickErrorMessage(undefined));
    } finally {
      setSaving(false);
    }
  }

  async function cancelSchedule() {
    if (!initial || cancelling) return;
    if (!confirm('이 예약을 취소하시겠습니까?')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/scheduled-notices/${initial.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(pickErrorMessage(typeof json.error === 'string' ? json.error : undefined));
        return;
      }
      toast.success('예약이 취소되었습니다');
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : pickErrorMessage(undefined));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? '메시지 전송 예약 수정' : '메시지 전송 예약'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scheduled-message">메시지</Label>
            <Textarea
              id="scheduled-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={MESSAGE_MAX}
              placeholder="통역사에게 보낼 공지 메시지를 입력하세요"
            />
            <p className="text-xs text-slate-500 text-right">
              {message.length} / {MESSAGE_MAX}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="scheduled-send-now"
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="scheduled-send-now" className="text-sm cursor-pointer">
              지금 발송 (예약 시각 무시)
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduled-at">발송 시각 (현지)</Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              disabled={sendNow}
            />
            <p className="text-xs text-slate-500">
              현재 행사 종료일 이내 시각만 등록할 수 있습니다.
            </p>
          </div>

          <div className="rounded-md border bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm">
            <span className="font-medium">대상자</span>{' '}
            <span className="text-slate-700 dark:text-slate-200">{recipientUserIds.length}명</span>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            {mode === 'edit' && initial && (
              <Button
                type="button"
                variant="outline"
                onClick={cancelSchedule}
                disabled={cancelling || saving}
                className="sm:mr-auto"
              >
                {cancelling ? '취소 중...' : '예약 취소'}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || cancelling}>
              닫기
            </Button>
            <Button type="submit" disabled={saving || cancelling}>
              {saving ? '저장 중...' : mode === 'edit' ? '수정' : '예약'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
