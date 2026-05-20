-- ============================================
-- 공지 수정 흔적: notices.edited_at
-- 관리자가 보낸 공지 메시지를 수정하면 edited_at 갱신.
-- 통역사 화면에 "수정됨" 라벨 표시 용도.
-- ============================================

ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN notices.edited_at IS
  '관리자가 메시지를 수정한 시각. NULL = 수정 이력 없음.';
