-- ============================================
-- 055: 임직원 로그인 (라이온코리아 계정관리 시스템 OIDC) 연동 테이블
-- ============================================
-- 흐름 요약 (src/lib/auth/lpx-session.ts):
--   /auth/callback 에서 OIDC 코드 교환 → 권한(authority) 확인 → Supabase admin
--   계정을 찾거나 생성 → magiclink token_hash 로 일반 Supabase 세션을 발급.
--   이후 기존 RLS(auth.uid()) / ensureAdmin / proxy 는 그대로 동작한다.
--
-- oidc_identities : OIDC sub ↔ profiles.id 연결.
--   profiles 에 컬럼으로 두지 않은 이유: profiles_update_own 정책 + 017 트리거가
--   role/email/linked_* 외의 본인 컬럼 변경을 허용하므로, 사용자가 자기 sub 를
--   임의로 바꿀 수 있게 된다. 별도 테이블 + service_role 전용으로 분리.
--   provisioned_by_oidc = true 인 계정(이 흐름이 생성한 계정)은 OIDC 세션으로만
--   사용할 수 있다 (비밀번호 세션 거부 — 권한 회수 우회 방지).
--
-- oidc_sessions : Supabase 세션 1개당 OIDC 토큰 1벌 (서버 전용).
--   리프레시 토큰은 브라우저로 내려가지 않는다. authority_checked_at 이 권한
--   재확인 캐시(60초)이며, 권한 목록 자체는 저장하지 않는다 (연동안내서 6절).
--   refresh_lease_until 은 리프레시 직렬화용 lease (토큰 회전 시 동시 갱신 =
--   세션 전체 폐기이므로 반드시 한 번에 하나만).
--   폐기 시 행을 지우지 않고 revoked_at 을 남긴다 — 행이 없으면 "비밀번호
--   세션"으로 간주되므로, 지우면 회수된 세션이 통과해 버린다.
--
-- 두 테이블 모두 RLS 활성 + 정책 없음 + anon/authenticated 권한 명시 회수
-- (053 참고: Supabase default privileges 가 명시적 GRANT 를 부여함).
-- ============================================

CREATE TABLE oidc_identities (
  sub TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  provisioned_by_oidc BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oidc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_session_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sub TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  authority_checked_at TIMESTAMPTZ NOT NULL,
  refresh_lease_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oidc_sessions_user_id ON oidc_sessions(user_id);
CREATE INDEX idx_oidc_sessions_created_at ON oidc_sessions(created_at);

ALTER TABLE oidc_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE oidc_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE oidc_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE oidc_sessions FROM PUBLIC, anon, authenticated;
