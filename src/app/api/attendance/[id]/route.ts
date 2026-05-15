import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

const VALID_STATUSES = ['NONE', 'WAITING', 'COMING', 'ABSENT', 'IN_CONSULT', 'DONE', 'LEAVE_OK', 'LEAVE'];
const VALID_EVALS = ['NORMAL', 'ABSENT', 'LATE', 'UNAUTHORIZED', 'OTHER'];

/**
 * 출석 상태/평가/메모 변경 (admin).
 * Body: { status?, eval?, memo?, change_method? }
 * - status 변경 시 attendance_status_logs 자동 기록 (이전과 동일하면 로그 생략)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  // 현재 상태 조회 (status 변경 시 로그 작성용)
  const { data: current, error: getErr } = await admin
    .from('attendances')
    .select('status')
    .eq('id', id)
    .single();
  if (getErr || !current) {
    return NextResponse.json({ error: '출석 항목을 찾을 수 없습니다' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if ('status' in body) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: '유효하지 않은 상태값' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if ('eval' in body) {
    if (body.eval !== null && body.eval !== undefined && !VALID_EVALS.includes(body.eval)) {
      return NextResponse.json({ error: '유효하지 않은 평가값' }, { status: 400 });
    }
    updates.eval = body.eval;
  }
  if ('memo' in body) {
    if (body.memo !== null && typeof body.memo !== 'string') {
      return NextResponse.json({ error: 'memo는 문자열이어야 합니다' }, { status: 400 });
    }
    if (typeof body.memo === 'string' && body.memo.length > 1000) {
      return NextResponse.json({ error: 'memo는 1000자 이내여야 합니다' }, { status: 400 });
    }
    updates.memo = body.memo;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 });
  }

  const { error } = await admin.from('attendances').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 상태 변경 로그 (실패 시 응답에 정보 포함 — 본 업데이트는 성공한 상태)
  let logError: string | null = null;
  if ('status' in updates && updates.status !== current.status) {
    const method = body.change_method && ['MANUAL', 'QR', 'AUTO'].includes(body.change_method)
      ? body.change_method
      : 'MANUAL';
    const { error: logErr } = await admin.from('attendance_status_logs').insert({
      attendance_id: id,
      prev_status: current.status,
      new_status: updates.status,
      changed_by: user.id,
      change_method: method,
    });
    if (logErr) logError = logErr.message;
  }

  return NextResponse.json({ success: true, log_error: logError });
}
