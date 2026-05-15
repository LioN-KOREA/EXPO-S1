'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUp, ArrowDown, Trash2, Plus, Save, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { TemplateField, FieldType } from '@/types';

const typeOptions: { value: FieldType; label: string }[] = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'textarea', label: '장문' },
  { value: 'select', label: '선택' },
  { value: 'date', label: '날짜' },
];

interface Props {
  eventId: string;
  initialFields: TemplateField[];
}

export function TemplateEditor({ eventId, initialFields }: Props) {
  const [fields, setFields] = useState<TemplateField[]>(initialFields);
  const [saving, setSaving] = useState(false);

  function update(index: number, patch: Partial<TemplateField>) {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...patch } : f));
  }

  function move(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  }

  function remove(index: number) {
    if (!confirm('이 필드를 삭제할까요?')) return;
    setFields((prev) => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i + 1 })));
  }

  function addField() {
    const newKey = `field_${Date.now()}`;
    setFields((prev) => [...prev, {
      key: newKey,
      label: '새 필드',
      type: 'text',
      required: false,
      order: prev.length + 1,
    }]);
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const cleanFields = fields.map((f, i) => ({
      ...f,
      order: i + 1,
      // 조건 정리: field/equals/in 셋 다 없으면 condition 제거
      condition: (() => {
        if (!f.condition?.field) return undefined;
        const v = f.condition.equals;
        const arr = f.condition.in;
        if (!v && !arr) return undefined;
        return f.condition;
      })(),
    }));

    const { error } = await supabase
      .from('report_templates')
      .update({ fields: cleanFields })
      .eq('event_id', eventId);

    if (error) {
      toast.error('저장 실패: ' + error.message);
    } else {
      toast.success('양식이 저장되었습니다');
    }
    setSaving(false);
  }

  const fieldKeys = useMemo(() => fields.map((f) => f.key), [fields]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">양식 편집 ({fields.length}개)</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addField} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              필드 추가
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            필드가 없습니다. "필드 추가" 버튼으로 시작하세요.
          </div>
        )}
        {fields.map((field, i) => (
          <div key={field.key + i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-6 text-center">{i + 1}</span>
              <Input
                value={field.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="필드 라벨"
                className="flex-1 h-8 text-sm font-medium"
              />
              <Select value={field.type} onValueChange={(v) => { if (v) update(i, { type: v as FieldType }); }}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                  className="w-3.5 h-3.5"
                />
                필수
              </label>
              <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} className="h-7 w-7">
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="h-7 w-7">
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(i)} className="h-7 w-7 text-red-500 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* 옵션 (select 전용) */}
            {field.type === 'select' && (
              <div className="flex items-center gap-2 pl-8">
                <span className="text-xs text-slate-500 shrink-0">옵션:</span>
                <Input
                  value={field.options?.join(',') ?? ''}
                  onChange={(e) => update(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="옵션을 쉼표로 구분 (예: 상,중,하)"
                  className="h-7 text-xs"
                />
              </div>
            )}

            {/* 분기 조건 */}
            <div className="flex items-center gap-2 pl-8 flex-wrap">
              <span className="text-xs text-slate-500 shrink-0">조건:</span>
              <Select
                value={field.condition?.field ?? '_none'}
                onValueChange={(v) => {
                  if (!v) return;
                  if (v === '_none') update(i, { condition: undefined });
                  else update(i, { condition: { field: v, equals: field.condition?.equals } });
                }}
              >
                <SelectTrigger className="w-[140px] h-7 text-xs">
                  <SelectValue placeholder="조건 없음" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">조건 없음</SelectItem>
                  {fieldKeys.filter((k) => k !== field.key).map((k) => {
                    const targetField = fields.find((f) => f.key === k);
                    return (
                      <SelectItem key={k} value={k}>{targetField?.label ?? k}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {field.condition?.field && (
                <>
                  <span className="text-xs text-slate-500">값:</span>
                  <Input
                    value={
                      Array.isArray(field.condition.in)
                        ? field.condition.in.join(',')
                        : String(field.condition.equals ?? '')
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes(',')) {
                        const arr = val.split(',').map((s) => s.trim()).filter(Boolean);
                        update(i, { condition: { field: field.condition!.field, in: arr } });
                      } else {
                        update(i, { condition: { field: field.condition!.field, equals: val } });
                      }
                    }}
                    placeholder="값 또는 쉼표로 다중값"
                    className="h-7 text-xs flex-1 min-w-[120px]"
                  />
                  <Badge variant="outline" className="text-[10px]">
                    {Array.isArray(field.condition.in) ? `in (${field.condition.in.length})` : 'equals'}
                  </Badge>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
