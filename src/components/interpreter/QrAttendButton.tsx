'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { QrCode } from 'lucide-react';
import { QrScannerModal } from './QrScannerModal';
import { useI18n } from '@/lib/i18n/context';

interface Props {
  eventId?: string;
}

export function QrAttendButton({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
      >
        <QrCode className="w-4 h-4" />
        {t.interpreter.qrAttend}
      </Button>
      <QrScannerModal open={open} onClose={() => setOpen(false)} eventId={eventId} />
    </>
  );
}
