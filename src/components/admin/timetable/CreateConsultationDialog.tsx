'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from './ConsultationEditDialog';
import type { TimeSlot, BuyerData, SellerData, ConsultationData, Interpreter } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  slots: TimeSlot[];
  buyers: BuyerData[];
  sellers: SellerData[];
  interpreters: Interpreter[];
  onCreated: (consultation: ConsultationData) => void;
}

// 무손실 단건 상담 추가. 예정에 없던 현장 상담을 재업로드 없이 등록.
export function CreateConsultationDialog({ open, onOpenChange, eventId, slots, buyers, sellers, interpreters, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [slotId, setSlotId] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [interpreterId, setInterpreterId] = useState('');

  // 닫힐 때 폼 초기화 → 다음에 열면 항상 빈 상태 (effect 없이 이벤트에서 처리)
  function handleOpenChange(next: boolean) {
    if (!next) { setSlotId(''); setBuyerId(''); setSellerId(''); setInterpreterId(''); }
    onOpenChange(next);
  }

  async function handleSave() {
    if (!slotId || !buyerId || !sellerId) {
      toast.error('시간·바이어·셀러는 필수입니다');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          time_slot_id: slotId,
          buyer_id: buyerId,
          seller_id: sellerId,
          interpreter_id: interpreterId && interpreterId !== '_none' ? interpreterId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '상담 추가 실패'); return; }
      const seller = sellers.find(s => s.id === sellerId);
      onCreated({
        ...data.consultation,
        seller: seller ? { company_name: seller.company_name, company_name_kr: seller.company_name_kr, contact_name: seller.contact_name } : null,
      });
      toast.success('상담이 추가되었습니다');
      handleOpenChange(false);
    } catch { toast.error('상담 추가 중 오류'); }
    finally { setSaving(false); }
  }

  const noParticipants = buyers.length === 0 || sellers.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">상담 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {noParticipants && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">
              바이어·셀러가 없으면 먼저 <b>참가자 등록 → 바이어/셀러 개별 추가</b>에서 등록하세요.
            </p>
          )}

          <SearchableSelect
            label="상담시간"
            items={slots}
            value={slotId}
            onChange={setSlotId}
            renderItem={(s) => <span>{s.date} {s.start_time} - {s.end_time}</span>}
            renderSelected={(s) => `${s.date} ${s.start_time} - ${s.end_time}`}
            searchFn={(s, q) => `${s.date} ${s.start_time} ${s.end_time}`.toLowerCase().includes(q)}
            placeholder="시간 선택"
          />

          <SearchableSelect
            label="바이어"
            items={buyers}
            value={buyerId}
            onChange={setBuyerId}
            renderItem={(b) => (
              <div className="flex items-center justify-between">
                <span>{b.company_name}</span>
                <span className="text-xs text-slate-400">{b.country} {b.booth_number ? `[${b.booth_number}]` : ''}</span>
              </div>
            )}
            renderSelected={(b) => `${b.company_name} (${b.country})`}
            searchFn={(b, q) => b.company_name.toLowerCase().includes(q) || b.country.toLowerCase().includes(q) || (b.booth_number || '').toLowerCase().includes(q)}
            placeholder="바이어 선택"
          />

          <SearchableSelect
            label="셀러"
            items={sellers}
            value={sellerId}
            onChange={setSellerId}
            renderItem={(s) => (
              <div>
                <span className="font-medium">{s.company_name_kr || s.company_name}</span>
                {s.contact_name && <span className="text-xs text-slate-400 ml-2">{s.contact_name}</span>}
              </div>
            )}
            renderSelected={(s) => s.company_name_kr || s.company_name}
            searchFn={(s, q) => s.company_name.toLowerCase().includes(q) || (s.company_name_kr || '').toLowerCase().includes(q) || (s.contact_name || '').toLowerCase().includes(q)}
            placeholder="셀러 선택"
          />

          <SearchableSelect
            label="통역사"
            items={interpreters}
            value={interpreterId}
            onChange={setInterpreterId}
            renderItem={(i) => (
              <div className="flex items-center justify-between">
                <span>{i.name}</span>
                <span className="text-xs text-slate-400">{i.email}</span>
              </div>
            )}
            renderSelected={(i) => i.name}
            searchFn={(i, q) => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)}
            placeholder="통역사 선택"
            allowNone
            noneLabel="미배정"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={saving}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? '추가 중...' : '상담 추가'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
