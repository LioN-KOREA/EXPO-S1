'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CheckCircle2, TrendingUp, BarChart3, Globe, DollarSign } from 'lucide-react';

interface Props {
  totalConsultations: number;
  totalMainAmount: number;
  mainAmountLabel: string;
  statusCounts: Record<string, number>;
  amountTotals: { label: string; total: number; key: string }[];
  possibilityCounts: Record<string, number>;
  possibilityLabel: string;
  avgPossibility: number;
  buyerRanking: { name: string; country: string; amount: number; count: number }[];
  sellerRanking: { name: string; amount: number; count: number }[];
  countryMetrics: { country: string; count: number; amount: number; avgPossibility: number }[];
}

const STATUS_CONFIG: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'approved', label: '승인', color: '#10b981', bg: 'bg-emerald-500' },
  { key: 'submitted', label: '검토중', color: '#3b82f6', bg: 'bg-blue-500' },
  { key: 'revision_requested', label: '수정요청', color: '#f59e0b', bg: 'bg-amber-500' },
  { key: 'rejected', label: '반려', color: '#ef4444', bg: 'bg-red-500' },
  { key: 'draft', label: '작성중', color: '#8b5cf6', bg: 'bg-violet-500' },
  { key: 'not_started', label: '미작성', color: '#cbd5e1', bg: 'bg-slate-300' },
];

const POSSIBILITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatUSD(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

export function EventDashboardClient({
  totalConsultations,
  totalMainAmount,
  mainAmountLabel,
  statusCounts,
  amountTotals,
  possibilityCounts,
  possibilityLabel,
  avgPossibility,
  buyerRanking,
  sellerRanking,
  countryMetrics,
}: Props) {
  const [rankTab, setRankTab] = useState<'buyer' | 'seller'>('buyer');
  const [metricTab, setMetricTab] = useState<'count' | 'amount' | 'possibility'>('count');

  const totalActive = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const possibilityTotal = Object.values(possibilityCounts).reduce((a, b) => a + b, 0);
  const possibilityEntries = Object.entries(possibilityCounts);

  // 성과지표 정렬
  const sortedCountry = [...countryMetrics].sort((a, b) => {
    if (metricTab === 'count') return b.count - a.count;
    if (metricTab === 'amount') return b.amount - a.amount;
    return b.avgPossibility - a.avgPossibility;
  });
  const maxMetric = sortedCountry[0]
    ? (metricTab === 'count' ? sortedCountry[0].count : metricTab === 'amount' ? sortedCountry[0].amount : sortedCountry[0].avgPossibility)
    : 1;

  return (
    <div className="space-y-6">

      {/* ── 1. 총 수출상담액 (히어로) ── */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-blue-600 to-indigo-600">
        <CardContent className="p-4 sm:p-6">
          <p className="text-xs sm:text-sm text-blue-100 font-medium">총 {mainAmountLabel}</p>
          <p className="text-2xl sm:text-4xl font-bold text-white mt-1 sm:mt-2 tracking-tight break-all">
            ${totalMainAmount.toLocaleString()}
          </p>
        </CardContent>
      </Card>

      {/* ── 2. 4개 통계 카드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          iconBg="bg-blue-50 text-blue-600"
          label="총 상담건수"
          value={`${totalConsultations}건`}
        />
        {amountTotals.slice(1, 3).map((amt, i) => (
          <StatCard
            key={i}
            icon={<DollarSign className="w-5 h-5" />}
            iconBg={i === 0 ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'}
            label={amt.label}
            value={formatUSD(amt.total)}
          />
        ))}
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-amber-50 text-amber-600"
          label="평균 거래가능성"
          value={`${avgPossibility}%`}
        />
      </div>

      {/* ── 3. 상담일지 현황 ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            상담일지 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                    <span className="text-[11px] font-semibold text-white drop-shadow-sm">{count}</span>
                  )}
                </div>
              );
            })}
          </div>
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

      {/* ── 4. 거래가능성 ── */}
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

      {/* ── 5. 실적순위 (금액 기준, 바이어/셀러 탭) ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              실적순위
            </CardTitle>
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setRankTab('buyer')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  rankTab === 'buyer' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                바이어
              </button>
              <button
                onClick={() => setRankTab('seller')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  rankTab === 'seller' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                셀러
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{mainAmountLabel} 기준으로 주요 성과 업체를 파악할 수 있어요.</p>
        </CardHeader>
        <CardContent>
          {rankTab === 'buyer' ? (
            <RankingList
              items={buyerRanking.map(b => ({
                name: b.name,
                sub: b.country,
                value: formatUSD(b.amount),
                rawValue: b.amount,
                count: b.count,
              }))}
              color="blue"
            />
          ) : (
            <RankingList
              items={sellerRanking.map(s => ({
                name: s.name,
                value: formatUSD(s.amount),
                rawValue: s.amount,
                count: s.count,
              }))}
              color="emerald"
            />
          )}
        </CardContent>
      </Card>

      {/* ── 6. 성과지표 (국가별, 탭 전환) ── */}
      {countryMetrics.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                성과지표
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">각 기준별로 성과가 높은 국가와 주요 분야를 파악할 수 있어요.</p>
            <div className="flex gap-1 mt-3">
              {[
                { key: 'count' as const, label: '상담건수' },
                { key: 'amount' as const, label: mainAmountLabel },
                { key: 'possibility' as const, label: '거래가능성' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setMetricTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    metricTab === tab.key
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedCountry.slice(0, 15).map((item) => {
                const value = metricTab === 'count' ? item.count : metricTab === 'amount' ? item.amount : item.avgPossibility;
                const pct = maxMetric > 0 ? (value / maxMetric) * 100 : 0;
                const displayValue = metricTab === 'count' ? `${item.count}건` : metricTab === 'amount' ? formatUSD(item.amount) : `${item.avgPossibility}%`;
                const barColor = metricTab === 'count' ? '#3b82f6' : metricTab === 'amount' ? '#8b5cf6' : '#10b981';

                return (
                  <div key={item.country}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{item.country}</span>
                      <span className="text-sm text-muted-foreground">{displayValue}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
              {sortedCountry.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 truncate">{label}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground tracking-tight truncate">{value}</p>
          </div>
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankingList({
  items,
  color,
}: {
  items: { name: string; sub?: string; value: string; rawValue: number; count: number }[];
  color: 'blue' | 'emerald';
}) {
  const maxVal = items[0]?.rawValue || 1;
  const barClass = color === 'blue' ? 'bg-blue-400' : 'bg-emerald-400';
  const textClass = color === 'blue' ? 'text-blue-600' : 'text-emerald-600';

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">데이터 없음</p>;
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <RankBadge rank={i + 1} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                {item.sub && <span className="text-[10px] text-muted-foreground shrink-0">{item.sub}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{item.count}건</span>
                <span className={`text-xs font-semibold ${textClass}`}>{item.value}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${barClass} transition-all duration-500`}
                style={{ width: `${maxVal > 0 ? (item.rawValue / maxVal) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
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
