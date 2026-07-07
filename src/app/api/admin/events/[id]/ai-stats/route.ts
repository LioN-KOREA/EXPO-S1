// PRD #19 M9 — admin 모니터링 카드 데이터.
// /admin/events/[id]/dashboard 의 AiUsageCard 가 30초 간격으로 polling.
//
// 응답 4수치 (수평바 4개):
//   - todayCalls       : 오늘(KST) ai_call_logs row 수 (성공·실패·캐시 hit 전체)
//   - failureRatePct   : 오늘 중 success/cache_hit 외 status 비율 (0..100)
//   - dailyCostUsd     : 오늘 success 누적 cost_usd
//   - poolHitRatePct   : 오늘 (cache_hit + success) 중 cache_hit 비율 = "재사용된 호출 / 전체 시도" — 비용 절감 효과
//
// admin RLS: ai_call_logs admin_select 정책으로 RLS 통과.
// 본인 행사 외에는 admin 도 본 row 0건이라 자연스럽게 0 반환.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureAdmin } from '@/lib/auth/guards';
import { kstTodayBoundsUtc } from '@/lib/ai/rate-limiter';

export const dynamic = 'force-dynamic';

interface AiStats {
  todayCalls: number;
  failureRatePct: number;
  dailyCostUsd: number;
  poolHitRatePct: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { startIso, endIso } = kstTodayBoundsUtc();

  const { data: rows, error } = await supabase
    .from('ai_call_logs')
    .select('status, cost_usd')
    .eq('event_id', eventId)
    // 'reserved' = 마이그 052 예약 마커(분당 cap 전용). 통계 호출수/실패율 왜곡 방지 위해 제외.
    .neq('status', 'reserved')
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (error) {
    return NextResponse.json({ error: `조회 실패: ${error.message}` }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{ status: string; cost_usd: number | null }>;
  const total = list.length;
  const success = list.filter((r) => r.status === 'success').length;
  const cacheHit = list.filter((r) => r.status === 'cache_hit').length;
  const failure = total - success - cacheHit;

  const dailyCost = list
    .filter((r) => r.status === 'success')
    .reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

  // 풀 hit율 분모 = 정상 LLM 시도 (success) + 캐시 hit. 실패 status 제외 → 캐시 절감 효과 정확.
  const llmAttempted = success + cacheHit;

  const stats: AiStats = {
    todayCalls: total,
    failureRatePct: total > 0 ? Math.round((failure / total) * 1000) / 10 : 0,
    dailyCostUsd: Math.round(dailyCost * 1_000_000) / 1_000_000,
    poolHitRatePct: llmAttempted > 0 ? Math.round((cacheHit / llmAttempted) * 1000) / 10 : 0,
  };

  return NextResponse.json(stats);
}
