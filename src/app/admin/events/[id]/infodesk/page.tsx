import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { InfodeskClient, type InfodeskEntry } from './infodesk-client';

export default async function InfodeskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select('id, name, options')
    .eq('id', eventId)
    .single();
  if (!event) notFound();

  const target: 'buyer' | 'seller' | 'all' = event.options?.infodesk_target ?? 'all';

  // 대상에 따라 buyers/sellers 조회
  const entries: InfodeskEntry[] = [];

  if (target === 'buyer' || target === 'all') {
    const { data: buyers } = await supabase
      .from('buyers')
      .select('id, company_name, buyer_name, country, booth_number, email, phone')
      .eq('event_id', eventId);
    (buyers ?? []).forEach((b) => {
      entries.push({
        kind: 'buyer',
        id: b.id,
        company: b.company_name,
        contact: b.buyer_name ?? '',
        country: b.country ?? '',
        booth: b.booth_number ?? '',
        email: b.email ?? '',
        phone: b.phone ?? '',
      });
    });
  }

  if (target === 'seller' || target === 'all') {
    const { data: sellers } = await supabase
      .from('sellers')
      .select('id, company_name, company_name_kr, contact_name, email, contact_phone, office_phone')
      .eq('event_id', eventId);
    (sellers ?? []).forEach((s) => {
      entries.push({
        kind: 'seller',
        id: s.id,
        company: s.company_name_kr || s.company_name,
        contact: s.contact_name ?? '',
        country: '',
        booth: '',
        email: s.email ?? '',
        phone: s.contact_phone || s.office_phone || '',
      });
    });
  }

  return (
    <div>

      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground">인포데스크</h2>
          <p className="text-slate-500 text-sm mt-1">
            현장 인포데스크용 검색 화면 ·
            노출 대상: {target === 'all' ? '바이어 + 셀러' : target === 'buyer' ? '바이어' : '셀러'}
          </p>
        </div>
        <Link href={`/admin/events/${eventId}/infodesk/kiosk`}>
          <Button className="gap-1.5 bg-rose-500 hover:bg-rose-600">
            <Maximize2 className="w-4 h-4" />
            키오스크 모드
          </Button>
        </Link>
      </div>

      <InfodeskClient entries={entries} />
    </div>
  );
}
