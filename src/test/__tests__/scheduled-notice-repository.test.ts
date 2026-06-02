import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelScheduledNotice,
  createScheduledNotice,
  listScheduledNotices,
  updateScheduledNotice,
} from '@/lib/scheduled-notice/repository';
import { ScheduledNoticeError } from '@/lib/scheduled-notice/errors';

type RpcResult = { data: unknown; error: { message: string } | null };

function makeClient(result: RpcResult) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('scheduled-notice repository', () => {
  describe('createScheduledNotice', () => {
    it('성공 시 id 반환 + RPC 인자 전달', async () => {
      const { client, rpc } = makeClient({ data: 'uuid-123', error: null });
      const out = await createScheduledNotice(client, {
        event_id: 'event-1',
        message: '안녕',
        scheduled_at: '2026-06-03T01:00:00.000Z',
        recipient_user_ids: ['u1', 'u2'],
      });
      expect(out).toEqual({ id: 'uuid-123' });
      expect(rpc).toHaveBeenCalledWith('create_scheduled_notice', {
        p_event_id: 'event-1',
        p_message: '안녕',
        p_scheduled_at: '2026-06-03T01:00:00.000Z',
        p_recipient_user_ids: ['u1', 'u2'],
      });
    });

    it('영문 키워드 에러 → ScheduledNoticeError 매핑', async () => {
      const { client } = makeClient({ data: null, error: { message: 'past_schedule' } });
      await expect(
        createScheduledNotice(client, {
          event_id: 'event-1',
          message: '안녕',
          scheduled_at: 'x',
          recipient_user_ids: ['u1'],
        })
      ).rejects.toMatchObject({ code: 'past_schedule' });
    });

    it('미지 에러 → unknown 코드', async () => {
      const { client } = makeClient({ data: null, error: { message: 'connection reset' } });
      await expect(
        createScheduledNotice(client, {
          event_id: 'e',
          message: 'm',
          scheduled_at: 's',
          recipient_user_ids: ['u'],
        })
      ).rejects.toMatchObject({ code: 'unknown' });
    });

    it('data 가 string 이 아니면 unknown', async () => {
      const { client } = makeClient({ data: null, error: null });
      await expect(
        createScheduledNotice(client, {
          event_id: 'e',
          message: 'm',
          scheduled_at: 's',
          recipient_user_ids: ['u'],
        })
      ).rejects.toBeInstanceOf(ScheduledNoticeError);
    });
  });

  describe('updateScheduledNotice', () => {
    it('성공 시 void', async () => {
      const { client, rpc } = makeClient({ data: null, error: null });
      await expect(
        updateScheduledNotice(client, 'id-1', {
          message: 'm',
          scheduled_at: 's',
          recipient_user_ids: ['u'],
        })
      ).resolves.toBeUndefined();
      expect(rpc).toHaveBeenCalledWith('update_scheduled_notice', {
        p_id: 'id-1',
        p_message: 'm',
        p_scheduled_at: 's',
        p_recipient_user_ids: ['u'],
      });
    });

    it('not_scheduled 에러 매핑', async () => {
      const { client } = makeClient({ data: null, error: { message: 'not_scheduled' } });
      await expect(
        updateScheduledNotice(client, 'id-1', {
          message: 'm',
          scheduled_at: 's',
          recipient_user_ids: ['u'],
        })
      ).rejects.toMatchObject({ code: 'not_scheduled' });
    });
  });

  describe('cancelScheduledNotice', () => {
    it('성공 시 void + RPC 인자 전달', async () => {
      const { client, rpc } = makeClient({ data: null, error: null });
      await expect(cancelScheduledNotice(client, 'id-2')).resolves.toBeUndefined();
      expect(rpc).toHaveBeenCalledWith('cancel_scheduled_notice', { p_id: 'id-2' });
    });

    it('not_admin 에러 매핑', async () => {
      const { client } = makeClient({ data: null, error: { message: 'not_admin' } });
      await expect(cancelScheduledNotice(client, 'id-2')).rejects.toMatchObject({
        code: 'not_admin',
      });
    });
  });

  describe('listScheduledNotices', () => {
    it('성공 시 row 배열 반환', async () => {
      const rows = [{ id: 'a' }, { id: 'b' }];
      const { client, rpc } = makeClient({ data: rows, error: null });
      await expect(listScheduledNotices(client, 'event-1')).resolves.toEqual(rows);
      expect(rpc).toHaveBeenCalledWith('list_scheduled_notices', { p_event_id: 'event-1' });
    });

    it('data 가 null 이면 빈 배열', async () => {
      const { client } = makeClient({ data: null, error: null });
      await expect(listScheduledNotices(client, 'event-1')).resolves.toEqual([]);
    });

    it('에러 매핑', async () => {
      const { client } = makeClient({ data: null, error: { message: 'unauthenticated' } });
      await expect(listScheduledNotices(client, 'event-1')).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    });
  });
});
