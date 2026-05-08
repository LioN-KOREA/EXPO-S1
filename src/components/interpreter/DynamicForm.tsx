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
import type { TemplateField } from '@/types';

interface DynamicFormProps {
  fields: TemplateField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

export function DynamicForm({ fields, values, onChange, disabled = false }: DynamicFormProps) {
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
            <Textarea
              id={field.key}
              value={String(values[field.key] ?? '')}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={disabled}
              required={field.required}
              rows={4}
            />
          )}

          {field.type === 'select' && field.options && (
            <Select
              value={String(values[field.key] ?? '')}
              onValueChange={(val) => onChange(field.key, val)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택하세요" />
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
