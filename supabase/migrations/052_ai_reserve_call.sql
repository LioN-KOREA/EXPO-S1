-- ============================================
-- auto-answer WARN 수정: 분당 호출 cap 을 hard cap 으로 (동시성 방어)
-- ============================================
-- 문제(감사 발견 WARN):
--   rate limit 이 count-before-call 방식이라 동시 요청이 모두 한도를 통과한 뒤
--   각자 OpenAI 를 호출 → 분당 cap/일일 $ cap 이 soft cap. 비용 초과 가능.
--
-- 처방:
--   check + 예약을 단일 RPC 로 묶고 user 별 advisory xact lock 으로 직렬화.
--   통과 시 status='reserved' 마커 row 를 즉시 INSERT → 뒤따르는 동시 요청의
--   분당 카운트에 즉시 반영됨(in-flight 포함) → 분당 cap 이 hard 하게 강제된다.
--
--   ai_call_logs.status 는 CHECK 없음(046) → 'reserved' 추가 안전.
--   분당 카운트는 status='reserved' row 만 집계(= 실제 OpenAI 호출 예약 단위).
--   최종 success/timeout/... 로그는 기존대로 별도 row 로 기록(감사용, 미집계).
--
-- ponytail: 일일 $ cap 은 여전히 semi-soft.
--   비용은 호출 성공 후에만 확정되므로, advisory lock 하에서 커밋된 success 만
--   합산 → in-flight 동시성(수 건)만큼 수 센트 초과 가능. 블래스트 반경이 작아
--   (event 당 $10, 통역사 소수) 완전 예약-원장까지는 과설계. 초과분은 허용.
-- ============================================

CREATE OR REPLACE FUNCTION public.ai_reserve_call(
  p_user_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_minute int;
  v_daily numeric;
BEGIN
  -- 동일 user 예약을 직렬화 → 분당 cap hard 강제. xact 종료 시 자동 해제.
  PERFORM pg_advisory_xact_lock(hashtext('ai_reserve:' || p_user_id::text));

  SELECT count(*) INTO v_minute
    FROM public.ai_call_logs
   WHERE user_id = p_user_id
     AND status = 'reserved'
     AND created_at > now() - interval '60 seconds';

  IF v_minute >= 10 THEN
    RETURN jsonb_build_object('result', 'minute_cap', 'minute_count', v_minute);
  END IF;

  SELECT coalesce(sum(cost_usd), 0) INTO v_daily
    FROM public.ai_call_logs
   WHERE event_id = p_event_id
     AND status = 'success'
     AND (created_at AT TIME ZONE 'Asia/Seoul')::date
       = (now() AT TIME ZONE 'Asia/Seoul')::date;

  IF v_daily >= 10 THEN
    RETURN jsonb_build_object('result', 'daily_cap', 'daily_usd', v_daily);
  END IF;

  -- 예약 마커. 분당 카운트에 즉시 반영.
  INSERT INTO public.ai_call_logs (user_id, event_id, model, status, cost_usd, created_at)
  VALUES (p_user_id, p_event_id, 'reserved', 'reserved', 0, now());

  RETURN jsonb_build_object('result', 'ok', 'minute_count', v_minute + 1, 'daily_usd', v_daily);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_reserve_call(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_reserve_call(uuid, uuid) TO service_role;
