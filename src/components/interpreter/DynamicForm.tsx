'use client';

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
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { TemplateField } from '@/types';

interface DynamicFormProps {
  fields: TemplateField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

// label/key에서 "세부"/"detail" 포함 textarea 필드는 AI 생성 버튼 노출
function isAiTarget(field: TemplateField): boolean {
  if (field.type !== 'textarea') return false;
  const text = (field.label + ' ' + field.key).toLowerCase();
  return /세부|상세|detail|description/.test(text);
}

export function DynamicForm({ fields, values, onChange, disabled = false }: DynamicFormProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key} className="text-sm">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>

          {field.type === 'text' && (
            <Input
              id={field.key}
              value={String(values[field.key] ?? '')}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={disabled}
              required={field.required}
            />
          )}

          {field.type === 'number' && (
            <Input
              id={field.key}
              type="number"
              value={String(values[field.key] ?? '')}
              onChange={(e) => onChange(field.key, e.target.value === '' ? null : Number(e.target.value))}
              disabled={disabled}
              required={field.required}
            />
          )}

          {field.type === 'date' && (
            <Input
              id={field.key}
              type="date"
              value={String(values[field.key] ?? '')}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={disabled}
              required={field.required}
            />
          )}

          {field.type === 'textarea' && (
            <>
              {isAiTarget(field) && !disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(t.interpreter.aiGeneratePreparing)}
                  className="gap-1.5 mb-1.5 border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t.interpreter.aiGenerate}
                </Button>
              )}
              <Textarea
                id={field.key}
                value={String(values[field.key] ?? '')}
                onChange={(e) => onChange(field.key, e.target.value)}
                disabled={disabled}
                required={field.required}
                rows={4}
              />
            </>
          )}

          {field.type === 'select' && field.options && (
            <Select
              value={String(values[field.key] ?? '')}
              onValueChange={(val) => onChange(field.key, val)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.interpreter.selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
    </div>
  );
}
