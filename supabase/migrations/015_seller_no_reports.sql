-- 셀러는 상담일지를 볼 수 없도록 RLS 정책 제거
DROP POLICY IF EXISTS "reports_select_seller" ON consultation_reports;
