import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { INTERPRETER_STATS_TAG } from '@/lib/cache/interpreter-stats';
import { ensureAdmin } from '@/lib/auth/guards';
import { listNotices, insertNotice, type NoticeRole } from '@/lib/notice/noticeRepository';

const VALID_ROLES: NoticeRole[] = ['admin', 'interpreter', 'buyer', 'seller'];

/** 보낸 공지함 (admin) */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  if (!eventId) return NextResponse.json({ error: 'event_id 필수' }, { status: 400 });

  try {
    const items = await listNotices(createAdminClient(), eventId);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

/** 공지 발송 (admin) */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json();
  if (!body.event_id) return NextResponse.json({ error: 'event_id 필수' }, { status: 400 });
  if (typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: '메시지 필수' }, { status: 400 });
  }
  if (body.message.length > 2000) {
    return NextResponse.json({ error: '메시지는 2000자 이내' }, { status: 400 });
  }
  if (!Array.isArray(body.target_roles) || body.target_roles.length === 0) {
    return NextResponse.json({ error: '대상 역할 1개 이상 선택' }, { status: 400 });
  }
  const normalizedRoles = Array.from(new Set(
    body.target_roles
      .filter((r: unknown) => typeof r === 'string')
      .map((r: string) => r.trim())
      .filter((r: string) => r.length > 0)
  )) as string[];
  const invalid = normalizedRoles.filter((r) => !VALID_ROLES.includes(r as NoticeRole));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `유효하지 않은 역할: ${invalid.join(', ')}` }, { status: 400 });
  }
  if (normalizedRoles.length === 0) {
    return NextResponse.json({ error: '대상 역할 1개 이상 선택' }, { status: 400 });
  }

  try {
    const inserted = await insertNotice(createAdminClient(), {
      event_id: body.event_id,
      message: body.message.trim(),
      target_roles: normalizedRoles as NoticeRole[],
      sent_by: guard.user.id,
    });
    if (inserted.target_roles.includes('interpreter')) {
      revalidateTag(INTERPRETER_STATS_TAG, 'max');
    }
    return NextResponse.json({ notice: inserted });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '발송 실패' },
      { status: 500 }
    );
  }
}
