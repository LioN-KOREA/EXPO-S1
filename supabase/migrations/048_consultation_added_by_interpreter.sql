-- 통역사가 현장에서 직접 추가한 상담 표시 (BIS@T IP2 "추가한 상담" 라벨/삭제 패턴)
-- 자가추가분만 통역사가 삭제 가능(일지 작성 전 한정) 하려면 admin 배정분과 구분 필요.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS added_by_interpreter boolean NOT NULL DEFAULT false;

-- ============================================
-- added_by_interpreter 불변 보호 (017 트리거 확장)
-- 통역사가 RLS UPDATE 로 admin 배정분을 added_by_interpreter=true 로 위조 후
-- 삭제 API 로 지우는 우회를 차단. (017 함수 재정의 + 컬럼 가드 추가)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_consultation_interpreter_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF v_caller_role = 'interpreter' AND OLD.interpreter_id = auth.uid() THEN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
      RAISE EXCEPTION 'event_id는 변경할 수 없습니다';
    END IF;
    IF NEW.time_slot_id IS DISTINCT FROM OLD.time_slot_id THEN
      RAISE EXCEPTION 'time_slot_id는 변경할 수 없습니다';
    END IF;
    IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
      RAISE EXCEPTION 'buyer_id는 변경할 수 없습니다';
    END IF;
    IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
      RAISE EXCEPTION 'seller_id는 변경할 수 없습니다';
    END IF;
    IF NEW.interpreter_id IS DISTINCT FROM OLD.interpreter_id THEN
      RAISE EXCEPTION 'interpreter_id는 본인이 변경할 수 없습니다';
    END IF;
    IF NEW.added_by_interpreter IS DISTINCT FROM OLD.added_by_interpreter THEN
      RAISE EXCEPTION 'added_by_interpreter는 변경할 수 없습니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 트리거 자체는 017에서 이미 걸려 있음(함수만 교체되어 반영). 안전하게 재보장.
DROP TRIGGER IF EXISTS trg_enforce_consultation_interpreter_immutable ON consultations;
CREATE TRIGGER trg_enforce_consultation_interpreter_immutable
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION enforce_consultation_interpreter_immutable();

-- ============================================
-- 통역사 자가추가 상담 원자 삭제 RPC (TOCTOU 방지)
-- 소유·자가추가·일지없음 조건을 단일 DELETE WHERE 로 원자 평가.
-- 하나라도 불충족이면 0행 삭제(=NULL 반환). 일지가 있으면 삭제 안 됨 → CASCADE 로 일지 유실 없음.
-- ============================================
CREATE OR REPLACE FUNCTION interpreter_delete_added_consultation(
  p_id uuid,
  p_interpreter_id uuid
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM consultations c
  WHERE c.id = p_id
    AND c.interpreter_id = p_interpreter_id
    AND c.added_by_interpreter IS TRUE
    AND NOT EXISTS (SELECT 1 FROM consultation_reports r WHERE r.consultation_id = c.id)
  RETURNING c.id;
$$;

REVOKE ALL ON FUNCTION interpreter_delete_added_consultation(uuid, uuid) FROM PUBLIC;
