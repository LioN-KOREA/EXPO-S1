'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Pencil, Eye } from 'lucide-react';
import Link from 'next/link';
import type { TemplateField } from '@/types';
import { TemplateEditor } from './TemplateEditor';

export default function TemplatePage() {
  const params = useParams();
  const eventId = params.id as string;
  const [dataLoading, setDataLoading] = useState(true);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [editMode, setEditMode] = useState(false);

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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">상담일지 양식</h2>
          {hasData && (
            <p className="text-slate-500 text-sm mt-1">{fields.length}개 필드 설정됨</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/events/${eventId}/registration`}>
            <Button variant="outline" size="sm">엑셀 업로드</Button>
          </Link>
          {hasData && (
            <Button size="sm" variant={editMode ? 'outline' : 'default'} onClick={() => setEditMode((v) => !v)} className="gap-1.5">
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
        <TemplateEditor eventId={eventId} initialFields={fields} key={fields.length} />
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
                    <span className="text-xs text-slate-500">{field.type}</span>
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
