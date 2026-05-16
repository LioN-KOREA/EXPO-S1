'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building2, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import { BUYER_STATUS_COLOR } from './BuyerCardList';

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
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(buyer.buyer_status);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!selected) {
      toast.error(t.interpreter.selectStatusFirst);
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
      toast.error(t.common.saveFailedPrefix + error.message);
    } else {
      toast.success(t.interpreter.statusSaved);
      router.refresh();
      onClose();
    }
    setLoading(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.interpreter.buyerStatusModalTitle}</DialogTitle>
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
                <p className="text-xs text-slate-500">{t.interpreter.inChargePrefix}{buyer.buyer_name}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                {buyer.country && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {buyer.country}
                  </span>
                )}
                {buyer.booth_number && <span>{t.interpreter.boothPrefix}{buyer.booth_number}</span>}
              </div>
            </div>
          </div>

          {/* 상태 라디오 */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">{t.interpreter.buyerStatusCurrent}</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((key) => {
                const color = BUYER_STATUS_COLOR[key];
                const label = t.buyerStatus[key as keyof typeof t.buyerStatus] ?? key;
                const isActive = selected === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={`px-3 py-2.5 text-sm rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? `${color} text-white border-transparent`
                        : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSave} disabled={loading || !selected}>
            {loading ? t.interpreter.saving : t.interpreter.saveAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
