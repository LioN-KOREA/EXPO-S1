'use client';

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[global-error]', error);
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
    /ChunkLoadError/i.test(msg);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", sans-serif',
          background: '#0f172a',
          color: '#f8fafc',
        }}
      >
        <div
          role="alert"
          aria-live="assertive"
          style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 28,
            }}
            aria-hidden
          >
            ⚠
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            {isChunkLoadError
              ? '페이지를 다시 불러와 주세요'
              : '예기치 못한 오류가 발생했습니다'}
          </h1>
          <p style={{ fontSize: 14, color: '#cbd5e1', marginBottom: 16, lineHeight: 1.6 }}>
            {isChunkLoadError
              ? '사이트가 업데이트됐거나 일시적인 네트워크 문제일 수 있습니다. 새로고침으로 해결될 수 있습니다.'
              : '잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침 또는 로그인 화면으로 이동해 주세요.'}
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 10,
                color: '#94a3b8',
                marginBottom: 16,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                if (isChunkLoadError) {
                  window.location.reload();
                } else {
                  reset();
                }
              }}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isChunkLoadError ? '새로고침' : '다시 시도'}
            </button>
            {!isChunkLoadError && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(148, 163, 184, 0.4)',
                  background: 'transparent',
                  color: '#f8fafc',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                새로고침
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                window.location.href = '/login';
              }}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'transparent',
                color: '#f8fafc',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              로그인으로
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
