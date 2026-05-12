'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, Save, Loader2, Search, X } from 'lucide-react';
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

// 검색 가능한 선택 컴포넌트
function SearchableSelect<T extends { id: string }>({
  label,
  items,
  value,
  onChange,
  renderItem,
  renderSelected,
  searchFn,
  placeholder,
  allowNone,
  noneLabel,
}: {
  label: string;
  items: T[];
  value: string;
  onChange: (id: string) => void;
  renderItem: (item: T) => React.ReactNode;
  renderSelected: (item: T) => string;
  searchFn: (item: T, query: string) => boolean;
  placeholder: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedItem = items.find(i => i.id === value);
  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter(i => searchFn(i, search.toLowerCase()));
  }, [items, search, searchFn]);

  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative mt-1">
        <div
          className="flex items-center h-9 px-3 border rounded-md text-sm cursor-pointer hover:border-slate-400 transition-colors bg-card"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={`flex-1 truncate ${!selectedItem && (!value || value === '_none') ? 'text-muted-foreground' : 'text-foreground'}`}>
            {selectedItem ? renderSelected(selectedItem) : (allowNone ? (noneLabel || '미지정') : placeholder)}
          </span>
          {selectedItem && (
            <button
              type="button"
              className="ml-1 p-0.5 hover:bg-slate-100 rounded"
              onClick={(e) => { e.stopPropagation(); onChange(''); setIsOpen(false); }}
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`${label} 검색...`}
                  className="h-8 pl-7 text-xs"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {allowNone && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                  onClick={() => { onChange('_none'); setIsOpen(false); setSearch(''); }}
                >
                  {noneLabel || '미지정'}
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">검색 결과 없음</p>
              ) : (
                filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${item.id === value ? 'bg-blue-50 text-blue-700' : ''}`}
                    onClick={() => { onChange(item.id); setIsOpen(false); setSearch(''); }}
                  >
                    {renderItem(item)}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
  const [boothNumber, setBoothNumber] = useState('');
  const [boothDirty, setBoothDirty] = useState(false);

  useEffect(() => {
    if (open && consultation) {
      setBuyerId(consultation.buyer_id);
      setSellerId(consultation.seller_id || '');
      setInterpreterId(consultation.interpreter_id || '');
      setMemo(consultation.memo || '');
      const buyer = buyers.find(b => b.id === consultation.buyer_id);
      setBoothNumber(buyer?.booth_number || '');
      setBoothDirty(false);
    }
  }, [open, consultation, buyers]);

  // 바이어 변경 시 부스번호 동기화 (dirty 리셋)
  useEffect(() => {
    if (buyerId) {
      const buyer = buyers.find(b => b.id === buyerId);
      setBoothNumber(buyer?.booth_number || '');
      setBoothDirty(false);
    }
  }, [buyerId, buyers]);

  async function handleSave() {
    if (!consultation) return;
    setSaving(true);

    const body: Record<string, unknown> = {};
    if (buyerId !== consultation.buyer_id) body.buyer_id = buyerId;
    if (sellerId !== (consultation.seller_id || '')) body.seller_id = sellerId || null;
    if (interpreterId !== (consultation.interpreter_id || '')) {
      body.interpreter_id = (!interpreterId || interpreterId === '_none') ? null : interpreterId;
    }
    if (memo !== (consultation.memo || '')) body.memo = memo || null;

    // 부스번호: 사용자가 직접 수정했을 때만 전송
    if (boothDirty) {
      body.booth_number = boothNumber || null;
    }

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

      const updated: Partial<ConsultationData> & { id: string } = { id: consultation.id };
      if ('buyer_id' in body) updated.buyer_id = body.buyer_id as string;
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
      <DialogContent className="sm:max-w-[520px]">
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

          {/* 바이어 (검색) */}
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
            searchFn={(b, q) =>
              b.company_name.toLowerCase().includes(q) ||
              b.country.toLowerCase().includes(q) ||
              (b.booth_number || '').toLowerCase().includes(q)
            }
            placeholder="바이어 선택"
          />

          {/* 부스번호 (수정 가능) */}
          <div>
            <Label className="text-xs text-muted-foreground">부스번호</Label>
            <Input
              value={boothNumber}
              onChange={(e) => { setBoothNumber(e.target.value); setBoothDirty(true); }}
              placeholder="예: A01"
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* 셀러 (검색) */}
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
            searchFn={(s, q) =>
              s.company_name.toLowerCase().includes(q) ||
              (s.company_name_kr || '').toLowerCase().includes(q) ||
              (s.contact_name || '').toLowerCase().includes(q)
            }
            placeholder="셀러 선택"
          />

          {/* 통역사 (검색) */}
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
            searchFn={(i, q) =>
              i.name.toLowerCase().includes(q) ||
              i.email.toLowerCase().includes(q)
            }
            placeholder="통역사 선택"
            allowNone
            noneLabel="미배정"
          />

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
