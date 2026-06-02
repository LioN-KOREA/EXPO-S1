import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventsPage from '@/app/admin/events/page';

// 버그 #20 S1 회귀: loadEvents / loadDeletedEvents silent fail 차단

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

type Filter = 'active' | 'deleted';
const queryState: Record<Filter, { result: { data: unknown; error: unknown }; throwErr: Error | null }> = {
  active: { result: { data: [], error: null }, throwErr: null },
  deleted: { result: { data: [], error: null }, throwErr: null },
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      let filter: Filter = 'active';
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.is = () => {
        filter = 'active';
        return builder;
      };
      builder.not = () => {
        filter = 'deleted';
        return builder;
      };
      builder.order = () => {
        const s = queryState[filter];
        if (s.throwErr) return Promise.reject(s.throwErr);
        return Promise.resolve(s.result);
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  queryState.active = { result: { data: [], error: null }, throwErr: null };
  queryState.deleted = { result: { data: [], error: null }, throwErr: null };
});

describe('admin EventsPage (버그 #20 S1)', () => {
  it('정상 빈 목록 → placeholder + 로딩 해제', async () => {
    render(<EventsPage />);
    await waitFor(() =>
      expect(screen.getByText('등록된 상담회가 없습니다')).toBeInTheDocument()
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('loadEvents reject → toast.error + 로딩 해제 + placeholder 렌더', async () => {
    queryState.active.throwErr = new Error('network down');
    render(<EventsPage />);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        '상담회 목록을 불러오지 못했습니다. 새로고침해 주세요.'
      )
    );
    expect(screen.getByText('등록된 상담회가 없습니다')).toBeInTheDocument();
  });

  it('loadEvents 가 error 객체 반환 → toast.error', async () => {
    queryState.active.result = { data: null, error: { message: 'RLS denied' } };
    render(<EventsPage />);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });

  it('loadDeletedEvents reject → toast.error', async () => {
    queryState.deleted.throwErr = new Error('rls fail');
    render(<EventsPage />);
    await waitFor(() => expect(screen.getByText('삭제된 상담회 보기')).toBeInTheDocument());
    fireEvent.click(screen.getByText('삭제된 상담회 보기'));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        '삭제된 상담회 목록을 불러오지 못했습니다.'
      )
    );
  });
});
