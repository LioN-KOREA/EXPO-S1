-- ============================================
-- 시스템 필드(consultation_type / absence_reason) 강제 정규화
--
-- 배경:
--   MultiStepReportForm 의 불참 분기는 두 필드의 키를 하드코딩으로 매칭한다
--   (`consultation_type` / `absence_reason`). 양식 편집/엑셀 업로드 과정에서
--   두 필드가 누락되거나 변형되면 "국내기업 불참" 선택 시에도 모든 필드를
--   계속 입력해야 하는 버그가 발생한다.
--
-- 본 마이그는 기존 모든 상담회의 report_templates.fields 를 정규화한다:
--   1) consultation_type 누락 → 캐논 정의로 맨 앞에 주입
--   2) absence_reason 누락   → 캐논 정의로 맨 뒤에 주입
--   3) 두 시스템 키가 존재하면 캐논 정의로 덮어쓰기 (label/options/condition/type/required/source 모두)
--   4) 중복 시스템 키는 첫 등장 한 개만 유지 (사실상 둘 다 캐논 1회만 존재)
--   5) **라벨 기반 흡수**: 엑셀 업로드로 라벨 기반 키(예: `상담_진행_유형`)가 부여된
--      필드는 system key 가 아니라 비시스템으로 남아 중복 노출 위험이 있다.
--      label 이 "상담 진행 유형" 또는 "불참 사유" (앞뒤 공백 trim + 끝 `*` 제거 후)
--      인 비시스템 필드는 제거하여 시스템 필드 단일 노출을 보장한다.
--   6) consultation_type 은 항상 맨 앞, absence_reason 은 항상 맨 뒤
--   7) order 는 1..N 으로 재부여
--
-- 비시스템 필드의 label/required/options/order 등은 사용자 입력 그대로 보존된다.
--
-- 추가:
--   사전 단계로 consultation_reports.data 의 라벨 기반 키를 시스템 키로 rename 한다.
--   (label='상담 진행 유형'/'불참 사유' 였던 비시스템 키에 저장된 답변을
--    consultation_type/absence_reason 으로 옮긴 뒤 fields 정규화 진행)
-- ============================================

-- 1단계: consultation_reports.data 의 라벨 기반 키 → 시스템 키 rename
DO $$
DECLARE
  rec RECORD;
  consult_alt_key text;
  absence_alt_key text;
BEGIN
  FOR rec IN
    SELECT
      rt.event_id,
      (
        SELECT e->>'key'
        FROM jsonb_array_elements(rt.fields) e
        WHERE e->>'label' = '상담 진행 유형'
          AND e->>'key' NOT IN ('consultation_type','absence_reason')
        LIMIT 1
      ) AS consult_alt,
      (
        SELECT e->>'key'
        FROM jsonb_array_elements(rt.fields) e
        WHERE e->>'label' = '불참 사유'
          AND e->>'key' NOT IN ('consultation_type','absence_reason')
        LIMIT 1
      ) AS absence_alt
    FROM report_templates rt
  LOOP
    consult_alt_key := rec.consult_alt;
    absence_alt_key := rec.absence_alt;

    -- consultation_type 키 부재 시에만 옮김 (시스템 키 기존 값 보호)
    IF consult_alt_key IS NOT NULL THEN
      UPDATE consultation_reports cr
      SET data = (cr.data - consult_alt_key)
                 || jsonb_build_object('consultation_type', cr.data -> consult_alt_key)
      FROM consultations c
      WHERE cr.consultation_id = c.id
        AND c.event_id = rec.event_id
        AND cr.data ? consult_alt_key
        AND NOT (cr.data ? 'consultation_type');

      -- 시스템 키가 이미 있으면 라벨 기반 키만 제거 (값 충돌 방지)
      UPDATE consultation_reports cr
      SET data = cr.data - consult_alt_key
      FROM consultations c
      WHERE cr.consultation_id = c.id
        AND c.event_id = rec.event_id
        AND cr.data ? consult_alt_key;
    END IF;

    IF absence_alt_key IS NOT NULL THEN
      UPDATE consultation_reports cr
      SET data = (cr.data - absence_alt_key)
                 || jsonb_build_object('absence_reason', cr.data -> absence_alt_key)
      FROM consultations c
      WHERE cr.consultation_id = c.id
        AND c.event_id = rec.event_id
        AND cr.data ? absence_alt_key
        AND NOT (cr.data ? 'absence_reason');

      UPDATE consultation_reports cr
      SET data = cr.data - absence_alt_key
      FROM consultations c
      WHERE cr.consultation_id = c.id
        AND c.event_id = rec.event_id
        AND cr.data ? absence_alt_key;
    END IF;
  END LOOP;
END $$;

-- 2단계: report_templates.fields 정규화

DO $$
DECLARE
  rec RECORD;
  consult_canon jsonb := jsonb_build_object(
    'key', 'consultation_type',
    'label', '상담 진행 유형',
    'type', 'select',
    'options', jsonb_build_array('현장 주선 상담', '사전 주선 상담', '국내기업 불참', '바이어 불참'),
    'required', true,
    'order', 1,
    'source', 'interpreter'
  );
  absence_canon jsonb := jsonb_build_object(
    'key', 'absence_reason',
    'label', '불참 사유',
    'type', 'textarea',
    'required', true,
    'order', 2,
    'source', 'interpreter',
    'condition', jsonb_build_object(
      'field', 'consultation_type',
      'in', jsonb_build_array('국내기업 불참', '바이어 불참')
    )
  );
  non_system jsonb;
  combined jsonb;
  ordered_fields jsonb;
  elem jsonb;
  i int;
BEGIN
  FOR rec IN SELECT id, fields FROM report_templates LOOP
    -- 비시스템 필드만 추출 (입력 순서 유지)
    -- 시스템 키 매칭 + 라벨 기반 흡수(끝 '*' 제거, 좌우 공백 trim 후 비교)
    SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
    INTO non_system
    FROM jsonb_array_elements(rec.fields) WITH ORDINALITY AS t(e, ord)
    WHERE e->>'key' NOT IN ('consultation_type', 'absence_reason')
      AND btrim(regexp_replace(COALESCE(e->>'label', ''), '\s*\*+\s*$', '')) NOT IN ('상담 진행 유형', '불참 사유');

    -- consultation_type 맨 앞, 비시스템, absence_reason 맨 뒤
    combined := jsonb_build_array(consult_canon) || non_system || jsonb_build_array(absence_canon);

    -- order 1..N 재부여
    ordered_fields := '[]'::jsonb;
    FOR i IN 0 .. jsonb_array_length(combined) - 1 LOOP
      elem := combined -> i;
      ordered_fields := ordered_fields || jsonb_build_array(elem || jsonb_build_object('order', i + 1));
    END LOOP;

    UPDATE report_templates SET fields = ordered_fields WHERE id = rec.id;
  END LOOP;
END $$;
