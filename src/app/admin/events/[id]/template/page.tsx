'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Upload, FileText } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { TemplateField } from '@/types';

const typeLabels: Record<string, string> = {
  text: '텍스트',
  number: '숫자',
  textarea: '장문',
  select: '선택',
  date: '날짜',
};

export default function TemplatePage() {
  const params = useParams();
  const eventId = params.id as string;
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('report_templates')
      .select('fields')
      .eq('event_id', eventId)
      .single();

    if (data?.fields) {
      setFields(data.fields as TemplateField[]);
    }
    setDataLoading(false);
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(file: File) {
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('event_id', eventId);

    try {
      const res = await fetch('/api/upload/template', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '업로드에 실패했습니다');
        return;
      }

      setFields(data.fields);
      setShowUpload(false);
      toast.success(`양식 업로드 완료: ${data.fields.length}개 필드 추출`);
    } catch {
      toast.error('업로드 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  const hasData = fields.length > 0;

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 상세로
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">상담일지 양식</h2>
          {hasData && (
            <p className="text-slate-500 text-sm mt-1">{fields.length}개 필드 설정됨</p>
          )}
        </div>
        {hasData && (
          <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)}>
            <Upload className="w-4 h-4 mr-1" />
            {showUpload ? '닫기' : '재업로드'}
          </Button>
        )}
      </div>

      {/* 업로드 폼 */}
      {(showUpload || !hasData) && !dataLoading && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg">양식 엑셀 업로드</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">
              상담일지 양식 엑셀을 업로드하면 헤더에서 필드를 추출하고 타입을 자동 추론합니다.
              {hasData && ' 기존 양식은 덮어쓰기됩니다.'}
            </p>
            <ExcelUploader
              onUpload={handleUpload}
              loading={loading}
              description="상담일지 양식 엑셀 파일을 드래그하거나 클릭"
            />
          </CardContent>
        </Card>
      )}

      {/* 로딩 */}
      {dataLoading && (
        <p className="text-sm text-slate-500">로딩 중...</p>
      )}

      {/* 설정된 필드 목록 */}
      {hasData && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <CardTitle className="text-lg">설정된 필드 ({fields.length}개)</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">통역사가 상담일지 작성 시 이 필드들이 폼으로 표시됩니다</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-6 text-center">{i + 1}</span>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-foreground text-sm">{field.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {typeLabels[field.type] || field.type}
                    </Badge>
                    {field.options && (
                      <span className="text-xs text-slate-500">
                        [{field.options.join(', ')}]
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
