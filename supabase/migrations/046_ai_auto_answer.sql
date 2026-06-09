-- ============================================
-- PRD #19 S0 — AI 자동 답변 인프라.
--
-- 1. ai_answer_pool       — (consultation_id, context_hash) 5-variant 풀
-- 2. ai_call_logs         — LLM 호출 로그 (prompt 평문 저장, Q11 B 결정)
-- 3. report_templates.fields 정규화 — 시스템 필드 7종 강제 (마이그 043 패턴 확장)
-- 4. RLS                  — admin/interpreter 조회 권한 분리, INSERT 는 service_role 만
--
-- 본 마이그는 환경변수 (OPENAI_API_KEY, AI_AUTO_ANSWER_ENABLED) 와 무관.
-- env 는 별도로 .env.production 에 운영팀이 추가.
-- ============================================

-- ============================================
-- 1. ai_answer_pool
-- ============================================
CREATE TABLE IF NOT EXISTS ai_answer_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  context_hash text NOT NULL,
  variant_index smallint NOT NULL CHECK (variant_index BETWEEN 0 AND 4),
  content text NOT NULL,
  temperature numeric(3,2),
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(10,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultation_id, context_hash, variant_index)
);

CREATE INDEX IF NOT EXISTS ai_answer_pool_consult_hash
  ON ai_answer_pool (consultation_id, context_hash);

ALTER TABLE ai_answer_pool ENABLE ROW LEVEL SECURITY;

-- admin = 전체 SELECT
DROP POLICY IF EXISTS ai_answer_pool_admin_select ON ai_answer_pool;
CREATE POLICY ai_answer_pool_admin_select ON ai_answer_pool
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- interpreter = 본인 배정 consultation 만 SELECT
DROP POLICY IF EXISTS ai_answer_pool_interpreter_select ON ai_answer_pool;
CREATE POLICY ai_answer_pool_interpreter_select ON ai_answer_pool
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM consultations c
      WHERE c.id = ai_answer_pool.consultation_id
        AND c.interpreter_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE 는 정책 0건 = authenticated 모두 거부.
-- 운영 코드는 SECURITY DEFINER RPC 또는 service_role 키로만 쓸 수 있음.

-- ============================================
-- 2. ai_call_logs
-- ============================================
CREATE TABLE IF NOT EXISTS ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  model text NOT NULL,
  -- status (S2 확정 11종, CHECK 미적용 — 향후 enum 확장 호환):
  --   success | cache_hit | timeout | http_5xx | rate_limit | kill_switch
  --   daily_cap | invalid_response | template_fallback | auth_error | unknown_error
  status text NOT NULL,
  prompt_text text,
  completion_text text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(10,6),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_call_logs_event_created
  ON ai_call_logs (event_id, created_at);

CREATE INDEX IF NOT EXISTS ai_call_logs_event_date_status
  ON ai_call_logs (event_id, ((created_at AT TIME ZONE 'Asia/Seoul')::date), status);

ALTER TABLE ai_call_logs ENABLE ROW LEVEL SECURITY;

-- admin 만 SELECT (모니터링 카드)
DROP POLICY IF EXISTS ai_call_logs_admin_select ON ai_call_logs;
CREATE POLICY ai_call_logs_admin_select ON ai_call_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT/UPDATE/DELETE 는 정책 0건 = service_role 만.

