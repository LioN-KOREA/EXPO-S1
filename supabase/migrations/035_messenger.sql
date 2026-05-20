-- ============================================
-- 메신저 (관리자 ↔ 통역사 1:1 양방향)
-- PRD: GitHub LioN-KOREA/EXPO-S1#1
-- 슬라이스 S1: 데이터 모델 · RLS · 트리거 · Storage 버킷
--
-- 안전 설계:
--   - last_message_at 컬럼 미도입. thread 목록 정렬은 messages MAX(created_at) 서브쿼리.
--     → touch trigger·session GUC 우회 위험 제거.
--   - 모든 SECURITY DEFINER 함수에 search_path = public, pg_temp 명시 (pg_temp 오염 방지).
--   - messages.created_at 은 BEFORE INSERT trigger 로 server now() 강제.
--   - interpreter 가 본인 메시지 soft delete 시 deleted_by_role='sender' 만 허용.
-- ============================================

-- --------------------------------------------
-- role helper (SECURITY DEFINER + search_path 고정)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_interpreter()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'interpreter'
  );
$$;

-- --------------------------------------------
-- attachments JSONB 형태 검증 (NULL/non-array safe)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION validate_messenger_attachments(att JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN att IS NULL THEN FALSE
    WHEN jsonb_typeof(att) <> 'array' THEN FALSE
    WHEN jsonb_array_length(att) > 3 THEN FALSE
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(att) AS x
      WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
         OR jsonb_typeof(x->'path') IS DISTINCT FROM 'string'
         OR jsonb_typeof(x->'name') IS DISTINCT FROM 'string'
         OR jsonb_typeof(x->'size') IS DISTINCT FROM 'number'
         OR jsonb_typeof(x->'mime') IS DISTINCT FROM 'string'
    )
  END;
$$;

-- --------------------------------------------
-- message_threads (last_message_at 없음)
-- --------------------------------------------
CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  interpreter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at_admin TIMESTAMPTZ,
  last_read_at_interpreter TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, interpreter_id)
);

CREATE INDEX idx_threads_event
  ON message_threads (event_id);
CREATE INDEX idx_threads_interpreter
  ON message_threads (interpreter_id);

-- --------------------------------------------
-- messages
-- --------------------------------------------
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'interpreter')),
  body TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  deleted_at TIMESTAMPTZ,
  deleted_by_role TEXT CHECK (deleted_by_role IN ('admin', 'sender')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT messages_content_or_attachment_chk CHECK (
    deleted_at IS NOT NULL
    OR (body IS NOT NULL AND length(trim(body)) > 0)
    OR (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) > 0)
  ),
  CONSTRAINT messages_attachments_shape_chk CHECK (
    validate_messenger_attachments(attachments)
  ),
  CONSTRAINT messages_delete_consistency_chk CHECK (
    (deleted_at IS NULL AND deleted_by_role IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by_role IS NOT NULL)
  )
);

-- thread 별 시간순 조회용 + thread 별 MAX(created_at) 조회용
CREATE INDEX idx_messages_thread_time
  ON messages (thread_id, created_at DESC, id DESC);
CREATE INDEX idx_messages_sender
  ON messages (sender_id);

-- --------------------------------------------
-- 트리거: messages BEFORE INSERT — created_at 강제 server now()
-- --------------------------------------------
CREATE OR REPLACE FUNCTION messages_force_created_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_at := now();
  -- INSERT 시 deleted_at/deleted_by_role 도 무조건 NULL (soft delete 는 별도 UPDATE)
  NEW.deleted_at := NULL;
  NEW.deleted_by_role := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_force_created_at_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_force_created_at();

-- --------------------------------------------
-- 트리거: messages immutable except deleted_at/deleted_by_role
-- 추가: interpreter 가 본인 메시지 UPDATE 시 deleted_by_role 'sender' 만 허용
-- --------------------------------------------
CREATE OR REPLACE FUNCTION messages_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_role IS DISTINCT FROM OLD.sender_role
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.attachments IS DISTINCT FROM OLD.attachments
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'messages row is immutable except deleted_at/deleted_by_role'
      USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  -- interpreter: 본인 메시지의 "최초 soft delete" 만 허용.
  -- 이미 삭제된 메시지(OLD.deleted_at NOT NULL)는 admin 만 변경 가능 — 관리자 삭제 기록 위장 차단.
  IF v_role = 'interpreter' THEN
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'interpreter cannot modify already-deleted message'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.deleted_at IS NULL OR NEW.deleted_by_role IS DISTINCT FROM 'sender' THEN
      RAISE EXCEPTION 'interpreter UPDATE must set deleted_at + deleted_by_role=sender'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- admin: 본인이 보낸 메시지는 'sender' 또는 'admin' 가능. 남이 보낸 메시지는 'admin' 강제.
  IF v_role = 'admin' AND NEW.deleted_by_role IS DISTINCT FROM OLD.deleted_by_role THEN
    IF OLD.sender_id IS DISTINCT FROM auth.uid() AND NEW.deleted_by_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'admin must set deleted_by_role=admin when deleting other user message'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_update_guard_trigger
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_update_guard();

