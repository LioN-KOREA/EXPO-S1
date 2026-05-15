'use client';

import { Button } from '@/components/ui/button';
import { QrCode } from 'lucide-react';
import { toast } from 'sonner';

export function QrAttendButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => toast.info('QR코드 출석 준비중 (Phase E-2)')}
      className="gap-2 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
    >
      <QrCode className="w-4 h-4" />
      QR코드로 출석하기
    </Button>
  );
}
