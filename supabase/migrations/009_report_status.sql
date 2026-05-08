-- 상담일지 상태 시스템 추가
-- 기존 submitted(boolean) → 5단계 상태 시스템으로 확장

-- 1. report_status 컬럼 추가
ALTER TABLE consultation_reports
ADD COLUMN IF NOT EXISTS report_status TEXT NOT NULL DEFAULT 'draft'
CHECK (report_status IN ('draft', 'submitted', 'under_review', 'approved', 'revision_requested'));

-- 2. 관리자 코멘트 (수정요청 사유)
ALTER TABLE consultation_reports
ADD COLUMN IF NOT EXISTS admin_comment TEXT;

-- 3. 검토 시간 및 검토자
ALTER TABLE consultation_reports
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE consultation_reports
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);

-- 4. 기존 데이터 마이그레이션 (submitted=true는 '제출됨'으로, 아직 관리자 승인 아님)
UPDATE consultation_reports
SET report_status = CASE
  WHEN submitted = true THEN 'submitted'
  ELSE 'draft'
END;

-- 5. 통역사 RLS: draft/revision_requested만 수정 가능 (관리자 상태로 변경 방지)
DROP POLICY IF EXISTS "reports_update_interpreter" ON consultation_reports;
CREATE POLICY "reports_update_interpreter" ON consultation_reports FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (
    interpreter_id = auth.uid()
    AND report_status IN ('draft', 'revision_requested', 'submitted')
  );

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_reports_status ON consultation_reports(report_status);
