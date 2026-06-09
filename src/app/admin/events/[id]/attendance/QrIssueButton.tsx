'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QrCode, Download, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';

interface Props {
  eventId: string;
}

export function QrIssueButton({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>('상담회');

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.from('events').select('name').eq('id', eventId).single().then(({ data }) => {
      if (data?.name) setEventName(data.name);
    });
  }, [open, eventId]);

  async function generate() {
    const payload = `CONTEXT:${eventId}`;
    const url = await QRCode.toDataURL(payload, {
      width: 600,
      margin: 2,
      color: { dark: '#0a0d14', light: '#ffffff' },
    });
    setDataUrl(url);
  }

  function handleOpen() {
    setOpen(true);
    generate();
  }

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${eventName}-${eventId.slice(0, 8)}.png`;
    a.click();
  }

  function handlePrint() {
    if (!dataUrl) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR — ${eventName}</title><style>
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;margin:0;padding:40px;}
      h1{margin:0 0 8px;font-size:28px;}
      .meta{color:#666;margin-bottom:24px;font-size:14px;}
      img{max-width:500px;width:100%;height:auto;}
      .footer{margin-top:24px;font-size:12px;color:#999;}
      @media print { @page { size: A4 portrait; margin: 20mm; } body { padding: 0; } }
    </style></head><body>
      <h1>${eventName}</h1>
      <div class="meta">현장 통역사 출석 QR</div>
      <img src="${dataUrl}" alt="QR" />
      <div class="footer">contEXT · 통역사 앱에서 스캔하여 출석</div>
      <script>window.onload = () => setTimeout(() => window.print(), 200);<\/script>
    </body></html>`);
    w.document.close();
  }

  return (
    <>
      <Button variant="outline" onClick={handleOpen} className="gap-1.5">
        <QrCode className="w-4 h-4" />
        QR 발급
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-rose-500" />
              {eventName} — 출석 QR
            </DialogTitle>
            <DialogDescription>
              현장에 인쇄해서 부착하세요. 통역사 앱 &quot;QR코드로 출석하기&quot; 버튼으로 스캔합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-4 bg-white rounded-xl">
            {dataUrl ? (
              <img src={dataUrl} alt="QR" className="w-64 h-64" />
            ) : (
              <p className="text-sm text-slate-500">생성 중...</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleDownload} disabled={!dataUrl} className="gap-1.5">
              <Download className="w-4 h-4" />
              PNG 다운로드
            </Button>
            <Button onClick={handlePrint} disabled={!dataUrl} className="gap-1.5">
              <Printer className="w-4 h-4" />
              인쇄
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
