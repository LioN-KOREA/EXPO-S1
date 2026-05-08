import { createClient } from '@supabase/supabase-js';

// Service Role 클라이언트 - RLS 우회, 서버 사이드에서만 사용
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
