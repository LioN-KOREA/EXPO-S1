'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Table2, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Link from 'next/link';

interface EventStat {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  consultationCount: number;
  approvedCount: number;
  submittedCount: number;
  draftCount: number;
  notStartedCount: number;
  rate: number;
}

interface OverallProps {
  eventStats: EventStat[];
  totalConsultations: number;
  totalApproved: number;
  totalSubmitted: number;
}

const STATUS_COLORS = { approved: '#10b981', submitted: '#3b82f6', draft: '#f59e0b', notStarted: '#94a3b8' };

export function OverallDashboardClient({ eventStats, totalConsultations, totalApproved, totalSubmitted }: OverallProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const overallStatusData = [
    { name: '승인됨', value: totalApproved, color: STATUS_COLORS.approved },
    { name: '검토중', value: totalSubmitted, color: STATUS_COLORS.submitted },
    { name: '작성중/미작성', value: totalConsultations - totalApproved - totalSubmitted, color: STATUS_COLORS.notStarted },
  ].filter(d => d.value > 0);

  // 상담회 비교 차트 데이터
  const comparisonData = eventStats.map(e => ({
    name: e.name.length > 10 ? e.name.substring(0, 10) + '...' : e.name,
    fullName: e.name,
    상담건수: e.consultationCount,
    승인: e.approvedCount,
    검토중: e.submittedCount,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <Button variant={viewMode === 'chart' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('chart')} className="gap-1.5 h-7 text-xs">
            <BarChart3 className="w-3.5 h-3.5" />차트
          </Button>
          <Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('table')} className="gap-1.5 h-7 text-xs">
            <Table2 className="w-3.5 h-3.5" />테이블
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 전체 일지 현황 */}
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">전체 상담일지 현황</CardTitle></CardHeader>
          <CardContent>
            {viewMode === 'chart' ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overallStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}`}>
                      {overallStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-2">
                {overallStatusData.map(item => (
                  <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-semibold">{item.value}건</span>
                  </div>
                ))}
                <div className="pt-2 border-t mt-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>합계</span>
                    <span>{totalConsultations}건</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 상담회별 비교 */}
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">상담회별 비교</CardTitle></CardHeader>
          <CardContent>
            {viewMode === 'chart' && comparisonData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="상담건수" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="승인" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="검토중" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">상담회</th>
                      <th className="px-3 py-2 text-right font-medium">상담</th>
                      <th className="px-3 py-2 text-right font-medium">승인</th>
                      <th className="px-3 py-2 text-right font-medium">검토중</th>
                      <th className="px-3 py-2 text-right font-medium">진행률</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {eventStats.map((e, i) => (
                      <tr key={e.id} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground font-medium truncate max-w-[150px]">{e.name}</span>
                            <Badge variant={e.status === 'active' ? 'default' : 'secondary'} className="text-[9px]">
                              {e.status === 'active' ? '진행' : '종료'}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{e.consultationCount}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{e.approvedCount}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{e.submittedCount}</td>
                        <td className="px-3 py-2 text-right font-medium">{e.rate}%</td>
                        <td className="px-2 py-2">
                          <Link href={`/admin/events/${e.id}/dashboard`}>
                            <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
