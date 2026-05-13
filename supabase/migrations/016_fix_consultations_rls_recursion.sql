-- 002에서 추가된 consultations_update_interpreter 정책의 WITH CHECK가
-- `SELECT FROM consultations WHERE id = consultations.id` 패턴으로 자기 자신 참조하여
-- PostgreSQL이 'infinite recursion detected in policy for relation "consultations"' 에러 발생.
-- 결과: admin이 통역사 배정(consultations.interpreter_id UPDATE) 시도 시 모든 UPDATE가 차단됨.
--
-- 해결: 통역사의 불변 필드 보호는 RLS WITH CHECK 서브쿼리로는 불가능 (PostgreSQL RLS 제약).
-- 정책을 001 원본 형태(단순)로 되돌리고, 필요시 컬럼 권한이나 트리거로 별도 보호.

DROP POLICY IF EXISTS "consultations_update_interpreter" ON consultations;

CREATE POLICY "consultations_update_interpreter" ON consultations FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (interpreter_id = auth.uid());

-- (옵션) 통역사의 불변 필드 변경을 차단하고 싶다면, 아래 트리거 활성화:
-- CREATE OR REPLACE FUNCTION enforce_consultation_interpreter_immutable()
-- RETURNS TRIGGER LANGUAGE plpgsql AS $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'interpreter') THEN
--     IF NEW.event_id IS DISTINCT FROM OLD.event_id
--        OR NEW.time_slot_id IS DISTINCT FROM OLD.time_slot_id
--        OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
--        OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
--        OR NEW.interpreter_id IS DISTINCT FROM OLD.interpreter_id THEN
--       RAISE EXCEPTION 'interpreter cannot modify immutable consultation fields';
--     END IF;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
--
-- DROP TRIGGER IF EXISTS trg_consultation_interpreter_immutable ON consultations;
-- CREATE TRIGGER trg_consultation_interpreter_immutable
--   BEFORE UPDATE ON consultations
--   FOR EACH ROW EXECUTE FUNCTION enforce_consultation_interpreter_immutable();
