BEGIN;

-- 018: migrations 001-017 종합 보안/무결성 보완
-- BLOCKER/HIGH 이슈를 한 번에 정리하는 후속 마이그레이션

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin');
END;
$$;

