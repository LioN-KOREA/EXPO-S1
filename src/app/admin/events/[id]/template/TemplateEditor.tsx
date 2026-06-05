'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUp, ArrowDown, Trash2, Plus, Save, FileText, Eye, GripVertical } from 'lucide-react';
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
import { DEFAULT_AUTO_ANSWER_TEMPLATE, ensureSystemFields, isSystemFieldKey } from '@/lib/template/defaults';
import { listAutoAnswerVariables, JOSA_PAIR_KEYS } from '@/lib/template/autoAnswer';

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
  initialAutoAnswerTemplate?: string | null;
}

export function TemplateEditor({ eventId, initialFields, initialAutoAnswerTemplate }: Props) {
  const [fields, setFields] = useState<TemplateField[]>(() => ensureSystemFields(initialFields));
  const [autoAnswerTemplate, setAutoAnswerTemplate] = useState<string>(
    initialAutoAnswerTemplate ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function openPreview() {
    setPreviewValues({});
    setPreviewOpen(true);
  }

  function handlePreviewSubmit() {
    toast.success('미리보기입니다. 실제 제출되지 않습니다');
    setPreviewOpen(false);
  }

  function update(index: number, patch: Partial<TemplateField>) {
    setFields((prev) => prev.map((f, i) => {
      if (i !== index) return f;
      if (isSystemFieldKey(f.key)) return f; // 시스템 필드는 변경 금지
      return { ...f, ...patch };
    }));
  }

  function move(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      if (isSystemFieldKey(next[index].key) || isSystemFieldKey(next[target].key)) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  }

  // 위치를 from 에서 to 로 이동(삽입 방식). 번호 입력·드래그 양쪽에서 사용.
  // 시스템 필드(consultation_type=맨앞, absence_reason=맨뒤)는 ensureSystemFields가
  // 위치를 강제하므로 비시스템 필드의 to를 [1, prev.length-2] 로 clamp 하여 시각적으로도 보호.
  function reorder(from: number, to: number) {
    setFields((prev) => {
      if (from === to) return prev;
      if (from < 0 || from >= prev.length) return prev;
      if (isSystemFieldKey(prev[from].key)) return prev;
      // 양 끝 시스템 필드 위치는 통과 금지
      const hasFront = prev.length > 0 && isSystemFieldKey(prev[0].key);
      const hasBack = prev.length > 0 && isSystemFieldKey(prev[prev.length - 1].key);
      const minIdx = hasFront ? 1 : 0;
      const maxIdx = hasBack ? prev.length - 2 : prev.length - 1;
      const clamped = Math.max(minIdx, Math.min(maxIdx, to));
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(clamped, 0, moved);
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  }

  function remove(index: number) {
    const target = fields[index];
    if (target && isSystemFieldKey(target.key)) {
      toast.error('이 필드는 시스템 필드로 삭제할 수 없습니다');
      return;
    }
    if (!confirm('이 필드를 삭제할까요?')) return;
    setFields((prev) => prev.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i + 1 })));
  }

  function addField() {
    const newKey = `field_${Date.now()}`;
    setFields((prev) => {
      const newField: TemplateField = {
        key: newKey,
        label: '새 필드',
        type: 'text',
        required: false,
        order: 0,
        source: 'interpreter',
      };
      // absence_reason 이 맨 뒤에 있으면 그 직전에 삽입 (시스템 필드 위치 유지)
      const lastIdx = prev.length - 1;
      const insertAt = lastIdx >= 0 && isSystemFieldKey(prev[lastIdx].key) ? lastIdx : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, newField);
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  }

  // 라벨 변경 시 source 자동 추론.
  // 사용자가 한 번이라도 source 드롭다운으로 명시한 경우(=sourceLocked) 추론 적용 안 함.
  function updateLabel(index: number, label: string) {
    setFields((prev) => prev.map((f, i) => {
      if (i !== index) return f;
      if (isSystemFieldKey(f.key)) return f; // 시스템 필드 label 잠금
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
    // 저장 직전 시스템 필드 보강 (UI 우회 방지)
    const enforced = ensureSystemFields(fields);
    const cleanFields = enforced.map((f, i) => ({
      ...f,
      order: i + 1,
      source: f.source ?? 'interpreter',
      autoSource: f.source === 'auto' ? f.autoSource : undefined,
      // 조건 정리: field 없거나, equals/in 모두 비어있을 때만 condition 제거
      // equals = 0, false, '' 모두 유효값이므로 undefined/null 만 비어있음으로 본다
      // (MultiStepReportForm은 'equals' in field.condition 으로 strict 평가)
      condition: (() => {
        if (!f.condition?.field) return undefined;
        const v = f.condition.equals;
        const arr = f.condition.in;
        const hasEquals = v !== undefined && v !== null;
        const hasIn = Array.isArray(arr) && arr.length > 0;
        if (!hasEquals && !hasIn) return undefined;
        return f.condition;
      })(),
    }));

    const { error } = await supabase
      .from('report_templates')
      .update({
        fields: cleanFields,
        auto_answer_template: autoAnswerTemplate.trim() === '' ? null : autoAnswerTemplate,
      })
      .eq('event_id', eventId);

    if (error) {
      toast.error('저장 실패: ' + error.message);
    } else {
      toast.success('양식이 저장되었습니다');
    }
    setSaving(false);
  }

  const fieldKeys = useMemo(() => fields.map((f) => f.key), [fields]);

  const autoAnswerVars = useMemo(() => listAutoAnswerVariables(fields), [fields]);

  return (
    <>
    <details className="mb-4 rounded-lg border bg-card shadow-sm">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-600 hover:bg-muted/40">
        고급 — LLM 실패 시 폴백 답변 템플릿 (평소 숨김)
      </summary>
    <Card className="border-0 shadow-none rounded-none">
      <CardHeader>
        <CardTitle className="text-lg">LLM 실패 시 폴백 답변 템플릿</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          평소에는 AI(LLM) 가 상담일지를 자동 생성합니다. 본 템플릿은 LLM 호출이
          실패(타임아웃·5xx·rate limit·kill switch off 등)할 때만 사용되는 폴백입니다.
          현재 양식 답안과 바이어/셀러 카드 정보를 변수로 치환하여 textarea에 주입합니다.
          비워두면 폴백 호출 시 비활성화 안내를 띄웁니다.
        </p>
        <Textarea
          value={autoAnswerTemplate}
          onChange={(e) => setAutoAnswerTemplate(e.target.value)}
          rows={Math.max(6, autoAnswerTemplate.split('\n').length + 1)}
          placeholder="예: 국내기업 {{seller_company|은/는}} {{consultation_item}}에 대해 상담했습니다..."
          className="text-sm font-mono"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoAnswerTemplate(DEFAULT_AUTO_ANSWER_TEMPLATE)}
            className="h-7 text-xs"
          >
            기본 템플릿 불러오기
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoAnswerTemplate('')}
            disabled={autoAnswerTemplate === ''}
            className="h-7 text-xs text-red-600"
          >
            비우기
          </Button>
        </div>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer select-none">사용 가능한 변수 ({autoAnswerVars.length}개)</summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
            {autoAnswerVars.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setAutoAnswerTemplate((prev) => prev + `{{${v.key}}}`)}
                className="text-left text-[11px] px-2 py-1 rounded bg-muted hover:bg-slate-200 font-mono"
                title="클릭하면 끝에 삽입"
              >
                <span className="text-rose-600">{`{{${v.key}}}`}</span>
                <span className="text-slate-500"> — {v.label}</span>
              </button>
            ))}
          </div>
        </details>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer select-none">조사 자동 처리 ({JOSA_PAIR_KEYS.length}개)</summary>
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] text-slate-500">
              변수 뒤에 <code className="font-mono text-rose-600">|페어</code>를 붙이면 값의 받침에 맞는 조사가 자동으로 붙습니다.
              예: <code className="font-mono">{`{{seller_company|은/는}}`}</code> → 회사명이 받침이 있으면 “…은”, 없으면 “…는”.
            </p>
            <div className="flex flex-wrap gap-1">
              {JOSA_PAIR_KEYS.map((pair) => (
                <span
                  key={pair}
                  className="text-[11px] px-2 py-0.5 rounded bg-muted font-mono"
                  title="변수 뒤에 |로 붙여 사용"
                >
                  {`|${pair}`}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              값이 한글이 아니거나 “(미입력)”처럼 괄호로 끝나면 안쪽 마지막 한글 글자의 받침으로 판정합니다.
              알 수 없는 페어는 그대로 출력됩니다.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
    </details>

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
        {fields.map((field, i) => {
          const locked = isSystemFieldKey(field.key);
          return (
          <div
            key={field.key + i}
            draggable={!locked}
            onDragStart={(e) => {
              if (locked) { e.preventDefault(); return; }
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOver !== i) setDragOver(i);
            }}
            onDragLeave={() => {
              if (dragOver === i) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom ?? Number(e.dataTransfer.getData('text/plain'));
              setDragFrom(null);
              setDragOver(null);
              if (!Number.isNaN(from)) reorder(from, i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            className={`border rounded-lg p-3 space-y-2 bg-muted/30 transition-colors ${
              dragOver === i && dragFrom !== i ? 'ring-2 ring-blue-400 bg-blue-50/50' : ''
            } ${dragFrom === i ? 'opacity-60' : ''} ${locked ? 'border-amber-300 bg-amber-50/30' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <GripVertical
                className={`w-4 h-4 shrink-0 ${locked ? 'text-amber-300 cursor-not-allowed' : 'text-slate-400 cursor-grab active:cursor-grabbing'}`}
                aria-label="드래그하여 순서 변경"
              />
              <Input
                type="number"
                min={1}
                max={fields.length}
                value={i + 1}
                onChange={(e) => {
                  if (locked) return;
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next >= 1 && next <= fields.length) {
                    reorder(i, next - 1);
                  }
                }}
                disabled={locked}
                className="w-14 h-8 text-xs text-center shrink-0 px-1"
                title={locked ? '시스템 필드 — 위치 고정' : '번호를 입력하면 해당 위치로 이동합니다'}
              />
              <Input
                value={field.label}
                onChange={(e) => updateLabel(i, e.target.value)}
                placeholder="필드 라벨"
                disabled={locked}
                className="flex-1 min-w-[140px] h-8 text-sm font-medium"
              />
              <Select value={field.type} onValueChange={(v) => { if (v && !locked) update(i, { type: v as FieldType }); }} disabled={locked}>
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
              <label className={`flex items-center gap-1 text-xs whitespace-nowrap ${locked ? 'text-slate-400' : 'text-slate-600'}`}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                  disabled={locked}
                  className="w-3.5 h-3.5"
                />
                필수
              </label>
              {locked && (
                <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">
                  시스템 필드 (잠금)
                </Badge>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0 || locked} className="h-9 w-9 sm:h-7 sm:w-7">
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === fields.length - 1 || locked} className="h-9 w-9 sm:h-7 sm:w-7">
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(i)} disabled={locked} className="h-9 w-9 sm:h-7 sm:w-7 text-red-500 hover:text-red-600 disabled:text-slate-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* 옵션 (select 전용) — 한 줄에 하나씩 입력 */}
            {field.type === 'select' && (
              <div className="flex items-start gap-2 pl-2 sm:pl-8">
                <span className="text-xs text-slate-500 shrink-0 mt-1.5">옵션:</span>
                <Textarea
                  value={(field.options ?? []).join('\n')}
                  onChange={(e) =>
                    update(i, {
                      options: e.target.value
                        .split('\n')
                        .map((s) => s.replace(/\r$/, '')),
                    })
                  }
                  onBlur={(e) =>
                    update(i, {
                      options: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  disabled={locked}
                  placeholder={'한 줄에 하나씩 입력\n예:\n상\n중\n하'}
                  rows={Math.max(2, (field.options?.length ?? 0) + 1)}
                  className="text-xs min-h-[60px] resize-y"
                />
              </div>
            )}

            {/* 작성 주체 */}
            <div className="flex items-center gap-2 pl-2 sm:pl-8 flex-wrap">
              <span className="text-xs text-slate-500 shrink-0">작성:</span>
              <Select
                value={field.source ?? 'interpreter'}
                disabled={locked}
                onValueChange={(v) => {
                  if (!v || locked) return;
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
                    disabled={locked}
                    onValueChange={(v) => {
                      if (!v || v === '_pick' || locked) return;
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
                disabled={locked}
                onValueChange={(v) => {
                  if (!v || locked) return;
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
                  <span className="text-xs text-slate-500 mt-1.5">값:</span>
                  <Textarea
                    value={
                      Array.isArray(field.condition.in)
                        ? field.condition.in.join('\n')
                        : String(field.condition.equals ?? '')
                    }
                    onChange={(e) => {
                      if (locked) return;
                      const lines = e.target.value.split('\n');
                      if (lines.length > 1) {
                        update(i, { condition: { field: field.condition!.field, in: lines } });
                      } else {
                        update(i, { condition: { field: field.condition!.field, equals: lines[0] } });
                      }
                    }}
                    onBlur={(e) => {
                      if (locked) return;
                      const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                      if (lines.length > 1) {
                        update(i, { condition: { field: field.condition!.field, in: lines } });
                      } else if (lines.length === 1) {
                        update(i, { condition: { field: field.condition!.field, equals: lines[0] } });
                      }
                    }}
                    disabled={locked}
                    placeholder={'값 1개 = 일치 비교\n여러 줄 = 그 중 하나라도 일치'}
                    rows={Math.max(2, Array.isArray(field.condition.in) ? field.condition.in.length + 1 : 2)}
                    className="text-xs flex-1 min-w-[160px] min-h-[44px] resize-y"
                  />
                  <Badge variant="outline" className="text-[10px] mt-1.5">
                    {Array.isArray(field.condition.in) ? `다중값 (${field.condition.in.length}개)` : '같음'}
                  </Badge>
                </>
              )}
            </div>
          </div>
          );
        })}
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
            autoAnswerTemplate={autoAnswerTemplate}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
