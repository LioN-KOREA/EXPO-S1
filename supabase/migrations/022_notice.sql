-- ============================================
-- 공지사항 (BIS@T P12 기반)
-- notices: admin이 발송, target_roles 부분집합으로 대상 지정
-- notice_reads: 읽음 표시 추적
-- ============================================

-- CHECK 제약은 서브쿼리 불가 → IMMUTABLE 함수로 우회
CREATE OR REPLACE FUNCTION validate_notice_target_roles(roles jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(roles) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(roles) AS t(role)
      WHERE t.role NOT IN ('admin', 'interpreter', 'buyer', 'seller')
    );
$$;

CREATE TABLE notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  -- 기준 profiles.role: admin/interpreter/buyer/seller (001 스키마)
  -- 발송 가능 대상은 admin/interpreter/buyer/seller 부분집합
  target_roles JSONB NOT NULL DEFAULT '[]',
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT notices_target_roles_chk CHECK (validate_notice_target_roles(target_roles))
);

CREATE TABLE notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (notice_id, user_id)
);

-- 인덱스
CREATE INDEX idx_notices_event ON notices (event_id, sent_at DESC);
CREATE INDEX idx_notices_target_roles ON notices USING GIN (target_roles);
CREATE INDEX idx_notice_reads_user ON notice_reads (user_id);
CREATE INDEX idx_notice_reads_notice ON notice_reads (notice_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;

-- notices: admin 발송/조회/수정/삭제, 사용자는 자기 역할이 target_roles에 포함된 공지만 조회
CREATE POLICY "notices_select_admin" ON notices FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "notices_select_targeted" ON notices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND notices.target_roles ? profiles.role
    )
  );
CREATE POLICY "notices_insert_admin" ON notices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "notices_update_admin" ON notices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "notices_delete_admin" ON notices FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- notice_reads: 사용자는 본인 읽음 기록 조회/생성, admin 전체 조회
CREATE POLICY "notice_reads_select_own" ON notice_reads FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "notice_reads_select_admin" ON notice_reads FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "notice_reads_insert_own" ON notice_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "notice_reads_delete_admin" ON notice_reads FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
