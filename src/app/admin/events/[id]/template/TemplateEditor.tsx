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
import { ArrowUp, ArrowDown, Trash2, Plus, Save, FileText, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MultiStepReportForm } from '@/components/interpreter/MultiStepReportForm';
import type { TemplateField, FieldType, FieldSource, AutoSourceKey } from '@/types';
import { AUTO_SOURCE_OPTIONS, inferAutoSourceFromLabel, isAdminLabel } from '@/lib/template/auto-source';

const typeOptions: { value: FieldType; label: string }[] = [
  { value: 'text', label: '텍스트' },
  { value: 'number', label: '숫자' },
  { value: 'textarea', label: '장문' },
  { value: 'select', label: '선택' },
  { value: 'date', label: '날짜' },
];

const sourceOptions: { value: FieldSource; label: string; hint: string }[] = [
  { value: 'interpreter', label: '통역사 작성', hint: '통역사가 폼에서 직접 입력' },
  { value: 'auto', label: '자동 채움', hint: '상담 정보에서 자동 입력 (통역사 폼 숨김)' },
  { value: 'admin', label: '관리자 작성', hint: '관리자만 일지 보기에서 입력 (통역사 폼 숨김)' },
];

interface Props {
  eventId: string;
  initialFields: TemplateField[];
}

