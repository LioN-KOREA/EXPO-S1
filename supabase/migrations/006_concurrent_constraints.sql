-- 같은 시간대에 셀러 중복 배정 방지
-- (한 셀러가 같은 시간에 두 바이어와 상담 불가)
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_slot_seller
  ON consultations (time_slot_id, seller_id);

-- 같은 시간대에 통역사 중복 배정 방지
-- (한 통역사가 같은 시간에 두 상담 불가)
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_slot_interpreter
  ON consultations (time_slot_id, interpreter_id)
  WHERE interpreter_id IS NOT NULL;
