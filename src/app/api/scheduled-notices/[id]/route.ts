import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureAdmin } from '@/lib/auth/guards';
import {
  cancelScheduledNotice,
  updateScheduledNotice,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!validateUuid(id)) {
    return NextResponse.json({ error: 'id_invalid' }, { status: 400 });
  }
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }
  const { message, scheduled_at, recipient_user_ids } = body as Record<string, unknown>;
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
    await updateScheduledNotice(supabase, id, {
      message,
      scheduled_at,
      recipient_user_ids: recipient_user_ids as string[],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorToResponse(e);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!validateUuid(id)) {
    return NextResponse.json({ error: 'id_invalid' }, { status: 400 });
  }
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    await cancelScheduledNotice(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorToResponse(e);
  }
}
