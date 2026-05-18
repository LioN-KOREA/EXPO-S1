'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Settings2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { TemplateField } from '@/types';

interface Props {
  reportId: string;
  reportVersion: number;
  initialData: Record<string, unknown>;
  adminFields: TemplateField[];
}

export function AdminFieldsEditor({ reportId, reportVersion, initialData, adminFields }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(initialData);
  const [saving, setSaving] = useState(false);

  if (adminFields.length === 0) return null;

  function setValue(key: string, v: unknown) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();

    const patch: Record<string, unknown> = { ...initialData };
    for (const f of adminFields) {
      patch[f.key] = values[f.key];
    }

    const { data, error } = await supabase
      .from('consultation_reports')
      .update({ data: patch, updated_at: new Date().toISOString() })
      .eq('id', reportId)
      .eq('version', reportVersion || 1)
      .select('id')
      .maybeSingle();

    if (error) {
      toast.error('저장 실패: ' + error.message);
    } else if (!data) {
      toast.error('동시 수정 충돌. 새로고침 후 다시 시도하세요.');
    } else {
      toast.success('관리자 필드 저장 완료');
    }
    setSaving(false);
  }

  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-blue-600" />
          관리자 입력 필드
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {adminFields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {f.label}
              {f.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {f.type === 'text' && (
              <Input
                value={String(values[f.key] ?? '')}
                onChange={(e) => setValue(f.key, e.target.value)}
                className="h-9"
              />
            )}
            {f.type === 'number' && (
              <Input
                type="number"
                value={String(values[f.key] ?? '')}
                onChange={(e) => setValue(f.key, e.target.value === '' ? null : Number(e.target.value))}
                className="h-9"
              />
            )}
            {f.type === 'date' && (
              <Input
                type="date"
                value={String(values[f.key] ?? '')}
                onChange={(e) => setValue(f.key, e.target.value)}
                className="h-9"
              />
            )}
            {f.type === 'textarea' && (
              <Textarea
                value={String(values[f.key] ?? '')}
                onChange={(e) => setValue(f.key, e.target.value)}
                rows={3}
              />
            )}
            {f.type === 'select' && f.options && (
              <Select
                value={String(values[f.key] ?? '')}
                onValueChange={(v) => setValue(f.key, v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
        <div className="pt-2">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? '저장 중...' : '관리자 필드 저장'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
