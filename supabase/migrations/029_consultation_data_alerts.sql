-- ============================================
-- 마이그 029 — consultation_data_alerts
-- 통역사가 자동 채움 정보(상담일/바이어명 등) 누락 또는 오류를
-- 관리자에게 알리고, 관리자가 보정 완료 처리하는 알림 테이블.
-- ============================================

CREATE TABLE consultation_data_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  missing_keys TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX consultation_data_alerts_consultation_idx
  ON consultation_data_alerts(consultation_id);
CREATE INDEX consultation_data_alerts_event_status_idx
  ON consultation_data_alerts(event_id, status);

-- 동일 consultation에 pending 알림 중복 방지 (resolved는 여러 개 허용)
CREATE UNIQUE INDEX consultation_data_alerts_pending_unique
  ON consultation_data_alerts(consultation_id)
  WHERE status = 'pending';

COMMENT ON TABLE consultation_data_alerts IS
  '통역사가 자동 채움 마스터 데이터 누락/오류를 관리자에게 보고하는 알림';
COMMENT ON COLUMN consultation_data_alerts.missing_keys IS
  '결손/오류로 신고된 자동 필드 키 목록 (예: ["time_slot.date", "buyer.company_name"])';

-- ============================================
-- RLS
-- ============================================
ALTER TABLE consultation_data_alerts ENABLE ROW LEVEL SECURITY;

-- 통역사: 본인이 담당한 상담의 알림만 SELECT/INSERT
CREATE POLICY "consultation_data_alerts_interpreter_select"
  ON consultation_data_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultations c
      WHERE c.id = consultation_data_alerts.consultation_id
        AND c.interpreter_id = auth.uid()
    )
  );

CREATE POLICY "consultation_data_alerts_interpreter_insert"
  ON consultation_data_alerts
  FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM consultations c
      WHERE c.id = consultation_data_alerts.consultation_id
        AND c.interpreter_id = auth.uid()
        AND c.event_id = consultation_data_alerts.event_id
    )
  );

-- 관리자: 전체 SELECT + 상태 변경
CREATE POLICY "consultation_data_alerts_admin_select"
  ON consultation_data_alerts
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "consultation_data_alerts_admin_update"
  ON consultation_data_alerts
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "consultation_data_alerts_admin_delete"
  ON consultation_data_alerts
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
