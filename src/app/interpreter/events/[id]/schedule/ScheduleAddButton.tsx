'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';

export function ScheduleAddButton() {
  const { t } = useI18n();
  return (
    <Button
      variant="outline"
      onClick={() => toast.info(t.interpreter.addScheduleAskAdmin)}
      className="gap-1.5"
    >
      <Plus className="w-4 h-4" />
      {t.interpreter.scheduleAdd}
    </Button>
  );
}
