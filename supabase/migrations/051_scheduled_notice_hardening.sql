-- ============================================
-- 040 WARN 수정: 예약메시지 멱등성 + dispatch 시점 event 재검증
-- ============================================

-- --------------------------------------------
-- 1) 멱등성: 동일 예약 중복 생성 차단
-- --------------------------------------------
-- 문제: create_scheduled_notice 에 unique 가 없어 admin 더블클릭/재시도 시
--       동일 예약이 2건 생성 → dispatch 때 중복 공지 발송.
-- 처방: (event_id, created_by, scheduled_at, message) 부분 unique index.
--       status='scheduled' 인 것만 대상(취소/발송/실패분은 재예약 허용).
-- ponytail: recipient_user_ids 는 키에서 제외. 같은 admin 이 같은 행사·같은 시각·
--   같은 문구를 서로 다른 수신자 부분집합으로 동시에 예약하는 경우는 비현실적 —
--   더블클릭(모든 필드 동일) 방어가 목적. 필요해지면 recipients 해시를 키에 추가.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_notices_dedup
  ON scheduled_notices (event_id, created_by, scheduled_at, md5(message))
  WHERE status = 'scheduled';

-- create RPC 재정의: 위 unique 위반을 friendly 키워드로 변환.
-- (040 원본 검증 전부 유지 + INSERT 에 EXCEPTION 핸들러만 추가)
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message_empty' USING ERRCODE = '42501';
  END IF;

  v_msg_len := length(p_message);
  IF v_msg_len > 4000 THEN
    RAISE EXCEPTION 'message_too_long' USING ERRCODE = '42501';
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at < (now() - interval '5 seconds') THEN
    RAISE EXCEPTION 'past_schedule' USING ERRCODE = '42501';
  END IF;

  IF p_recipient_user_ids IS NULL
     OR cardinality(p_recipient_user_ids) = 0
     OR array_position(p_recipient_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'recipient_empty' USING ERRCODE = '42501';
  END IF;

  SELECT e.end_date INTO v_event_end
    FROM public.events e
   WHERE e.id = p_event_id
     AND e.deleted_at IS NULL
     AND e.status = 'active';

  IF v_event_end IS NULL THEN
    RAISE EXCEPTION 'event_inactive' USING ERRCODE = '42501';
  END IF;

  IF (p_scheduled_at AT TIME ZONE 'Asia/Seoul')::date > v_event_end THEN
    RAISE EXCEPTION 'event_ended' USING ERRCODE = '42501';
  END IF;

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

  BEGIN
    INSERT INTO public.scheduled_notices (
      event_id, message, scheduled_at, status,
      recipient_user_ids, created_by, created_at, updated_at
    ) VALUES (
      p_event_id, p_message, p_scheduled_at, 'scheduled',
      p_recipient_user_ids, v_user_id, now(), now()
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- idx_scheduled_notices_dedup 충돌 = 동일 예약 중복(더블클릭/재시도).
    RAISE EXCEPTION 'duplicate_schedule' USING ERRCODE = '42501';
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scheduled_notice(uuid, text, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scheduled_notice(uuid, text, timestamptz, uuid[]) TO authenticated;


-- --------------------------------------------
-- 2) dispatch 시점 event 재검증
-- --------------------------------------------
-- 문제: 예약 생성 후 event 가 soft-delete(deleted_at) 되거나 status='archived'
--       로 바뀌어도 scheduled row 가 남아 있으면 dispatch 가 공지를 발송.
--       (event 하드삭제는 FK CASCADE 로 예약도 지워져 안전하지만, soft-delete/
--        archived 는 방치됨.)
-- 처방: 각 row 처리 직전 event 활성 재확인. 비활성이면 발송 없이 'cancelled'
--       + failed_reason 로 마감.
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
  v_event_ok boolean;
BEGIN
  FOR v_row IN
    SELECT id, event_id, message, recipient_user_ids, created_by
      FROM public.scheduled_notices
     WHERE status = 'scheduled'
       AND scheduled_at <= now()
     ORDER BY scheduled_at
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- dispatch 시점 event 활성 재확인
      SELECT EXISTS (
        SELECT 1 FROM public.events e
         WHERE e.id = v_row.event_id
           AND e.deleted_at IS NULL
           AND e.status = 'active'
      ) INTO v_event_ok;

      IF NOT v_event_ok THEN
        UPDATE public.scheduled_notices
           SET status = 'cancelled',
               failed_reason = 'event_inactive_at_dispatch',
               updated_at = now()
         WHERE id = v_row.id;
        CONTINUE;
      END IF;

      INSERT INTO public.notices (
        event_id, message, target_roles, recipient_user_ids, sent_by, sent_at
      ) VALUES (
        v_row.event_id, v_row.message, v_target_roles,
        v_row.recipient_user_ids, v_row.created_by, now()
      )
      RETURNING id INTO v_notice_id;

      UPDATE public.scheduled_notices
         SET status = 'sent',
             sent_notice_id = v_notice_id,
             updated_at = now()
       WHERE id = v_row.id;

      v_sent_count := v_sent_count + 1;

    EXCEPTION WHEN OTHERS THEN
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

REVOKE ALL ON FUNCTION public.dispatch_due_scheduled_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_due_scheduled_notices() TO service_role;
