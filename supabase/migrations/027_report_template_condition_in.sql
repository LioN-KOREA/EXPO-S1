-- ============================================
-- 상담일지 양식 condition 다중값 지원
-- 025의 condition: { field, equals } 단일값만 → { field, in: [...] } 다중값도 지원
-- ============================================

CREATE OR REPLACE FUNCTION validate_report_template_fields(fields_jsonb JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  field JSONB;
  field_keys TEXT[] := ARRAY[]::TEXT[];
  cond_field TEXT;
  has_equals BOOLEAN;
  has_in BOOLEAN;
BEGIN
  IF jsonb_typeof(fields_jsonb) <> 'array' THEN
    RETURN FALSE;
  END IF;

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

  FOR field IN SELECT * FROM jsonb_array_elements(fields_jsonb)
  LOOP
    IF field ? 'condition' THEN
      IF jsonb_typeof(field->'condition') <> 'object' THEN
        RETURN FALSE;
      END IF;
      IF NOT (field->'condition' ? 'field') THEN
        RETURN FALSE;
      END IF;
      has_equals := field->'condition' ? 'equals';
      has_in := field->'condition' ? 'in';
      -- equals 또는 in 둘 중 하나 필수
      IF NOT (has_equals OR has_in) THEN
        RETURN FALSE;
      END IF;
      IF has_in AND jsonb_typeof(field->'condition'->'in') <> 'array' THEN
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
  '양식 fields jsonb 유효성 검증. condition: { field, equals } 또는 { field, in: [...] } 둘 다 허용';
