'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BuyerError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[buyer/error]', error);
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
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">
          {isChunkLoadError ? 'Please reload the page' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          {isChunkLoadError
            ? 'The site may have been updated, or there is a temporary network issue. A refresh may resolve it.'
            : 'Please try again in a moment. If the problem persists, contact your event organizer.'}
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
            {isChunkLoadError ? 'Refresh' : 'Try again'}
          </Button>
        </div>
      </div>
    </div>
  );
}
