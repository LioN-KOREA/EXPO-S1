'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building2, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { BUYER_STATUS_LABEL } from './BuyerCardList';

interface Buyer {
  id: string;
  company_name: string;
  buyer_name: string;
  country: string;
  booth_number: string;
  buyer_status: string | null;
  consultation_ids: string[];
}

interface Props {
  buyer: Buyer;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  'MET_INTERPRETER',
  'BUS_BOARDED',
  'INDIVIDUAL_MOVE',
  'WAITING',
  'ABSENT',
  'ONSITE_MATCH_AVAILABLE',
  'ONSITE_MATCH_DONE',
];

export function BuyerStatusModal({ buyer, onClose }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(buyer.buyer_status);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!selected) {
      toast.error('상태를 선택해주세요');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    // 해당 바이어의 본인 배정 상담 전체에 동일 상태 적용
    const { error } = await supabase
      .from('consultations')
      .update({ buyer_status: selected })
      .in('id', buyer.consultation_ids);

    if (error) {
      toast.error('저장 실패: ' + error.message);
    } else {
      toast.success('상태가 저장되었습니다');
      router.refresh();
      onClose();
    }
    setLoading(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>바이어 상태 변경</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 바이어 정보 */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground truncate">{buyer.company_name}</p>
              {buyer.buyer_name && (
                <p className="text-xs text-slate-500">담당: {buyer.buyer_name}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                {buyer.country && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {buyer.country}
                  </span>
                )}
                {buyer.booth_number && <span>부스 {buyer.booth_number}</span>}
              </div>
            </div>
          </div>

          {/* 상태 라디오 */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">현재 상태</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((key) => {
                const info = BUYER_STATUS_LABEL[key];
                const isActive = selected === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={`px-3 py-2.5 text-sm rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? `${info.color} text-white border-transparent`
                        : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 text-foreground'
                    }`}
                  >
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={loading || !selected}>
            {loading ? '저장 중...' : '저장하기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
