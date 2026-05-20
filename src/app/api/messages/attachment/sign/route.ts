// POST /api/messages/attachment/sign body { path: string }
// thread 참여자만 signed URL 발급. RLS storage 정책이 권한 1차 검증.

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { authMessenger } from '@/lib/messenger/auth';

const SIGNED_TTL_SEC = 60 * 5; // 5분

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await authMessenger(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: { path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문 필요' }, { status: 400 });
  }
  if (typeof body.path !== 'string' || body.path.length === 0) {
    return NextResponse.json({ error: 'path 필수' }, { status: 400 });
  }

  // Storage RLS 가 권한 검사. signed URL 발급 자체는 user supabase client 로 호출.
  const { data, error } = await supabase.storage
    .from('messages')
    .createSignedUrl(body.path, SIGNED_TTL_SEC);
  if (error || !data) {
    return NextResponse.json({ error: error?.message || '서명 URL 발급 실패' }, { status: 403 });
  }
  return NextResponse.json({ url: data.signedUrl, expires_in: SIGNED_TTL_SEC });
}
