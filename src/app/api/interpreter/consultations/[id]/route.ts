import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureRole } from '@/lib/auth/guards';

// 통역사가 자기 자가추가 상담 삭제 — 본인이 추가(added_by_interpreter)했고 일지 작성 전일 때만.
// 삭제는 원자 RPC(소유·자가추가·일지없음 단일 WHERE)로 TOCTOU 차단.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const guard = await ensureRole(supabase, ['interpreter']);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const interpreterId = guard.user.id;

  const admin = createAdminClient();
  try {
    // 명확한 메시지용 사전 확인 (fail-closed). 실제 삭제 가드는 RPC 가 원자적으로 재확인.
    const { data: cons, error: readErr } = await admin
      .from('consultations')
      .select('interpreter_id, added_by_interpreter')
      .eq('id', id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    if (!cons || cons.interpreter_id !== interpreterId || !cons.added_by_interpreter) {
      return NextResponse.json({ error: '삭제 권한이 없습니다' }, { status: 403 });
    }

    // 원자 삭제: 소유·자가추가·일지없음 모두 만족해야 1행 삭제, 아니면 NULL
    const { data: deletedId, error: rpcErr } = await admin.rpc('interpreter_delete_added_consultation', {
      p_id: id,
      p_interpreter_id: interpreterId,
    });
    if (rpcErr) return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 });
    if (!deletedId) {
      // 사전 확인은 통과했으나 삭제 0행 = 그 사이 일지가 생김
      return NextResponse.json({ error: '상담일지 작성 후에는 삭제할 수 없습니다' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