-- ============================================
-- 3. report_templates.fields 시스템 필드 7종 강제 주입 (마이그 043 패턴 확장)
--
-- 추가 시스템 키 (모두 PRD #19 §3 산출표 참조):
--   - industry             : 국내기업 업종/주요품목 (text)
--   - consultation_content : 상담내용 (textarea)
--   - key_discussion       : 주요 논의사항 (textarea)
--   - expected_amount      : 예상 계약금액 (text)
--   - buyer_reaction       : 바이어 반응 (textarea)
--   - follow_up            : 후속 계획 (textarea)
--   - notes                : 기타 특이사항 (textarea)
--
-- 마이그 043 의 consultation_type / absence_reason 은 그대로 유지 + 맨 앞/뒤 위치 유지.
-- 본 마이그는 위 7종 시스템 키를 비시스템 필드 사이에 강제 주입한다.
-- 운영자는 양식 편집기에서 label 만 한글 변경 가능, key/type 는 잠금 (코드 가드 별도).
--
-- 정책: idempotent.
--   - 이미 존재하는 시스템 키는 type/source/required 캐논으로 덮어쓴다 (label 은 사용자 변경 보존).
--   - 미존재면 캐논 정의로 신규 주입한다.
-- ============================================

DO $$
DECLARE
  rec RECORD;
  -- 7종 시스템 필드 캐논 정의 (id 순서 = 폼 노출 순서).
  ai_canons jsonb := jsonb_build_array(
    jsonb_build_object('key', 'industry', 'label', '국내기업 업종/주요품목', 'type', 'text', 'required', false, 'source', 'interpreter'),
    jsonb_build_object('key', 'consultation_content', 'label', '상담내용', 'type', 'textarea', 'required', false, 'source', 'interpreter'),
    jsonb_build_object('key', 'key_discussion', 'label', '주요 논의사항', 'type', 'textarea', 'required', false, 'source', 'interpreter'),
    jsonb_build_object('key', 'expected_amount', 'label', '예상 계약금액 (USD)', 'type', 'text', 'required', false, 'source', 'interpreter'),
    jsonb_build_object('key', 'buyer_reaction', 'label', '바이어 반응', 'type', 'textarea', 'required', false, 'source', 'interpreter'),
    jsonb_build_object('key', 'follow_up', 'label', '후속 계획', 'type', 'textarea', 'required', false, 'source', 'interpreter'),
    jsonb_build_object('key', 'notes', 'label', '기타 특이사항', 'type', 'textarea', 'required', false, 'source', 'interpreter')
  );
  ai_keys text[] := ARRAY['industry', 'consultation_content', 'key_discussion', 'expected_amount', 'buyer_reaction', 'follow_up', 'notes'];
  consult_canon jsonb;
  absence_canon jsonb;
  consult_present jsonb;
  absence_present jsonb;
  middle jsonb;
  combined jsonb;
  ordered_fields jsonb;
  elem jsonb;
  i int;
  canon jsonb;
  canon_key text;
  existing jsonb;
BEGIN
  FOR rec IN SELECT id, fields FROM report_templates LOOP
    -- 기존 consultation_type / absence_reason 유지 (마이그 043 가 보장).
    SELECT e INTO consult_present
    FROM jsonb_array_elements(rec.fields) e
    WHERE e->>'key' = 'consultation_type'
    LIMIT 1;

    SELECT e INTO absence_present
    FROM jsonb_array_elements(rec.fields) e
    WHERE e->>'key' = 'absence_reason'
    LIMIT 1;

    -- 캐논 fallback (만약 043 이 무효화됐어도 본 마이그가 복구).
    consult_canon := COALESCE(consult_present, jsonb_build_object(
      'key', 'consultation_type',
      'label', '상담 진행 유형',
      'type', 'select',
      'options', jsonb_build_array('현장 주선 상담', '사전 주선 상담', '국내기업 불참', '바이어 불참'),
      'required', true,
      'source', 'interpreter'
    ));
    absence_canon := COALESCE(absence_present, jsonb_build_object(
      'key', 'absence_reason',
      'label', '불참 사유',
      'type', 'textarea',
      'required', true,
      'source', 'interpreter',
      'condition', jsonb_build_object(
        'field', 'consultation_type',
        'in', jsonb_build_array('국내기업 불참', '바이어 불참')
      )
    ));

    -- 비시스템 + 비AI 필드만 추출 (입력 순서 유지).
    SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
    INTO middle
    FROM jsonb_array_elements(rec.fields) WITH ORDINALITY AS t(e, ord)
    WHERE e->>'key' NOT IN ('consultation_type', 'absence_reason')
      AND NOT (e->>'key' = ANY (ai_keys));

    -- AI 시스템 필드 7종: 기존 있으면 캐논 key/type/source/required 로 덮고 label 보존.
    FOR i IN 0 .. jsonb_array_length(ai_canons) - 1 LOOP
      canon := ai_canons -> i;
      canon_key := canon->>'key';

      SELECT e INTO existing
      FROM jsonb_array_elements(rec.fields) e
      WHERE e->>'key' = canon_key
      LIMIT 1;

      IF existing IS NOT NULL
         AND existing ? 'label'
         AND jsonb_typeof(existing->'label') = 'string'
         AND length(existing->>'label') > 0
      THEN
        -- 운영자가 바꾼 label 보존. null/빈 문자열은 캐논 label 유지 (validate_report_template_fields 호환).
        canon := canon || jsonb_build_object('label', existing->>'label');
      END IF;

      middle := middle || jsonb_build_array(canon);
    END LOOP;

    -- consultation_type 맨 앞 + middle + absence_reason 맨 뒤.
    combined := jsonb_build_array(consult_canon) || middle || jsonb_build_array(absence_canon);

    -- order 1..N 재부여.
    ordered_fields := '[]'::jsonb;
    FOR i IN 0 .. jsonb_array_length(combined) - 1 LOOP
      elem := combined -> i;
      ordered_fields := ordered_fields || jsonb_build_array(elem || jsonb_build_object('order', i + 1));
    END LOOP;

    UPDATE report_templates SET fields = ordered_fields WHERE id = rec.id;
  END LOOP;
END $$;
