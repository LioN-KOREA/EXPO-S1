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
}

export function PendingReportsPopup({ pendingCount, eventId, firstPendingConsultationId }: Props) {
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
