-- ============================================
-- 상담일지 양식 — 분기/순서 메타데이터 확장
-- DB 스키마는 jsonb이므로 ALTER 불필요. 코멘트 + 검증 함수만 추가.
--
-- 기존 TemplateField: { key, label, type, options?, required }
-- 확장:
--   condition?: { field: string, equals: any }  -- 분기 (해당 field 답이 equals와 같을 때만 노출)
--   order?:     number                          -- 순서 (멀티스텝 폼)
-- ============================================

COMMENT ON COLUMN report_templates.fields IS
  'TemplateField[] — key/label/type/options/required + condition/order (분기/순서). condition: { field, equals } 형태로 앞 답 기반 조건부 노출. order: number, 멀티스텝 폼 정렬용';

-- 검증 함수: fields jsonb가 올바른 형태인지 체크
-- (필수 키 존재 + condition/order 타입 검사. condition.field가 다른 필드 key를 가리키는지 검사)
CREATE OR REPLACE FUNCTION validate_report_template_fields(fields_jsonb JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  field JSONB;
  field_keys TEXT[] := ARRAY[]::TEXT[];
  cond_field TEXT;
BEGIN
  IF jsonb_typeof(fields_jsonb) <> 'array' THEN
    RETURN FALSE;
  END IF;

  -- 1차 패스: key 수집 + 필수 필드 존재 확인
  FOR field IN SELECT * FROM jsonb_array_elements(fields_jsonb)
  LOOP
    IF NOT (field ? 'key') OR NOT (field ? 'label') OR NOT (field ? 'type') THEN
      RETURN FALSE;
    END IF;
    IF jsonb_typeof(field->'key') <> 'string'
       OR jsonb_typeof(field->'label') <> 'string'
       OR jsonb_typeof(field->'type') <> 'string' THEN
      RETURN FALSE;
    END IF;
    field_keys := array_append(field_keys, field->>'key');
  END LOOP;

  -- 2차 패스: condition.field 유효성 + order 타입 검사
  FOR field IN SELECT * FROM jsonb_array_elements(fields_jsonb)
  LOOP
    IF field ? 'condition' THEN
      IF jsonb_typeof(field->'condition') <> 'object' THEN
        RETURN FALSE;
      END IF;
      IF NOT (field->'condition' ? 'field') OR NOT (field->'condition' ? 'equals') THEN
        RETURN FALSE;
      END IF;
      cond_field := field->'condition'->>'field';
      IF NOT (cond_field = ANY(field_keys)) THEN
        RETURN FALSE;
      END IF;
    END IF;
    IF field ? 'order' THEN
      IF jsonb_typeof(field->'order') <> 'number' THEN
        RETURN FALSE;
      END IF;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_report_template_fields IS
  '양식 fields jsonb 유효성 검증. 필수 키 + condition/order 타입 + condition.field가 다른 필드 key 참조하는지 확인';

-- CHECK 제약 추가 (기존 데이터 만족 시에만 — 실패 시 별도 데이터 정리 후 적용)
-- 운영 데이터 안전을 위해 NOT VALID로 일단 추가 — 검증은 별도 단계에서 진행
ALTER TABLE report_templates
  DROP CONSTRAINT IF EXISTS report_templates_fields_valid_chk;
ALTER TABLE report_templates
  ADD CONSTRAINT report_templates_fields_valid_chk
  CHECK (validate_report_template_fields(fields))
  NOT VALID;
