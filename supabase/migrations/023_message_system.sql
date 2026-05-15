-- ============================================
-- 메시지 시스템 (BIS@T P13 기반, 시스템 테이블만)
-- message_templates: 카카오/SMS 템플릿
-- message_logs: 발송 이력
-- 모든 작업은 admin만 — 사용자 노출 X
-- ============================================

CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('KAKAO', 'SMS')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',  -- ['{name}', '{date}']
  approved BOOLEAN NOT NULL DEFAULT false,  -- 카카오 알림톡 승인 필요
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_message_templates_type ON message_templates (type);
CREATE INDEX idx_message_logs_event ON message_logs (event_id);
CREATE INDEX idx_message_logs_target ON message_logs (target_user_id);
CREATE INDEX idx_message_logs_status ON message_logs (status, created_at DESC);

-- ============================================
-- RLS — admin 전용. 일반 사용자 접근 차단.
-- ============================================
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_templates_admin_all" ON message_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "message_logs_admin_all" ON message_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
