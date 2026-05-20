// 메신저 API 인증/권한 helper

import { createClient } from '@/lib/supabase/server';
import type { Role } from './threadRepository';

export interface AuthedUser {
  id: string;
  role: Role;
}

export async function authMessenger(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ user: AuthedUser } | { error: string; status: 401 | 403 }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '인증 필요', status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile) return { error: '프로필 없음', status: 403 };
  const role = profile.role as string;
  if (role !== 'admin' && role !== 'interpreter') {
    return { error: '권한 없음', status: 403 };
  }
  return { user: { id: user.id, role: role as Role } };
}
