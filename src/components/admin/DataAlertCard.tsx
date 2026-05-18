'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface AlertItem {
  id: string;
  missing_keys: string[];
  note: string | null;
  status: 'pending' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

interface Props {
  alert: AlertItem;
  keyLabelMap: Record<string, string>;
}

export function DataAlertCard({ alert, keyLabelMap }: Props) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);

  const labels = alert.missing_keys.map((k) => keyLabelMap[k] ?? k);

  async function resolve() {
    setResolving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('consultation_data_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
      })
      .eq('id', alert.id)
      .eq('status', 'pending');
    if (error) {
      toast.error('처리 실패: ' + error.message);
    } else {
      toast.success('확인 완료 처리되었습니다');
      router.refresh();
    }
    setResolving(false);
  }

  if (alert.status === 'resolved') {
    return (
      <Card className="border-0 shadow-sm mb-6 bg-emerald-50/50 border-emerald-100">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-700">데이터 확인 완료</p>
              <p className="text-xs text-slate-500 mt-1">
                {alert.resolved_at && new Date(alert.resolved_at).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm mb-6 bg-amber-50/50 border-amber-100">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-700">통역사 데이터 확인 요청</p>
            <p className="text-xs text-amber-600 mt-1">
              비어 있거나 잘못된 항목: <span className="font-medium">{labels.join(', ')}</span>
            </p>
            {alert.note && (
              <p className="text-xs text-slate-600 mt-2 bg-white/50 rounded p-2">
                메모: {alert.note}
              </p>
            )}
            <p className="text-[11px] text-slate-500 mt-2">
              요청: {new Date(alert.created_at).toLocaleString('ko-KR')}
            </p>
            <Button
              size="sm"
              onClick={resolve}
              disabled={resolving}
              className="mt-3 gap-1.5 bg-amber-500 hover:bg-amber-600"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {resolving ? '처리 중...' : '확인 완료'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
