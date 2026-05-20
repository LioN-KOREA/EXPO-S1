// 공지(notice) 도메인 저장소.
// API 라우트의 인라인 SQL 을 한 곳에 모음.
// RLS 가 권한 강제 — 본 모듈은 service-role admin client 사용 가정.
// validate / revalidate 는 라우트 책임 (도메인 의존성 격리).

import type { SupabaseClient } from '@supabase/supabase-js';

export type NoticeRole = 'admin' | 'interpreter' | 'buyer' | 'seller';

export interface NoticeRow {
  id: string;
  event_id: string;
  message: string;
  target_roles: NoticeRole[];
  sent_at: string;
  edited_at: string | null;
  sender: { id: string; name: string } | null;
}

const SELECT_COLS = 'id, event_id, message, target_roles, sent_at, edited_at, sender:profiles!notices_sent_by_fkey(id, name)';

/** 이벤트의 보낸 공지 목록 (admin). 최신순. */
export async function listNotices(
  supabase: SupabaseClient,
  eventId: string
): Promise<NoticeRow[]> {
  const { data, error } = await supabase
    .from('notices')
    .select(SELECT_COLS)
    .eq('event_id', eventId)
    .order('sent_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown) as NoticeRow[];
}

export interface InsertNoticeInput {
  event_id: string;
  message: string;
  target_roles: NoticeRole[];
  sent_by: string;
}

export interface InsertedNotice {
  id: string;
  event_id: string;
  message: string;
  target_roles: NoticeRole[];
  sent_by: string;
  sent_at: string;
  edited_at: string | null;
}

export async function insertNotice(
  supabase: SupabaseClient,
  input: InsertNoticeInput
): Promise<InsertedNotice> {
  const { data, error } = await supabase
    .from('notices')
    .insert(input)
    .select('id, event_id, message, target_roles, sent_by, sent_at, edited_at')
    .single();
  if (error) throw new Error(error.message);
  return data as InsertedNotice;
}

/** message 수정. edited_at 자동 갱신. 미존재 id 면 null. clock 주입 가능 (test). */
export async function updateNoticeMessage(
  supabase: SupabaseClient,
  id: string,
  message: string,
  editedAt: string = new Date().toISOString()
): Promise<{ id: string; target_roles: NoticeRole[] } | null> {
  const { data, error } = await supabase
    .from('notices')
    .update({ message, edited_at: editedAt })
    .eq('id', id)
    .select('id, target_roles')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string; target_roles: NoticeRole[] } | null) ?? null;
}

/** soft delete X — notice 는 hard delete (CASCADE notice_reads). 미존재 시 null. */
export async function deleteNotice(
  supabase: SupabaseClient,
  id: string
): Promise<{ target_roles: NoticeRole[] } | null> {
  const { data, error } = await supabase
    .from('notices')
    .delete()
    .eq('id', id)
    .select('target_roles')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { target_roles: NoticeRole[] } | null) ?? null;
}
