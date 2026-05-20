// API 라우트 인증 / 권한 guard.
// discriminated union 반환 — throw 안 함 (NextResponse.json 흐름 유지).
//
// 사용 예:
//   const guard = await ensureAdmin(supabase);
//   if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
//   guard.user.id / guard.user.role
//
// 기존 라우트들이 각자 auth.getUser() + profiles.role select 를 인라인 작성하고 있어
// 한 곳에서 처리하도록 추출. 향후 라우트 추가 시 import 만으로 동일 패턴 적용.

import type { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'interpreter' | 'buyer' | 'seller';

export interface AuthedUser {
  id: string;
  role: Role;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type GuardOk = { user: AuthedUser };
type GuardErr = { error: string; status: 401 | 403 };
type GuardResult = GuardOk | GuardErr;

/** 인증된 사용자 확보 (역할 무관). */
export async function ensureAuthenticated(supabase: ServerClient): Promise<GuardResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '인증 필요', status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: '프로필 없음', status: 403 };
  return { user: { id: user.id, role: profile.role as Role } };
}

/** 허용 역할 목록 중 하나여야 통과. */
export async function ensureRole(
  supabase: ServerClient,
  allowed: ReadonlyArray<Role>
): Promise<GuardResult> {
  const guard = await ensureAuthenticated(supabase);
  if ('error' in guard) return guard;
  if (!allowed.includes(guard.user.role)) {
    return { error: '권한 없음', status: 403 };
  }
  return guard;
}

/** admin 전용 단축 — 가장 흔한 경우. */
export async function ensureAdmin(supabase: ServerClient): Promise<GuardResult> {
  return ensureRole(supabase, ['admin']);
}
