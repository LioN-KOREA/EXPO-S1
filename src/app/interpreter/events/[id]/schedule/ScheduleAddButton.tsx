'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import { SearchableSelect } from '@/components/admin/timetable/ConsultationEditDialog';

interface SlotOpt { id: string; date: string; start_time: string; end_time: string; }
interface BuyerOpt { id: string; company_name: string; country: string; booth_number: string; }
interface SellerOpt { id: string; company_name: string; company_name_kr: string; contact_name: string; }

interface Props {
  eventId: string;
  slots: SlotOpt[];
  buyers: BuyerOpt[];
  sellers: SellerOpt[];
}

export function ScheduleAddButton({ eventId, slots, buyers, sellers }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [slotId, setSlotId] = useState('');
  // 바이어: 기존 선택 또는 새 업체 입력
  const [buyerNew, setBuyerNew] = useState(false);
  const [buyerId, setBuyerId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerCountry, setBuyerCountry] = useState('');
  // 셀러
  const [sellerNew, setSellerNew] = useState(false);
  const [sellerId, setSellerId] = useState('');
  const [sellerName, setSellerName] = useState('');

  function reset() {
    setSlotId(''); setBuyerNew(false); setBuyerId(''); setBuyerName(''); setBuyerCountry('');
    setSellerNew(false); setSellerId(''); setSellerName('');
  }
  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  async function handleSave() {
    const buyerOk = buyerNew ? buyerName.trim() : buyerId;
    const sellerOk = sellerNew ? sellerName.trim() : sellerId;
    if (!slotId || !buyerOk || !sellerOk) {
      toast.error(t.interpreter.scheduleAddRequired);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { event_id: eventId, time_slot_id: slotId };
      if (buyerNew) payload.new_buyer = { company_name: buyerName.trim(), country: buyerCountry.trim() };
      else payload.buyer_id = buyerId;
      if (sellerNew) payload.new_seller = { company_name: sellerName.trim() };
      else payload.seller_id = sellerId;

      const res = await fetch('/api/interpreter/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t.interpreter.scheduleAddFailed); return; }
      toast.success(t.interpreter.scheduleAddSuccess);
      handleOpenChange(false);
      router.refresh();
    } catch { toast.error(t.interpreter.scheduleAddFailed); }
    finally { setSaving(false); }
  }

  // 시간 슬롯이 없으면 추가 자체 불가 (바이어/셀러는 새로 입력 가능하므로 목록 비어도 됨)
  const noSlots = slots.length === 0;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="w-4 h-4" />
        {t.interpreter.scheduleAdd}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.interpreter.scheduleAdd}</DialogTitle>
            <DialogDescription>{t.interpreter.scheduleAddDesc}</DialogDescription>
          </DialogHeader>

          {noSlots ? (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-3 mt-2">{t.interpreter.scheduleAddNoData}</p>
          ) : (
            <div className="space-y-4 mt-2">
              <SearchableSelect
                label={t.interpreter.selectTime}
                items={slots}
                value={slotId}
                onChange={setSlotId}
                renderItem={(s) => <span>{s.date} {s.start_time} - {s.end_time}</span>}
                renderSelected={(s) => `${s.date} ${s.start_time} - ${s.end_time}`}
                searchFn={(s, q) => `${s.date} ${s.start_time} ${s.end_time}`.toLowerCase().includes(q)}
                placeholder={t.interpreter.selectTime}
              />

              {/* 바이어 */}
              <div className="space-y-1.5">
                {buyerNew ? (
                  <>
                    <Label className="text-xs text-muted-foreground">{t.interpreter.newBuyerLabel}</Label>
                    <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder={t.interpreter.companyNamePh} maxLength={200} className="h-9 text-sm" />
                    <Input value={buyerCountry} onChange={(e) => setBuyerCountry(e.target.value)} placeholder={t.interpreter.countryPh} maxLength={80} className="h-9 text-sm" />
                  </>
                ) : (
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
                )}
                <button type="button" onClick={() => setBuyerNew(v => !v)} className="text-xs text-rose-600 hover:underline">
                  {buyerNew ? t.interpreter.pickFromList : t.interpreter.newCompanyToggle}
                </button>
              </div>

              {/* 셀러 */}
              <div className="space-y-1.5">
                {sellerNew ? (
                  <>
                    <Label className="text-xs text-muted-foreground">{t.interpreter.newSellerLabel}</Label>
                    <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder={t.interpreter.companyNamePh} maxLength={200} className="h-9 text-sm" />
                  </>
                ) : (
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
                )}
                <button type="button" onClick={() => setSellerNew(v => !v)} className="text-xs text-rose-600 hover:underline">
                  {sellerNew ? t.interpreter.pickFromList : t.interpreter.newCompanyToggle}
                </button>
              </div>

              <p className="text-[11px] text-slate-400">{t.interpreter.newCompanyHint}</p>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {t.interpreter.scheduleAdd}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
