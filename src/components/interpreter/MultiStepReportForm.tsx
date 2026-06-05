'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Sparkles, ClipboardCheck, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { TemplateField } from '@/types';
import { ABSENT_CONSULTATION_TYPES } from '@/lib/template/defaults';

const CONSULTATION_TYPE_KEY = 'consultation_type';
const ABSENCE_REASON_KEY = 'absence_reason';

interface AutoAnswerConsultation {
  buyer?: { company_name?: string | null; country?: string | null } | null;
  seller?: {
    company_name?: string | null;
    company_name_kr?: string | null;
    contact_name?: string | null;
  } | null;
}

interface Props {
  fields: TemplateField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  autoAnswerTemplate?: string | null;
  consultation?: AutoAnswerConsultation | null;
  consultationId?: string;
}

function isVisible(field: TemplateField, values: Record<string, unknown>): boolean {
  if (!field.condition) return true;
  const v = values[field.condition.field];
  if (field.condition.in && Array.isArray(field.condition.in)) {
    return field.condition.in.includes(v);
  }
  if ('equals' in field.condition) {
    return field.condition.equals === v;
  }
  return true;
}

function isAiTarget(field: TemplateField): boolean {
  if (field.type !== 'textarea') return false;
  const text = (field.label + ' ' + field.key).toLowerCase();
  return /세부|상세|detail|description/.test(text);
}

