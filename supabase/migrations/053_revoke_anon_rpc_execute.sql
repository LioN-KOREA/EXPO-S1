-- ============================================
-- 053: anon/authenticated 롤의 서버전용 RPC 실행 권한 회수
-- ============================================
-- 문제(감사 발견 S1, 실제 노출 확인):
--   아래 5개 함수는 SECURITY DEFINER(owner=postgres) 이고 함수 본문에
--   auth.uid()/is_admin() 검사가 없다. 전부 서버 라우트에서 service_role
--   클라이언트로만 호출하도록 설계된 함수인데, 실측 ACL 은 다음과 같았다:
--
--     {postgres=X, anon=X, authenticated=X, service_role=X}
--
--   anon 키는 브라우저 번들에 포함되는 공개값이므로, 사이트 주소를 아는
--   누구나 /rest/v1/rpc/<fn> 을 직접 호출할 수 있는 상태였다.
--   SECURITY DEFINER 라 RLS 도 우회한다.
--
-- 왜 048/050/051 의 REVOKE 가 안 먹었나:
--   해당 마이그들은 `REVOKE ALL ON FUNCTION ... FROM PUBLIC` 만 했다.
--   Supabase 는 public 스키마 함수에 default privileges 로 anon/authenticated
--   에게 **명시적** GRANT 를 부여한다. FROM PUBLIC 리보크는 ACL 의 PUBLIC
--   항목만 지우고 명시적 GRANT 는 남긴다. 게다가 CREATE OR REPLACE 는 기존
--   ACL 을 그대로 유지하므로 함수를 다시 덮어써도 회수되지 않는다.
--   → 롤을 명시해서 REVOKE 해야 한다.
--
-- 영향 없음 근거 (호출부 전수 확인, 전부 service_role):
--   interpreter_add_consultation            src/app/api/interpreter/consultations/route.ts:41 (admin)
--   interpreter_delete_added_consultation   src/app/api/interpreter/consultations/[id]/route.ts:32 (admin)
--   ai_reserve_call                         src/app/api/ai/auto-answer/route.ts:225 (admin)
--   dispatch_due_scheduled_notices          앱 호출부 없음 (스케줄러/수동 전용)
--   purge_old_messages                      앱 호출부 없음 (운영 정리용)
--
-- 범위 밖(의도적):
--   is_admin/is_interpreter/upload_timetable/create|update|cancel|list_scheduled_notice/
--   interpreter_self_checkin/update_interpreter_global_fields 등은 본문에서
--   auth.uid()/is_admin() 를 검사하므로 그대로 둔다. 일부는 클라이언트에서
--   직접 호출되므로 회수하면 기능이 깨진다.
-- ============================================

REVOKE EXECUTE ON FUNCTION public.purge_old_messages(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_due_scheduled_notices()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_reserve_call(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.interpreter_add_consultation(uuid, uuid, uuid, uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.interpreter_delete_added_consultation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- service_role 은 명시 보장 (이미 있어도 GRANT 는 멱등).
GRANT EXECUTE ON FUNCTION public.purge_old_messages(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_due_scheduled_notices() TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_reserve_call(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.interpreter_add_consultation(uuid, uuid, uuid, uuid, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.interpreter_delete_added_consultation(uuid, uuid) TO service_role;

-- 회수 실패 시 마이그레이션을 실패시킨다 (조용한 미적용 방지).
DO $$
DECLARE
  v_leak text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_leak
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'purge_old_messages',
       'dispatch_due_scheduled_notices',
       'ai_reserve_call',
       'interpreter_add_consultation',
       'interpreter_delete_added_consultation'
     )
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'anon/authenticated 실행권한이 남아있음: %', v_leak;
  END IF;
END $$;
