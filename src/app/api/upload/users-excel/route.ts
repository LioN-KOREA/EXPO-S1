import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseUsersExcel } from '@/lib/excel/users-parser';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const buffer = await file.arrayBuffer();
    const result = await parseUsersExcel(buffer);

    // 파싱 에러가 있으면 업로드 중단
    if (result.errors.length > 0) {
      return NextResponse.json({
        error: '엑셀 데이터에 문제가 있습니다. 프리뷰에서 오류를 확인해주세요.',
        errors: result.errors,
      }, { status: 400 });
    }

    // 기존 이메일 조회
    const { data: existingProfiles } = await admin.from('profiles').select('email');
    const existingEmails = new Set((existingProfiles || []).map(p => p.email.toLowerCase()));

    // 중복 이메일 제외
    const newUsers = result.users.filter(u => !existingEmails.has(u.email));

    let created = 0;
    const skipped = result.users.length - newUsers.length;
    const errors: { email: string; error: string }[] = [];

    for (const u of newUsers) {
      // 1. Auth 계정 생성
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });

      if (authErr) {
        errors.push({ email: u.email, error: authErr.message });
        continue;
      }

      // 2. Profile 생성
      const { error: profileErr } = await admin.from('profiles').insert({
        id: authData.user.id,
        email: u.email,
        name: u.name,
        role: u.role,
        phone: u.phone || null,
        language: u.language || null,
        company_name: u.company_name || null,
        country: u.country || null,
        extra_info: Object.keys(u.extra_info).length > 0 ? u.extra_info : {},
        must_change_password: true,
      });

      if (profileErr) {
        // 고아 계정 방지: Auth 삭제
        await admin.auth.admin.deleteUser(authData.user.id);
        errors.push({ email: u.email, error: profileErr.message });
        continue;
      }

      created++;
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      errors,
      total: result.users.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업로드 오류';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
