-- ============================================
-- 메시지 전송 예약 (PRD #10 / S1 #12)
-- ============================================
-- 별도 테이블 scheduled_notices + RPC 5개 + notices.recipient_user_ids ALTER + pg_cron
--
-- 설계 결정 (PRD #10):
-- - notices 확장이 아닌 별도 테이블: notices 는 immutable broadcast,
--   scheduled 는 mutable lifecycle 이라 의미 충돌 회피
-- - 부분집합 발송을 위해 notices.recipient_user_ids UUID[] NULL 추가
--   NULL = 기존 target_roles broadcast (회귀 안전), NOT NULL = 그 user 들에게만
-- - pg_cron 매분 dispatch_due_scheduled_notices() 호출
-- - 권한 admin only, 영문 키워드 RAISE EXCEPTION + ERRCODE='42501'
-- - 마이그 039 패턴 그대로: SECURITY DEFINER + SET search_path + REVOKE/GRANT
--
-- pg_cron / cron.schedule 등록은 마이그 안에서 일단 시도하되 권한 실패할 수 있음.
-- 실패 시 docs/runbook/pg_cron-setup.md 절차로 SQL Editor 수동 1회 실행.
-- 운영 적용 시 진우 매니저가 Dashboard 에서 검증 후 cron job 활성화.
-- ============================================

-- ============================================
-- 1) pg_cron extension
-- ============================================
-- Supabase 는 dashboard 에서 pg_cron 활성화 후에야 CREATE EXTENSION 권한이 열림.
-- 권한 없는 환경에서도 마이그 자체는 통과시키기 위해 DO 블록 안에 try/except 로 감쌈.
-- 등록 실패 시 RAISE NOTICE 만 남기고 runbook 으로 위임 (Codex 검수 BLOCK#2 반영).
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
  RAISE NOTICE 'pg_cron extension 생성 실패: docs/runbook/pg_cron-setup.md 참조하여 dashboard 에서 사전 활성화 필요';
END;
$ext$;


-- ============================================
-- 2) notices.recipient_user_ids 컬럼 추가 + 정책 ALTER
-- ============================================
-- 기존 broadcast(recipient_user_ids IS NULL) 동작 보존.
-- 발송 시 NOT NULL 이면 그 user 들에게만 노출.
ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS recipient_user_ids UUID[] NULL;

COMMENT ON COLUMN notices.recipient_user_ids IS
  '부분집합 발송 대상. NULL=target_roles broadcast(기존 동작), NOT NULL=이 user_id 만 노출.';

-- GIN 인덱스: PostgreSQL array GIN 은 @>/&&/= 연산자에서 동작.
-- 현재 정책은 `auth.uid() = ANY(...)` 패턴이라 직접 GIN 활용은 못함.
-- 향후 정책을 `recipient_user_ids @> ARRAY[auth.uid()]` 형태로 바꾸거나
-- admin 측 대량 조회용 cardinality/포함 검색에 대비해 인덱스만 유지.
-- (Codex SUGGEST#3 — 주석 정정)
CREATE INDEX IF NOT EXISTS idx_notices_recipient_user_ids
  ON notices USING GIN (recipient_user_ids);

-- notices_select_targeted 정책 ALTER:
-- 기존: target_roles 에 내 role 포함 시 조회 가능
-- 변경: 추가로 recipient_user_ids 가 NULL 이거나 내 uid 가 그 배열에 있어야 함
DROP POLICY IF EXISTS "notices_select_targeted" ON notices;
CREATE POLICY "notices_select_targeted" ON notices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND notices.target_roles ? profiles.role
    )
    AND (
      notices.recipient_user_ids IS NULL
      OR auth.uid() = ANY(notices.recipient_user_ids)
    )
  );

-- notice_reads_insert_own 정책도 동일한 가시성 게이트로 갱신:
-- 기존 정책은 user_id=auth.uid() 만 검증해서, 비수신자가 notice UUID 만 알면
-- targeted notice 에 read marker 를 임의로 만들 수 있는 무결성 누수가 있었음.
-- (Codex 검수 WARN#1 반영)
DROP POLICY IF EXISTS "notice_reads_insert_own" ON notice_reads;
CREATE POLICY "notice_reads_insert_own" ON notice_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM notices n
       JOIN profiles p ON p.id = auth.uid()
      WHERE n.id = notice_reads.notice_id
        AND n.target_roles ? p.role
        AND (n.recipient_user_ids IS NULL OR auth.uid() = ANY(n.recipient_user_ids))
    )
  );


