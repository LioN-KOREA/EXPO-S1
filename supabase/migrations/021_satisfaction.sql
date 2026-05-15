-- ============================================
-- 사전/사후 설문 (BIS@T P10 기반)
-- satisfaction_forms: 양식 정의 (TemplateField[] 재사용)
-- satisfaction_responses: 응답 데이터
-- ============================================

CREATE TABLE satisfaction_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('BUYER', 'SELLER', 'INTERPRETER')),
  stage TEXT NOT NULL DEFAULT 'PRE' CHECK (stage IN ('PRE', 'POST')),
  title TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',  -- TemplateField[] (key/label/type/options/required)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE satisfaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES satisfaction_forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (form_id, user_id)
);

-- 인덱스
CREATE INDEX idx_satisfaction_forms_event ON satisfaction_forms (event_id);
CREATE INDEX idx_satisfaction_forms_target ON satisfaction_forms (event_id, target_type, stage);
CREATE INDEX idx_satisfaction_responses_form ON satisfaction_responses (form_id);
CREATE INDEX idx_satisfaction_responses_user ON satisfaction_responses (user_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE satisfaction_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE satisfaction_responses ENABLE ROW LEVEL SECURITY;

-- satisfaction_forms: admin CRUD
-- 활성화된 폼은 target_type ↔ profiles.role 매핑된 사용자만 조회
--   BUYER ↔ buyer, SELLER ↔ seller, INTERPRETER ↔ interpreter
CREATE POLICY "satisfaction_forms_select_targeted" ON satisfaction_forms FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          (satisfaction_forms.target_type = 'BUYER' AND profiles.role = 'buyer')
          OR (satisfaction_forms.target_type = 'SELLER' AND profiles.role = 'seller')
          OR (satisfaction_forms.target_type = 'INTERPRETER' AND profiles.role = 'interpreter')
        )
    )
  );
CREATE POLICY "satisfaction_forms_select_admin" ON satisfaction_forms FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "satisfaction_forms_insert_admin" ON satisfaction_forms FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "satisfaction_forms_update_admin" ON satisfaction_forms FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "satisfaction_forms_delete_admin" ON satisfaction_forms FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- satisfaction_responses: 사용자는 target_type ↔ role 매칭 시에만 본인 응답 조회/생성, admin 전체 조회
CREATE POLICY "satisfaction_responses_select_own" ON satisfaction_responses FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "satisfaction_responses_select_admin" ON satisfaction_responses FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "satisfaction_responses_insert_own" ON satisfaction_responses FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM satisfaction_forms f
      JOIN profiles p ON p.id = auth.uid()
      WHERE f.id = satisfaction_responses.form_id
        AND f.active = true
        AND (
          (f.target_type = 'BUYER' AND p.role = 'buyer')
          OR (f.target_type = 'SELLER' AND p.role = 'seller')
          OR (f.target_type = 'INTERPRETER' AND p.role = 'interpreter')
        )
    )
  );
CREATE POLICY "satisfaction_responses_update_own" ON satisfaction_responses FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "satisfaction_responses_delete_admin" ON satisfaction_responses FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
