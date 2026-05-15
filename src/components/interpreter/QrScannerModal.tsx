'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, QrCode } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  eventId?: string;
  onSuccess?: (data: { eventId: string; checkedInAt: string }) => void;
}

interface Html5Qrcode {
  start(
    cameraIdOrConfig: { facingMode: string } | string,
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decoded: string) => void,
    onError?: (err: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

export function QrScannerModal({ open, onClose, eventId, onSuccess }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'processing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function start() {
      try {
        // dynamic import (큰 라이브러리, 모달 열릴 때만 로드)
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled || !containerRef.current) return;

        const elementId = 'qr-scanner-region';
        containerRef.current.id = elementId;

        const scanner = new Html5Qrcode(elementId) as unknown as Html5Qrcode;
        scannerRef.current = scanner;
        setStatus('scanning');

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decoded) => {
            await handleScanned(decoded);
          },
          () => {
            // 스캔 실패 무시 (자주 발생)
          },
        );
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : '카메라를 시작할 수 없습니다');
      }
    }

    async function handleScanned(decoded: string) {
      if (status === 'processing' || status === 'done') return;
      setStatus('processing');

      try {
        // QR 형식: "EXCON:<eventId>" 또는 "<eventId>" 또는 URL 끝 eventId
        let scannedEventId = decoded.trim();
        if (scannedEventId.startsWith('EXCON:')) scannedEventId = scannedEventId.slice(6);
        const uuidMatch = scannedEventId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) scannedEventId = uuidMatch[0];

        // eventId 일치 확인 (옵션)
        if (eventId && scannedEventId !== eventId) {
          throw new Error('QR이 이 상담회와 일치하지 않습니다');
        }

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다');

        const today = new Date().toISOString().slice(0, 10);
        const nowIso = new Date().toISOString();

        // attendances upsert (event_id + user_id + date 유니크)
        const { error } = await supabase
          .from('attendances')
          .upsert({
            event_id: scannedEventId,
            user_id: user.id,
            date: today,
            account_type: 'INTERPRETER',
            status: 'WAITING',
          }, { onConflict: 'event_id,user_id,date', ignoreDuplicates: false });

        if (error) throw new Error(error.message);

        // 상태 로그 (옵션, 실패해도 진행)
        setStatus('done');
        setMessage(`출석 시간: ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`);
        toast.success('출석이 확인되었습니다');
        onSuccess?.({ eventId: scannedEventId, checkedInAt: nowIso });

        await scannerRef.current?.stop();
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'QR 처리 실패');
        toast.error(err instanceof Error ? err.message : 'QR 처리 실패');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [open, eventId, onSuccess, status]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-rose-500" />
            QR코드 출석
          </DialogTitle>
          <DialogDescription>
            현장에 비치된 QR코드를 카메라에 비춰주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden">
          <div ref={containerRef} className="w-full h-full" />
          {status === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              카메라 준비 중...
            </div>
          )}
          {status === 'processing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              출석 처리 중...
            </div>
          )}
          {status === 'done' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/90 text-white">
              <CheckCircle2 className="w-12 h-12 mb-2" />
              <p className="font-bold">출석 완료</p>
              <p className="text-xs mt-1">{message}</p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/90 text-white p-4 text-center">
              <XCircle className="w-12 h-12 mb-2" />
              <p className="font-bold">실패</p>
              <p className="text-xs mt-1">{message}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {status === 'done' ? '닫기' : '취소'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
