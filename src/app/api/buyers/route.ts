import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json();
  const { event_id, company_name, buyer_name, country, booth_number, phone, email } = body;

  if (!event_id || !company_name?.trim() || !country?.trim()) {
    return NextResponse.json({ error: '회사명과 국가는 필수입니다' }, { status: 400 });
  }

  const { data, error } = await supabase.from('buyers').insert({
    event_id,
    company_name: company_name.trim(),
    buyer_name: buyer_name?.trim() || null,
    country: country.trim(),
    booth_number: booth_number?.trim() || null,
    phone: phone?.trim() || null,
    email: email?.trim() || null,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, id: data.id });
}
