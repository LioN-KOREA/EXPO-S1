'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

interface TemplateDownloadButtonProps {
  type: 'users' | 'timetable' | 'interpreters' | 'report-template';
  label?: string;
}

const TYPE_NAMES: Record<string, string> = {
  users: '사용자_일괄등록_양식',
  timetable: '타임테이블_양식',
  interpreters: '통역사_등록_양식',
  'report-template': '상담일지_양식_샘플',
};

export function TemplateDownloadButton({ type, label }: TemplateDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/export/templates?type=${type}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || '다운로드 실패');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${TYPE_NAMES[type] || type}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast.error('다운로드 중 오류'); }
    finally { setLoading(false); }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading} className="text-xs">
      <Download className="w-3.5 h-3.5 mr-1.5" />
      {loading ? '다운로드 중...' : (label || '양식 다운로드')}
    </Button>
  );
}
