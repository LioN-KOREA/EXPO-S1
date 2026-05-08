'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Table2, FileText, CheckCircle2, Clock, RotateCcw, AlertCircle, TrendingUp } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface Props {
  totalConsultations: number;
  statusCounts: Record<string, number>;
  amountTotals: { label: string; total: number }[];
  possibilityCounts: Record<string, number>;
  possibilityLabel: string;
  buyerRanking: { name: string; country: string; count: number }[];
  sellerRanking: { name: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  approved: '#10b981',
  submitted: '#3b82f6',
  revision_requested: '#ef4444',
  draft: '#f59e0b',
  not_started: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  approved: '승인됨',
  submitted: '검토중',
  revision_requested: '수정요청',
  draft: '작성중',
  not_started: '미작성',
};

function formatAmount(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
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
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const statusData = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: STATUS_LABELS[key] || key, value, color: STATUS_COLORS[key] || '#94a3b8' }));

  const possibilityData = Object.entries(possibilityCounts).map(([key, value]) => ({ name: key, value }));
  const POSSIBILITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* 뷰 모드 토글 */}
      <div className="flex justify-end">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'chart' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('chart')}
            className="gap-1.5 h-7 text-xs"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            차트
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            className="gap-1.5 h-7 text-xs"
          >
            <Table2 className="w-3.5 h-3.5" />
            테이블
          </Button>
        </div>
      </div>

      {/* 요약 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <FileText className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{totalConsultations}</p>
            <p className="text-xs text-muted-foreground">총 상담건수</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-foreground">{statusCounts.approved || 0}</p>
            <p className="text-xs text-muted-foreground">승인 완료</p>
          </CardContent>
        </Card>
        {amountTotals.slice(0, 2).map((amt, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-5 h-5 text-purple-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-foreground">{formatAmount(amt.total)}</p>
              <p className="text-xs text-muted-foreground">{amt.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 상담일지 상태 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">상담일지 현황</CardTitle></CardHeader>
          <CardContent>
            {viewMode === 'chart' ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}`}>
                      {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-2">
                {statusData.map(item => (
                  <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-foreground">{item.name}</span>
                    </div>
                    <span className="text-sm font-semibold">{item.value}건</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 거래가능성 */}
        {possibilityData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">{possibilityLabel}</CardTitle></CardHeader>
            <CardContent>
              {viewMode === 'chart' ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={possibilityData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}`}>
                        {possibilityData.map((_, i) => <Cell key={i} fill={POSSIBILITY_COLORS[i % POSSIBILITY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="space-y-2">
                  {possibilityData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: POSSIBILITY_COLORS[i % POSSIBILITY_COLORS.length] }} />
                        <span className="text-sm text-foreground">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold">{item.value}건</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 금액 통계 (3개 이상 금액 필드가 있을 때) */}
      {amountTotals.length > 2 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">금액 통계</CardTitle></CardHeader>
          <CardContent>
            {viewMode === 'chart' ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={amountTotals}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={formatAmount} />
                    <Tooltip formatter={(value) => Number(value).toLocaleString()} />
                    <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-2">
                {amountTotals.map(item => (
                  <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-sm text-foreground">{item.label}</span>
                    <span className="text-sm font-semibold">{item.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 실적 순위 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">바이어 상담 순위</CardTitle></CardHeader>
          <CardContent>
            {viewMode === 'chart' && buyerRanking.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={buyerRanking} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="상담건수" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-1.5">
                {buyerRanking.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0">{i + 1}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.country}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-600">{item.count}건</span>
                  </div>
                ))}
                {buyerRanking.length === 0 && <p className="text-sm text-muted-foreground">데이터 없음</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">셀러 상담 순위</CardTitle></CardHeader>
          <CardContent>
            {viewMode === 'chart' && sellerRanking.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sellerRanking} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="상담건수" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sellerRanking.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0">{i + 1}</Badge>
                    <p className="text-sm font-medium text-foreground truncate flex-1">{item.name}</p>
                    <span className="text-sm font-semibold text-emerald-600">{item.count}건</span>
                  </div>
                ))}
                {sellerRanking.length === 0 && <p className="text-sm text-muted-foreground">데이터 없음</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
