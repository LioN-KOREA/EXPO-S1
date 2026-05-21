'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, QrCode, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';

interface Props {
  open: boolean;
  onClose: () => void;
  eventId?: string;
  onSuccess?: (data: { eventId: string; checkedInAt: string }) => void;
}

interface Html5QrcodeInstance {
  start(
    cameraIdOrConfig: { facingMode: string } | string,
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decoded: string) => void,
    onError?: (err: string) => void,
  ): Promise<unknown>;
  stop(): Promise<unknown>;
  clear(): void;
}

// html5-qrcode 의 stop()/clear() 는 상태에 따라 동기 throw 도 가능 — 항상 안전하게 정리
async function safeDispose(scanner: Html5QrcodeInstance | null): Promise<void> {
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {
    // already stopped / transition 중 sync throw — 무시
  }
  try {
    scanner.clear();
  } catch {
    // 무시
  }
}

type Status = 'idle' | 'scanning' | 'processing' | 'done' | 'error';

export function QrScannerModal({ open, onClose, eventId, onSuccess }: Props) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const statusRef = useRef<Status>('idle');
  const onSuccessRef = useRef(onSuccess);
  const eventIdRef = useRef(eventId);
  // 이전 세션 dispose 가 진행 중이면 새 세션 start 전에 await — 같은 DOM id 재사용 충돌 방지
  const pendingDisposeRef = useRef<Promise<void> | null>(null);
  const [status, setStatusState] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { eventIdRef.current = eventId; }, [eventId]);

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setMessage('');
      return;
    }

    // 세션별 abort flag + 로컬 scanner 인스턴스 (closure 캡처)
    let aborted = false;
    let myScanner: Html5QrcodeInstance | null = null;
    // in-flight scanner.start() promise — cleanup 이 chain 에 태워 다음 start 가 await
    let startBarrier: Promise<unknown> | null = null;

    // 모든 dispose 경로를 pendingDisposeRef chain 에 등록 — 다음 start() 가 await 해서 DOM id 충돌 방지
    function registerDispose(s: Html5QrcodeInstance | null): Promise<void> {
      if (!s) return Promise.resolve();
      const prev = pendingDisposeRef.current;
      const barrier = startBarrier;
      // 순서: 이전 pending → in-flight start 완료 → 본 dispose
      const next = (prev ?? Promise.resolve())
        .catch(() => {})
        .then(() => (barrier ?? Promise.resolve()).catch(() => {}))
        .then(() => safeDispose(s));
      pendingDisposeRef.current = next;
      return next;
    }

    async function handleScanned(decoded: string) {
      if (aborted) return;
      // processing/done/error 모두 terminal — 후속 프레임 콜백 차단
      if (statusRef.current !== 'scanning') return;
      setStatus('processing');

      // terminal 도달 시 항상 카메라 정리 — onSuccess 콜백이 throw 해도 보장
      const disposeOnce = (() => {
        let disposed = false;
        return async () => {
          if (disposed) return;
          disposed = true;
          const s = myScanner;
          myScanner = null;
          if (scannerRef.current === s) scannerRef.current = null;
          await registerDispose(s);
        };
      })();

      try {
        let scannedEventId = decoded.trim();
        if (scannedEventId.startsWith('EXCON:')) scannedEventId = scannedEventId.slice(6);
        const uuidMatch = scannedEventId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) scannedEventId = uuidMatch[0];

        const currentEventId = eventIdRef.current;
        if (currentEventId && scannedEventId !== currentEventId) {
          throw new Error(t.interpreter.qrEventMismatch);
        }

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (aborted) return;
        if (!user) throw new Error(t.interpreter.loginRequired);

        const today = new Date().toISOString().slice(0, 10);
        const nowIso = new Date().toISOString();

        const { error } = await supabase
          .from('attendances')
          .upsert({
            event_id: scannedEventId,
            user_id: user.id,
            date: today,
            account_type: 'INTERPRETER',
            status: 'WAITING',
          }, { onConflict: 'event_id,user_id,date', ignoreDuplicates: false });

        if (aborted) return;
        if (error) throw new Error(error.message);

        // 외부 콜백 호출 전에 카메라 정리 (콜백이 throw 해도 leak 없도록)
        await disposeOnce();
        if (aborted) return;

        setStatus('done');
        setMessage(`${t.interpreter.qrAttendTimePrefix}${new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' })}`);
        toast.success(t.interpreter.qrSuccess);
        try {
          onSuccessRef.current?.({ eventId: scannedEventId, checkedInAt: nowIso });
        } catch (cbErr) {
          // 외부 콜백 에러는 콘솔로만 — 출석은 이미 성공
          console.error('[QrScannerModal] onSuccess callback threw', cbErr);
        }
      } catch (err) {
        if (aborted) {
          await disposeOnce();
          return;
        }
        setStatus('error');
        const msg = err instanceof Error ? err.message : t.interpreter.qrProcessFailed;
        setMessage(msg);
        toast.error(msg);
        // error terminal — 카메라 즉시 정리 (다음 프레임 콜백 leak 방지)
        await disposeOnce();
      }
    }

    async function start() {
      try {
        // 1) 보안 컨텍스트 / API 존재 확인 — getUserMedia 실행 전에 명확한 사유 노출
        if (typeof window !== 'undefined') {
          if (!window.isSecureContext) {
            throw new Error(t.interpreter.cameraInsecureContext);
          }
          if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            throw new Error(t.interpreter.cameraApiUnavailable);
          }
        }
        if (aborted) return;

        // 2) 직접 getUserMedia 시도 — 권한 prompt 띄우고 DOMException name 으로 사유 구분
        //    (html5-qrcode 의 추상화는 에러 사유를 가려 사용자에게 무엇이 막혔는지 못 알려줌)
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
          // 즉시 정리 — html5-qrcode 가 자체 stream 다시 획득
          probeStream.getTracks().forEach((track) => { try { track.stop(); } catch { /* ignore */ } });
        } catch (mediaErr) {
          if (aborted) return;
          const name = (mediaErr as DOMException)?.name ?? '';
          const msg = mediaErr instanceof Error ? mediaErr.message : '';
          // NotAllowedError = user denied OR Permissions-Policy block
          // SecurityError = insecure context or policy block (Chrome 옛 버전)
          // NotFoundError = no camera
          // NotReadableError = camera in use by other app
          if (name === 'NotAllowedError' || name === 'SecurityError') {
            // Permissions-Policy 차단인지 사용자 거부인지 메시지로 추론
            const isPolicyBlock = /Permissions[- ]?Policy/i.test(msg) || /disallowed by permissions policy/i.test(msg);
            console.warn('[QrScannerModal] getUserMedia blocked:', { name, msg, isPolicyBlock });
            if (isPolicyBlock) {
              throw new Error(t.interpreter.cameraPolicyBlocked);
            }
            throw new Error(t.interpreter.cameraPermissionDenied);
          }
          if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            throw new Error(t.interpreter.cameraNotFound);
          }
          if (name === 'NotReadableError') {
            throw new Error(t.interpreter.cameraInUse);
          }
          // 알 수 없는 에러 — 원본 메시지 유지 (디버깅 도움)
          console.warn('[QrScannerModal] getUserMedia unknown error:', { name, msg });
          throw new Error(msg || t.interpreter.cameraStartFailed);
        }
        if (aborted) return;

        // 이전 세션 dispose 가 끝날 때까지 대기 (DOM id qr-scanner-region 재사용 충돌 방지)
        const pending = pendingDisposeRef.current;
        if (pending) {
          await pending.catch(() => {});
          // 본인이 await 한 promise 가 여전히 current 일 때만 null 처리 — 다른 사이클이 덮어썼을 수 있음
          if (pendingDisposeRef.current === pending) pendingDisposeRef.current = null;
        }
        if (aborted) return;

        const mod = await import('html5-qrcode').catch(() => {
          throw new Error(t.interpreter.qrChunkLoadFailed);
        });
        if (aborted || !containerRef.current) return;

        const elementId = 'qr-scanner-region';
        containerRef.current.id = elementId;

        const scanner = new mod.Html5Qrcode(elementId) as unknown as Html5QrcodeInstance;
        if (aborted) {
          // 인스턴스 생성 직후 abort 됐으면 즉시 정리
          await registerDispose(scanner);
          return;
        }

        // myScanner 는 start() 시도 전에 세팅 — cleanup 이 in-flight start 도 잡을 수 있도록
        myScanner = scanner;
        scannerRef.current = scanner;
        setStatus('scanning');

        try {
          // startBarrier 에 등록 — cleanup/registerDispose 가 in-flight 완료 후 dispose 하도록
          startBarrier = scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decoded) => {
              void handleScanned(decoded);
            },
            () => {
              // 매 프레임 디코드 실패 — 무시
            },
          );
          await startBarrier;
        } catch (startErr) {
          // start() 자체가 실패 — instance clear + ref 정리
          if (scannerRef.current === scanner) scannerRef.current = null;
          if (myScanner === scanner) myScanner = null;
          await registerDispose(scanner);
          if (!aborted) throw startErr;
          return;
        }

        // start resolve 후에도 abort 됐으면 leak 방지 정리
        if (aborted) {
          if (scannerRef.current === scanner) scannerRef.current = null;
          if (myScanner === scanner) myScanner = null;
          await registerDispose(scanner);
        }
      } catch (err) {
        if (aborted) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : t.interpreter.cameraStartFailed);
      }
    }

    start();

    return () => {
      aborted = true;
      const s = myScanner;
      myScanner = null;
      if (scannerRef.current === s) scannerRef.current = null;
      // registerDispose 가 chain 처리 — s null 이면 기존 pending 보존 (Promise.resolve 반환만)
      void registerDispose(s);
    };
    // status / onSuccess / eventId 는 ref 로 동기화 — deps 에서 제외
    // (deps 에 넣으면 setStatus 마다 useEffect 재실행 → 스캐너 반복 생성/파괴 → Android Chrome renderer 크래시)
  }, [open, setStatus, t, locale]);

  function handleRetry() {
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-rose-500" />
            {t.interpreter.qrAttendTitle}
          </DialogTitle>
          <DialogDescription>
            {t.interpreter.qrInstruction}
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden">
          <div ref={containerRef} className="w-full h-full" />
          {status === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t.interpreter.cameraPreparing}
            </div>
          )}
          {status === 'processing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t.interpreter.attendanceProcessing}
            </div>
          )}
          {status === 'done' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/90 text-white">
              <CheckCircle2 className="w-12 h-12 mb-2" />
              <p className="font-bold">{t.interpreter.attendanceDone}</p>
              <p className="text-xs mt-1">{message}</p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/90 text-white p-4 text-center">
              <XCircle className="w-12 h-12 mb-2" />
              <p className="font-bold">{t.interpreter.failed}</p>
              <p className="text-xs mt-1">{message}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {status === 'error' && (
            <Button variant="outline" onClick={handleRetry} className="gap-1.5">
              <RotateCcw className="w-4 h-4" />
              {t.interpreter.retry}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {status === 'done' ? t.common.close : t.common.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
