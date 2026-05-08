'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  Clock,
  Building2,
  TrendingUp,
  Globe,
  MapPin,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { LanguageToggle } from '@/components/LanguageToggle';

interface ConsultationData {
  id: string;
  seller_id: string;
  time_slot: { date: string; start_time: string; end_time: string } | null;
  seller: { company_name: string; company_name_kr: string; contact_name: string } | null;
  interpreter: { name: string } | null;
  event: { name: string } | null;
}

export default function BuyerDashboard() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<{ name: string; linked_buyer_id: string | null } | null>(null);
  const [buyerInfo, setBuyerInfo] = useState<{ company_name: string; country: string } | null>(null);
  const [consultations, setConsultations] = useState<ConsultationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles')
        .select('linked_buyer_id, name')
        .eq('id', user.id)
        .single();
      setProfile(prof);

      if (!prof?.linked_buyer_id) { setLoading(false); return; }

      const { data: buyer } = await supabase
        .from('buyers')
        .select('company_name, country')
        .eq('id', prof.linked_buyer_id)
        .single();
      setBuyerInfo(buyer);

      const { data: cons } = await supabase
        .from('consultations')
        .select(`
          *,
          time_slot:time_slots(*),
          seller:sellers(company_name, company_name_kr, contact_name),
          interpreter:profiles!consultations_interpreter_id_fkey(name),
          event:events(name)
        `)
        .eq('buyer_id', prof.linked_buyer_id);

      const sorted = (cons || []) as unknown as ConsultationData[];
      sorted.sort((a, b) => {
        const dateA = a.time_slot?.date || '';
        const dateB = b.time_slot?.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.time_slot?.start_time || '').localeCompare(b.time_slot?.start_time || '');
      });
      setConsultations(sorted);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-center py-12 text-slate-500">{t.common.loading}</p>;
  }

  if (!profile?.linked_buyer_id) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="w-14 h-14 text-foreground/80 mx-auto mb-4" />
        <p className="text-slate-500 font-medium">{t.buyer.noConsultations}</p>
        <p className="text-sm text-slate-500 mt-1">{t.buyer.noConsultationsDesc}</p>
      </div>
    );
  }

  const totalCount = consultations.length;
  const uniqueSellers = new Set(consultations.map((c) => c.seller_id));

  // 날짜별 그룹핑
  const grouped = new Map<string, ConsultationData[]>();
  consultations.forEach((c) => {
    const date = c.time_slot?.date || 'N/A';
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(c);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t.buyer.mySchedule}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-slate-500 text-sm">{buyerInfo?.company_name || profile.name}</span>
            {buyerInfo?.country && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="w-3 h-3" />
                {buyerInfo.country}
              </span>
            )}
          </div>
        </div>
        <LanguageToggle />
      </div>

      {totalCount > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.buyer.totalConsultations}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center mx-auto mb-2">
                <Building2 className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{uniqueSellers.size}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.buyer.companies}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center mx-auto mb-2">
                <CalendarDays className="w-5 h-5 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">{grouped.size}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.buyer.consultationDays}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {consultations.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">{t.buyer.noConsultations}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  {date}
                </div>
                <span className="text-xs text-slate-500">{items.length}{t.common.units}</span>
                <div className="flex-1 h-px bg-card" />
              </div>

              <div className="space-y-2">
                {items.map((c, idx) => (
                  <Card key={c.id} className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-white">{idx + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                              <Clock className="w-3 h-3" />
                              {c.time_slot?.start_time} - {c.time_slot?.end_time}
                            </div>
                            {c.event && <span className="text-xs text-slate-500 truncate">{c.event.name}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="text-sm font-medium text-foreground truncate">
                              {c.seller?.company_name_kr || c.seller?.company_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 ml-6">
                            {c.seller?.contact_name && (
                              <span className="text-xs text-slate-500">{t.buyer.contact}: {c.seller.contact_name}</span>
                            )}
                            {c.interpreter && (
                              <span className="text-xs text-slate-500">
                                <Globe className="w-3 h-3 inline mr-0.5" />
                                {c.interpreter.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
