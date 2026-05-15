-- ============================================
-- 출석표 (BIS@T P6 기반)
-- attendances: 일자별 자동 생성, account_type=INTERPRETER|SELLER (바이어 제외)
-- attendance_status_logs: 상태 변경 감사 로그
-- ============================================

-- 출석 본 테이블
CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('INTERPRETER', 'SELLER')),
  work_type TEXT NOT NULL DEFAULT 'REGULAR' CHECK (work_type IN ('REGULAR', 'RESERVE')),
  status TEXT NOT NULL DEFAULT 'NONE' CHECK (status IN (
    'NONE',         -- 미정
    'WAITING',      -- 출석대기
    'COMING',       -- 출근중
    'ABSENT',       -- 결근
    'IN_CONSULT',   -- 상담중
    'DONE',         -- 상담완료
    'LEAVE_OK',     -- 퇴근가능
    'LEAVE'         -- 퇴근
  )),
  eval TEXT CHECK (eval IS NULL OR eval IN (
    'NORMAL',       -- 정상
    'ABSENT',       -- 결근
    'LATE',         -- 지각
    'UNAUTHORIZED', -- 무단
    'OTHER'         -- 기타
  )),
  memo TEXT,
  -- 부스 연결 (선택). 부스 마스터 테이블은 미도입 — FK 없이 UUID 보관용으로만 사용.
  -- 추후 booths 테이블 도입 시 별도 ALTER로 FK 부여.
  booth_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_id, date)
);

-- 상태 변경 감사 로그
CREATE TABLE attendance_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES attendances(id) ON DELETE CASCADE,
  prev_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_method TEXT NOT NULL DEFAULT 'MANUAL' CHECK (change_method IN ('MANUAL', 'QR', 'AUTO')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_attendances_event_date ON attendances (event_id, date);
CREATE INDEX idx_attendances_user_date ON attendances (user_id, date);
CREATE INDEX idx_attendances_event_account ON attendances (event_id, account_type);
CREATE INDEX idx_attendance_logs_attendance ON attendance_status_logs (attendance_id);
CREATE INDEX idx_attendance_logs_created ON attendance_status_logs (created_at DESC);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_status_logs ENABLE ROW LEVEL SECURITY;

-- attendances: admin 전체 권한, 본인 조회만 가능
CREATE POLICY "attendances_select_admin" ON attendances FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "attendances_select_own" ON attendances FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "attendances_insert_admin" ON attendances FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "attendances_update_admin" ON attendances FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "attendances_delete_admin" ON attendances FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- attendance_status_logs: admin 조회/생성, 본인 출석 로그는 조회만 가능
CREATE POLICY "attendance_logs_select_admin" ON attendance_status_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "attendance_logs_select_own" ON attendance_status_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM attendances
      WHERE attendances.id = attendance_status_logs.attendance_id
        AND attendances.user_id = auth.uid()
    )
  );
CREATE POLICY "attendance_logs_insert_admin" ON attendance_status_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
