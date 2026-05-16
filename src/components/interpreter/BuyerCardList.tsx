'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { BuyerStatusModal } from './BuyerStatusModal';

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
  buyers: Buyer[];
}

export const BUYER_STATUS_COLOR: Record<string, string> = {
  MET_INTERPRETER: 'bg-rose-500',
  BUS_BOARDED: 'bg-emerald-500',
  INDIVIDUAL_MOVE: 'bg-blue-500',
  WAITING: 'bg-slate-400',
  ABSENT: 'bg-red-500',
  ONSITE_MATCH_AVAILABLE: 'bg-amber-400',
  ONSITE_MATCH_DONE: 'bg-emerald-600',
};

export function BuyerCardList({ buyers }: Props) {
  const { t } = useI18n();
  const [openBuyer, setOpenBuyer] = useState<Buyer | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {buyers.map((b) => {
          const statusKey = b.buyer_status;
          const statusColor = statusKey ? BUYER_STATUS_COLOR[statusKey] : null;
          const statusLabel = statusKey
            ? (t.buyerStatus[statusKey as keyof typeof t.buyerStatus] ?? statusKey)
            : null;
          return (
            <Card
              key={b.id}
              className="border-0 shadow-sm cursor-pointer hover:shadow-lg transition-all"
              onClick={() => setOpenBuyer(b)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{b.company_name}</p>
                    {b.buyer_name && (
                      <p className="text-xs text-slate-500 truncate">{t.interpreter.inChargePrefix}{b.buyer_name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {b.country && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-500">
                          <MapPin className="w-3 h-3" />
                          {b.country}
                        </span>
                      )}
                      {b.booth_number && (
                        <span className="text-xs text-slate-500">{t.interpreter.boothPrefix}{b.booth_number}</span>
                      )}
                      {statusLabel && statusColor ? (
                        <Badge className={`text-xs ${statusColor} text-white border-0`}>
                          {statusLabel}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{t.interpreter.noStatus}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {openBuyer && (
        <BuyerStatusModal
          buyer={openBuyer}
          onClose={() => setOpenBuyer(null)}
        />
      )}
    </>
  );
}
