import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { INTERPRETER_STATS_TAG } from '@/lib/cache/interpreter-stats';
import { ensureAuthenticated } from '@/lib/auth/guards';

export async function POST() {
  const supabase = await createClient();
  const guard = await ensureAuthenticated(supabase);
  if ('error' in guard) return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  revalidateTag(INTERPRETER_STATS_TAG, 'max');
  return Response.json({ ok: true });
}
