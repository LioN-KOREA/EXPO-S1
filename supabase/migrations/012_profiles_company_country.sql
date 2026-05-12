-- profiles 테이블에 회사명, 국가, 추가정보 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extra_info JSONB DEFAULT '{}';

-- profiles_update_own 정책 업데이트: company_name, country도 본인이 수정 가능
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    role = (SELECT role FROM profiles WHERE id = auth.uid()) AND
    email = (SELECT email FROM profiles WHERE id = auth.uid()) AND
    linked_buyer_id IS NOT DISTINCT FROM (SELECT linked_buyer_id FROM profiles WHERE id = auth.uid()) AND
    linked_seller_id IS NOT DISTINCT FROM (SELECT linked_seller_id FROM profiles WHERE id = auth.uid())
  );