-- ============================================
-- 3) scheduled_notices 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed')),
  -- cardinality 는 빈 배열에서 0 을 반환 (array_length 는 NULL → CHECK 통과 버그).
  -- array_position(..., NULL) IS NULL 로 NULL element 도 차단.
  -- (Codex 검수 BLOCK#1 반영)
  recipient_user_ids UUID[] NOT NULL
    CHECK (cardinality(recipient_user_ids) >= 1)
    CHECK (array_position(recipient_user_ids, NULL) IS NULL),
  sent_notice_id UUID NULL REFERENCES notices(id) ON DELETE SET NULL,
  failed_reason TEXT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
-- dispatcher 용: status='scheduled' AND scheduled_at <= now() 검색
CREATE INDEX IF NOT EXISTS idx_scheduled_notices_dispatch
  ON scheduled_notices (status, scheduled_at);

-- admin 목록 용: 행사별 최근 순
CREATE INDEX IF NOT EXISTS idx_scheduled_notices_event
  ON scheduled_notices (event_id, created_at DESC);


-- ============================================
-- 4) RLS — admin 만 SELECT/INSERT/UPDATE/DELETE
-- ============================================
ALTER TABLE scheduled_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_notices_select_admin" ON scheduled_notices FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "scheduled_notices_insert_admin" ON scheduled_notices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "scheduled_notices_update_admin" ON scheduled_notices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "scheduled_notices_delete_admin" ON scheduled_notices FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- ============================================
-- 5) 공통 검증 헬퍼 — admin 체크
--    SECURITY DEFINER RPC 안에서 auth.uid() 호출자가 admin 인지 검증.
-- ============================================
-- (인라인으로 각 RPC 에 박는 대신 헬퍼로 분리하지 않음 — 한 곳에서만 쓰이면 인라인이 명확.
--  마이그 039 도 인라인 EXISTS 패턴 사용.)


