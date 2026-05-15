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
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { TemplateField } from '@/types';

interface Props {
  fields: TemplateField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
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
  submitLabel = '제출',
}: Props) {
  const [step, setStep] = useState(0);

  // 순서 정렬 + 표시 가능한 필드만 추출
  const sorted = useMemo(
    () => [...fields].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [fields]
  );
  const visible = useMemo(() => sorted.filter((f) => isVisible(f, values)), [sorted, values]);

  // step 범위 보정
  const safeStep = Math.min(step, Math.max(0, visible.length - 1));
  const current = visible[safeStep];
  const progress = visible.length > 0 ? ((safeStep + 1) / visible.length) * 100 : 0;
  const isLast = safeStep === visible.length - 1;
  const isFirst = safeStep === 0;

  function handleNext() {
    if (current?.required) {
      const v = values[current.key];
      if (v === undefined || v === null || v === '') {
        toast.error('필수 항목입니다');
        return;
      }
    }
    if (isLast) {
      onSubmit();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handlePrev() {
    if (!isFirst) setStep((s) => s - 1);
  }

  if (!current) {
    return <p className="text-sm text-slate-500">표시할 질문이 없습니다.</p>;
  }

  return (
    <div className="space-y-6">
      {/* 진척도 바 */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>{safeStep + 1} / {visible.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 현재 질문 */}
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
                  onClick={() => toast.info('AI 답변 생성 준비중 (Phase E-3)')}
                  className="gap-1.5 mb-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 답변 생성
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

      {/* 이전/다음 */}
      {!disabled && (
        <div className="flex gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrev}
            disabled={isFirst || submitting}
            className="gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            className={`flex-1 gap-1.5 ${
              isLast
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'
                : ''
            }`}
          >
            {isLast ? (submitting ? '제출 중...' : submitLabel) : '다음'}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
