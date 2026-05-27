-- ============================================
-- messages 테이블 REPLICA IDENTITY FULL
-- ============================================
-- 배경:
--   메신저 hard delete (커밋 7b1a634) 후 useThreadRealtime 가 messages DELETE 이벤트를
--   thread_id 필터로 구독함. 기본 REPLICA IDENTITY 는 PK(id) 만 publish 하므로
--   삭제 시 payload.old 에 thread_id 가 없어 PostgREST filter 가 매칭 안 되어
--   타 클라이언트가 DELETE 를 실시간 반영 못함.
--
-- 해결:
--   REPLICA IDENTITY FULL 로 모든 컬럼을 WAL 에 포함시켜 DELETE old tuple 에
--   thread_id 가 포함되도록 함. 성능 영향 = 메시지 INSERT/UPDATE/DELETE 시 WAL
--   크기 증가, 그러나 본 테이블 row 크기가 작아 무시 가능.
-- ============================================

ALTER TABLE public.messages REPLICA IDENTITY FULL;
