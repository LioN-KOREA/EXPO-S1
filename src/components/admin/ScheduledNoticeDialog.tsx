'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScheduledNoticeComposeForm } from './ScheduledNoticeComposeForm';
import { ScheduledNoticeList } from './ScheduledNoticeList';
import type { ScheduledNoticeRow } from '@/lib/scheduled-notice/repository';

type TabValue = 'compose' | 'list';

export interface ScheduledNoticeDialogProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  recipientUserIds: string[];
  /** 작성/수정/취소 성공 시 외부 알림 (호출자가 부수효과 있으면 사용) */
  onSubmitted?: () => void;
  /** 초기 탭 — 기본값 'compose' */
  initialTab?: TabValue;
}

export function ScheduledNoticeDialog({
  open,
  onClose,
  eventId,
  recipientUserIds,
  onSubmitted,
  initialTab = 'compose',
}: ScheduledNoticeDialogProps) {
  const [tab, setTab] = useState<TabValue>(initialTab);
  const [editInitial, setEditInitial] = useState<ScheduledNoticeRow | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const editing = editInitial !== null;

  function bumpRefresh() {
    setListRefreshKey((n) => n + 1);
  }

  function backToList() {
    setEditInitial(null);
    setTab('list');
    bumpRefresh();
  }

  function startEdit(row: ScheduledNoticeRow) {
    setEditInitial(row);
    setTab('compose');
  }

  function handleSubmitted() {
    onSubmitted?.();
    backToList();
  }

  function handleTabChange(value: TabValue) {
    // 수정 중 사용자가 직접 탭을 누르면 수정 상태를 해제한다.
    // - 목록 → 작성: "새 작성" 의도로 해석
    // - 작성(수정 모드) → 목록: 수정 포기로 해석 (다이얼로그 제목/탭 라벨도 원복)
    if (value !== tab) {
      setEditInitial(null);
    }
    setTab(value);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? '메시지 전송 예약 수정' : '메시지 전송 예약'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => handleTabChange(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="compose">{editing ? '수정' : '작성'}</TabsTrigger>
            <TabsTrigger value="list">예약 목록</TabsTrigger>
          </TabsList>

          <TabsContent value="compose">
            <ScheduledNoticeComposeForm
              key={editInitial?.id ?? 'new'}
              eventId={eventId}
              recipientUserIds={recipientUserIds}
              mode={editing ? 'edit' : 'create'}
              initial={editInitial}
              onSubmitted={handleSubmitted}
              onClose={editing ? backToList : onClose}
            />
          </TabsContent>

          <TabsContent value="list">
            <ScheduledNoticeList
              eventId={eventId}
              refreshKey={listRefreshKey}
              onEdit={startEdit}
              onCancelled={() => {
                onSubmitted?.();
                bumpRefresh();
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
