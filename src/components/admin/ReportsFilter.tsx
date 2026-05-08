'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PaginationSelector } from '@/components/ui/pagination-selector';
import {
  FileText,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Clock,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

type FilterStatus = 'all' | 'submitted' | 'approved' | 'revision_requested' | 'rejected' | 'in_progress' | 'not_started';
type ViewMode = 'date' | 'booth' | 'time' | 'buyer' | 'seller';

interface ConsultationItem {
  id: string;
  buyer_name: string;
  seller_name: string;
  interpreter_name: string;
  booth_number: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'submitted' | 'approved' | 'revision_requested' | 'rejected' | 'in_progress' | 'not_started';
}

interface ReportsFilterProps {
  eventId: string;
  items: ConsultationItem[];
  counts: {
    total: number;
    submitted: number;
    approved: number;
    revisionRequested: number;
    rejected: number;
    inProgress: number;
    notStarted: number;
  };
}

const STATUS_TABS: { key: FilterStatus; label: string; icon: typeof FileText; color: string; activeColor: string }[] = [
  { key: 'all', label: '전체', icon: FileText, color: 'text-slate-400', activeColor: 'bg-card text-foreground shadow-sm' },
  { key: 'submitted', label: '검토중', icon: Clock, color: 'text-blue-600', activeColor: 'bg-card text-blue-700 shadow-sm' },
  { key: 'approved', label: '승인됨', icon: CheckCircle2, color: 'text-emerald-600', activeColor: 'bg-card text-emerald-700 shadow-sm' },
  { key: 'revision_requested', label: '수정요청', icon: RotateCcw, color: 'text-amber-600', activeColor: 'bg-card text-amber-700 shadow-sm' },
  { key: 'rejected', label: '반려', icon: XCircle, color: 'text-red-600', activeColor: 'bg-card text-red-700 shadow-sm' },
  { key: 'in_progress', label: '작성중', icon: FileText, color: 'text-orange-600', activeColor: 'bg-card text-orange-700 shadow-sm' },
  { key: 'not_started', label: '미작성', icon: AlertCircle, color: 'text-slate-500', activeColor: 'bg-card text-foreground/80 shadow-sm' },
];

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'date', label: '일자별' },
  { key: 'booth', label: '부스별' },
  { key: 'time', label: '시간별' },
  { key: 'buyer', label: '바이어별' },
  { key: 'seller', label: '셀러별' },
];

function getStatusBadge(status: ConsultationItem['status']) {
  switch (status) {
    case 'approved':
      return <Badge className="text-xs gap-1 bg-emerald-500"><CheckCircle2 className="w-3 h-3" />승인됨</Badge>;
    case 'submitted':
      return <Badge variant="outline" className="text-xs gap-1 border-blue-200 text-blue-700 bg-blue-50"><Clock className="w-3 h-3" />검토중</Badge>;
    case 'revision_requested':
      return <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 border-0"><RotateCcw className="w-3 h-3" />수정요청</Badge>;
    case 'rejected':
      return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" />반려</Badge>;
    case 'in_progress':
      return <Badge className="text-xs bg-orange-100 text-orange-700 border-0 gap-1"><FileText className="w-3 h-3" />작성중</Badge>;
    case 'not_started':
      return <Badge variant="secondary" className="text-xs gap-1"><AlertCircle className="w-3 h-3" />미작성</Badge>;
  }
}

function getItemKey(item: ConsultationItem, mode: ViewMode): string {
  switch (mode) {
    case 'date': return item.date;
    case 'booth': return item.booth_number || '부스 미지정';
    case 'time': return `${item.start_time} - ${item.end_time}`;
    case 'buyer': return item.buyer_name || '바이어 미지정';
    case 'seller': return item.seller_name || '셀러 미지정';
  }
}

