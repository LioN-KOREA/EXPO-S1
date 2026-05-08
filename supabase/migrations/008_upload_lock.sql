-- 업로드 중 이벤트 잠금 플래그
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_uploading BOOLEAN DEFAULT false;
