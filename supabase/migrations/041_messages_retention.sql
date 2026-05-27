-- ============================================
-- 메신저 보존 정책
-- ============================================
-- 정책:
--  1) 사용자/관리자 trigger 삭제 = 즉시 hard delete (앱 레이어 처리 — /api/messages/[id]/delete)
--  2) 자동 보존 기간 = 90 일 (3 개월). 매일 03:00 UTC 에 90 일 초과 메시지 DELETE
--  3) 행사 삭제 시 = ON DELETE CASCADE 로 thread 와 message 모두 즉시 hard delete
--     (마이그 035 에서 events → message_threads → messages CASCADE 체인 이미 적용)
--
-- 본 마이그:
--  - purge_old_messages(p_days INT) RPC (SECURITY DEFINER + search_path)
--  - pg_cron 일일 스케줄 등록 (extension/권한 실패 시 fallback 처리)
--  - cron 실패 시 docs/runbook 절차서로 수동 등록 위임
-- ============================================

-- 1) pg_cron extension (Supabase Dashboard 에서 사전 활성화 필요할 수 있음)
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
  RAISE NOTICE 'pg_cron 생성 실패: Dashboard 에서 사전 활성화 필요. docs/runbook/pg_cron-setup.md 참조';
END $ext$;

-- 2) 90일 초과 메시지 hard delete RPC
CREATE OR REPLACE FUNCTION public.purge_old_messages(p_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted int;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'invalid_days_param' USING ERRCODE = '22023';
  END IF;

  WITH del AS (
    DELETE FROM public.messages
    WHERE created_at < (now() - (p_days || ' days')::interval)
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_messages(int) FROM PUBLIC;
-- service_role + postgres 만 호출 가능. authenticated/anon 차단.
GRANT EXECUTE ON FUNCTION public.purge_old_messages(int) TO service_role;

COMMENT ON FUNCTION public.purge_old_messages(int) IS '메시지 보존 정책 — p_days(기본 90) 초과 메시지 hard delete. pg_cron 일일 호출 + 운영 비상시 수동 호출 양용.';

-- 3) pg_cron 일일 스케줄 (03:00 UTC = 12:00 KST). 권한 실패 시 NOTICE 만 남김.
DO $cron$
BEGIN
  PERFORM cron.schedule(
    'purge-old-messages-daily',
    '0 3 * * *',
    $$SELECT public.purge_old_messages(90);$$
  );
  RAISE NOTICE 'pg_cron 일일 메시지 정리 스케줄 등록 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule 등록 실패 (%): docs/runbook/pg_cron-setup.md 참조하여 Dashboard SQL Editor 에서 수동 실행', SQLERRM;
END $cron$;
