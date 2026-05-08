-- ============================================
-- 수출상담회 웹사이트 DB 스키마
-- ============================================

-- 수출상담회
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 사용자 프로필 (Supabase Auth 연동)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'interpreter', 'buyer', 'seller')),
  phone TEXT,
  language TEXT,           -- 통역 언어 (예: 영어, 아랍어, 베트남어)
  linked_buyer_id UUID,   -- buyer 역할일 때 buyers 테이블 연결
  linked_seller_id UUID,  -- seller 역할일 때 sellers 테이블 연결
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 상담회-통역사 매핑
CREATE TABLE event_interpreters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  interpreter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(event_id, interpreter_id)
);

-- 타임슬롯 정의 (상담회별 유동적)
CREATE TABLE time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_order INT NOT NULL
);

-- 바이어
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  country TEXT NOT NULL,
  booth_number TEXT,
  phone TEXT,
  email TEXT,
  extra_info JSONB DEFAULT '{}'
);

-- 셀러 (참가업체)
CREATE TABLE sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_name_kr TEXT,
  representative TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  office_phone TEXT,
  email TEXT,
  extra_info JSONB DEFAULT '{}'
);

-- 상담 스케줄 (타임테이블 매칭)
CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  time_slot_id UUID NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  interpreter_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed'))
);

-- 상담일지 양식 정의 (상담회별 동적)
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  fields JSONB NOT NULL DEFAULT '[]'
);

-- 상담일지 데이터
CREATE TABLE consultation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
  interpreter_id UUID NOT NULL REFERENCES profiles(id),
  data JSONB NOT NULL DEFAULT '{}',
  submitted BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_interpreters ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_reports ENABLE ROW LEVEL SECURITY;

-- 프로필: 인증된 사용자는 모두 조회 가능 (profiles 재귀 방지)
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
-- 프로필 생성/수정은 Service Role(API Route)에서만 수행 → RLS 우회
-- 따라서 INSERT/UPDATE 정책은 본인 데이터만 허용 (안전 장치)
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 이벤트: 모든 인증 사용자 조회, Admin만 수정
CREATE POLICY "events_select_all" ON events FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "events_insert_admin" ON events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "events_update_admin" ON events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "events_delete_admin" ON events FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 상담회-통역사: 모든 인증 사용자 조회, Admin만 수정
CREATE POLICY "event_interpreters_select" ON event_interpreters FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "event_interpreters_insert_admin" ON event_interpreters FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "event_interpreters_delete_admin" ON event_interpreters FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 타임슬롯: 모든 인증 사용자 조회, Admin만 수정/삭제
CREATE POLICY "time_slots_select" ON time_slots FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "time_slots_insert_admin" ON time_slots FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "time_slots_delete_admin" ON time_slots FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 바이어/셀러: 모든 인증 사용자 조회, Admin만 수정/삭제
CREATE POLICY "buyers_select" ON buyers FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "buyers_insert_admin" ON buyers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "buyers_delete_admin" ON buyers FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "sellers_select" ON sellers FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "sellers_insert_admin" ON sellers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "sellers_delete_admin" ON sellers FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 상담: 통역사는 자기 것만, Admin은 전체
CREATE POLICY "consultations_select_interpreter" ON consultations FOR SELECT
  USING (interpreter_id = auth.uid());
CREATE POLICY "consultations_select_admin" ON consultations FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "consultations_insert_admin" ON consultations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "consultations_delete_admin" ON consultations FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
-- 통역사: status만 변경 가능
CREATE POLICY "consultations_update_interpreter" ON consultations FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (interpreter_id = auth.uid());
CREATE POLICY "consultations_update_admin" ON consultations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 양식 템플릿: 모든 인증 사용자 조회, Admin만 수정/삭제
CREATE POLICY "report_templates_select" ON report_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "report_templates_insert_admin" ON report_templates FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "report_templates_update_admin" ON report_templates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "report_templates_delete_admin" ON report_templates FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 상담일지: 통역사는 자기 것만 조회/수정, Admin은 전체
CREATE POLICY "reports_select_interpreter" ON consultation_reports FOR SELECT
  USING (interpreter_id = auth.uid());
CREATE POLICY "reports_select_admin" ON consultation_reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "reports_insert_interpreter" ON consultation_reports FOR INSERT
  WITH CHECK (
    interpreter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM consultations
      WHERE consultations.id = consultation_id
        AND consultations.interpreter_id = auth.uid()
    )
  );
CREATE POLICY "reports_update_interpreter" ON consultation_reports FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (interpreter_id = auth.uid());
CREATE POLICY "reports_update_admin" ON consultation_reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX idx_consultations_event ON consultations(event_id);
CREATE INDEX idx_consultations_interpreter ON consultations(interpreter_id);
CREATE INDEX idx_time_slots_event ON time_slots(event_id);
CREATE INDEX idx_buyers_event ON buyers(event_id);
CREATE INDEX idx_sellers_event ON sellers(event_id);
CREATE INDEX idx_reports_consultation ON consultation_reports(consultation_id);
