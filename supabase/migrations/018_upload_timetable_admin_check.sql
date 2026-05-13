-- ============================================
-- 018: upload_timetable RPC 권한 검사 추가 (보안 강화)
-- ============================================
--
-- 005의 upload_timetable 함수는 SECURITY DEFINER로 작성되어 함수 소유자 권한으로 실행되는데,
-- 호출자 권한 검사가 없어 anon-key 가진 누구나 호출 시 다른 행사(event_id)의
-- consultations/reports/time_slots/buyers/sellers 데이터를 통째로 wipe할 수 있는 상태.
--
-- 본 마이그레이션은 함수 본문 첫 줄에 admin 권한 검사를 추가하고, 그 외 로직은 005와 동일하게
-- 유지합니다.

CREATE OR REPLACE FUNCTION upload_timetable(
  p_event_id UUID,
  p_time_slots JSONB,
  p_buyers JSONB,
  p_sellers JSONB,
  p_consultations JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot_ids UUID[];
  v_buyer_ids UUID[];
  v_seller_ids UUID[];
  v_slot_id UUID;
  v_buyer_id UUID;
  v_seller_id UUID;
  v_slot JSONB;
  v_buyer JSONB;
  v_seller JSONB;
  v_cons JSONB;
  v_idx INT;
BEGIN
  -- 0. 호출자 권한 검사 (admin 전용)
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION '권한이 없습니다 (admin 전용 RPC)';
  END IF;

  -- 1. 기존 데이터 삭제 (FK 순서)
  DELETE FROM consultation_reports
    WHERE consultation_id IN (
      SELECT id FROM consultations WHERE event_id = p_event_id
    );
  DELETE FROM consultations WHERE event_id = p_event_id;
  DELETE FROM time_slots WHERE event_id = p_event_id;
  DELETE FROM buyers WHERE event_id = p_event_id;
  DELETE FROM sellers WHERE event_id = p_event_id;

  -- 2. 타임슬롯 삽입
  v_slot_ids := ARRAY[]::UUID[];
  FOR v_idx IN 0..jsonb_array_length(p_time_slots) - 1 LOOP
    v_slot := p_time_slots->v_idx;
    INSERT INTO time_slots (event_id, date, start_time, end_time, slot_order)
    VALUES (
      p_event_id,
      (v_slot->>'date')::DATE,
      (v_slot->>'start_time')::TIME,
      (v_slot->>'end_time')::TIME,
      (v_slot->>'slot_order')::INT
    )
    RETURNING id INTO v_slot_id;
    v_slot_ids := array_append(v_slot_ids, v_slot_id);
  END LOOP;

  -- 3. 바이어 삽입
  v_buyer_ids := ARRAY[]::UUID[];
  FOR v_idx IN 0..jsonb_array_length(p_buyers) - 1 LOOP
    v_buyer := p_buyers->v_idx;
    INSERT INTO buyers (event_id, company_name, buyer_name, country, booth_number, phone, email)
    VALUES (
      p_event_id,
      v_buyer->>'company_name',
      COALESCE(v_buyer->>'buyer_name', ''),
      COALESCE(v_buyer->>'country', ''),
      v_buyer->>'booth_number',
      v_buyer->>'phone',
      v_buyer->>'email'
    )
    RETURNING id INTO v_buyer_id;
    v_buyer_ids := array_append(v_buyer_ids, v_buyer_id);
  END LOOP;

  -- 4. 셀러 삽입
  v_seller_ids := ARRAY[]::UUID[];
  FOR v_idx IN 0..jsonb_array_length(p_sellers) - 1 LOOP
    v_seller := p_sellers->v_idx;
    INSERT INTO sellers (event_id, company_name, company_name_kr, contact_name, contact_phone, office_phone, email)
    VALUES (
      p_event_id,
      COALESCE(v_seller->>'company_name', ''),
      v_seller->>'company_name_kr',
      v_seller->>'contact_name',
      v_seller->>'contact_phone',
      v_seller->>'office_phone',
      v_seller->>'email'
    )
    RETURNING id INTO v_seller_id;
    v_seller_ids := array_append(v_seller_ids, v_seller_id);
  END LOOP;

  -- 5. 상담 매칭 삽입
  FOR v_idx IN 0..jsonb_array_length(p_consultations) - 1 LOOP
    v_cons := p_consultations->v_idx;
    DECLARE
      v_buyer_idx INT := (v_cons->>'buyer_index')::INT;
      v_slot_idx INT := (v_cons->>'slot_index')::INT;
      v_seller_idx INT := (v_cons->>'seller_index')::INT;
    BEGIN
      IF v_buyer_idx < array_length(v_buyer_ids, 1)
         AND v_slot_idx < array_length(v_slot_ids, 1)
         AND v_seller_idx < array_length(v_seller_ids, 1) THEN
        INSERT INTO consultations (event_id, time_slot_id, buyer_id, seller_id)
        VALUES (
          p_event_id,
          v_slot_ids[v_slot_idx + 1],
          v_buyer_ids[v_buyer_idx + 1],
          v_seller_ids[v_seller_idx + 1]
        )
        ON CONFLICT (time_slot_id, buyer_id) DO NOTHING;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'time_slots', array_length(v_slot_ids, 1),
    'buyers', array_length(v_buyer_ids, 1),
    'sellers', array_length(v_seller_ids, 1),
    'buyer_ids', to_jsonb(v_buyer_ids),
    'seller_ids', to_jsonb(v_seller_ids)
  );
END;
$$;
