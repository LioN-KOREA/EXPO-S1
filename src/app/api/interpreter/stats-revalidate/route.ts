import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { INTERPRETER_STATS_TAG } from '@/lib/cache/interpreter-stats';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  revalidateTag(INTERPRETER_STATS_TAG, 'max');
  return Response.json({ ok: true });
}
