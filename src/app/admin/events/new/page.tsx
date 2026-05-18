'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const startDate = formData.get('start_date') as string;
    const endDate = formData.get('end_date') as string;

    if (endDate < startDate) {
      toast.error('종료일은 시작일보다 같거나 이후여야 합니다.');
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.from('events').insert({
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      start_date: startDate,
      end_date: endDate,
    });

    if (error) {
      toast.error('상담회 생성에 실패했습니다.');
      setLoading(false);
      return;
    }

    toast.success('상담회가 생성되었습니다.');
    router.push('/admin/events');
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/admin/events" className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          상담회 목록으로
        </Link>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">새 상담회 생성</h2>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">상담회 명칭 *</Label>
              <Input
                id="name"
                name="name"
                placeholder="예: 2025 자동차부품 수출상담회"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="상담회에 대한 간단한 설명"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">시작일 *</Label>
                <Input id="start_date" name="start_date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">종료일 *</Label>
                <Input id="end_date" name="end_date" type="date" required />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="submit"
                className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                disabled={loading}
              >
                {loading ? '생성 중...' : '상담회 생성'}
              </Button>
              <Link href="/admin/events" className="w-full sm:w-auto">
                <Button type="button" variant="outline" className="w-full sm:w-auto">취소</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
