import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { ScheduledNoticeList } from '@/components/admin/ScheduledNoticeList';
import type {
  ScheduledNoticeRow,
  ScheduledNoticeStatus,
} from '@/lib/scheduled-notice/repository';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
});

function row(overrides: Partial<ScheduledNoticeRow> & { id: string; status: ScheduledNoticeStatus }): ScheduledNoticeRow {
  return {
    event_id: 'event-1',
    message: '메시지',
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    recipient_user_ids: ['u1'],
    sent_notice_id: null,
    failed_reason: null,
    created_by: 'admin-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as ScheduledNoticeRow;
}

function mockList(items: ScheduledNoticeRow[]) {
  server.use(
    http.get('/api/scheduled-notices', () => HttpResponse.json({ items }))
  );
}

describe('ScheduledNoticeList', () => {
  it('빈 응답 → placeholder', async () => {
    mockList([]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByText('예약된 메시지가 없습니다.')).toBeInTheDocument());
  });

  it('scheduled 상태 → 수정/취소 버튼 노출', async () => {
    mockList([row({ id: 'a', status: 'scheduled', message: '대기 중인 공지' })]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-a')).toBeInTheDocument());
    const r = screen.getByTestId('scheduled-row-a');
    expect(within(r).getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  it('sent/cancelled 상태 → 수정/취소 버튼 숨김', async () => {
    mockList([
      row({ id: 'sent1', status: 'sent' }),
      row({ id: 'can1', status: 'cancelled' }),
    ]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-sent1')).toBeInTheDocument());
    expect(within(screen.getByTestId('scheduled-row-sent1')).queryByRole('button', { name: '수정' })).toBeNull();
    expect(within(screen.getByTestId('scheduled-row-sent1')).queryByRole('button', { name: '취소' })).toBeNull();
    expect(within(screen.getByTestId('scheduled-row-can1')).queryByRole('button', { name: '수정' })).toBeNull();
  });

  it('cancelled 상태 → 취소 버튼 미노출 (이미 취소됨)', async () => {
    mockList([row({ id: 'c1', status: 'cancelled' })]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-c1')).toBeInTheDocument());
    expect(within(screen.getByTestId('scheduled-row-c1')).queryByRole('button', { name: '취소' })).toBeNull();
  });

  it('failed 상태 → 수정/취소 버튼 미노출 (사유 버튼만)', async () => {
    mockList([row({ id: 'f2', status: 'failed', failed_reason: 'x' })]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-f2')).toBeInTheDocument());
    expect(within(screen.getByTestId('scheduled-row-f2')).queryByRole('button', { name: '수정' })).toBeNull();
    expect(within(screen.getByTestId('scheduled-row-f2')).queryByRole('button', { name: '취소' })).toBeNull();
    expect(within(screen.getByTestId('scheduled-row-f2')).getByRole('button', { name: '실패 사유' })).toBeInTheDocument();
  });

  it('failed 상태 → 실패 사유 버튼 + 토글', async () => {
    mockList([row({ id: 'f1', status: 'failed', failed_reason: 'dispatch_timeout' })]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-f1')).toBeInTheDocument());
    const r = screen.getByTestId('scheduled-row-f1');
    const btn = within(r).getByRole('button', { name: '실패 사유' });
    fireEvent.click(btn);
    expect(within(r).getByTestId('failed-reason-f1')).toHaveTextContent('dispatch_timeout');
    fireEvent.click(within(r).getByRole('button', { name: '사유 닫기' }));
    expect(within(r).queryByTestId('failed-reason-f1')).toBeNull();
  });

  it('수정 버튼 클릭 → onEdit(row) 콜백', async () => {
    const onEdit = vi.fn();
    const r = row({ id: 'edit-row', status: 'scheduled', message: '편집 대상' });
    mockList([r]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={onEdit} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-edit-row')).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId('scheduled-row-edit-row')).getByRole('button', { name: '수정' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'edit-row' }));
  });

  it('취소 버튼 → confirm 후 DELETE → onCancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCancelled = vi.fn();
    const r = row({ id: 'cancel-me', status: 'scheduled' });
    server.use(
      http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [r] })),
      http.delete('/api/scheduled-notices/cancel-me', () => HttpResponse.json({ ok: true }))
    );
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} onCancelled={onCancelled} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-cancel-me')).toBeInTheDocument());

    fireEvent.click(within(screen.getByTestId('scheduled-row-cancel-me')).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('취소 confirm 거부 → DELETE 호출 안 됨', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteSpy = vi.fn(() => HttpResponse.json({ ok: true }));
    const r = row({ id: 'no-cancel', status: 'scheduled' });
    server.use(
      http.get('/api/scheduled-notices', () => HttpResponse.json({ items: [r] })),
      http.delete('/api/scheduled-notices/no-cancel', deleteSpy)
    );
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-row-no-cancel')).toBeInTheDocument());

    fireEvent.click(within(screen.getByTestId('scheduled-row-no-cancel')).getByRole('button', { name: '취소' }));
    expect(deleteSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('GET 에러 → toast (한글 매핑)', async () => {
    server.use(
      http.get('/api/scheduled-notices', () =>
        HttpResponse.json({ error: 'not_admin' }, { status: 400 })
      )
    );
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [arg] = toastError.mock.calls[0];
    expect(arg).toContain('관리자');
  });

  it('scheduled_at ASC 정렬', async () => {
    mockList([
      row({ id: 'late', status: 'scheduled', scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }),
      row({ id: 'early', status: 'scheduled', scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
    ]);
    render(<ScheduledNoticeList eventId="event-1" onEdit={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('scheduled-notice-list')).toBeInTheDocument());
    const items = screen.getAllByTestId(/^scheduled-row-/);
    expect(items[0]).toHaveAttribute('data-testid', 'scheduled-row-early');
    expect(items[1]).toHaveAttribute('data-testid', 'scheduled-row-late');
  });
});