-- --------------------------------------------
-- 트리거: message_threads INSERT/UPDATE 가드
-- INSERT: last_read_at_*, created_at 사용자 주입 차단 (강제 NULL/now())
-- UPDATE:
--   - interpreter: last_read_at_interpreter 만 변경 가능
--   - admin: last_read_at_admin 만 변경 가능
--   - immutable: id, event_id, interpreter_id, created_at
-- --------------------------------------------
CREATE OR REPLACE FUNCTION threads_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_read_at_admin := NULL;
    NEW.last_read_at_interpreter := NULL;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.interpreter_id IS DISTINCT FROM OLD.interpreter_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'message_threads immutable columns cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_role = 'admin' THEN
    IF NEW.last_read_at_interpreter IS DISTINCT FROM OLD.last_read_at_interpreter THEN
      RAISE EXCEPTION 'admin cannot modify last_read_at_interpreter'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_role = 'interpreter' THEN
    IF NEW.last_read_at_admin IS DISTINCT FROM OLD.last_read_at_admin THEN
      RAISE EXCEPTION 'interpreter cannot modify last_read_at_admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized role for message_threads update'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER threads_write_guard_trigger
  BEFORE INSERT OR UPDATE ON message_threads
  FOR EACH ROW
  EXECUTE FUNCTION threads_write_guard();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------
-- message_threads RLS
-- --------------------------------------------
CREATE POLICY "threads_select_admin" ON message_threads FOR SELECT
  USING (is_admin());
CREATE POLICY "threads_select_own_interpreter" ON message_threads FOR SELECT
  USING (is_interpreter() AND interpreter_id = auth.uid());

CREATE POLICY "threads_insert_admin" ON message_threads FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "threads_insert_own_interpreter" ON message_threads FOR INSERT
  WITH CHECK (is_interpreter() AND interpreter_id = auth.uid());

CREATE POLICY "threads_update_admin" ON message_threads FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "threads_update_own_interpreter" ON message_threads FOR UPDATE
  USING (is_interpreter() AND interpreter_id = auth.uid())
  WITH CHECK (is_interpreter() AND interpreter_id = auth.uid());

-- --------------------------------------------
-- messages RLS
-- --------------------------------------------
CREATE POLICY "messages_select_admin" ON messages FOR SELECT
  USING (is_admin());
CREATE POLICY "messages_select_own_thread" ON messages FOR SELECT
  USING (
    is_interpreter()
    AND EXISTS (
      SELECT 1 FROM message_threads t
      WHERE t.id = messages.thread_id
        AND t.interpreter_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert_admin" ON messages FOR INSERT
  WITH CHECK (
    is_admin()
    AND sender_role = 'admin'
    AND sender_id = auth.uid()
  );
CREATE POLICY "messages_insert_interpreter" ON messages FOR INSERT
  WITH CHECK (
    is_interpreter()
    AND sender_role = 'interpreter'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM message_threads t
      WHERE t.id = messages.thread_id
        AND t.interpreter_id = auth.uid()
    )
  );

-- UPDATE: deleted_at/deleted_by_role 외 변경은 immutable trigger 가 차단.
-- admin 은 모든 메시지 soft delete, interpreter 는 본인이 보낸 메시지만 soft delete.
CREATE POLICY "messages_update_admin" ON messages FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "messages_update_own_sent" ON messages FOR UPDATE
  USING (is_interpreter() AND sender_id = auth.uid())
  WITH CHECK (is_interpreter() AND sender_id = auth.uid());

-- ============================================
-- Storage 버킷: messages (이미지/PDF, 5MB, 메시지당 3개)
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messages',
  'messages',
  false,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- 경로 검증: '{uuid}/{uuid}/{filename}' 강제. 소문자 UUID + filename 화이트리스트.
-- filename: 영숫자·점·하이픈·언더스코어·공백·괄호만 허용. 점 시작 X. 슬래시 X.
CREATE OR REPLACE FUNCTION messenger_storage_thread_id(p_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_\-+ ()][A-Za-z0-9._\-+ ()]*$'
      THEN split_part(p_name, '/', 1)::UUID
    ELSE NULL
  END;
$$;

CREATE POLICY "messages_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'messages'
    AND messenger_storage_thread_id(name) IS NOT NULL
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM message_threads t
        WHERE t.id = messenger_storage_thread_id(name)
          AND t.interpreter_id = auth.uid()
      )
    )
  );

CREATE POLICY "messages_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'messages'
    AND messenger_storage_thread_id(name) IS NOT NULL
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM message_threads t
        WHERE t.id = messenger_storage_thread_id(name)
          AND t.interpreter_id = auth.uid()
      )
    )
  );

CREATE POLICY "messages_storage_delete_admin"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'messages' AND is_admin());

COMMENT ON TABLE message_threads IS '관리자↔통역사 1:1 메신저 thread. lazy upsert (event_id, interpreter_id) UNIQUE. last_message_at 미보유 — 조회 시 messages MAX(created_at).';
COMMENT ON TABLE messages IS '메신저 메시지. immutable except deleted_at/deleted_by_role. created_at 은 server now() 강제.';
