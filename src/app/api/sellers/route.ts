import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json();
  const { event_id, company_name, company_name_kr, contact_name, contact_phone, email } = body;

  if (!event_id || !company_name?.trim()) {
    return NextResponse.json({ error: '회사명은 필수입니다' }, { status: 400 });
  }

  const { data, error } = await supabase.from('sellers').insert({
    event_id,
    company_name: company_name.trim(),
    company_name_kr: company_name_kr?.trim() || null,
    contact_name: contact_name?.trim() || null,
    contact_phone: contact_phone?.trim() || null,
    email: email?.trim() || null,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, id: data.id });
}
