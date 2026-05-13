import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { isValidCountryCode } from '@/lib/constants/countries';
import type { UserRole } from '@/types';

const ALLOWED_ROLES: UserRole[] = ['admin', 'interpreter', 'buyer', 'seller'];
const ALLOWED_FIELDS = ['name', 'email', 'role', 'phone', 'language', 'company_name', 'country'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const admin = createAdminClient();
  const body = await request.json();

  // 허용된 필드만 추출
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  // 비밀번호 리셋 처리
  if ('password' in body && body.password) {
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 최소 6자 이상이어야 합니다 (Supabase Auth 정책)' }, { status: 400 });
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password: body.password,
    });
    if (pwErr) {
      return NextResponse.json({ error: `비밀번호 변경 실패: ${pwErr.message}` }, { status: 400 });
    }
    // must_change_password 설정
    if (body.must_change_password !== undefined) {
      updates.must_change_password = body.must_change_password;
    }
  }

  if (Object.keys(updates).length === 0 && !('password' in body)) {
    return NextResponse.json({ error: '수정할 필드가 없습니다' }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  // 역할 검증
  if (updates.role && !ALLOWED_ROLES.includes(updates.role as UserRole)) {
    return NextResponse.json({ error: '유효하지 않은 역할입니다' }, { status: 400 });
  }

  // 국가코드 검증
  if (updates.country && typeof updates.country === 'string' && updates.country !== '' && !isValidCountryCode(updates.country)) {
    return NextResponse.json({ error: '유효하지 않은 국가코드입니다' }, { status: 400 });
  }

  try {
    // 이메일 변경 전 기존 이메일 보관 (롤백용)
    let oldEmail: string | null = null;
    if (updates.email) {
      const { data: currentProfile } = await admin.from('profiles').select('email').eq('id', userId).single();
      oldEmail = currentProfile?.email || null;

      const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
        email: updates.email as string,
      });
      if (authErr) {
        return NextResponse.json({ error: `이메일 변경 실패: ${authErr.message}` }, { status: 400 });
      }
    }

    // Profile 업데이트
    const { data: updated, error: profileErr } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (profileErr) {
      // Auth 이메일 롤백
      if (oldEmail) {
        await admin.auth.admin.updateUserById(userId, { email: oldEmail });
      }
      throw profileErr;
    }

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : '수정 실패';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  // 자기 자신 삭제 방지
  if (userId === user.id) return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다' }, { status: 400 });

  const admin = createAdminClient();

  try {
    // 프로필 삭제 (CASCADE로 관련 데이터도 정리)
    const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId);
    if (profileErr) throw profileErr;
    // Auth 계정 삭제
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
