import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseUsersExcel } from '@/lib/excel/users-parser';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const result = parseUsersExcel(buffer);

    // 기존 이메일과 중복 체크
    const admin = createAdminClient();
    const { data: existingProfiles } = await admin.from('profiles').select('email');
    const existingEmails = new Set((existingProfiles || []).map(p => p.email.toLowerCase()));

    const duplicates: string[] = [];
    for (const u of result.users) {
      if (existingEmails.has(u.email)) {
        duplicates.push(u.email);
        result.errors.push({
          row: u.row_number,
          field: '이메일',
          message: `이미 등록된 이메일: ${u.email}`,
        });
      }
    }

    // 역할별 카운트
    const summary = {
      total: result.users.length,
      admins: result.users.filter(u => u.role === 'admin').length,
      interpreters: result.users.filter(u => u.role === 'interpreter').length,
      buyers: result.users.filter(u => u.role === 'buyer').length,
      sellers: result.users.filter(u => u.role === 'seller').length,
    };

    return NextResponse.json({
      success: true,
      preview: result.users,
      summary,
      errors: result.errors,
      duplicates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '파싱 오류';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
