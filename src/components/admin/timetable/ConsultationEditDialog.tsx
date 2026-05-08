'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Clock, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { TimeSlot, BuyerData, SellerData, ConsultationData, Interpreter } from './types';

interface ConsultationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultation: ConsultationData | null;
  timeSlot: TimeSlot | null;
  buyers: BuyerData[];
  sellers: SellerData[];
  interpreters: Interpreter[];
  onSaved: (updated: Partial<ConsultationData> & { id: string }) => void;
}

export function ConsultationEditDialog({
  open,
  onOpenChange,
  consultation,
  timeSlot,
  buyers,
  sellers,
  interpreters,
  onSaved,
}: ConsultationEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [buyerId, setBuyerId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [interpreterId, setInterpreterId] = useState('');
  const [memo, setMemo] = useState('');

  // 현재 바이어의 부스번호
  const currentBuyer = buyers.find(b => b.id === buyerId);

  // open 변경 시 form state 리셋
  useEffect(() => {
    if (open && consultation) {
      setBuyerId(consultation.buyer_id);
      setSellerId(consultation.seller_id || '');
      setInterpreterId(consultation.interpreter_id || '');
      setMemo(consultation.memo || '');
    }
  }, [open, consultation]);

  async function handleSave() {
    if (!consultation) return;
    setSaving(true);

    const body: Record<string, unknown> = {};
    if (sellerId !== (consultation.seller_id || '')) body.seller_id = sellerId || null;
    if (interpreterId !== (consultation.interpreter_id || '')) body.interpreter_id = interpreterId || null;
    if (memo !== (consultation.memo || '')) body.memo = memo || null;

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/consultations/${consultation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || '수정에 실패했습니다');
        setSaving(false);
        return;
      }

      // 로컬 상태 업데이트를 위해 변경 내용 전달
      const updated: Partial<ConsultationData> & { id: string } = { id: consultation.id };
      if ('seller_id' in body) {
        updated.seller_id = body.seller_id as string;
        const seller = sellers.find(s => s.id === body.seller_id);
        if (seller) updated.seller = { company_name: seller.company_name, company_name_kr: seller.company_name_kr, contact_name: seller.contact_name };
      }
      if ('interpreter_id' in body) updated.interpreter_id = body.interpreter_id as string | null;
      if ('memo' in body) updated.memo = body.memo as string | null;

      onSaved(updated);
      toast.success('수정되었습니다');
      onOpenChange(false);
    } catch {
      toast.error('수정 중 오류가 발생했습니다');
    }
    setSaving(false);
  }

  if (!consultation || !timeSlot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg">상담 상세 수정</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 시간 (읽기전용) */}
          <div>
            <Label className="text-xs text-muted-foreground">상담시간</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="gap-1">
                <Clock className="w-3 h-3" />
                {timeSlot.date} {timeSlot.start_time} - {timeSlot.end_time}
              </Badge>
            </div>
          </div>

          {/* 부스번호 (읽기전용, 바이어에 종속) */}
          <div>
            <Label className="text-xs text-muted-foreground">부스번호</Label>
            <Input
              value={currentBuyer?.booth_number || '-'}
              disabled
              className="mt-1 h-9 text-sm bg-muted"
            />
          </div>

          {/* 바이어 (읽기전용) */}
          <div>
            <Label className="text-xs text-muted-foreground">바이어</Label>
            <Input
              value={`${currentBuyer?.company_name || '-'} (${currentBuyer?.country || ''})`}
              disabled
              className="mt-1 h-9 text-sm bg-muted"
            />
          </div>

          {/* 셀러 */}
          <div>
            <Label className="text-xs text-muted-foreground">셀러</Label>
            <Select value={sellerId || null} onValueChange={(v) => setSellerId(v ?? '')}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder="셀러 선택" />
              </SelectTrigger>
              <SelectContent>
                {sellers.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.company_name_kr || s.company_name} - {s.contact_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 통역사 */}
          <div>
            <Label className="text-xs text-muted-foreground">통역사</Label>
            <Select value={interpreterId || '_none'} onValueChange={(v) => setInterpreterId(!v || v === '_none' ? '' : v)}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder="통역사 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none" className="text-sm text-muted-foreground">미배정</SelectItem>
                {interpreters.map(i => (
                  <SelectItem key={i.id} value={i.id} className="text-sm">
                    {i.name} ({i.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 비고 */}
          <div>
            <Label className="text-xs text-muted-foreground">비고</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 입력..."
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* 저장 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
