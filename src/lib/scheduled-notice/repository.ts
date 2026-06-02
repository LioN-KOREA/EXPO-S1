// 메시지 전송 예약 도메인 저장소.
// 마이그 040 의 4 RPC (create/update/cancel/list) 래퍼.
// RPC 자체가 admin 검증 + 비즈니스 룰 강제 — 본 모듈은 호출/에러 매핑만.

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapRpcError, ScheduledNoticeError } from './errors';

export type ScheduledNoticeStatus = 'scheduled' | 'sent' | 'cancelled' | 'failed';

export interface ScheduledNoticeRow {
  id: string;
  event_id: string;
  message: string;
  scheduled_at: string;
  status: ScheduledNoticeStatus;
  recipient_user_ids: string[];
  sent_notice_id: string | null;
  failed_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledNoticeInput {
  event_id: string;
  message: string;
  scheduled_at: string; // ISO timestamptz
  recipient_user_ids: string[];
}

export interface UpdateScheduledNoticeInput {
  message: string;
  scheduled_at: string;
  recipient_user_ids: string[];
}

export async function createScheduledNotice(
  supabase: SupabaseClient,
  input: CreateScheduledNoticeInput
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_scheduled_notice', {
    p_event_id: input.event_id,
    p_message: input.message,
    p_scheduled_at: input.scheduled_at,
    p_recipient_user_ids: input.recipient_user_ids,
  });
  if (error) throw mapRpcError(error.message);
  if (typeof data !== 'string') throw new ScheduledNoticeError('unknown');
  return { id: data };
}

export async function updateScheduledNotice(
  supabase: SupabaseClient,
  id: string,
  input: UpdateScheduledNoticeInput
): Promise<void> {
  const { error } = await supabase.rpc('update_scheduled_notice', {
    p_id: id,
    p_message: input.message,
    p_scheduled_at: input.scheduled_at,
    p_recipient_user_ids: input.recipient_user_ids,
  });
  if (error) throw mapRpcError(error.message);
}

export async function cancelScheduledNotice(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.rpc('cancel_scheduled_notice', {
    p_id: id,
  });
  if (error) throw mapRpcError(error.message);
}

export async function listScheduledNotices(
  supabase: SupabaseClient,
  eventId: string
): Promise<ScheduledNoticeRow[]> {
  const { data, error } = await supabase.rpc('list_scheduled_notices', {
    p_event_id: eventId,
  });
  if (error) throw mapRpcError(error.message);
  return ((data ?? []) as ScheduledNoticeRow[]);
}
