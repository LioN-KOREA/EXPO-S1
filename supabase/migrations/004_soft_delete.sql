-- 소프트 삭제: events 테이블에 deleted_at 추가
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 삭제된 이벤트는 일반 조회에서 제외
DROP POLICY IF EXISTS "events_select_all" ON events;
CREATE POLICY "events_select_all" ON events FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

-- Admin은 삭제된 이벤트도 볼 수 있도록 별도 정책
CREATE POLICY "events_select_deleted_admin" ON events FOR SELECT
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
