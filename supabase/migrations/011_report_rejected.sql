-- 반려 상태 추가
ALTER TABLE consultation_reports DROP CONSTRAINT IF EXISTS consultation_reports_report_status_check;
ALTER TABLE consultation_reports ADD CONSTRAINT consultation_reports_report_status_check
  CHECK (report_status IN ('draft', 'submitted', 'under_review', 'approved', 'revision_requested', 'rejected'));
