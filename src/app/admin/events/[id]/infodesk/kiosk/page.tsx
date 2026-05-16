import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { InfodeskKioskClient } from './InfodeskKioskClient';
import type { InfodeskEntry } from '../infodesk-client';

export default async function InfodeskKioskPage({
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
    <InfodeskKioskClient
      entries={entries}
      eventName={event.name}
      eventId={eventId}
      target={target}
    />
  );
}
