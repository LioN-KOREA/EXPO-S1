import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureAdmin } from '@/lib/auth/guards';
import {
  createScheduledNotice,
  listScheduledNotices,
} from '@/lib/scheduled-notice/repository';
import { ScheduledNoticeError } from '@/lib/scheduled-notice/errors';
import {
  validateMessage,
  validateRecipientUserIds,
  validateScheduledAt,
  validateUuid,
} from '@/lib/scheduled-notice/validate';

function errorToResponse(e: unknown) {
  if (e instanceof ScheduledNoticeError) {
    return NextResponse.json({ error: e.code }, { status: 400 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : 'unknown' },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  if (!eventId) return NextResponse.json({ error: 'event_id 필수' }, { status: 400 });
  if (!validateUuid(eventId)) {
    return NextResponse.json({ error: 'event_id_invalid' }, { status: 400 });
  }

  try {
    const items = await listScheduledNotices(supabase, eventId);
    return NextResponse.json({ items });
  } catch (e) {
    return errorToResponse(e);
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }
  const { event_id, message, scheduled_at, recipient_user_ids } = body as Record<string, unknown>;
  if (typeof event_id !== 'string' || !validateUuid(event_id)) {
    return NextResponse.json({ error: 'event_id_invalid' }, { status: 400 });
  }
  if (typeof message !== 'string') {
    return NextResponse.json({ error: 'message 필수' }, { status: 400 });
  }
  const msgErr = validateMessage(message);
  if (msgErr) return NextResponse.json({ error: msgErr }, { status: 400 });
  if (typeof scheduled_at !== 'string') {
    return NextResponse.json({ error: 'scheduled_at 필수' }, { status: 400 });
  }
  const schedErr = validateScheduledAt(scheduled_at);
  if (schedErr) return NextResponse.json({ error: schedErr }, { status: 400 });
  const recErr = validateRecipientUserIds(recipient_user_ids);
  if (recErr) return NextResponse.json({ error: recErr }, { status: 400 });

  try {
    const { id } = await createScheduledNotice(supabase, {
      event_id,
      message,
      scheduled_at,
      recipient_user_ids: recipient_user_ids as string[],
    });
    return NextResponse.json({ id });
  } catch (e) {
    return errorToResponse(e);
  }
}
