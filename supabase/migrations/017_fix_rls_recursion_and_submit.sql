-- ============================================
-- 017: RLS 자기참조 패턴 정리 + 통역사 일지 제출 차단 버그 fix + 016 BLOCKER 대응 (불변필드 트리거)
-- ============================================
--
-- 1) reports_update_interpreter: WITH CHECK에 'submitted'가 빠져서 통역사 제출이 RLS에 막힘
--    014의 의도는 "이미 제출된 일지를 다시 수정 금지"였으나, USING 대신 WITH CHECK에 status 조건을
--    넣어서 새로 'submitted'로 transition하는 것 자체를 차단해버림.
--    수정: USING이 OLD 상태(draft/revision_requested/rejected)에서만 통과되게 하고,
--          WITH CHECK는 interpreter 본인이면 어떤 status로든 변경 가능하도록 단순화.
--
-- 2) profiles_update_own: WITH CHECK 안에 SELECT FROM profiles 자기참조가 있어
--    경우에 따라 무한재귀 가능성. 정책은 단순화하고, 변경 금지 필드(role/email/linked_*)는
--    BEFORE UPDATE 트리거로 본인이 admin이 아닐 때만 차단.
--
-- 3) consultations 통역사 불변필드 보호 (Codex 검수 BLOCKER 대응):
--    016에서 RLS를 단순화하면서 통역사가 자기 consultation의 event_id/buyer_id 등도 변경 가능해짐.
--    실제 코드 경로는 status만 변경하지만, DB 레벨 보호를 위해 BEFORE UPDATE 트리거 추가.

-- ============================================
-- 1) reports_update_interpreter 재정의
-- ============================================
DROP POLICY IF EXISTS "reports_update_interpreter" ON consultation_reports;
CREATE POLICY "reports_update_interpreter" ON consultation_reports FOR UPDATE
  USING (
    interpreter_id = auth.uid()
    AND report_status IN ('draft', 'revision_requested', 'rejected')
  )
  WITH CHECK (
    interpreter_id = auth.uid()
  );

-- ============================================
-- 2) profiles_update_own 단순화 + 불변필드 트리거
-- ============================================
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION enforce_profile_immutable_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- 호출자가 admin이면 모든 필드 변경 허용
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 본인 update이고 admin이 아니면 role/email/linked_* 변경 금지
  IF auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role 필드는 변경할 수 없습니다';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'email 필드는 변경할 수 없습니다';
    END IF;
    IF NEW.linked_buyer_id IS DISTINCT FROM OLD.linked_buyer_id THEN
      RAISE EXCEPTION 'linked_buyer_id는 변경할 수 없습니다';
    END IF;
    IF NEW.linked_seller_id IS DISTINCT FROM OLD.linked_seller_id THEN
      RAISE EXCEPTION 'linked_seller_id는 변경할 수 없습니다';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_immutable_fields ON profiles;
CREATE TRIGGER trg_enforce_profile_immutable_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_immutable_fields();

-- ============================================
-- 3) consultations 통역사 불변필드 트리거 (016 BLOCKER 대응)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_consultation_interpreter_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- admin은 모든 필드 변경 허용
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 통역사가 자기 consultation을 update할 때만 불변필드 보호
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_consultation_interpreter_immutable ON consultations;
CREATE TRIGGER trg_enforce_consultation_interpreter_immutable
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION enforce_consultation_interpreter_immutable();
