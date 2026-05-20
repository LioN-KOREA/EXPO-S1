// GET  /api/messages/threads?event_id=...
//   admin: 이벤트 내 통역사 명단 + thread/unread 정보
//   interpreter: 본인 thread 1개 (없으면 lazy upsert 후 반환)
// POST /api/messages/threads (admin) body { event_id, interpreter_id } → thread lazy upsert

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';
import {
  listThreadsForEvent,
  getThreadForInterpreter,
  getOrCreateThread,
} from '@/lib/messenger/threadRepository';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  if (!eventId) return NextResponse.json({ error: 'event_id 필수' }, { status: 400 });

  try {
    if (guard.user.role === 'admin') {
      // service-role 로 명단·집계 — RLS 통과지만 안정성 위해 admin client 사용
      const admin = createAdminClient();
      const items = await listThreadsForEvent(admin, eventId);
      return NextResponse.json({ items });
    }
    // interpreter: 본인이 해당 event 에 배정됐는지 검증 후 lazy upsert
    const { data: mapping } = await supabase
      .from('event_interpreters')
      .select('id')
      .eq('event_id', eventId)
      .eq('interpreter_id', guard.user.id)
      .maybeSingle();
    if (!mapping) {
      return NextResponse.json({ error: '해당 이벤트에 배정되지 않은 통역사' }, { status: 403 });
    }
    let thread = await getThreadForInterpreter(supabase, eventId, guard.user.id);
    if (!thread) {
      thread = await getOrCreateThread(supabase, eventId, guard.user.id);
    }
    return NextResponse.json({ thread });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (guard.user.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 thread 생성 가능' }, { status: 403 });
  }

  let body: { event_id?: unknown; interpreter_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문 필요' }, { status: 400 });
  }
  if (typeof body.event_id !== 'string' || typeof body.interpreter_id !== 'string') {
    return NextResponse.json({ error: 'event_id, interpreter_id 필수' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    // 대상 사용자가 interpreter role 인지 확인
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', body.interpreter_id)
      .maybeSingle();
    if (!profile || profile.role !== 'interpreter') {
      return NextResponse.json({ error: '대상은 통역사여야 합니다' }, { status: 400 });
    }
    // event_interpreters 매핑 확인
    const { data: mapping } = await admin
      .from('event_interpreters')
      .select('id')
      .eq('event_id', body.event_id)
      .eq('interpreter_id', body.interpreter_id)
      .maybeSingle();
    if (!mapping) {
      return NextResponse.json({ error: '해당 이벤트에 배정되지 않은 통역사' }, { status: 400 });
    }
    const thread = await getOrCreateThread(admin, body.event_id, body.interpreter_id);
    return NextResponse.json({ thread });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'thread 생성 실패' },
      { status: 500 }
    );
  }
}
