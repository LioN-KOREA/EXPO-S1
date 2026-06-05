'use client';

// PRD #16 S1 — 통역사 목록 화면의 검색·필터 client 컴포넌트.
// 외부 IF = 초기값 props + URLSearchParams 갱신.
// router.replace 로 query 만 갱신 → server component 재렌더(SSR refetch).

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { InterpreterGrade, InterpreterRehireStatus } from '@/types';

const GRADE_VALUES: InterpreterGrade[] = ['특급', '우수', '보통', '주의'];
const REHIRE_VALUES: InterpreterRehireStatus[] = ['가능', '불가', '보류'];

const ALL_VALUE = '__all__';

interface Props {
  initialSearch: string;
  initialGrade: InterpreterGrade | null;
  initialRehire: InterpreterRehireStatus | null;
}

export function InterpreterListFilter({ initialSearch, initialGrade, initialRehire }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [, startTransition] = useTransition();

  // back/forward 또는 외부 query 변경 → input 상태 재동기화 (SSR 값과 UI 일치).
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  // search input 디바운스 — 350ms 입력 멈춤 후 URL 갱신.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (search === initialSearch) return;
      updateParam('q', search);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL_VALUE) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.replace(`/admin/interpreters?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="이름·이메일·전화 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      <Select
        value={initialGrade ?? ALL_VALUE}
        onValueChange={(v) => updateParam('grade', typeof v === 'string' ? v : '')}
      >
        <SelectTrigger className="w-full sm:w-[160px] h-9">
          <SelectValue>{initialGrade ?? '등급 (전체)'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>등급 (전체)</SelectItem>
          {GRADE_VALUES.map((g) => (
            <SelectItem key={g} value={g}>{g}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={initialRehire ?? ALL_VALUE}
        onValueChange={(v) => updateParam('rehire', typeof v === 'string' ? v : '')}
      >
        <SelectTrigger className="w-full sm:w-[160px] h-9">
          <SelectValue>{initialRehire ?? '재섭외 (전체)'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>재섭외 (전체)</SelectItem>
          {REHIRE_VALUES.map((r) => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
