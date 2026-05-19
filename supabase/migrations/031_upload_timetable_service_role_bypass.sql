-- ============================================
-- 마이그 031 — upload_timetable admin 검사 service_role 우회
--
-- 이유: route(/api/upload/timetable)는 service_role client(createAdminClient)로
-- RPC 호출 → auth.uid() = NULL → 018에서 추가한 admin 검사 항상 실패.
-- route 가 이미 호출 전에 profile.role === 'admin' 검증하므로, RPC 내부 검사는
-- "service_role 호출이면 통과 / 사용자 JWT 호출이면 admin 확인" 으로 변경한다.
-- ============================================

CREATE OR REPLACE FUNCTION upload_timetable(
  p_event_id UUID,
  p_time_slots JSONB,
  p_buyers JSONB,
  p_sellers JSONB,
  p_consultations JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- 0. 호출자 권한 검사 — auth.uid() 가 있을 때만 admin 검증.
  --    service_role 으로 호출되면 auth.uid() = NULL → route 측에서 이미 검증된 것으로 본다.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
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
      v_buyer->>'buyer_name',
      v_buyer->>'country',
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
    INSERT INTO sellers (event_id, company_name, company_name_kr, representative, contact_name, contact_phone, office_phone, email)
    VALUES (
      p_event_id,
      v_seller->>'company_name',
      v_seller->>'company_name_kr',
      v_seller->>'representative',
      v_seller->>'contact_name',
      v_seller->>'contact_phone',
      v_seller->>'office_phone',
      v_seller->>'email'
    )
    RETURNING id INTO v_seller_id;
    v_seller_ids := array_append(v_seller_ids, v_seller_id);
  END LOOP;

  -- 5. 상담 삽입 (buyer_index, slot_index, seller_index 로 매핑)
  FOR v_idx IN 0..jsonb_array_length(p_consultations) - 1 LOOP
    v_cons := p_consultations->v_idx;
    INSERT INTO consultations (event_id, time_slot_id, buyer_id, seller_id)
    VALUES (
      p_event_id,
      v_slot_ids[(v_cons->>'slot_index')::INT + 1],
      v_buyer_ids[(v_cons->>'buyer_index')::INT + 1],
      v_seller_ids[(v_cons->>'seller_index')::INT + 1]
    );
  END LOOP;

  RETURN jsonb_build_object(
    'time_slots', jsonb_array_length(p_time_slots),
    'buyers', jsonb_array_length(p_buyers),
    'sellers', jsonb_array_length(p_sellers),
    'consultations', jsonb_array_length(p_consultations),
    'buyer_ids', to_jsonb(v_buyer_ids),
    'seller_ids', to_jsonb(v_seller_ids)
  );
END;
$$;
