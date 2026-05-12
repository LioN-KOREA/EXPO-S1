-- 통역사 상담일지 수정 RLS: submitted 제거 (제출 후 수정 방지)
-- 수정 가능: draft, revision_requested, rejected만
DROP POLICY IF EXISTS "reports_update_interpreter" ON consultation_reports;
CREATE POLICY "reports_update_interpreter" ON consultation_reports FOR UPDATE
  USING (interpreter_id = auth.uid())
  WITH CHECK (
    interpreter_id = auth.uid()
    AND report_status IN ('draft', 'revision_requested', 'rejected')
  );
