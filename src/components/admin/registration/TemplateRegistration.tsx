'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { TemplateDownloadButton } from '@/components/admin/TemplateDownloadButton';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { TemplateField } from '@/types';

export function TemplateRegistration({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<TemplateField[]>([]);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('report_templates')
      .select('fields')
      .eq('event_id', eventId)
      .single();
    if (data?.fields) setFields(data.fields as TemplateField[]);
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(file: File) {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('event_id', eventId);
    try {
      const res = await fetch('/api/upload/template', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '업로드 실패'); return; }
      setFields(data.fields);
      toast.success(`양식 업로드 완료: ${data.fields.length}개 필드 추출`);
    } catch { toast.error('업로드 중 오류'); }
    finally { setLoading(false); }
  }

  const typeLabels: Record<string, string> = { text: '텍스트', number: '숫자', textarea: '장문', select: '선택', date: '날짜' };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">상담일지 양식 업로드</CardTitle>
            <TemplateDownloadButton type="report-template" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">엑셀 양식에서 필드명과 타입을 추출합니다. 기존 양식이 있으면 덮어쓰기됩니다.</p>
          <ExcelUploader onUpload={handleUpload} loading={loading} description="상담일지 양식 엑셀 업로드" />
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              현재 양식 ({fields.length}개 필드)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <span className="text-xs text-slate-500 w-6 text-right">{i + 1}</span>
                  <span className="text-sm font-medium text-foreground flex-1">{field.label}</span>
                  <Badge variant="secondary" className="text-xs">{typeLabels[field.type] || field.type}</Badge>
                  {field.required && <Badge className="text-[10px] bg-red-100 text-red-700 border-0">필수</Badge>}
                  {field.options && field.options.length > 0 && (
                    <span className="text-[10px] text-slate-500">{field.options.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
