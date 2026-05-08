-- ============================================
-- 보안 및 데이터 무결성 패치
-- ============================================

-- [CRITICAL #1] 역할 자가 변경 차단
-- 기존 정책 삭제 후 name, phone, language만 수정 가능하도록 제한
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- role, linked_buyer_id, linked_seller_id, email 변경 차단
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND linked_buyer_id IS NOT DISTINCT FROM (SELECT linked_buyer_id FROM profiles WHERE id = auth.uid())
    AND linked_seller_id IS NOT DISTINCT FROM (SELECT linked_seller_id FROM profiles WHERE id = auth.uid())
    AND email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- [CRITICAL #4] 통역사 상담 필드 수정 제한 (status만 변경 가능)
DROP POLICY IF EXISTS "consultations_update_interpreter" ON consultations;
CREATE POLICY "consultations_update_interpreter" ON consultations FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (
    interpreter_id = auth.uid()
    -- 불변 필드가 변경되지 않았는지 확인
    AND event_id = (SELECT event_id FROM consultations WHERE id = consultations.id)
    AND time_slot_id = (SELECT time_slot_id FROM consultations WHERE id = consultations.id)
    AND buyer_id = (SELECT buyer_id FROM consultations WHERE id = consultations.id)
    AND seller_id = (SELECT seller_id FROM consultations WHERE id = consultations.id)
    AND interpreter_id = (SELECT interpreter_id FROM consultations WHERE id = consultations.id)
  );

-- [HIGH #5] 바이어/셀러의 상담 조회 정책 추가
CREATE POLICY "consultations_select_buyer" ON consultations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'buyer'
        AND profiles.linked_buyer_id = consultations.buyer_id
    )
  );

CREATE POLICY "consultations_select_seller" ON consultations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'seller'
        AND profiles.linked_seller_id = consultations.seller_id
    )
  );

-- [HIGH #5] 셀러의 상담일지 조회 정책 추가
CREATE POLICY "reports_select_seller" ON consultation_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultations c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = consultation_reports.consultation_id
        AND p.role = 'seller'
        AND p.linked_seller_id = c.seller_id
        AND consultation_reports.submitted = true
    )
  );

-- [HIGH #9] 제출된 일지 수정 차단 (DB 레벨)
DROP POLICY IF EXISTS "reports_update_interpreter" ON consultation_reports;
CREATE POLICY "reports_update_interpreter" ON consultation_reports FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (
    interpreter_id = auth.uid()
    -- 이미 제출된 일지는 수정 불가 (기존 submitted가 false인 경우만 허용)
    AND (SELECT submitted FROM consultation_reports cr WHERE cr.id = consultation_reports.id) = false
  );

-- [HIGH #8] email 유니크 제약
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON profiles (email);

-- [HIGH #10] consultation buyer+slot 유니크 제약
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_slot_buyer ON consultations (time_slot_id, buyer_id);

-- ============================================
-- 추가 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_linked_buyer ON profiles (linked_buyer_id) WHERE linked_buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_linked_seller ON profiles (linked_seller_id) WHERE linked_seller_id IS NOT NULL;
