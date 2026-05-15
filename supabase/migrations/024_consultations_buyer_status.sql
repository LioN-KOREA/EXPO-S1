-- ============================================
-- 상담 — 바이어 상태 컬럼 추가 (BIS@T 통역사 IP7 기준)
-- 통역사가 IP7 모달에서 바이어의 현장 상태를 수동 갱신
-- NULL = 상태 없음 (기본값)
-- ============================================

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS buyer_status TEXT
  CHECK (
    buyer_status IS NULL
    OR buyer_status IN (
      'MET_INTERPRETER',          -- 통역사 만남
      'BUS_BOARDED',              -- 셔틀버스 탑승
      'INDIVIDUAL_MOVE',          -- 개별이동
      'WAITING',                  -- 대기중
      'ABSENT',                   -- 불참
      'ONSITE_MATCH_AVAILABLE',   -- 현장매칭 가능
      'ONSITE_MATCH_DONE'         -- 현장매칭 완료
    )
  );

COMMENT ON COLUMN consultations.buyer_status IS
  '통역사 IP7 모달에서 변경하는 바이어 현장 상태. NULL=상태없음';

-- 인덱스 (상태별 카운트/필터링용)
CREATE INDEX IF NOT EXISTS idx_consultations_buyer_status
  ON consultations (event_id, buyer_status)
  WHERE buyer_status IS NOT NULL;