export function TemplateEditor({ eventId, initialFields }: Props) {
  const [fields, setFields] = useState<TemplateField[]>(initialFields);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});

  function openPreview() {
    setPreviewValues({});
    setPreviewOpen(true);
  }

  function handlePreviewSubmit() {
    toast.success('미리보기입니다. 실제 제출되지 않습니다');
    setPreviewOpen(false);
  }

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
      source: 'interpreter',
    }]);
  }

  // 라벨 변경 시 source 자동 추론.
  // 사용자가 한 번이라도 source 드롭다운으로 명시한 경우(=sourceLocked) 추론 적용 안 함.
  function updateLabel(index: number, label: string) {
    setFields((prev) => prev.map((f, i) => {
      if (i !== index) return f;
      if (f.sourceLocked) {
        return { ...f, label };
      }
      const autoSource = inferAutoSourceFromLabel(label);
      const inferredSource: FieldSource = autoSource
        ? 'auto'
        : isAdminLabel(label)
          ? 'admin'
          : 'interpreter';
      const nextAutoSource = inferredSource === 'auto' ? autoSource : undefined;
      return { ...f, label, source: inferredSource, autoSource: nextAutoSource };
    }));
  }

  async function save() {
    // autoSource 미지정 'auto' 필드 검증: 통역사 폼에서 영구 숨김+결손 알림 무시 되는 데드락 방지
    const invalidAuto = fields
      .map((f, i) => ({ field: f, order: i + 1 }))
      .filter(({ field }) => field.source === 'auto' && !field.autoSource);
    if (invalidAuto.length > 0) {
      const labels = invalidAuto
        .map(({ field, order }) => `${order}. ${field.label || '(라벨 없음)'}`)
        .join(', ');
      toast.error(`'자동 채움' 필드는 매핑 소스를 선택해야 합니다: ${labels}`);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const cleanFields = fields.map((f, i) => ({
      ...f,
      order: i + 1,
      source: f.source ?? 'interpreter',
      autoSource: f.source === 'auto' ? f.autoSource : undefined,
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
    <>
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg">양식 편집 ({fields.length}개)</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={addField} className="gap-1.5 flex-1 sm:flex-initial">
              <Plus className="w-3.5 h-3.5" />
              필드 추가
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openPreview}
              disabled={fields.length === 0}
              className="gap-1.5 flex-1 sm:flex-initial"
            >
              <Eye className="w-3.5 h-3.5" />
              미리보기
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 flex-1 sm:flex-initial">
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 w-6 text-center shrink-0">{i + 1}</span>
              <Input
                value={field.label}
                onChange={(e) => updateLabel(i, e.target.value)}
                placeholder="필드 라벨"
                className="flex-1 min-w-[140px] h-8 text-sm font-medium"
              />
              <Select value={field.type} onValueChange={(v) => { if (v) update(i, { type: v as FieldType }); }}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue>
                    {typeOptions.find((o) => o.value === field.type)?.label ?? field.type}
                  </SelectValue>
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
              <div className="flex items-center gap-1 ml-auto">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} className="h-9 w-9 sm:h-7 sm:w-7">
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="h-9 w-9 sm:h-7 sm:w-7">
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(i)} className="h-9 w-9 sm:h-7 sm:w-7 text-red-500 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* 옵션 (select 전용) */}
            {field.type === 'select' && (
              <div className="flex items-center gap-2 pl-2 sm:pl-8">
                <span className="text-xs text-slate-500 shrink-0">옵션:</span>
                <Input
                  value={field.options?.join(',') ?? ''}
                  onChange={(e) => update(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="옵션을 쉼표로 구분 (예: 상,중,하)"
                  className="h-7 text-xs"
                />
              </div>
            )}

            {/* 작성 주체 */}
            <div className="flex items-center gap-2 pl-2 sm:pl-8 flex-wrap">
              <span className="text-xs text-slate-500 shrink-0">작성:</span>
              <Select
                value={field.source ?? 'interpreter'}
                onValueChange={(v) => {
                  if (!v) return;
                  const next = v as FieldSource;
                  update(i, {
                    source: next,
                    autoSource: next === 'auto' ? (field.autoSource ?? inferAutoSourceFromLabel(field.label)) : undefined,
                    sourceLocked: true,
                  });
                }}
              >
                <SelectTrigger className="w-[120px] h-7 text-xs">
                  <SelectValue>
                    {sourceOptions.find((o) => o.value === (field.source ?? 'interpreter'))?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.source === 'auto' && (
                <>
                  <span className="text-xs text-slate-500">매핑:</span>
                  <Select
                    value={field.autoSource ?? '_pick'}
                    onValueChange={(v) => {
                      if (!v || v === '_pick') return;
                      update(i, { autoSource: v as AutoSourceKey, sourceLocked: true });
                    }}
                  >
                    <SelectTrigger className="w-[180px] h-7 text-xs">
                      <SelectValue placeholder="자동 채움 소스 선택">
                        {AUTO_SOURCE_OPTIONS.find((o) => o.value === field.autoSource)?.label ?? '자동 채움 소스 선택'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_pick" disabled>자동 채움 소스 선택</SelectItem>
                      {AUTO_SOURCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              {field.source && field.source !== 'interpreter' && (
                <Badge variant="outline" className="text-[10px]">
                  통역사 폼 숨김
                </Badge>
              )}
              {field.source === 'auto' && !field.autoSource && (
                <Badge variant="outline" className="text-[10px] border-red-300 bg-red-50 text-red-600">
                  매핑 소스 필요
                </Badge>
              )}
            </div>

            {/* 분기 조건 */}
            <div className="flex items-center gap-2 pl-2 sm:pl-8 flex-wrap">
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
                  <SelectValue placeholder="조건 없음">
                    {field.condition?.field
                      ? (fields.find((f) => f.key === field.condition!.field)?.label ?? field.condition.field)
                      : '조건 없음'}
                  </SelectValue>
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
                    {Array.isArray(field.condition.in) ? `다중값 (${field.condition.in.length}개)` : '같음'}
                  </Badge>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>

    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>양식 미리보기 (통역사 시점)</DialogTitle>
          <DialogDescription>
            저장하지 않은 라이브 편집 상태로 통역사 화면을 미리 확인합니다. 제출해도 실제 데이터로 저장되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <MultiStepReportForm
            fields={fields}
            values={previewValues}
            onChange={(key, value) => setPreviewValues((prev) => ({ ...prev, [key]: value }))}
            onSubmit={handlePreviewSubmit}
            submitLabel="미리보기 완료"
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
