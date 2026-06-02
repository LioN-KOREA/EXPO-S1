import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';
import { ScheduledNoticeComposeForm } from '@/components/admin/ScheduledNoticeComposeForm';
import type { ScheduledNoticeRow } from '@/lib/scheduled-notice/repository';

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

function renderForm(overrides: Partial<React.ComponentProps<typeof ScheduledNoticeComposeForm>> = {}) {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();
  render(
    <ScheduledNoticeComposeForm
      eventId="event-1"
      recipientUserIds={['u1', 'u2']}
      mode="create"
      onSubmitted={onSubmitted}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onSubmitted, onClose };
}

function makeInitial(overrides: Partial<ScheduledNoticeRow> = {}): ScheduledNoticeRow {
  return {
    id: 'sched-1',
    event_id: 'event-1',
    message: '원본 메시지',
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    recipient_user_ids: ['u1', 'u2'],
    sent_notice_id: null,
    failed_reason: null,
    created_by: 'admin-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ScheduledNoticeComposeForm', () => {
  it('대상자 카운트 표시', () => {
    renderForm({ recipientUserIds: ['a', 'b', 'c'] });
    expect(screen.getByText('3명')).toBeInTheDocument();
  });

  it('작성 모드 — 본문 입력 + 제출 → POST 호출', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    server.use(
      http.post('/api/scheduled-notices', async ({ request }) => {
        captured.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'new-id' });
      })
    );

    const { onSubmitted } = renderForm();
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '점심시간 안내' } });
    fireEvent.click(screen.getByRole('button', { name: '예약' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(captured.body).toMatchObject({
      event_id: 'event-1',
      message: '점심시간 안내',
      recipient_user_ids: ['u1', 'u2'],
    });
    expect(captured.body?.scheduled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(onSubmitted).toHaveBeenCalled();
  });

  it('지금 발송 토글 → datetime input 비활성 + scheduled_at 거의 현재', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    server.use(
      http.post('/api/scheduled-notices', async ({ request }) => {
        captured.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'new-id' });
      })
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '긴급' } });
    fireEvent.click(screen.getByLabelText(/지금 발송/));
    expect(screen.getByLabelText('발송 시각 (현지)')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '예약' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const sentAt = new Date(captured.body?.scheduled_at as string).getTime();
    expect(Math.abs(sentAt - Date.now())).toBeLessThan(60 * 1000);
  });

  it('빈 본문 → 검증 실패 + POST 호출 안 됨', () => {
    const postSpy = vi.fn(() => HttpResponse.json({ id: 'should-not-happen' }));
    server.use(http.post('/api/scheduled-notices', postSpy));

    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '예약' }));

    expect(toastError).toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('과거 시각 → 검증 실패', () => {
    const postSpy = vi.fn(() => HttpResponse.json({ id: 'should-not-happen' }));
    server.use(http.post('/api/scheduled-notices', postSpy));

    renderForm();
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '메시지' } });
    fireEvent.change(screen.getByLabelText('발송 시각 (현지)'), {
      target: { value: '2020-01-01T00:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '예약' }));

    expect(toastError).toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('서버 에러 코드 → 한글 메시지로 toast', async () => {
    server.use(
      http.post('/api/scheduled-notices', () =>
        HttpResponse.json({ error: 'not_admin' }, { status: 400 })
      )
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '예약' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [arg] = toastError.mock.calls[0];
    expect(typeof arg).toBe('string');
    expect(arg).toContain('관리자');
  });

  it('수정 모드 — initial prefill + 예약 취소 버튼 노출', () => {
    renderForm({ mode: 'edit', initial: makeInitial({ message: '미리 채워진 메시지' }) });
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('미리 채워진 메시지');
    expect(screen.getByRole('button', { name: '예약 취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
  });

  it('수정 모드 제출 → PATCH 호출', async () => {
    const captured: { method?: string; body?: Record<string, unknown> } = {};
    server.use(
      http.patch('/api/scheduled-notices/sched-1', async ({ request }) => {
        captured.method = request.method;
        captured.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      })
    );
    renderForm({ mode: 'edit', initial: makeInitial() });

    const ta = screen.getByLabelText('메시지') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '수정된 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(captured.method).toBe('PATCH');
    expect(captured.body?.message).toBe('수정된 메시지');
  });

  it('수정 모드 — 예약 취소 → confirm 후 DELETE', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteSpy = vi.fn(() => HttpResponse.json({ ok: true }));
    server.use(http.delete('/api/scheduled-notices/sched-1', deleteSpy));

    renderForm({ mode: 'edit', initial: makeInitial() });

    fireEvent.click(screen.getByRole('button', { name: '예약 취소' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('수정 모드 — recipient_user_ids 는 initial 기준 (부모가 다른 ids 전달해도 row 원본 유지)', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    server.use(
      http.patch('/api/scheduled-notices/sched-1', async ({ request }) => {
        captured.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      })
    );
    const initial = makeInitial({ recipient_user_ids: ['ORIGINAL-1', 'ORIGINAL-2'] });
    renderForm({
      mode: 'edit',
      initial,
      // 부모는 다른 user_ids 전달 (현재 필터 결과 등)
      recipientUserIds: ['UNRELATED-A', 'UNRELATED-B', 'UNRELATED-C'],
    });

    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(captured.body?.recipient_user_ids).toEqual(['ORIGINAL-1', 'ORIGINAL-2']);
    // 대상자 카운트 표시도 initial 기준
    // (위 fireEvent 전에 검증) — 별도 케이스
  });

  it('수정 모드 — 대상자 카운트 표시는 initial 기준', () => {
    const initial = makeInitial({ recipient_user_ids: ['X', 'Y', 'Z', 'W'] });
    renderForm({
      mode: 'edit',
      initial,
      recipientUserIds: ['IGNORED-1'],
    });
    expect(screen.getByText('4명')).toBeInTheDocument();
  });

  it('수정 모드 — confirm 거부 시 DELETE 호출 안 됨', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteSpy = vi.fn(() => HttpResponse.json({ ok: true }));
    server.use(http.delete('/api/scheduled-notices/sched-1', deleteSpy));

    renderForm({ mode: 'edit', initial: makeInitial() });

    fireEvent.click(screen.getByRole('button', { name: '예약 취소' }));
    expect(deleteSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
