-- ============================================
-- 054: 커버링 인덱스 없는 외래키 17건 보강
-- ============================================
-- 문제(감사 발견, Supabase performance advisor `unindexed_foreign_keys` 17건):
--   자식 테이블의 FK 컬럼에 인덱스가 없으면
--     (1) 부모 삭제/갱신 시 자식 전체 seq scan (events 삭제 = CASCADE 전파 경로 전부)
--     (2) 해당 FK 를 조인키로 쓰는 조회가 seq scan
--   현재 데이터가 작아(consultations 414행) 체감은 없으나, 상담회가 누적되면
--   그대로 지연으로 나타난다. 인덱스 추가는 되돌리기 쉽고 부작용이 작다.
--
-- CONCURRENTLY 미사용: 마이그레이션이 트랜잭션 안에서 돌아 사용할 수 없고,
-- 현재 최대 테이블이 414행이라 잠금 시간이 무시할 수준이다.
-- ============================================

-- 핫 경로 (실데이터 있음)
CREATE INDEX IF NOT EXISTS idx_consultations_buyer_id
  ON public.consultations (buyer_id);
CREATE INDEX IF NOT EXISTS idx_consultations_seller_id
  ON public.consultations (seller_id);
CREATE INDEX IF NOT EXISTS idx_consultation_reports_interpreter_id
  ON public.consultation_reports (interpreter_id);
CREATE INDEX IF NOT EXISTS idx_consultation_reports_reviewed_by
  ON public.consultation_reports (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_event_interpreters_interpreter_id
  ON public.event_interpreters (interpreter_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_event_id
  ON public.report_templates (event_id);
CREATE INDEX IF NOT EXISTS idx_notices_sent_by
  ON public.notices (sent_by);
CREATE INDEX IF NOT EXISTS idx_attendance_status_logs_changed_by
  ON public.attendance_status_logs (changed_by);

-- 아직 비어있으나 CASCADE 경로에 포함되는 테이블
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_consultation_id
  ON public.ai_call_logs (consultation_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_user_id
  ON public.ai_call_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_consultation_data_alerts_requester_id
  ON public.consultation_data_alerts (requester_id);
CREATE INDEX IF NOT EXISTS idx_consultation_data_alerts_resolved_by
  ON public.consultation_data_alerts (resolved_by);
-- interpreter_evaluations_assignment_fk (event_id, interpreter_id) 는 인덱스를 추가하지 않는다.
-- 기존 UNIQUE 인덱스 interpreter_evaluations_unique_pair (interpreter_id, event_id) 가
-- 두 컬럼 동등조건 조회를 이미 커버한다. advisor 는 conkey 배열 순서로만 판정해 이를
-- 놓치고 경고하지만, 실제로는 중복 인덱스가 되므로 쓰기비용만 늘어난다.
CREATE INDEX IF NOT EXISTS idx_interpreter_evaluations_evaluated_by
  ON public.interpreter_evaluations (evaluated_by);
CREATE INDEX IF NOT EXISTS idx_message_logs_template_id
  ON public.message_logs (template_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notices_created_by
  ON public.scheduled_notices (created_by);
CREATE INDEX IF NOT EXISTS idx_scheduled_notices_sent_notice_id
  ON public.scheduled_notices (sent_notice_id);

-- 중복 인덱스 제거 (감사 중 발견, FK 와 무관):
-- idx_reports_consultation (consultation_id) 는 UNIQUE 인덱스
-- consultation_reports_consultation_id_key (consultation_id) 와 완전히 동일하다.
-- UNIQUE 쪽이 제약을 지탱하므로 일반 인덱스만 제거한다.
DROP INDEX IF EXISTS public.idx_reports_consultation;
