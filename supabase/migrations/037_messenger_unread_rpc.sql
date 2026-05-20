-- ============================================
-- 메신저 unread 집계 RPC
-- JS 메모리 루프 → DB 단계 집계로 이전.
-- 통역사 50~100명 환경에서 응답시간 차이는 작으나, 대규모 확장 시 N+1 제거.
-- 호출자: lib/messenger/unreadCounter.ts
-- ============================================

CREATE OR REPLACE FUNCTION messenger_unread_for_admin(p_event_id UUID DEFAULT NULL)
RETURNS TABLE (thread_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.thread_id, COUNT(*) AS unread_count
  FROM messages m
  JOIN message_threads t ON t.id = m.thread_id
  WHERE m.sender_role = 'interpreter'
    AND m.deleted_at IS NULL
    AND (p_event_id IS NULL OR t.event_id = p_event_id)
    AND (t.last_read_at_admin IS NULL OR m.created_at > t.last_read_at_admin)
  GROUP BY m.thread_id;
$$;

CREATE OR REPLACE FUNCTION messenger_unread_for_interpreter(p_interpreter_id UUID)
RETURNS TABLE (thread_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.thread_id, COUNT(*) AS unread_count
  FROM messages m
  JOIN message_threads t ON t.id = m.thread_id
  WHERE t.interpreter_id = p_interpreter_id
    AND m.sender_role = 'admin'
    AND m.deleted_at IS NULL
    AND (t.last_read_at_interpreter IS NULL OR m.created_at > t.last_read_at_interpreter)
  GROUP BY m.thread_id;
$$;

-- 권한: authenticated 만 호출 가능. RLS 우회는 함수 본문에서 제한된 조건만 사용.
REVOKE ALL ON FUNCTION messenger_unread_for_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION messenger_unread_for_admin(UUID) TO authenticated;
REVOKE ALL ON FUNCTION messenger_unread_for_interpreter(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION messenger_unread_for_interpreter(UUID) TO authenticated;
