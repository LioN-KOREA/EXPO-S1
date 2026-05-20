-- ============================================
-- 메신저 Realtime 활성화
-- messages / message_threads 테이블을 supabase_realtime publication 에 추가.
-- 변경 시 Postgres LISTEN/NOTIFY 로 WebSocket subscribe 가능.
-- ============================================

-- 비멱등 ALTER PUBLICATION 을 try/catch 로 감싸 이미 추가된 경우 통과.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