export function MultiStepReportForm({
  fields,
  values,
  onChange,
  disabled = false,
  onSubmit,
  submitting = false,
  submitLabel,
  autoAnswerTemplate,
  consultation,
  consultationId,
}: Props) {
  const { t } = useI18n();
  const resolvedSubmitLabel = submitLabel ?? t.interpreter.submit;
  const [step, setStep] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVariantIndex, setAiVariantIndex] = useState(0);
  const [aiClickCount, setAiClickCount] = useState(0);

  // 순서 정렬 + 통역사가 작성하는 필드만 (auto/admin 제외) + 조건 분기 필터
  const sorted = useMemo(
    () => [...fields]
      .filter((f) => (f.source ?? 'interpreter') === 'interpreter')
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [fields]
  );
  // 불참 분기: consultation_type 이 불참 계열이면 consultation_type + absence_reason 외 모두 숨김
  const isAbsentFlow = ABSENT_CONSULTATION_TYPES.includes(values[CONSULTATION_TYPE_KEY] as string);
  const visible = useMemo(
    () => sorted.filter((f) => {
      if (!isVisible(f, values)) return false;
      if (isAbsentFlow && f.key !== CONSULTATION_TYPE_KEY && f.key !== ABSENCE_REASON_KEY) {
        return false;
      }
      return true;
    }),
    [sorted, values, isAbsentFlow]
  );

  // 검토 step = 마지막 + 1 (visible.length 위치)
  const totalSteps = visible.length + 1; // 양식 step + 검토 step
  // step 범위 보정
  const safeStep = Math.min(step, Math.max(0, totalSteps - 1));
  const isReviewStep = safeStep === visible.length;
  const current = isReviewStep ? null : visible[safeStep];
  const progress = totalSteps > 0 ? ((safeStep + 1) / totalSteps) * 100 : 0;
  const isLast = safeStep === totalSteps - 1;
  const isFirst = safeStep === 0;

  function handleNext() {
    if (current?.required) {
      const v = values[current.key];
      if (v === undefined || v === null || v === '') {
        toast.error(t.interpreter.requiredField);
        return;
      }
    }
    if (isLast) {
      // 검토 step에서 다음(=제출) 클릭 — 모든 필수 검증
      const missing = visible.find((f) => {
        if (!f.required) return false;
        const v = values[f.key];
        return v === undefined || v === null || v === '';
      });
      if (missing) {
        toast.error(`${t.interpreter.requiredFieldMissingPrefix}${missing.label}`);
        return;
      }
      onSubmit();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handlePrev() {
    if (!isFirst) setStep((s) => s - 1);
  }

  function jumpToStep(index: number) {
    setStep(index);
  }

  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">{t.interpreter.noVisibleFields}</p>;
  }

  function formatValue(field: TemplateField, val: unknown): string {
    if (val === undefined || val === null || val === '') return t.interpreter.notFilled;
    if (field.type === 'number' && typeof val === 'number') {
      return val.toLocaleString('ko-KR');
    }
    return String(val);
  }

  return (
    <div className="space-y-6">
      {/* 진척도 바 */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>
            {isReviewStep ? t.interpreter.reviewStep : `${safeStep + 1} / ${visible.length}`}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 검토 step */}
      {isReviewStep && (
        <div className="min-h-[200px]">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-semibold">{t.interpreter.reviewTitle}</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            {t.interpreter.reviewDesc}
          </p>
          <div className="space-y-2">
            {visible.map((f, i) => (
              <button
                key={f.key}
                type="button"
                onClick={() => jumpToStep(i)}
                className="w-full text-left p-3 rounded-lg border bg-card hover:bg-muted transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 mb-0.5">
                      {i + 1}. {f.label}
                      {f.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    <p className={`text-sm break-words ${
                      values[f.key] === undefined || values[f.key] === '' ? 'text-red-500 italic' : 'text-foreground font-medium'
                    }`}>
                      {formatValue(f, values[f.key])}
                    </p>
                  </div>
                  <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-500 shrink-0 mt-0.5" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 현재 질문 */}
      {!isReviewStep && current && (
      <div className="min-h-[200px]">
        <Label htmlFor={current.key} className="text-base font-semibold">
          {current.label}
          {current.required && <span className="text-red-500 ml-1">*</span>}
        </Label>

        <div className="mt-3">
          {current.type === 'text' && (
            <Input
              id={current.key}
              value={String(values[current.key] ?? '')}
              onChange={(e) => onChange(current.key, e.target.value)}
              disabled={disabled}
              required={current.required}
              className="h-11"
            />
          )}

          {current.type === 'number' && (
            <Input
              id={current.key}
              type="number"
              value={String(values[current.key] ?? '')}
              onChange={(e) => onChange(current.key, e.target.value === '' ? null : Number(e.target.value))}
              disabled={disabled}
              required={current.required}
              className="h-11"
            />
          )}

          {current.type === 'date' && (
            <Input
              id={current.key}
              type="date"
              value={String(values[current.key] ?? '')}
              onChange={(e) => onChange(current.key, e.target.value)}
              disabled={disabled}
              required={current.required}
              className="h-11"
            />
          )}

          {current.type === 'textarea' && (
            <>
              {isAiTarget(current) && !disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={aiLoading || aiClickCount >= 5}
                  onClick={async () => {
                    if (!consultationId) {
                      toast.error('consultationId 누락');
                      return;
                    }
                    if (aiClickCount >= 5) {
                      toast.info('5개 시안을 모두 생성했습니다.');
                      return;
                    }
                    const existing = String(values[current.key] ?? '');
                    if (existing.trim() && !confirm('기존 내용을 덮어쓸까요?')) {
                      return;
                    }
                    setAiLoading(true);
                    const fieldKey = current.key;
                    try {
                      const res = await fetch('/api/ai/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          consultation_id: consultationId,
                          variant_index: aiVariantIndex,
                          form_values: values,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        toast.error(`AI 호출 실패: ${data.error ?? res.status}`);
                        return;
                      }
                      onChange(fieldKey, data.content);
                      setAiVariantIndex((i) => (i + 1) % 5);
                      setAiClickCount((c) => c + 1);
                      const nextCount = aiClickCount + 1;
                      if (nextCount >= 5) {
                        toast.success(`AI 답변 생성 완료 (시안 5/5). 모든 시안을 생성했습니다.`);
                      } else {
                        toast.success(`AI 답변 생성 완료 (시안 ${nextCount}/5)`);
                      }
                    } catch (e) {
                      toast.error(`AI 호출 오류: ${e instanceof Error ? e.message : String(e)}`);
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  className="gap-1.5 mb-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {aiLoading
                    ? '생성 중...'
                    : aiClickCount >= 5
                      ? '5개 시안 모두 생성됨'
                      : `AI 답변 생성 (${aiClickCount + 1}/5)`}
                </Button>
              )}
              <Textarea
                id={current.key}
                value={String(values[current.key] ?? '')}
                onChange={(e) => onChange(current.key, e.target.value)}
                disabled={disabled}
                required={current.required}
                rows={6}
              />
            </>
          )}

          {current.type === 'select' && current.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {current.options.map((option) => {
                const isActive = values[current.key] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => !disabled && onChange(current.key, option)}
                    disabled={disabled}
                    className={`px-4 py-3 text-sm rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 text-foreground'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 이전/다음 */}
      <div className="flex gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrev}
          disabled={isFirst || submitting}
          className="gap-1.5 min-w-[88px] h-10"
        >
          <ChevronLeft className="w-4 h-4" />
          {t.interpreter.prev}
        </Button>
        {disabled ? (
          !isLast && (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 gap-1.5 h-10"
            >
              {t.interpreter.next}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )
        ) : (
          <Button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            className={`flex-1 gap-1.5 h-10 ${
              isLast
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'
                : ''
            }`}
          >
            {isLast ? (submitting ? t.interpreter.submitting : resolvedSubmitLabel) : t.interpreter.next}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
