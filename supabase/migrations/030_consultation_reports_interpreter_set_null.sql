-- ============================================
-- 마이그 030 — consultation_reports.interpreter_id FK ON DELETE SET NULL
--
-- 이유: 통역사 사용자 삭제 시 FK RESTRICT(default) 로 차단되어 admin이
-- 사용자 관리 화면에서 통역사를 삭제하지 못함. 일지는 감사·통계 목적으로
-- 보존하되 작성자만 NULL 로 끊는다.
--
-- 부수 영향: RLS reports_*_interpreter 정책은 interpreter_id=auth.uid() 조건
-- 사용. interpreter_id NULL row 는 통역사 본인 시점에서 보이지 않게 됨
-- (이미 통역사 계정 삭제됐으므로 자연스러운 동작). admin은 role 기준이라 영향 없음.
-- ============================================

ALTER TABLE consultation_reports
  DROP CONSTRAINT IF EXISTS consultation_reports_interpreter_id_fkey;

ALTER TABLE consultation_reports
  ALTER COLUMN interpreter_id DROP NOT NULL;

ALTER TABLE consultation_reports
  ADD CONSTRAINT consultation_reports_interpreter_id_fkey
  FOREIGN KEY (interpreter_id) REFERENCES profiles(id) ON DELETE SET NULL;
