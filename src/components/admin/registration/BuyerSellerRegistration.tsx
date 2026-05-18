'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Building2, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface BuyerForm { company_name: string; buyer_name: string; country: string; booth_number: string; phone: string; email: string; }
interface SellerForm { company_name: string; company_name_kr: string; contact_name: string; contact_phone: string; email: string; }
interface BuyerRow { id: string; company_name: string; buyer_name: string; country: string; booth_number: string; email: string; }
interface SellerRow { id: string; company_name: string; company_name_kr: string; contact_name: string; email: string; }

const emptyBuyer: BuyerForm = { company_name: '', buyer_name: '', country: '', booth_number: '', phone: '', email: '' };
const emptySeller: SellerForm = { company_name: '', company_name_kr: '', contact_name: '', contact_phone: '', email: '' };

export function BuyerSellerRegistration({ eventId }: { eventId: string }) {
  const [buyerForm, setBuyerForm] = useState<BuyerForm>(emptyBuyer);
  const [sellerForm, setSellerForm] = useState<SellerForm>(emptySeller);
  const [saving, setSaving] = useState(false);
  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const supabase = createClient();
    const [buyersRes, sellersRes] = await Promise.all([
      supabase.from('buyers').select('id, company_name, buyer_name, country, booth_number, email').eq('event_id', eventId).order('company_name'),
      supabase.from('sellers').select('id, company_name, company_name_kr, contact_name, email').eq('event_id', eventId).order('company_name'),
    ]);
    setBuyers(buyersRes.data || []);
    setSellers(sellersRes.data || []);
    setLoadingData(false);
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAddBuyer() {
    if (!buyerForm.company_name.trim() || !buyerForm.country.trim()) {
      toast.error('회사명과 국가는 필수입니다');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buyerForm, event_id: eventId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '등록 실패'); return; }
      toast.success(`바이어 "${buyerForm.company_name}" 등록 완료`);
      setBuyerForm(emptyBuyer);
      loadData();
    } catch { toast.error('등록 중 오류'); }
    finally { setSaving(false); }
  }

  async function handleAddSeller() {
    if (!sellerForm.company_name.trim()) {
      toast.error('회사명은 필수입니다');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sellerForm, event_id: eventId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '등록 실패'); return; }
      toast.success(`셀러 "${sellerForm.company_name_kr || sellerForm.company_name}" 등록 완료`);
      setSellerForm(emptySeller);
      loadData();
    } catch { toast.error('등록 중 오류'); }
    finally { setSaving(false); }
  }

  async function handleDeleteBuyer(id: string) {
    if (!confirm('이 바이어를 삭제하시겠습니까?')) return;
    const supabase = createClient();
    const { error } = await supabase.from('buyers').delete().eq('id', id);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('바이어 삭제됨');
    loadData();
  }

  async function handleDeleteSeller(id: string) {
    if (!confirm('이 셀러를 삭제하시겠습니까?')) return;
    const supabase = createClient();
    const { error } = await supabase.from('sellers').delete().eq('id', id);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('셀러 삭제됨');
    loadData();
  }

  return (
    <Tabs defaultValue="buyer">
      <TabsList className="mb-4">
        <TabsTrigger value="buyer">바이어 ({buyers.length})</TabsTrigger>
        <TabsTrigger value="seller">셀러 ({sellers.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="buyer">
        <div className="space-y-4">
          {/* 바이어 추가 폼 */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="w-4 h-4" />바이어 추가</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-xs">회사명 *</Label>
                  <Input value={buyerForm.company_name} onChange={e => setBuyerForm(f => ({ ...f, company_name: e.target.value }))} placeholder="회사명" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">담당자명</Label>
                  <Input value={buyerForm.buyer_name} onChange={e => setBuyerForm(f => ({ ...f, buyer_name: e.target.value }))} placeholder="담당자명" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">국가 *</Label>
                  <Input value={buyerForm.country} onChange={e => setBuyerForm(f => ({ ...f, country: e.target.value }))} placeholder="국가" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">부스번호</Label>
                  <Input value={buyerForm.booth_number} onChange={e => setBuyerForm(f => ({ ...f, booth_number: e.target.value }))} placeholder="부스번호" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">이메일</Label>
                  <Input value={buyerForm.email} onChange={e => setBuyerForm(f => ({ ...f, email: e.target.value }))} placeholder="이메일" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">전화번호</Label>
                  <Input value={buyerForm.phone} onChange={e => setBuyerForm(f => ({ ...f, phone: e.target.value }))} placeholder="전화번호" className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <Button size="sm" onClick={handleAddBuyer} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                {saving ? '등록 중...' : '바이어 등록'}
              </Button>
            </CardContent>
          </Card>

          {/* 바이어 목록 */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">등록된 바이어 ({buyers.length})</CardTitle></CardHeader>
            <CardContent>
              {loadingData ? <p className="text-sm text-slate-500">로딩 중...</p> : buyers.length === 0 ? (
                <p className="text-sm text-slate-500">등록된 바이어가 없습니다</p>
              ) : (
                <div className="border rounded-lg max-h-[400px] overflow-auto">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">회사명</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">담당자</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">국가</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">부스</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">이메일</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {buyers.map((b, i) => (
                        <tr key={b.id} className={i % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                          <td className="px-3 py-2 font-medium text-foreground">{b.company_name}</td>
                          <td className="px-3 py-2 text-slate-500">{b.buyer_name}</td>
                          <td className="px-3 py-2 text-slate-500">{b.country}</td>
                          <td className="px-3 py-2">{b.booth_number && <Badge variant="secondary" className="text-xs">{b.booth_number}</Badge>}</td>
                          <td className="px-3 py-2 text-slate-500">{b.email}</td>
                          <td className="px-2 py-2">
                            <button onClick={() => handleDeleteBuyer(b.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="seller">
        <div className="space-y-4">
          {/* 셀러 추가 폼 */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" />셀러 추가</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-xs">회사명(영문) *</Label>
                  <Input value={sellerForm.company_name} onChange={e => setSellerForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company Name" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">회사명(한글)</Label>
                  <Input value={sellerForm.company_name_kr} onChange={e => setSellerForm(f => ({ ...f, company_name_kr: e.target.value }))} placeholder="회사명" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">담당자명</Label>
                  <Input value={sellerForm.contact_name} onChange={e => setSellerForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="담당자명" className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">전화번호</Label>
                  <Input value={sellerForm.contact_phone} onChange={e => setSellerForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="전화번호" className="mt-1 h-9 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">이메일</Label>
                  <Input value={sellerForm.email} onChange={e => setSellerForm(f => ({ ...f, email: e.target.value }))} placeholder="이메일" className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <Button size="sm" onClick={handleAddSeller} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
                {saving ? '등록 중...' : '셀러 등록'}
              </Button>
            </CardContent>
          </Card>

          {/* 셀러 목록 */}
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">등록된 셀러 ({sellers.length})</CardTitle></CardHeader>
            <CardContent>
              {loadingData ? <p className="text-sm text-slate-500">로딩 중...</p> : sellers.length === 0 ? (
                <p className="text-sm text-slate-500">등록된 셀러가 없습니다</p>
              ) : (
                <div className="border rounded-lg max-h-[400px] overflow-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">회사명(한글)</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">회사명(영문)</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">담당자</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">이메일</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sellers.map((s, i) => (
                        <tr key={s.id} className={i % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                          <td className="px-3 py-2 font-medium text-foreground">{s.company_name_kr || '-'}</td>
                          <td className="px-3 py-2 text-slate-500">{s.company_name}</td>
                          <td className="px-3 py-2 text-slate-500">{s.contact_name}</td>
                          <td className="px-3 py-2 text-slate-500">{s.email}</td>
                          <td className="px-2 py-2">
                            <button onClick={() => handleDeleteSeller(s.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
