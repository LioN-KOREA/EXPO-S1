import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { ScheduledNoticeDialog } from '@/components/admin/ScheduledNoticeDialog';
import type { ScheduledNoticeRow } from '@/lib/scheduled-notice/repository';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

beforeEach(() => {
  toastSuccess.mockReset();
  toastError.mockReset();
});

function makeRow(id: string, message = '대기 중인 공지'): ScheduledNoticeRow {
  return {
    id,
    event_id: 'event-1',
    message,
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    recipient_user_ids: ['u1', 'u2'],
    sent_notice_id: null,
    failed_reason: null,
    created_by: 'admin-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function renderDialog(initialTab: 'compose' | 'list' = 'compose') {
  render(
    <ScheduledNoticeDialog
      open
      onClose={() => {}}
      eventId="event-1"
      recipientUserIds={['u1', 'u2']}
      initialTab={initialTab}
    />
  );
}

describe('ScheduledNoticeDialog 탭 통합', () => {
  it('탭 2개 렌더 — 작성 / 예약 목록', () => {
    server.use(http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [] })));
    renderDialog();
    expect(screen.getByRole('tab', { name: '작성' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '예약 목록' })).toBeInTheDocument();
  });

  it('목록 탭 → list fetch + 행 렌더', async () => {
    const r = makeRow('row-1', '공지A');
    server.use(http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [r] })));
    renderDialog('list');
    await waitFor(() => expect(screen.getByTestId('scheduled-row-row-1')).toBeInTheDocument());
  });

  it('목록 수정 클릭 → 작성 탭 전환 + initial prefill', async () => {
    const r = makeRow('row-edit', '편집 대상 메시지');
    server.use(http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [r] })));
    renderDialog('list');
    await waitFor(() => expect(screen.getByTestId('scheduled-row-row-edit')).toBeInTheDocument());

    fireEvent.click(
      within(screen.getByTestId('scheduled-row-row-edit')).getByRole('button', { name: '수정' })
    );

    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('편집 대상 메시지');
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
  });

  it('목록 취소 클릭 → DELETE 호출 + 목록 갱신', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const r = makeRow('row-cancel');
    let fetchCount = 0;
    server.use(
      http.get('/api/scheduled-notices', () => {
        fetchCount += 1;
        // 첫 fetch 는 row 1개, 두 번째 fetch (cancel 후 refresh) 는 빈 배열
        return HttpResponse.json({ items: fetchCount === 1 ? [r] : [] });
      }),
      http.delete('/api/scheduled-notices/row-cancel', () => HttpResponse.json({ ok: true }))
    );
    renderDialog('list');
    await waitFor(() => expect(screen.getByTestId('scheduled-row-row-cancel')).toBeInTheDocument());

    fireEvent.click(
      within(screen.getByTestId('scheduled-row-row-cancel')).getByRole('button', { name: '취소' })
    );
    await waitFor(() =>
      expect(screen.getByText('예약된 메시지가 없습니다.')).toBeInTheDocument()
    );
    confirmSpy.mockRestore();
  });

  it('작성 제출 성공 → 목록 탭으로 전환', async () => {
    server.use(
      http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [] })),
      http.post('/api/scheduled-notices', () => HttpResponse.json({ id: 'new' }))
    );
    renderDialog('compose');
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '새 공지' } });
    fireEvent.click(screen.getByRole('button', { name: '예약' }));

    await waitFor(() =>
      expect(screen.getByText('예약된 메시지가 없습니다.')).toBeInTheDocument()
    );
  });

  it('수정 중 목록 탭 클릭 → editing 해제 (작성 탭 라벨 복원)', async () => {
    const r = makeRow('row-x', '편집 중');
    server.use(http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [r] })));
    renderDialog('list');
    await waitFor(() => expect(screen.getByTestId('scheduled-row-row-x')).toBeInTheDocument());

    // 목록 → 수정 클릭 → 작성 탭(수정 모드, 라벨 '수정')
    fireEvent.click(within(screen.getByTestId('scheduled-row-row-x')).getByRole('button', { name: '수정' }));
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('편집 중');
    expect(screen.getByRole('tab', { name: '수정' })).toBeInTheDocument();

    // 목록 탭 클릭 → editing 해제 — 다시 작성 탭 라벨이 '작성' 으로 복원
    fireEvent.click(screen.getByRole('tab', { name: '예약 목록' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: '작성' })).toBeInTheDocument());

    // 작성 탭 클릭 → 빈 메시지
    fireEvent.click(screen.getByRole('tab', { name: '작성' }));
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('');
  });
});
