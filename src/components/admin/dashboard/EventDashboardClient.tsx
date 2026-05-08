'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CheckCircle2, TrendingUp, Users, Building2, BarChart3 } from 'lucide-react';

interface Props {
  totalConsultations: number;
  statusCounts: Record<string, number>;
  amountTotals: { label: string; total: number }[];
  possibilityCounts: Record<string, number>;
  possibilityLabel: string;
  buyerRanking: { name: string; country: string; count: number }[];
  sellerRanking: { name: string; count: number }[];
}

const STATUS_CONFIG: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'approved', label: '승인', color: '#10b981', bg: 'bg-emerald-500' },
  { key: 'submitted', label: '검토중', color: '#3b82f6', bg: 'bg-blue-500' },
  { key: 'revision_requested', label: '수정요청', color: '#ef4444', bg: 'bg-red-500' },
  { key: 'draft', label: '작성중', color: '#f59e0b', bg: 'bg-amber-500' },
  { key: 'not_started', label: '미작성', color: '#cbd5e1', bg: 'bg-slate-300' },
];

const POSSIBILITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatAmount(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}천만`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function EventDashboardClient({
  totalConsultations,
  statusCounts,
  amountTotals,
  possibilityCounts,
  possibilityLabel,
  buyerRanking,
  sellerRanking,
}: Props) {
  const totalActive = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const possibilityTotal = Object.values(possibilityCounts).reduce((a, b) => a + b, 0);
  const possibilityEntries = Object.entries(possibilityCounts);
  const maxBuyerCount = buyerRanking.length > 0 ? buyerRanking[0].count : 1;
  const maxSellerCount = sellerRanking.length > 0 ? sellerRanking[0].count : 1;

  return (
    <div className="space-y-6">

      {/* ── 요약 통계 카드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          iconBg="bg-blue-50 text-blue-600"
          label="총 상담건수"
          value={totalConsultations}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBg="bg-emerald-50 text-emerald-600"
          label="승인 완료"
          value={statusCounts.approved || 0}
          sub={totalConsultations > 0 ? `${Math.round(((statusCounts.approved || 0) / totalConsultations) * 100)}%` : undefined}
        />
        {amountTotals.map((amt, i) => (
          <StatCard
            key={i}
            icon={<TrendingUp className="w-5 h-5" />}
            iconBg={i === 0 ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'}
            label={amt.label}
            value={formatAmount(amt.total)}
            isString
          />
        ))}
      </div>

      {/* ── 상담일지 현황 (수평 바) ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            상담일지 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 전체 진행 바 */}
          <div className="h-8 rounded-lg overflow-hidden flex bg-slate-100">
            {STATUS_CONFIG.map(({ key, color }) => {
              const count = statusCounts[key] || 0;
              if (count === 0 || totalActive === 0) return null;
              const pct = (count / totalActive) * 100;
              return (
                <div
                  key={key}
                  className="h-full transition-all duration-500 flex items-center justify-center"
                  style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 0 ? '2px' : 0 }}
                >
                  {pct >= 8 && (
                    <span className="text-[11px] font-semibold text-white drop-shadow-sm">
                      {count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 범례 + 숫자 */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
            {STATUS_CONFIG.map(({ key, label, bg }) => {
              const count = statusCounts[key] || 0;
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-sm ${bg}`} />
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-semibold text-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 거래가능성 (수평 바 차트) ── */}
      {possibilityEntries.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{possibilityLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {possibilityEntries.map(([name, value], i) => {
                const pct = possibilityTotal > 0 ? (value / possibilityTotal) * 100 : 0;
                const color = POSSIBILITY_COLORS[i % POSSIBILITY_COLORS.length];
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      <span className="text-sm text-muted-foreground">{value}건 ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 실적 순위 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 바이어 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              바이어 상담 순위
            </CardTitle>
          </CardHeader>
          <CardContent>
            {buyerRanking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
            ) : (
              <div className="space-y-2.5">
                {buyerRanking.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <RankBadge rank={i + 1} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground truncate pr-2">{item.name}</span>
                        <span className="text-xs font-semibold text-blue-600 shrink-0">{item.count}건</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-400 transition-all duration-500"
                            style={{ width: `${(item.count / maxBuyerCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 w-12">{item.country}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 셀러 */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              셀러 상담 순위
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sellerRanking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
            ) : (
              <div className="space-y-2.5">
                {sellerRanking.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <RankBadge rank={i + 1} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground truncate pr-2">{item.name}</span>
                        <span className="text-xs font-semibold text-emerald-600 shrink-0">{item.count}건</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                          style={{ width: `${(item.count / maxSellerCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({
  icon,
  iconBg,
  label,
  value,
  sub,
  isString,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number | string;
  sub?: string;
  isString?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">
              {isString ? value : Number(value).toLocaleString()}
            </p>
            {sub && (
              <p className="text-xs text-emerald-600 font-medium mt-0.5">{sub}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors = rank === 1
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : rank === 2
      ? 'bg-slate-50 text-slate-600 ring-slate-200'
      : rank === 3
        ? 'bg-orange-50 text-orange-700 ring-orange-200'
        : 'bg-muted text-muted-foreground ring-border';

  return (
    <span className={`w-7 h-7 rounded-lg ring-1 flex items-center justify-center text-xs font-bold shrink-0 ${colors}`}>
      {rank}
    </span>
  );
}
