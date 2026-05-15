-- ============================================
-- 이벤트 옵션 (BIS@T P3 기반)
-- events 테이블에 jsonb 옵션 컬럼 추가
-- ============================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '{
  "prior_match": false,
  "greeting": false,
  "onsite_match": false,
  "ai_interpret": false,
  "video_call": false,
  "infodesk_target": "all"
}'::jsonb;

-- infodesk_target 값 검증 (buyer | seller | all)
ALTER TABLE events ADD CONSTRAINT events_options_infodesk_target_chk
  CHECK (
    options->>'infodesk_target' IS NULL
    OR options->>'infodesk_target' IN ('buyer', 'seller', 'all')
  );

-- 인덱스 (옵션 키 기준 조회용 — GIN)
CREATE INDEX IF NOT EXISTS idx_events_options ON events USING GIN (options);
