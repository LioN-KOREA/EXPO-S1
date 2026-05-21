import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

const BOOLEAN_KEYS = ['prior_match', 'greeting', 'onsite_match', 'ai_interpret', 'video_call'] as const;
const ALLOWED_TARGETS = ['buyer', 'seller', 'all'] as const;

interface EventOptions {
  prior_match: boolean;
  greeting: boolean;
  onsite_match: boolean;
  ai_interpret: boolean;
  video_call: boolean;
  infodesk_target: 'buyer' | 'seller' | 'all';
}

const DEFAULT_OPTIONS: EventOptions = {
  prior_match: false,
  greeting: false,
  onsite_match: false,
  ai_interpret: false,
  video_call: false,
  infodesk_target: 'all',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createAdminClient();
  const { data, error } = await admin.from('events').select('options').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const merged: EventOptions = { ...DEFAULT_OPTIONS, ...(data?.options ?? {}) };
  return NextResponse.json({ options: merged });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await request.json();
  const cleaned: Partial<EventOptions> = {};

  for (const k of BOOLEAN_KEYS) {
    if (k in body) {
      if (typeof body[k] !== 'boolean') {
        return NextResponse.json({ error: `${k}는 boolean이어야 합니다` }, { status: 400 });
      }
      cleaned[k] = body[k];
    }
  }
  if ('infodesk_target' in body) {
    if (!ALLOWED_TARGETS.includes(body.infodesk_target)) {
      return NextResponse.json({ error: 'infodesk_target은 buyer | seller | all 중 하나' }, { status: 400 });
    }
    cleaned.infodesk_target = body.infodesk_target;
  }

  const admin = createAdminClient();
  const { data: cur, error: getErr } = await admin
    .from('events')
    .select('id, options, deleted_at')
    .eq('id', id)
    .single();
  if (getErr || !cur) return NextResponse.json({ error: '이벤트를 찾을 수 없습니다' }, { status: 404 });
  if (cur.deleted_at) return NextResponse.json({ error: '삭제된 이벤트입니다' }, { status: 410 });

  const merged: EventOptions = { ...DEFAULT_OPTIONS, ...(cur?.options ?? {}), ...cleaned };
  const { error } = await admin.from('events').update({ options: merged }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, options: merged });
}
