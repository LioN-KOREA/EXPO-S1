import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

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
