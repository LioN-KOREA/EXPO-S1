-- ============================================
-- PRD #18 S0 — 통역사 공지 Realtime 알림 마이그.
-- notices 테이블을 supabase_realtime publication 에 추가하여 INSERT 이벤트가
-- WebSocket 으로 통역사 클라이언트에 전파되도록 한다.
--
-- 검증 (2026-05-28): 운영 DB supabase_realtime publication 에 messages 만 포함,
-- notices 미포함. 본 마이그가 추가한다.
--
-- idempotent: duplicate_object 예외 swallow (마이그 036 패턴 그대로).
-- ============================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notices;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
