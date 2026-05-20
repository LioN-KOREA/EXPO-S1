// 메신저 인증 helper — lib/auth/guards 위 thin wrapper.
// 메신저는 admin / interpreter 양쪽 허용.

import type { createClient } from '@/lib/supabase/server';
import { ensureRole, type AuthedUser as BaseAuthedUser } from '@/lib/auth/guards';

export type AuthedUser = BaseAuthedUser & { role: 'admin' | 'interpreter' };

export async function authMessenger(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ user: AuthedUser } | { error: string; status: 401 | 403 | 500 }> {
  const guard = await ensureRole(supabase, ['admin', 'interpreter']);
  if ('error' in guard) return guard;
  return { user: guard.user as AuthedUser };
}