export function ReportsFilter({ eventId, items, counts }: ReportsFilterProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [selectedValue, setSelectedValue] = useState<string>('_all');
  const [pageSize, setPageSize] = useState<number | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // 뷰 모드별 드롭다운 옵션 생성
  const viewOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach(item => set.add(getItemKey(item, viewMode)));
    return Array.from(set).sort();
  }, [items, viewMode]);

  // 1. 뷰 모드 필터
  const viewFiltered = useMemo(() => {
    if (selectedValue === '_all') return items;
    return items.filter(item => getItemKey(item, viewMode) === selectedValue);
  }, [items, viewMode, selectedValue]);

  // 2. 상태 필터
  const statusFiltered = useMemo(() => {
    if (filter === 'all') return viewFiltered;
    return viewFiltered.filter(i => i.status === filter);
  }, [viewFiltered, filter]);

  // 필터된 상태별 건수
  const filteredCounts = useMemo(() => {
    const c = { total: 0, submitted: 0, approved: 0, revisionRequested: 0, rejected: 0, inProgress: 0, notStarted: 0 };
    viewFiltered.forEach(i => {
      c.total++;
      if (i.status === 'submitted') c.submitted++;
      else if (i.status === 'approved') c.approved++;
      else if (i.status === 'revision_requested') c.revisionRequested++;
      else if (i.status === 'rejected') c.rejected++;
      else if (i.status === 'in_progress') c.inProgress++;
      else c.notStarted++;
    });
    return c;
  }, [viewFiltered]);

  // 3. 페이지네이션
  const paginated = useMemo(() => {
    if (pageSize === 'all') return statusFiltered;
    const start = (currentPage - 1) * pageSize;
    return statusFiltered.slice(start, start + pageSize);
  }, [statusFiltered, pageSize, currentPage]);

  // 날짜별 그룹핑 (표시용)
  const grouped = useMemo(() => {
    const map = new Map<string, ConsultationItem[]>();
    paginated.forEach(item => {
      const key = item.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  }, [paginated]);

  function getCount(key: FilterStatus) {
    if (key === 'all') return selectedValue === '_all' ? counts.total : filteredCounts.total;
    const fc = filteredCounts;
    if (key === 'submitted') return fc.submitted;
    if (key === 'approved') return fc.approved;
    if (key === 'revision_requested') return fc.revisionRequested;
    if (key === 'rejected') return fc.rejected;
    if (key === 'in_progress') return fc.inProgress;
    return fc.notStarted;
  }

  return (
    <div>
      {/* 뷰 모드 + 드롭다운 필터 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={viewMode} onValueChange={(v) => { if (v) { setViewMode(v as ViewMode); setSelectedValue('_all'); setCurrentPage(1); } }}>
          <SelectTrigger className="w-[120px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIEW_MODES.map(m => (
              <SelectItem key={m.key} value={m.key} className="text-sm">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedValue} onValueChange={(v) => { if (v) { setSelectedValue(v); setCurrentPage(1); setFilter('all'); } }}>
          <SelectTrigger className="w-[200px] h-9 text-sm">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all" className="text-sm">전체</SelectItem>
            {viewOptions.map(opt => (
              <SelectItem key={opt} value={opt} className="text-sm">{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedValue !== '_all' && (
          <button
            onClick={() => { setSelectedValue('_all'); setFilter('all'); }}
            className="text-xs text-blue-600 hover:underline"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex gap-1 bg-card rounded-lg p-1 mb-4 flex-wrap">
        {STATUS_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = filter === tab.key;
          const count = getCount(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); setCurrentPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all justify-center ${
                isActive ? tab.activeColor : `${tab.color} hover:bg-card`
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              <span className={`text-xs ${isActive ? 'opacity-100' : 'opacity-60'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* 페이지네이션 */}
      <div className="mb-4">
        <PaginationSelector
          totalItems={statusFiltered.length}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 목록 */}
      {statusFiltered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">
              {filter !== 'all' || selectedValue !== '_all' ? '해당 조건의 항목이 없습니다' : '상담 데이터가 없습니다'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, dateItems]) => {
            const dateApproved = dateItems.filter(i => i.status === 'approved').length;
            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    {date}
                  </div>
                  <span className="text-xs text-slate-400">
                    {filter === 'all' ? `${dateApproved}/${dateItems.length}건 승인` : `${dateItems.length}건`}
                  </span>
                  <div className="flex-1 h-px bg-card" />
                </div>

                <div className="space-y-2">
                  {dateItems.map(item => {
                    const isClickable = item.status !== 'not_started';
                    const content = (
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground truncate">{item.buyer_name}</span>
                              <span className="text-xs text-slate-400">x</span>
                              <span className="text-sm text-muted-foreground truncate">{item.seller_name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span>{item.start_time} - {item.end_time}</span>
                              {item.booth_number && <span>부스 {item.booth_number}</span>}
                              <span>통역: {item.interpreter_name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {getStatusBadge(item.status)}
                            {isClickable && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </CardContent>
                    );

                    return (
                      <Card key={item.id} className={`border-0 shadow-sm ${isClickable ? 'hover:shadow-md transition-shadow' : ''}`}>
                        {isClickable ? (
                          <Link href={`/admin/events/${eventId}/reports/${item.id}`}>{content}</Link>
                        ) : content}
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
