'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
  const [buyerId, setBuyerId] = useState('');
  const [sellerId, setSellerId] = useState('');

  function handleOpenChange(next: boolean) {
    if (!next) { setSlotId(''); setBuyerId(''); setSellerId(''); }
    setOpen(next);
  }

  async function handleSave() {
    if (!slotId || !buyerId || !sellerId) {
      toast.error(t.interpreter.scheduleAddRequired);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/interpreter/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, time_slot_id: slotId, buyer_id: buyerId, seller_id: sellerId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t.interpreter.scheduleAddFailed); return; }
      toast.success(t.interpreter.scheduleAddSuccess);
      handleOpenChange(false);
      router.refresh();
    } catch { toast.error(t.interpreter.scheduleAddFailed); }
    finally { setSaving(false); }
  }

  const noData = slots.length === 0 || buyers.length === 0 || sellers.length === 0;

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

          {noData ? (
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

              <div className="flex justify-end gap-2 pt-2">
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
