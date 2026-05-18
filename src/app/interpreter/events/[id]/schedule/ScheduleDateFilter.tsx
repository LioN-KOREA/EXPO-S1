'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/context';

interface Props {
  eventId: string;
  allDates: string[];
  selectedDate: string;
  selectedStatus: string;
}

export function ScheduleDateFilter({ eventId, allDates, selectedDate, selectedStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const statuses = [
    { value: 'all', label: t.interpreter.filterAllStatus },
    { value: 'scheduled', label: t.interpreter.consultBefore },
    { value: 'in_progress', label: t.interpreter.consultIn },
    { value: 'completed', label: t.interpreter.consultDone },
  ];

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
          <SelectValue placeholder={t.interpreter.filterDatePlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {allDates.length === 0 ? (
            <SelectItem value="_none" disabled>{t.interpreter.filterDateEmpty}</SelectItem>
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
          {statuses.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