-- ============================================
-- 6) RPC create_scheduled_notice
-- ============================================
CREATE OR REPLACE FUNCTION public.create_scheduled_notice(
  p_event_id uuid,
  p_message text,
  p_scheduled_at timestamptz,
  p_recipient_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_event_end date;
  v_msg_len int;
  v_bad_recipient int;
BEGIN
  -- 인증
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- admin 여부
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  -- message 길이
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message_empty' USING ERRCODE = '42501';
  END IF;

  v_msg_len := length(p_message);
  IF v_msg_len > 4000 THEN
    RAISE EXCEPTION 'message_too_long' USING ERRCODE = '42501';
  END IF;

  -- scheduled_at >= now() - 5초 (분 단위 정확도 + 클럭 드리프트 허용)
  IF p_scheduled_at IS NULL OR p_scheduled_at < (now() - interval '5 seconds') THEN
    RAISE EXCEPTION 'past_schedule' USING ERRCODE = '42501';
  END IF;

  -- recipient 1명 이상 + NULL element 차단
  IF p_recipient_user_ids IS NULL
     OR cardinality(p_recipient_user_ids) = 0
     OR array_position(p_recipient_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'recipient_empty' USING ERRCODE = '42501';
  END IF;

  -- 행사 활성 + scheduled_at 이 end_date 이내
  SELECT e.end_date INTO v_event_end
    FROM public.events e
   WHERE e.id = p_event_id
     AND e.deleted_at IS NULL
     AND e.status = 'active';

  IF v_event_end IS NULL THEN
    RAISE EXCEPTION 'event_inactive' USING ERRCODE = '42501';
  END IF;

  -- end_date 23:59:59 KST 까지를 마감으로 본다 (서버 UTC 비교).
  -- end_date 익일 00:00 KST = end_date UTC 15:00. 단순화: scheduled_at 의 date 부분이 end_date 이하면 OK.
  IF (p_scheduled_at AT TIME ZONE 'Asia/Seoul')::date > v_event_end THEN
    RAISE EXCEPTION 'event_ended' USING ERRCODE = '42501';
  END IF;

  -- recipient_user_ids 모두 그 행사 통역사인지 확인
  SELECT count(*) INTO v_bad_recipient
    FROM unnest(p_recipient_user_ids) AS r(uid)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.event_interpreters ei
       JOIN public.profiles p ON p.id = ei.interpreter_id
      WHERE ei.event_id = p_event_id
        AND ei.interpreter_id = r.uid
        AND p.role = 'interpreter'
   );

  IF v_bad_recipient > 0 THEN
    RAISE EXCEPTION 'recipient_not_interpreter' USING ERRCODE = '42501';
  END IF;

  -- INSERT
  INSERT INTO public.scheduled_notices (
    event_id, message, scheduled_at, status,
    recipient_user_ids, created_by, created_at, updated_at
  ) VALUES (
    p_event_id, p_message, p_scheduled_at, 'scheduled',
    p_recipient_user_ids, v_user_id, now(), now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scheduled_notice(uuid, text, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scheduled_notice(uuid, text, timestamptz, uuid[]) TO authenticated;


-- ============================================
-- 7) RPC update_scheduled_notice
-- ============================================
CREATE OR REPLACE FUNCTION public.update_scheduled_notice(
  p_id uuid,
  p_message text,
  p_scheduled_at timestamptz,
  p_recipient_user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_event_end date;
  v_bad_recipient int;
  v_affected int;
BEGIN
  -- 인증
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  -- 대상 row 존재 + scheduled 상태 확인 + event_id 가져오기 (race 차단 위해 FOR UPDATE)
  SELECT event_id INTO v_event_id
    FROM public.scheduled_notices
   WHERE id = p_id
     AND status = 'scheduled'
   FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'not_scheduled' USING ERRCODE = '42501';
  END IF;

  -- message 검증
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message_empty' USING ERRCODE = '42501';
  END IF;

  IF length(p_message) > 4000 THEN
    RAISE EXCEPTION 'message_too_long' USING ERRCODE = '42501';
  END IF;

  -- scheduled_at
  IF p_scheduled_at IS NULL OR p_scheduled_at < (now() - interval '5 seconds') THEN
    RAISE EXCEPTION 'past_schedule' USING ERRCODE = '42501';
  END IF;

  -- recipient 1명 이상 + NULL element 차단
  IF p_recipient_user_ids IS NULL
     OR cardinality(p_recipient_user_ids) = 0
     OR array_position(p_recipient_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'recipient_empty' USING ERRCODE = '42501';
  END IF;

  -- 행사 활성 + end_date 이내
  SELECT e.end_date INTO v_event_end
    FROM public.events e
   WHERE e.id = v_event_id
     AND e.deleted_at IS NULL
     AND e.status = 'active';

  IF v_event_end IS NULL THEN
    RAISE EXCEPTION 'event_inactive' USING ERRCODE = '42501';
  END IF;

  IF (p_scheduled_at AT TIME ZONE 'Asia/Seoul')::date > v_event_end THEN
    RAISE EXCEPTION 'event_ended' USING ERRCODE = '42501';
  END IF;

  -- recipient 모두 그 행사 통역사
  SELECT count(*) INTO v_bad_recipient
    FROM unnest(p_recipient_user_ids) AS r(uid)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.event_interpreters ei
       JOIN public.profiles p ON p.id = ei.interpreter_id
      WHERE ei.event_id = v_event_id
        AND ei.interpreter_id = r.uid
        AND p.role = 'interpreter'
   );

  IF v_bad_recipient > 0 THEN
    RAISE EXCEPTION 'recipient_not_interpreter' USING ERRCODE = '42501';
  END IF;

  -- UPDATE — status='scheduled' 가드 한 번 더 (SELECT FOR UPDATE 와 일관성 강화)
  UPDATE public.scheduled_notices
     SET message = p_message,
         scheduled_at = p_scheduled_at,
         recipient_user_ids = p_recipient_user_ids,
         updated_at = now()
   WHERE id = p_id
     AND status = 'scheduled';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'not_scheduled' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_scheduled_notice(uuid, text, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_scheduled_notice(uuid, text, timestamptz, uuid[]) TO authenticated;


-- ============================================
-- 8) RPC cancel_scheduled_notice
-- ============================================
CREATE OR REPLACE FUNCTION public.cancel_scheduled_notice(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_affected int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.scheduled_notices
     SET status = 'cancelled',
         updated_at = now()
   WHERE id = p_id
     AND status = 'scheduled';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'not_scheduled' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_scheduled_notice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_notice(uuid) TO authenticated;


-- ============================================
-- 9) RPC list_scheduled_notices
-- ============================================
CREATE OR REPLACE FUNCTION public.list_scheduled_notices(p_event_id uuid)
RETURNS SETOF public.scheduled_notices
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT * FROM public.scheduled_notices
     WHERE event_id = p_event_id
     ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_scheduled_notices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_scheduled_notices(uuid) TO authenticated;


-- ============================================
-- 10) RPC dispatch_due_scheduled_notices (cron worker)
-- ============================================
-- pg_cron 이 매분 호출. FOR UPDATE SKIP LOCKED 로 동시 실행 안전.
-- 각 row 마다 BEGIN/EXCEPTION 블록 (savepoint) 으로 격리:
--   성공 → status='sent' + sent_notice_id
--   실패 → status='failed' + failed_reason (재시도 X)
CREATE OR REPLACE FUNCTION public.dispatch_due_scheduled_notices()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_notice_id uuid;
  v_sent_count int := 0;
  v_target_roles jsonb := '["interpreter"]'::jsonb;
  v_err text;
BEGIN
  -- due rows 잠금. UPDATE 가 아닌 SELECT FOR UPDATE 로 row lock 만 잡고
  -- 각 row 처리는 별도 BEGIN/EXCEPTION 블록에서.
  FOR v_row IN
    SELECT id, event_id, message, recipient_user_ids, created_by
      FROM public.scheduled_notices
     WHERE status = 'scheduled'
       AND scheduled_at <= now()
     ORDER BY scheduled_at
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- notices INSERT — target_roles=['interpreter'] + recipient_user_ids 전달
      INSERT INTO public.notices (
        event_id, message, target_roles, recipient_user_ids, sent_by, sent_at
      ) VALUES (
        v_row.event_id, v_row.message, v_target_roles,
        v_row.recipient_user_ids, v_row.created_by, now()
      )
      RETURNING id INTO v_notice_id;

      -- scheduled_notices 전이
      UPDATE public.scheduled_notices
         SET status = 'sent',
             sent_notice_id = v_notice_id,
             updated_at = now()
       WHERE id = v_row.id;

      v_sent_count := v_sent_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- savepoint 자동 롤백 후 실패 표시
      v_err := SQLERRM;
      UPDATE public.scheduled_notices
         SET status = 'failed',
             failed_reason = v_err,
             updated_at = now()
       WHERE id = v_row.id;
    END;
  END LOOP;

  RETURN v_sent_count;
END;
$$;

-- dispatch RPC 는 cron 이 호출 (postgres role) — authenticated 에는 노출 안 함.
-- service_role 도 호출 가능하게 둠 (수동 트리거/테스트용).
REVOKE ALL ON FUNCTION public.dispatch_due_scheduled_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_due_scheduled_notices() TO service_role;


-- ============================================
-- 11) pg_cron 매분 등록
-- ============================================
-- 권한 실패 가능 (Supabase 운영에서 dashboard 사전 활성화 필요).
-- 실패 시 runbook 의 SQL Editor 수동 실행으로 우회.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 이미 등록된 job 이 있으면 unschedule 후 재등록 (멱등성)
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'dispatch_due_scheduled_notices_minutely'
    ) THEN
      PERFORM cron.unschedule('dispatch_due_scheduled_notices_minutely');
    END IF;

    PERFORM cron.schedule(
      'dispatch_due_scheduled_notices_minutely',
      '* * * * *',
      $job$SELECT public.dispatch_due_scheduled_notices();$job$
    );
  END IF;
EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_function THEN
  -- pg_cron 미설치/권한 없음 → 마이그 자체는 통과시키고 runbook 으로 위임
  RAISE NOTICE 'pg_cron 자동 등록 실패: docs/runbook/pg_cron-setup.md 참조하여 수동 등록 필요';
END;
$cron$;
