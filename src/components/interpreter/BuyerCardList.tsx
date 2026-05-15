'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin } from 'lucide-react';
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

export const BUYER_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  MET_INTERPRETER: { label: '통역사와만남', color: 'bg-rose-500' },
  BUS_BOARDED: { label: '버스탑승', color: 'bg-emerald-500' },
  INDIVIDUAL_MOVE: { label: '개별이동', color: 'bg-blue-500' },
  WAITING: { label: '대기중', color: 'bg-slate-400' },
  ABSENT: { label: '불참/부재', color: 'bg-red-500' },
  ONSITE_MATCH_AVAILABLE: { label: '현장매칭가능', color: 'bg-amber-400' },
  ONSITE_MATCH_DONE: { label: '현장매칭완료', color: 'bg-emerald-600' },
};

export function BuyerCardList({ buyers }: Props) {
  const [openBuyer, setOpenBuyer] = useState<Buyer | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {buyers.map((b) => {
          const statusInfo = b.buyer_status ? BUYER_STATUS_LABEL[b.buyer_status] : null;
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
                      <p className="text-xs text-slate-500 truncate">담당: {b.buyer_name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {b.country && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-500">
                          <MapPin className="w-3 h-3" />
                          {b.country}
                        </span>
                      )}
                      {b.booth_number && (
                        <span className="text-xs text-slate-500">부스 {b.booth_number}</span>
                      )}
                      {statusInfo ? (
                        <Badge className={`text-xs ${statusInfo.color} text-white border-0`}>
                          {statusInfo.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">상태없음</Badge>
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
