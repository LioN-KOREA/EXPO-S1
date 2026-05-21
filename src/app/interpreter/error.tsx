'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InterpreterError({ error, reset }: Props) {
  useEffect(() => {
    // 운영 로그 — 콘솔에 남겨 원격 디버깅 단서
    console.error('[interpreter/error]', error);
  }, [error]);

  const msg = error.message || '';
  const isChunkLoadError =
    error.name === 'ChunkLoadError' ||
    /Loading chunk [^\s]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Unable to preload CSS/i.test(msg) ||
    (/ChunkLoadError/i.test(msg));

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">
          {isChunkLoadError ? '페이지를 다시 불러와 주세요' : '문제가 발생했어요'}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          {isChunkLoadError
            ? '사이트가 업데이트됐거나 일시적인 네트워크 문제일 수 있어요. 새로고침으로 해결될 수 있어요.'
            : '잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 알려 주세요.'}
        </p>
        {error.digest && (
          <p className="text-[10px] text-slate-400 mb-4 font-mono">
            ref: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <Button
            onClick={() => {
              if (isChunkLoadError) {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            {isChunkLoadError ? '새로고침' : '다시 시도'}
          </Button>
        </div>
      </div>
    </div>
  );
}
