'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

type FilterStatus = 'all' | 'submitted' | 'approved' | 'revision_requested' | 'in_progress' | 'not_started';

interface ConsultationItem {
  id: string;
  buyer_name: string;
  seller_name: string;
  interpreter_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'submitted' | 'approved' | 'revision_requested' | 'in_progress' | 'not_started';
}

interface ReportsFilterProps {
  eventId: string;
  items: ConsultationItem[];
  counts: {
    total: number;
    submitted: number;
    approved: number;
    revisionRequested: number;
    inProgress: number;
    notStarted: number;
  };
}

const TABS: { key: FilterStatus; label: string; icon: typeof FileText; color: string; activeColor: string }[] = [
  { key: 'all', label: '전체', icon: FileText, color: 'text-slate-400', activeColor: 'bg-card text-foreground shadow-sm' },
  { key: 'submitted', label: '검토중', icon: Clock, color: 'text-blue-600', activeColor: 'bg-card text-blue-700 shadow-sm' },
  { key: 'approved', label: '승인됨', icon: CheckCircle2, color: 'text-emerald-600', activeColor: 'bg-card text-emerald-700 shadow-sm' },
  { key: 'revision_requested', label: '수정요청', icon: RotateCcw, color: 'text-red-600', activeColor: 'bg-card text-red-700 shadow-sm' },
  { key: 'in_progress', label: '작성중', icon: FileText, color: 'text-amber-600', activeColor: 'bg-card text-amber-700 shadow-sm' },
  { key: 'not_started', label: '미작성', icon: AlertCircle, color: 'text-slate-500', activeColor: 'bg-card text-foreground/80 shadow-sm' },
];

function getStatusBadge(status: ConsultationItem['status']) {
  switch (status) {
    case 'approved':
      return <Badge className="text-xs gap-1 bg-emerald-500"><CheckCircle2 className="w-3 h-3" />승인됨</Badge>;
    case 'submitted':
      return <Badge variant="outline" className="text-xs gap-1 border-blue-200 text-blue-700 bg-blue-50"><Clock className="w-3 h-3" />검토중</Badge>;
    case 'revision_requested':
      return <Badge variant="destructive" className="text-xs gap-1"><RotateCcw className="w-3 h-3" />수정요청</Badge>;
    case 'in_progress':
      return <Badge className="text-xs bg-amber-100 text-amber-700 border-0 gap-1"><FileText className="w-3 h-3" />작성중</Badge>;
    case 'not_started':
      return <Badge variant="secondary" className="text-xs gap-1"><AlertCircle className="w-3 h-3" />미작성</Badge>;
  }
}

export function ReportsFilter({ eventId, items, counts }: ReportsFilterProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  // 날짜별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, ConsultationItem[]>();
    filtered.forEach((item) => {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date)!.push(item);
    });
    return map;
  }, [filtered]);

  function getCount(key: FilterStatus) {
    if (key === 'all') return counts.total;
    if (key === 'submitted') return counts.submitted;
    if (key === 'approved') return counts.approved;
    if (key === 'revision_requested') return counts.revisionRequested;
    if (key === 'in_progress') return counts.inProgress;
    return counts.notStarted;
  }

  return (
    <div>
      {/* 상태 필터 탭 */}
      <div className="flex gap-1 bg-card rounded-lg p-1 mb-6 flex-wrap">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = filter === tab.key;
          const count = getCount(tab.key);

          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all justify-center ${
                isActive ? tab.activeColor : `${tab.color} hover:bg-card`
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              <span className={`text-xs ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">
              {filter !== 'all' ? '해당 상태의 항목이 없습니다' : '상담 데이터가 없습니다'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, dateItems]) => {
            const dateApproved = dateItems.filter((i) => i.status === 'approved').length;
            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    {date}
                  </div>
                  <span className="text-xs text-slate-400">
                    {filter === 'all'
                      ? `${dateApproved}/${dateItems.length}건 승인`
                      : `${dateItems.length}건`}
                  </span>
                  <div className="flex-1 h-px bg-card" />
                </div>

                <div className="space-y-2">
                  {dateItems.map((item) => {
                    const isClickable = item.status !== 'not_started';

                    const content = (
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground truncate">
                                {item.buyer_name}
                              </span>
                              <span className="text-xs text-slate-400">x</span>
                              <span className="text-sm text-muted-foreground truncate">
                                {item.seller_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span>{item.start_time} - {item.end_time}</span>
                              <span>통역: {item.interpreter_name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {getStatusBadge(item.status)}
                            {isClickable && (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    );

                    return (
                      <Card
                        key={item.id}
                        className={`border-0 shadow-sm ${isClickable ? 'hover:shadow-md transition-shadow' : ''}`}
                      >
                        {isClickable ? (
                          <Link href={`/admin/events/${eventId}/reports/${item.id}`}>
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
