-- 반려(rejected) 상태에서도 통역사가 수정(재작성) 가능하도록 RLS 업데이트
DROP POLICY IF EXISTS "reports_update_interpreter" ON consultation_reports;
CREATE POLICY "reports_update_interpreter" ON consultation_reports FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (
    interpreter_id = auth.uid()
    AND report_status IN ('draft', 'revision_requested', 'submitted', 'rejected')
  );
