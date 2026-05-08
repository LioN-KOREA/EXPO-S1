'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import Link from 'next/link';
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
  const [dataLoading, setDataLoading] = useState(true);
  const [fields, setFields] = useState<TemplateField[]>([]);

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
        <Link href={`/admin/events/${eventId}/registration`}>
          <Button variant="outline" size="sm">등록 탭에서 수정</Button>
        </Link>
      </div>

      {dataLoading && <p className="text-sm text-slate-500">로딩 중...</p>}

      {!dataLoading && !hasData && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">양식이 설정되지 않았습니다</p>
            <p className="text-sm text-slate-500 mt-1">등록 탭에서 양식을 업로드하세요</p>
          </CardContent>
        </Card>
      )}

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
                <div key={field.key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-6 text-center">{i + 1}</span>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-foreground text-sm">{field.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{typeLabels[field.type] || field.type}</Badge>
                    {field.options && (
                      <span className="text-xs text-slate-500">[{field.options.join(', ')}]</span>
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
