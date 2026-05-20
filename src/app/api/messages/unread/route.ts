// GET /api/messages/unread → 호출자 역할 기준 unread 합계 + by-thread
// admin: 전체 thread 합 (선택 event_id 필터)
// interpreter: 본인 thread 합

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';
import { unreadForAdmin, unreadForInterpreter } from '@/lib/messenger/unreadCounter';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id') ?? undefined;

  try {
    if (guard.user.role === 'admin') {
      const admin = createAdminClient();
      const result = await unreadForAdmin(admin, eventId);
      return NextResponse.json(result);
    }
    const result = await unreadForInterpreter(supabase, guard.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '집계 실패' },
      { status: 500 }
    );
  }
}
