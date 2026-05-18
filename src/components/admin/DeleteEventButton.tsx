'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('이 상담회를 삭제하시겠습니까?\n삭제 후에도 상담회 목록에서 복구할 수 있습니다.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '삭제에 실패했습니다');
        return;
      }

      toast.success('상담회가 삭제되었습니다');
      router.push('/admin/events');
    } catch {
      toast.error('삭제 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
      className="w-full sm:w-auto h-10 sm:h-7 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
    >
      <Trash2 className="w-4 h-4 mr-1" />
      {loading ? '삭제 중...' : '삭제'}
    </Button>
  );
}
