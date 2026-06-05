'use client';

// PRD #16 S1 — 통역사 글로벌 메타 편집 폼 (admin only).
// 저장 = `/api/admin/interpreters/[id]/global` POST (RPC update_interpreter_global_fields 래핑).
// "저장" 버튼 모드 — 인라인 자동저장 X. 사용자 메모리 룰: 자동저장 우선이지만, base_rate/등급은 신중 입력이라 명시 저장.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import type {
  InterpreterGlobalMeta,
  InterpreterGrade,
  InterpreterRehireStatus,
} from '@/types';

const GRADE_VALUES: InterpreterGrade[] = ['특급', '우수', '보통', '주의'];
const REHIRE_VALUES: InterpreterRehireStatus[] = ['가능', '불가', '보류'];
const NULL_VALUE = '__null__';

interface Props {
  interpreterId: string;
  initialMeta: InterpreterGlobalMeta | null;
}

export function InterpreterGlobalFieldsForm({ interpreterId, initialMeta }: Props) {
  const router = useRouter();
  const [grade, setGrade] = useState<InterpreterGrade | null>(initialMeta?.grade ?? null);
  const [baseRate, setBaseRate] = useState<string>(
    initialMeta?.base_rate !== null && initialMeta?.base_rate !== undefined
      ? String(initialMeta.base_rate)
      : '',
  );
  const [rehire, setRehire] = useState<InterpreterRehireStatus | null>(
    initialMeta?.rehire_status ?? null,
  );
  const [notes, setNotes] = useState<string>(initialMeta?.global_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSave() {
    // 음수 + NaN 가드
    let parsedRate: number | null = null;
    if (baseRate.trim()) {
      const n = Number(baseRate.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        toast.error('기준 요율은 0 이상의 숫자만 입력하세요.');
        return;
      }
      parsedRate = n;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/interpreters/${interpreterId}/global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade,
          base_rate: parsedRate,
          rehire_status: rehire,
          global_notes: notes.trim() ? notes : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || '저장 실패');
        return;
      }
      toast.success('저장되었습니다');
      startTransition(() => router.refresh());
    } catch {
      toast.error('네트워크 오류');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>등급</Label>
          <Select
            value={grade ?? NULL_VALUE}
            onValueChange={(v) => {
              const value = typeof v === 'string' ? v : '';
              setGrade(value === NULL_VALUE || !value ? null : (value as InterpreterGrade));
            }}
          >
            <SelectTrigger>
              <SelectValue>{grade ?? '미설정'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_VALUE}>미설정</SelectItem>
              {GRADE_VALUES.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>재섭외 가능 여부</Label>
          <Select
            value={rehire ?? NULL_VALUE}
            onValueChange={(v) => {
              const value = typeof v === 'string' ? v : '';
              setRehire(value === NULL_VALUE || !value ? null : (value as InterpreterRehireStatus));
            }}
          >
            <SelectTrigger>
              <SelectValue>{rehire ?? '미설정'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_VALUE}>미설정</SelectItem>
              {REHIRE_VALUES.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>기준 요율 (원/일)</Label>
          <Input
            type="number"
            min={0}
            step={1000}
            placeholder="예: 300000"
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>글로벌 노트</Label>
          <Textarea
            rows={4}
            placeholder="예: 오전 일찍 도착, 통역 명확. 다국적 행사 선호."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="text-xs text-slate-500">
            특정 이벤트가 아닌 통역사 본인 전체에 대한 누적 메모입니다. 이벤트별 평가는 별도 표에서 입력합니다.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}
