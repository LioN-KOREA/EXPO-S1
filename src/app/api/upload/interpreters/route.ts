import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

interface UserData {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 인증 + Admin 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  }

  const body = await request.json();
  const users: UserData[] = body.users;

  if (!users || users.length === 0) {
    return NextResponse.json({ error: '사용자 데이터가 필요합니다' }, { status: 400 });
  }

  // Service Role로 Admin API 사용
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const results = [];
  const errors = [];

  for (const userData of users) {
    // Auth 계정 생성
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true,
    });

    if (authError) {
      errors.push({ email: userData.email, error: authError.message });
      continue;
    }

    // 역할 화이트리스트 검증
    const allowedRoles = ['admin', 'interpreter', 'buyer', 'seller'];
    const role = allowedRoles.includes(userData.role) ? userData.role : 'interpreter';

    // 프로필 생성
    const { error: profileError } = await adminClient
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: userData.email,
        name: userData.name,
        role,
        phone: userData.phone || null,
        language: userData.language || null,
      });

    if (profileError) {
      // 고아 계정 방지: 프로필 실패 시 auth 계정 삭제
      await adminClient.auth.admin.deleteUser(authData.user.id);
      errors.push({ email: userData.email, error: profileError.message });
      continue;
    }

    results.push({ email: userData.email, name: userData.name });
  }

  return NextResponse.json({
    success: true,
    created: results.length,
    errors: errors.length > 0 ? errors : undefined,
    results,
  });
}
