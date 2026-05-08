-- 최초 로그인 비밀번호 변경 플래그
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
