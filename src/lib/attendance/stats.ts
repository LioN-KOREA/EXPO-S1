// PRD #17 S0 — 출석률 집계 (deep module).
// 외부 IF = getAttendanceStats({ eventId, scope, today? })
// 내부: events.start_date/end_date + attendances 조회 + status 분류.
//
// 분자 = 출근/상담/퇴근 계열 (WAITING/COMING/IN_CONSULT/DONE/LEAVE_OK/LEAVE)
// 분모 = 해당 범위의 attendances row 전체 (account_type='INTERPRETER')
// 결근(ABSENT)/미체크(NONE) 카운트는 부수 정보.
//
// today 인자 = 테스트 주입 (YYYY-MM-DD). 미제공 시 KST 오늘.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AttendanceStatsScope = 'today' | 'all';

export interface AttendanceStats {
  numerator: number;
  denominator: number;
  absent: number;
  none: number;
  outOfRange: boolean;
}

export interface GetAttendanceStatsInput {
  eventId: string;
  scope: AttendanceStatsScope;
  /** YYYY-MM-DD. 미제공 시 KST 기준 오늘. */
  today?: string;
}

const PRESENT_STATUSES = new Set([
  'WAITING',
  'COMING',
  'IN_CONSULT',
  'DONE',
  'LEAVE_OK',
  'LEAVE',
]);

/** KST(Asia/Seoul) 기준 YYYY-MM-DD. `sv-SE` locale = ISO 8601 date. */
export function todayKST(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

export async function getAttendanceStats(
  supabase: SupabaseClient,
  input: GetAttendanceStatsInput,
): Promise<AttendanceStats> {
  const today = input.today ?? todayKST();

  // 행사 기간 확인.
  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select('start_date, end_date')
    .eq('id', input.eventId)
    .maybeSingle();
  if (eventErr) throw eventErr;
  if (!eventRow) {
    // 행사 없으면 outOfRange 로 처리 (UI 가 "행사 없음" 표시 가능).
    return { numerator: 0, denominator: 0, absent: 0, none: 0, outOfRange: true };
  }

  const startDate = eventRow.start_date as string;
  const endDate = eventRow.end_date as string;

  // today scope + 오늘이 행사 기간 밖 = 즉시 outOfRange.
  if (input.scope === 'today' && (today < startDate || today > endDate)) {
    return { numerator: 0, denominator: 0, absent: 0, none: 0, outOfRange: true };
  }

  // 분모/분자 쿼리. account_type=INTERPRETER 만.
  let query = supabase
    .from('attendances')
    .select('status, date')
    .eq('event_id', input.eventId)
    .eq('account_type', 'INTERPRETER');

  if (input.scope === 'today') {
    query = query.eq('date', today);
  } else {
    // 'all' = 행사 기간 전체. 외부 날짜 (예: 잘못 생성된 row) 제거.
    query = query.gte('date', startDate).lte('date', endDate);
  }

  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) throw rowsErr;

  let numerator = 0;
  let absent = 0;
  let none = 0;
  for (const row of (rows ?? []) as Array<{ status: string }>) {
    const s = row.status;
    if (PRESENT_STATUSES.has(s)) numerator += 1;
    else if (s === 'ABSENT') absent += 1;
    else if (s === 'NONE') none += 1;
    // 그 외 status 값(미정의)은 분자/결근/미체크 어디에도 안 들어감 — 분모에는 포함.
  }
  const denominator = (rows ?? []).length;

  return {
    numerator,
    denominator,
    absent,
    none,
    outOfRange: false,
  };
}
