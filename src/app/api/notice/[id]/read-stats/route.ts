import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

/**
 * 공지 읽음 통계 (admin)
 * - target_roles 별 이벤트 참가자 풀 산정
 * - notice_reads와 교차 → 읽은/안읽은 카운트
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: noticeId } = await params;
  const supabase = await createClient();

  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createAdminClient();
  const { data: notice, error: nerr } = await admin
    .from('notices')
    .select('id, event_id, target_roles, sent_at, message')
    .eq('id', noticeId)
    .single();
  if (nerr || !notice) return NextResponse.json({ error: '공지를 찾을 수 없음' }, { status: 404 });

  const targetRoles: string[] = Array.isArray(notice.target_roles) ? notice.target_roles : [];
  const eventId = notice.event_id;
  const targetUserIds = new Set<string>();

  if (targetRoles.includes('interpreter')) {
    const { data } = await admin
      .from('event_interpreters')
      .select('interpreter_id')
      .eq('event_id', eventId);
    (data ?? []).forEach((r: { interpreter_id?: string }) => {
      if (r.interpreter_id) targetUserIds.add(r.interpreter_id);
    });
  }

  if (targetRoles.includes('seller')) {
    const { data: sellers } = await admin.from('sellers').select('id').eq('event_id', eventId);
    const sellerIds = (sellers ?? []).map((s: { id: string }) => s.id);
    if (sellerIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'seller')
        .in('linked_seller_id', sellerIds);
      (profs ?? []).forEach((p: { id: string }) => targetUserIds.add(p.id));
    }
  }

  if (targetRoles.includes('buyer')) {
    const { data: buyers } = await admin.from('buyers').select('id').eq('event_id', eventId);
    const buyerIds = (buyers ?? []).map((b: { id: string }) => b.id);
    if (buyerIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'buyer')
        .in('linked_buyer_id', buyerIds);
      (profs ?? []).forEach((p: { id: string }) => targetUserIds.add(p.id));
    }
  }

  if (targetRoles.includes('admin')) {
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
    (admins ?? []).forEach((p: { id: string }) => targetUserIds.add(p.id));
  }

  const total = targetUserIds.size;
  let readCount = 0;
  if (total > 0) {
    const { data: reads } = await admin
      .from('notice_reads')
      .select('user_id')
      .eq('notice_id', noticeId);
    readCount = (reads ?? []).filter((r: { user_id: string }) => targetUserIds.has(r.user_id)).length;
  }

  return NextResponse.json({
    notice_id: noticeId,
    target_roles: targetRoles,
    total,
    read: readCount,
    unread: total - readCount,
    sent_at: notice.sent_at,
  });
}
