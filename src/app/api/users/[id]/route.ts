import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  // 자기 자신 삭제 방지
  if (userId === user.id) return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다' }, { status: 400 });

  const admin = createAdminClient();

  try {
    // 프로필 삭제 (CASCADE로 관련 데이터도 정리)
    const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId);
    if (profileErr) throw profileErr;
    // Auth 계정 삭제
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
