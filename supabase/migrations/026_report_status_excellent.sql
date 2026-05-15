-- ============================================
-- 상담일지 상태 — 우수상담(excellent) 추가
-- BIS@T 팀장 PDF P10 기준. 관리자가 우수상담으로 마킹.
-- ============================================

ALTER TABLE consultation_reports
  DROP CONSTRAINT IF EXISTS consultation_reports_report_status_check;

ALTER TABLE consultation_reports
  ADD CONSTRAINT consultation_reports_report_status_check
  CHECK (
    report_status IN (
      'draft',
      'submitted',
      'under_review',
      'approved',
      'revision_requested',
      'rejected',
      'excellent'
    )
  );

COMMENT ON COLUMN consultation_reports.report_status IS
  '상담일지 상태 — draft/submitted/under_review/approved/revision_requested/rejected/excellent. excellent는 관리자가 마킹하는 우수상담';
