-- ============================================
-- 마이그 028 — Codex 보안/버그 검수 반영
-- 1. profiles admin UPDATE 정책 추가 (HIGH)
-- 2. satisfaction_responses UPDATE 정책 강화 (HIGH)
-- 3. notice_reads INSERT 정책 강화 — 대상 role 검증 (MEDIUM)
-- 4. validate_notice_target_roles 타입 안전 (LOW)
-- 5. upload_timetable search_path 고정 (MEDIUM)
-- 6. consultations.interpreter_id / consultation_reports.reviewed_by FK → ON DELETE SET NULL (MEDIUM)
-- ============================================

-- 1) profiles admin UPDATE 정책 -----------------------------------------
-- 기존: 본인만 update (017에서 단순화). admin 다른 사용자 변경 차단되던 버그.
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 2) satisfaction_responses UPDATE 정책 강화 -------------------------------
-- 기존: user_id = auth.uid() 만 검증 → form_id/submitted_at 임의 변경 가능
DROP POLICY IF EXISTS "satisfaction_responses_update_own" ON satisfaction_responses;
CREATE POLICY "satisfaction_responses_update_own" ON satisfaction_responses
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- form_id 변경 불가: WITH CHECK은 새 row 조건. 트리거 보강 필요
  );

-- form_id / submitted_at 변경 차단 트리거
CREATE OR REPLACE FUNCTION prevent_satisfaction_response_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.form_id <> OLD.form_id THEN
    RAISE EXCEPTION 'form_id는 변경할 수 없습니다';
  END IF;
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'user_id는 변경할 수 없습니다';
  END IF;
  -- submitted_at은 server-set 컬럼이라 client 변경 차단
  IF NEW.submitted_at <> OLD.submitted_at THEN
    NEW.submitted_at := OLD.submitted_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_satisfaction_responses_immutable ON satisfaction_responses;
CREATE TRIGGER trg_satisfaction_responses_immutable
  BEFORE UPDATE ON satisfaction_responses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_satisfaction_response_immutable_fields();

-- 3) notice_reads INSERT 강화 -------------------------------------------
-- 기존: user_id = auth.uid() 만. 안 보이는 공지 read marker 가능
DROP POLICY IF EXISTS "notice_reads_insert_own" ON notice_reads;
CREATE POLICY "notice_reads_insert_own" ON notice_reads
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM notices n
      JOIN profiles p ON p.id = auth.uid()
      WHERE n.id = notice_reads.notice_id
        AND n.target_roles ? p.role
    )
  );

-- 4) validate_notice_target_roles 타입 안전 -------------------------------
-- 기존: roles가 array 아니면 에러. 가드 추가
CREATE OR REPLACE FUNCTION validate_notice_target_roles(roles jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  role_text TEXT;
BEGIN
  IF roles IS NULL OR jsonb_typeof(roles) <> 'array' THEN
    RETURN FALSE;
  END IF;
  FOR role_text IN SELECT * FROM jsonb_array_elements_text(roles)
  LOOP
    IF role_text NOT IN ('admin', 'interpreter', 'buyer', 'seller') THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

-- 5) upload_timetable search_path 고정 ----------------------------------
-- 005에서 정의된 SECURITY DEFINER 함수. ALTER로 search_path 설정
ALTER FUNCTION upload_timetable(uuid, jsonb, jsonb, jsonb, jsonb)
  SET search_path = public, pg_temp;

-- 6) FK → ON DELETE SET NULL --------------------------------------------
-- consultations.interpreter_id
ALTER TABLE consultations
  DROP CONSTRAINT IF EXISTS consultations_interpreter_id_fkey;
ALTER TABLE consultations
  ADD CONSTRAINT consultations_interpreter_id_fkey
  FOREIGN KEY (interpreter_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- consultation_reports.reviewed_by
ALTER TABLE consultation_reports
  DROP CONSTRAINT IF EXISTS consultation_reports_reviewed_by_fkey;
ALTER TABLE consultation_reports
  ADD CONSTRAINT consultation_reports_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
