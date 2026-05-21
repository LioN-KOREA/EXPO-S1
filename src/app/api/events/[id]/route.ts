import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth/guards';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const { searchParams } = new URL(request.url);
  const hard = searchParams.get('hard') === 'true';
  const confirmName = searchParams.get('confirmName');

  const supabase = await createClient();

  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createAdminClient();

  try {
    if (hard) {
      // 완전 삭제: 단일 DELETE에 모든 precondition(id + deleted_at IS NOT NULL + name 일치)
      // 원자적으로 결합. fetch→delete 분리 시 다른 admin의 PATCH(복구)/UPDATE(이름변경) 사이 race.
      // ON DELETE CASCADE로 buyers/sellers/consultations 등 하위 데이터 자동 제거.
      // message_logs는 ON DELETE SET NULL이라 익명화되어 잔존(감사 로그용).
      if (!confirmName) {
        return NextResponse.json(
          { error: '확인용 상담회 이름이 필요합니다' },
          { status: 400 }
        );
      }

      const { data: deleted, error } = await admin
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('name', confirmName)
        .not('deleted_at', 'is', null)
        .select('id');

      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        return NextResponse.json(
          {
            error:
              '완전 삭제 실패. 상담회가 존재하지 않거나, 소프트 삭제되지 않았거나, 이름이 변경되었습니다',
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, hardDeleted: true });
    }

    // 소프트 삭제: deleted_at 타임스탬프 설정
    const { error } = await admin
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// 복구 API
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createAdminClient();

  try {
    const { error } = await admin
      .from('events')
      .update({ deleted_at: null })
      .eq('id', eventId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '복구 실패';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
