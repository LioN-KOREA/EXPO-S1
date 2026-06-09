// PRD #19 M6 — 분당 호출수 + 일일 누적비용 제한.
//
// PRD §Solution / Q12 결정:
//   - 분당: user_id 기준 sliding window 10회/min (성공·실패 무관, 모든 LLM 호출 시도)
//   - 일일: event_id 기준 SUM(cost_usd WHERE created_at::date = today AND status='success') > $10
//
// 한도 초과 시 폴백 트리거 (라우트가 buildTemplateFallback 호출).
//
// 시간 기준 = Asia/Seoul (DB 인덱스 ai_call_logs_event_date_status 와 일치).

import type { SupabaseClient } from '@supabase/supabase-js';

export const PER_MINUTE_CAP = 10;
export const DAILY_USD_CAP = 10;

export type LimitReason = 'minute_cap' | 'daily_cap';

export interface LimitOk {
  allowed: true;
}
export interface LimitBlocked {
  allowed: false;
  reason: LimitReason;
  currentCount?: number;
  currentCostUsd?: number;
}
export type LimitResult = LimitOk | LimitBlocked;

/** 분당 호출 + 일일 비용 동시 체크. 둘 중 하나라도 막히면 차단. */
export async function checkLimits(
  supabase: SupabaseClient,
  params: { userId: string; eventId: string },
): Promise<LimitResult> {
  const minuteCheck = await checkMinuteCap(supabase, params.userId);
  if (!minuteCheck.allowed) return minuteCheck;

  const dailyCheck = await checkDailyCap(supabase, params.eventId);
  if (!dailyCheck.allowed) return dailyCheck;

  return { allowed: true };
}

/** 분당 sliding window — 직전 60초 내 ai_call_logs row 수. */
export async function checkMinuteCap(
  supabase: SupabaseClient,
  userId: string,
): Promise<LimitResult> {
  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from('ai_call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceIso);

  if (error) {
    // DB 실패 = 안전하게 차단 X. 통역사 현장 흐름 보호.
    return { allowed: true };
  }

  const c = count ?? 0;
  if (c >= PER_MINUTE_CAP) {
    return { allowed: false, reason: 'minute_cap', currentCount: c };
  }
  return { allowed: true };
}

/** 일일 누적비용 — event_id 기준 오늘(KST) success SUM. */
export async function checkDailyCap(
  supabase: SupabaseClient,
  eventId: string,
): Promise<LimitResult> {
  const { startIso, endIso } = kstTodayBoundsUtc();
  const { data, error } = await supabase
    .from('ai_call_logs')
    .select('cost_usd')
    .eq('event_id', eventId)
    .eq('status', 'success')
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (error) {
    return { allowed: true };
  }

  const sum = (data ?? []).reduce(
    (acc: number, r: { cost_usd: number | null }) => acc + Number(r.cost_usd ?? 0),
    0,
  );
  if (sum >= DAILY_USD_CAP) {
    return { allowed: false, reason: 'daily_cap', currentCostUsd: sum };
  }
  return { allowed: true };
}

/** Asia/Seoul 기준 오늘 00:00 ~ 내일 00:00 의 UTC ISO. */
export function kstTodayBoundsUtc(now: Date = new Date()): { startIso: string; endIso: string } {
  // KST = UTC+9. 고정 오프셋이라 DST 신경 X.
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstY = kstNow.getUTCFullYear();
  const kstM = kstNow.getUTCMonth();
  const kstD = kstNow.getUTCDate();
  const kstStart = Date.UTC(kstY, kstM, kstD) - KST_OFFSET_MS;
  const kstEnd = kstStart + 24 * 60 * 60 * 1000;
  return { startIso: new Date(kstStart).toISOString(), endIso: new Date(kstEnd).toISOString() };
}
