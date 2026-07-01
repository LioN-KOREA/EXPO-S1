-- 통역사가 현장에서 즉석 등록한 미등록 업체 표시 + 원자 상담추가 RPC.
-- 관리자가 사후 검수/보정할 수 있도록 buyers/sellers 에 플래그.
ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS added_by_interpreter boolean NOT NULL DEFAULT false;
ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS added_by_interpreter boolean NOT NULL DEFAULT false;

-- ============================================
-- 통역사 자가 상담 추가 (원자) — 미등록 업체 즉석 생성 + 상담 생성을 한 트랜잭션으로.
-- 상담 insert 가 unique(23505) 등으로 실패하면 즉석 생성한 buyer/seller 도 함께 rollback → orphan 방지.
-- 기존 업체는 id 로, 미등록은 이름으로 넘긴다. buyer_name 은 NOT NULL 이라 '' 로 채움(관리자 사후 보정).
-- ============================================
CREATE OR REPLACE FUNCTION interpreter_add_consultation(
  p_event_id uuid,
  p_interpreter_id uuid,
  p_time_slot_id uuid,
  p_buyer_id uuid,
  p_new_buyer_name text,
  p_new_buyer_country text,
  p_seller_id uuid,
  p_new_seller_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid;
  v_seller uuid;
  v_cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM event_interpreters WHERE event_id = p_event_id AND interpreter_id = p_interpreter_id) THEN
    RAISE EXCEPTION 'not_assigned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM time_slots WHERE id = p_time_slot_id AND event_id = p_event_id) THEN
    RAISE EXCEPTION 'bad_slot';
  END IF;

  -- 바이어 확정
  IF p_buyer_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM buyers WHERE id = p_buyer_id AND event_id = p_event_id) THEN
      RAISE EXCEPTION 'bad_buyer';
    END IF;
    v_buyer := p_buyer_id;
  ELSE
    IF p_new_buyer_name IS NULL OR btrim(p_new_buyer_name) = '' THEN
      RAISE EXCEPTION 'bad_buyer';
    END IF;
    INSERT INTO buyers (event_id, company_name, buyer_name, country, added_by_interpreter)
    VALUES (p_event_id, btrim(p_new_buyer_name), '', COALESCE(btrim(p_new_buyer_country), ''), true)
    RETURNING id INTO v_buyer;
  END IF;

  -- 셀러 확정
  IF p_seller_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM sellers WHERE id = p_seller_id AND event_id = p_event_id) THEN
      RAISE EXCEPTION 'bad_seller';
    END IF;
    v_seller := p_seller_id;
  ELSE
    IF p_new_seller_name IS NULL OR btrim(p_new_seller_name) = '' THEN
      RAISE EXCEPTION 'bad_seller';
    END IF;
    INSERT INTO sellers (event_id, company_name, added_by_interpreter)
    VALUES (p_event_id, btrim(p_new_seller_name), true)
    RETURNING id INTO v_seller;
  END IF;

  -- 상담 생성 (unique 위반은 23505 로 전파 → 호출부에서 메시지 매핑)
  INSERT INTO consultations (event_id, time_slot_id, buyer_id, seller_id, interpreter_id, added_by_interpreter)
  VALUES (p_event_id, p_time_slot_id, v_buyer, v_seller, p_interpreter_id, true)
  RETURNING id INTO v_cid;

  RETURN v_cid;
END;
$$;

REVOKE ALL ON FUNCTION interpreter_add_consultation(uuid, uuid, uuid, uuid, text, text, uuid, text) FROM PUBLIC;
