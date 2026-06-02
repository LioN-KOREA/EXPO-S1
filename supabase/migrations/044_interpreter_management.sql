-- ============================================
-- 마이그 044 — 통역사 관리 메뉴 (PRD #16 / 슬라이스 S0)
--
-- 본 마이그 산출물:
--   1) 신규 테이블 interpreter_global_meta
--      - profiles 와 1:1 (interpreter_id = profiles.id, PRIMARY KEY)
--      - grade / base_rate / rehire_status / global_notes
--      - 한글 enum CHECK + 음수 금지 CHECK
--      - admin-only RLS (SELECT/INSERT/UPDATE/DELETE)
--      - updated_at 자동 갱신 트리거
--
--      [설계 결정] PRD #16 본문은 profiles 컬럼 추가를 명시했으나,
--      Postgres 의 column-level GRANT/REVOKE 는 table-level GRANT 가 있을 때
--      덮어쓰기되어 통역사 self-select 노출 차단이 불가능하다.
--      따라서 통역사 본인이 자기 grade/요율을 조회할 수 없게 하려면(PRD US18)
--      별도 테이블로 row-level RLS 차단이 깔끔하다.
--      Trade-off: profiles 단일 join → meta join 1회 추가. UI 영향 미미.
--
--   2) 신규 테이블 interpreter_evaluations
--      - UNIQUE(interpreter_id, event_id)
--      - admin-only RLS (SELECT/INSERT/UPDATE/DELETE)
--      - 인덱스: (interpreter_id), (event_id)
--      - updated_at 자동 갱신 트리거
--
--   3) update_interpreter_global_fields(p_id, p_grade, p_base_rate,
--      p_rehire_status, p_global_notes) RPC
--      - SECURITY DEFINER + search_path 고정
--      - 호출자 admin 검증 (RAISE EXCEPTION + ERRCODE 42501)
--      - 대상 interpreter 검증
--      - enum/음수 검증
--      - interpreter_global_meta upsert
--      - REVOKE PUBLIC + GRANT authenticated (admin 만 통과)
--
-- idempotent: CREATE TABLE IF NOT EXISTS / CREATE POLICY IF NOT EXISTS pattern
--             / CREATE OR REPLACE FUNCTION
-- ============================================

-- 1) interpreter_global_meta -------------------------------------------------

CREATE TABLE IF NOT EXISTS interpreter_global_meta (
  interpreter_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  grade text,
  base_rate numeric,
  rehire_status text,
  global_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interpreter_global_meta_grade_check
    CHECK (grade IS NULL OR grade IN ('특급', '우수', '보통', '주의')),
  CONSTRAINT interpreter_global_meta_rehire_status_check
    CHECK (rehire_status IS NULL OR rehire_status IN ('가능', '불가', '보류')),
  CONSTRAINT interpreter_global_meta_base_rate_nonneg
    CHECK (base_rate IS NULL OR base_rate >= 0)
);

ALTER TABLE interpreter_global_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interpreter_global_meta_admin_select ON interpreter_global_meta;
CREATE POLICY interpreter_global_meta_admin_select ON interpreter_global_meta
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS interpreter_global_meta_admin_insert ON interpreter_global_meta;
CREATE POLICY interpreter_global_meta_admin_insert ON interpreter_global_meta
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS interpreter_global_meta_admin_update ON interpreter_global_meta;
CREATE POLICY interpreter_global_meta_admin_update ON interpreter_global_meta
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS interpreter_global_meta_admin_delete ON interpreter_global_meta;
CREATE POLICY interpreter_global_meta_admin_delete ON interpreter_global_meta
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE OR REPLACE FUNCTION public.interpreter_global_meta_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interpreter_global_meta_touch ON interpreter_global_meta;
CREATE TRIGGER interpreter_global_meta_touch
  BEFORE UPDATE ON interpreter_global_meta
  FOR EACH ROW
  EXECUTE FUNCTION public.interpreter_global_meta_touch_updated_at();

-- 2) interpreter_evaluations ------------------------------------------------

CREATE TABLE IF NOT EXISTS interpreter_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  comment text,
  notes text,
  paid_rate numeric,
  evaluated_by uuid NOT NULL REFERENCES profiles(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interpreter_evaluations_paid_rate_nonneg
    CHECK (paid_rate IS NULL OR paid_rate >= 0),
  CONSTRAINT interpreter_evaluations_unique_pair
    UNIQUE (interpreter_id, event_id)
);

CREATE INDEX IF NOT EXISTS interpreter_evaluations_interpreter_idx
  ON interpreter_evaluations (interpreter_id);
CREATE INDEX IF NOT EXISTS interpreter_evaluations_event_idx
  ON interpreter_evaluations (event_id);

ALTER TABLE interpreter_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interpreter_evaluations_admin_select ON interpreter_evaluations;
CREATE POLICY interpreter_evaluations_admin_select ON interpreter_evaluations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS interpreter_evaluations_admin_insert ON interpreter_evaluations;
CREATE POLICY interpreter_evaluations_admin_insert ON interpreter_evaluations
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS interpreter_evaluations_admin_update ON interpreter_evaluations;
CREATE POLICY interpreter_evaluations_admin_update ON interpreter_evaluations
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS interpreter_evaluations_admin_delete ON interpreter_evaluations;
CREATE POLICY interpreter_evaluations_admin_delete ON interpreter_evaluations
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE OR REPLACE FUNCTION public.interpreter_evaluations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interpreter_evaluations_touch ON interpreter_evaluations;
CREATE TRIGGER interpreter_evaluations_touch
  BEFORE UPDATE ON interpreter_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.interpreter_evaluations_touch_updated_at();

-- 3) update_interpreter_global_fields RPC -----------------------------------

CREATE OR REPLACE FUNCTION public.update_interpreter_global_fields(
  p_id uuid,
  p_grade text,
  p_base_rate numeric,
  p_rehire_status text,
  p_global_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role text;
  target_role text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden_not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO target_role FROM profiles WHERE id = p_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = '42704';
  END IF;
  IF target_role IS DISTINCT FROM 'interpreter' THEN
    RAISE EXCEPTION 'target_not_interpreter' USING ERRCODE = '22023';
  END IF;

  IF p_grade IS NOT NULL AND p_grade NOT IN ('특급','우수','보통','주의') THEN
    RAISE EXCEPTION 'invalid_grade' USING ERRCODE = '22023';
  END IF;
  IF p_rehire_status IS NOT NULL AND p_rehire_status NOT IN ('가능','불가','보류') THEN
    RAISE EXCEPTION 'invalid_rehire_status' USING ERRCODE = '22023';
  END IF;
  IF p_base_rate IS NOT NULL AND p_base_rate < 0 THEN
    RAISE EXCEPTION 'invalid_base_rate' USING ERRCODE = '22023';
  END IF;

  -- upsert into interpreter_global_meta
  INSERT INTO interpreter_global_meta (
    interpreter_id, grade, base_rate, rehire_status, global_notes
  )
  VALUES (p_id, p_grade, p_base_rate, p_rehire_status, p_global_notes)
  ON CONFLICT (interpreter_id) DO UPDATE
  SET
    grade = EXCLUDED.grade,
    base_rate = EXCLUDED.base_rate,
    rehire_status = EXCLUDED.rehire_status,
    global_notes = EXCLUDED.global_notes;
END;
$$;

REVOKE ALL ON FUNCTION public.update_interpreter_global_fields(uuid, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_interpreter_global_fields(uuid, text, numeric, text, text) TO authenticated;
