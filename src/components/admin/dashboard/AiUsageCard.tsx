'use client';

// PRD #19 M9 — AI 자동 답변 사용 현황 카드.
// 4수치 수평바 (파이차트 금지 룰). 30초 polling.
//
// 위치: /admin/events/[id]/dashboard.
// 권한: admin RLS 가 API 측에서 통과 검증 — 통역사 UI 에는 카드 자체를 마운트 X.

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, AlertTriangle, DollarSign, RefreshCw } from 'lucide-react';

interface AiStats {
  todayCalls: number;
  failureRatePct: number;
  dailyCostUsd: number;
  poolHitRatePct: number;
}

const REFRESH_MS = 30_000;
const DAILY_COST_CAP = 10;

export function AiUsageCard({ eventId }: { eventId: string }) {
  const [stats, setStats] = useState<AiStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}/ai-stats`, { cache: 'no-store' });
        if (!res.ok) {
          setError(`status ${res.status}`);
          return;
        }
        const data = (await res.json()) as AiStats;
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'unknown');
      }
    };

    fetchStats();
    timer = setInterval(fetchStats, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [eventId]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-rose-500" />
          AI 자동 답변 사용 현황 (오늘)
        </CardTitle>
        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-xs text-amber-600 mb-2">조회 오류 — 30초 후 자동 재시도</p>
        )}
        {!stats ? (
          <p className="text-sm text-slate-400">로딩 중…</p>
        ) : (
          <div className="space-y-4">
            <Bar
              label="오늘 호출수"
              valueText={`${stats.todayCalls}회`}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              ratio={Math.min(stats.todayCalls / 100, 1)}
              barClass="bg-blue-500"
            />
            <Bar
              label="실패율"
              valueText={`${stats.failureRatePct.toFixed(1)}%`}
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              ratio={stats.failureRatePct / 100}
              barClass={stats.failureRatePct >= 20 ? 'bg-red-500' : 'bg-amber-500'}
            />
            <Bar
              label="누적 비용"
              valueText={`$${stats.dailyCostUsd.toFixed(4)} / $${DAILY_COST_CAP}`}
              icon={<DollarSign className="w-3.5 h-3.5" />}
              ratio={Math.min(stats.dailyCostUsd / DAILY_COST_CAP, 1)}
              barClass={stats.dailyCostUsd >= DAILY_COST_CAP * 0.8 ? 'bg-red-500' : 'bg-emerald-500'}
            />
            <Bar
              label="풀 캐시 hit율"
              valueText={`${stats.poolHitRatePct.toFixed(1)}%`}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              ratio={stats.poolHitRatePct / 100}
              barClass="bg-violet-500"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Bar({
  label,
  valueText,
  icon,
  ratio,
  barClass,
}: {
  label: string;
  valueText: string;
  icon: React.ReactNode;
  ratio: number;
  barClass: string;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const widthPct = (clamped * 100).toFixed(1);
  return (
    <div>
      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
        <span className="flex items-center gap-1.5 text-slate-600">
          {icon}
          {label}
        </span>
        <span className="font-semibold text-foreground tabular-nums">{valueText}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
