'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export function ScheduleAddButton() {
  return (
    <Button
      variant="outline"
      onClick={() => toast.info('스케줄 추가는 관리자에게 문의해주세요')}
      className="gap-1.5"
    >
      <Plus className="w-4 h-4" />
      스케줄 추가
    </Button>
  );
}
