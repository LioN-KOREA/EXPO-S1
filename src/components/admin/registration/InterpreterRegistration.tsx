'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { TemplateDownloadButton } from '@/components/admin/TemplateDownloadButton';
import { toast } from 'sonner';

export function InterpreterRegistration({ eventId }: { eventId: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'replace' | 'append'>('replace');

  async function handleExcelUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('event_id', eventId);
    formData.append('mode', uploadMode);

    try {
      const res = await fetch('/api/upload/interpreters-excel', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '업로드 실패'); return; }
      toast.success(`${data.created}명 신규 생성, ${data.assigned}명 배정 완료`);
    } catch { toast.error('업로드 오류'); }
    finally { setUploading(false); }
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">통역사 엑셀 업로드</CardTitle>
          <TemplateDownloadButton type="interpreters" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500 mb-4">
          엑셀 파일(이름·이메일·전화번호)로 통역사 계정을 만들고 이 상담회에 배정합니다.
          초기 비밀번호는 전화번호 뒷자리(국가번호·지역번호 제외). 이미 있는 계정은 배정만 됩니다.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setUploadMode('replace')}
            className={`flex-1 p-3 rounded-lg border text-left text-sm transition-all ${
              uploadMode === 'replace'
                ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-300'
                : 'border-border hover:border-slate-300'
            }`}
          >
            <p className="font-medium text-foreground">교체</p>
            <p className="text-xs text-slate-500 mt-0.5">기존 배정 해제 → 엑셀 통역사만 배정</p>
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('append')}
            className={`flex-1 p-3 rounded-lg border text-left text-sm transition-all ${
              uploadMode === 'append'
                ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-300'
                : 'border-border hover:border-slate-300'
            }`}
          >
            <p className="font-medium text-foreground">추가</p>
            <p className="text-xs text-slate-500 mt-0.5">기존 배정 유지 + 엑셀 통역사 추가</p>
          </button>
        </div>

        <ExcelUploader onUpload={handleExcelUpload} loading={uploading} description="통역사 명단 엑셀 업로드" />
      </CardContent>
    </Card>
  );
}
