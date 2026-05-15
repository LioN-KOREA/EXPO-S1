'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  eventId: string;
  allDates: string[];
  selectedDate: string;
  selectedStatus: string;
}

const STATUSES = [
  { value: 'all', label: '전체 상태' },
  { value: 'scheduled', label: '상담전' },
  { value: 'in_progress', label: '상담중' },
  { value: 'completed', label: '완료' },
];

export function ScheduleDateFilter({ eventId, allDates, selectedDate, selectedStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    if (val === 'all' && key === 'status') p.delete(key);
    else p.set(key, val);
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <Select value={selectedDate} onValueChange={(v) => v && updateParam('date', v)}>
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="일자 선택" />
        </SelectTrigger>
        <SelectContent>
          {allDates.length === 0 ? (
            <SelectItem value="_none" disabled>일자 없음</SelectItem>
          ) : (
            allDates.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <Select value={selectedStatus} onValueChange={(v) => v && updateParam('status', v)}>
        <SelectTrigger className="w-[120px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
