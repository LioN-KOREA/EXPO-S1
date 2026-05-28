'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Pencil, Eye } from 'lucide-react';
import Link from 'next/link';
import type { TemplateField, FieldType, FieldSource } from '@/types';
import { TemplateEditor } from './TemplateEditor';
import { ensureSystemFields } from '@/lib/template/defaults';

const TYPE_LABEL: Record<FieldType, string> = {
  text: '텍스트',
  number: '숫자',
  textarea: '장문',
  select: '선택',
  date: '날짜',
};

const SOURCE_LABEL: Record<FieldSource, string> = {
  interpreter: '통역사 작성',
  auto: '자동 채움',
  admin: '관리자 작성',
};

export default function TemplatePage() {
  const params = useParams();
  const eventId = params.id as string;
  const [dataLoading, setDataLoading] = useState(true);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [autoAnswerTemplate, setAutoAnswerTemplate] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('report_templates')
      .select('fields, auto_answer_template')
      .eq('event_id', eventId)
      .single();

    if (data?.fields) {
      setFields(ensureSystemFields(data.fields as TemplateField[]));
    }
    setAutoAnswerTemplate((data?.auto_answer_template ?? null) as string | null);
    setDataLoading(false);
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  const hasData = fields.length > 0;

  return (
    <div className="max-w-2xl">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">상담일지 양식</h2>
          {hasData && (
            <p className="text-slate-500 text-sm mt-1">{fields.length}개 필드 설정됨</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/events/${eventId}/registration`} className="block flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">엑셀 업로드</Button>
          </Link>
          {hasData && (
            <Button size="sm" variant={editMode ? 'outline' : 'default'} onClick={() => setEditMode((v) => !v)} className="gap-1.5 flex-1 sm:flex-initial">
              {editMode ? <><Eye className="w-3.5 h-3.5" />조회</> : <><Pencil className="w-3.5 h-3.5" />편집</>}
            </Button>
          )}
        </div>
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

      {hasData && editMode && (
        <TemplateEditor
          eventId={eventId}
          initialFields={fields}
          initialAutoAnswerTemplate={autoAnswerTemplate}
          key={fields.length}
        />
      )}
      {hasData && !editMode && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-slate-500 w-6 text-center">{i + 1}</span>
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground text-sm truncate">{field.label}</span>
                    {field.required && <span className="text-xs text-red-500">*</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">{TYPE_LABEL[field.type] ?? field.type}</span>
                    {field.source && field.source !== 'interpreter' && (
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {SOURCE_LABEL[field.source]}
                      </span>
                    )}
                    {field.condition && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">조건부</span>
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
