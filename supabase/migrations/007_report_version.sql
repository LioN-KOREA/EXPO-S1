-- 상담일지 낙관적 락을 위한 version 컬럼
ALTER TABLE consultation_reports ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- 버전 자동 증가 트리거
CREATE OR REPLACE FUNCTION increment_report_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_report_version
  BEFORE UPDATE ON consultation_reports
  FOR EACH ROW
  EXECUTE FUNCTION increment_report_version();
