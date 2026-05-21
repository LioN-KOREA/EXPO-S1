'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { tmpl } from '@/lib/i18n/dictionaries';

interface Props {
  pendingCount: number;
  eventId: string;
  firstPendingConsultationId?: string;
  notStartedCount?: number;
  inProgressCount?: number;
  revisionCount?: number;
  rejectedCount?: number;
}

export function PendingReportsPopup({
  pendingCount,
  eventId,
  firstPendingConsultationId,
  notStartedCount = 0,
  inProgressCount = 0,
  revisionCount = 0,
  rejectedCount = 0,
}: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pendingCount > 0) {
      setOpen(true);
    }
  }, [pendingCount]);

  if (pendingCount <= 0) return null;

  function close() {
    setOpen(false);
  }

  function goToFirst() {
    setOpen(false);
    if (firstPendingConsultationId) {
      router.push(`/interpreter/events/${eventId}/consultation/${firstPendingConsultationId}`);
    }
  }

  const breakdown: Array<{ count: number; label: string; className: string }> = [
    { count: notStartedCount, label: t.interpreter.pendingPopupBreakdownNotStarted, className: 'text-slate-600 bg-slate-50 border-slate-200' },
    { count: inProgressCount, label: t.interpreter.pendingPopupBreakdownInProgress, className: 'text-amber-700 bg-amber-50 border-amber-200' },
    { count: revisionCount, label: t.interpreter.pendingPopupBreakdownRevision, className: 'text-red-700 bg-red-50 border-red-200' },
    { count: rejectedCount, label: t.interpreter.pendingPopupBreakdownRejected, className: 'text-red-800 bg-red-100 border-red-300' },
  ].filter((item) => item.count > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            {t.interpreter.pendingPopupTitle}
          </DialogTitle>
          <DialogDescription>
            {tmpl(t.interpreter.pendingPopupDesc, { count: pendingCount })}
          </DialogDescription>
        </DialogHeader>
        {breakdown.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {breakdown.map((item) => (
              <li
                key={item.label}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${item.className}`}
              >
                {tmpl(item.label, { count: item.count })}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>
            {t.interpreter.pendingPopupLater}
          </Button>
          {firstPendingConsultationId && (
            <Button onClick={goToFirst} className="bg-rose-500 hover:bg-rose-600">
              {t.interpreter.pendingPopupGo}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
