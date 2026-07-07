-- ============================================
-- 048 BLOCK 수정: interpreter_delete_added_consultation race 차단
-- ============================================
-- 문제(감사 발견 BLOCK):
--   기존 함수는 단일 DELETE ... WHERE NOT EXISTS (consultation_reports) 였다.
--   READ COMMITTED 에서 NOT EXISTS 서브쿼리는 statement 스냅샷 기준이라,
--   삭제 직전 동시 트랜잭션이 상담일지를 INSERT/커밋하면 이를 못 보고 상담을
--   지운다 → consultation_reports 의 ON DELETE CASCADE 로 방금 작성된 일지가
--   함께 유실된다. (통역사가 폰 2대/탭 2개로 "자가추가 상담 삭제" 와
--   "그 상담 일지 작성" 을 동시에 실행하는 드문 경로.)
--
-- 수정:
--   plpgsql 로 바꿔 상담 row 를 먼저 FOR UPDATE 로 잠근다.
--   일지 INSERT 는 FK 로 parent 에 FOR KEY SHARE 락을 잡는데, 이는 FOR UPDATE 와
--   충돌한다. 따라서:
--     - 삭제가 먼저 잠그면 → 동시 일지 INSERT 는 커밋까지 대기 → 삭제 후엔 그 상담이
--       사라져 일지 INSERT 는 FK 위반으로 실패(정상: 지워진 상담엔 일지 못 씀).
--     - 일지 INSERT 가 먼저 잠그면 → 삭제 SELECT FOR UPDATE 가 대기 → 커밋 후
--       재조회(새 스냅샷)에서 EXISTS 가 일지를 보고 NULL 반환(삭제 안 함).
--   어느 순서든 일지 유실 없음.
-- ============================================

CREATE OR REPLACE FUNCTION interpreter_delete_added_consultation(
  p_id uuid,
  p_interpreter_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  -- 소유·자가추가 조건을 만족하는 상담 row 를 배타 잠금.
  -- 동시 일지 INSERT(FK FOR KEY SHARE)와 직렬화된다.
  SELECT c.id INTO v_id
    FROM consultations c
   WHERE c.id = p_id
     AND c.interpreter_id = p_interpreter_id
     AND c.added_by_interpreter IS TRUE
   FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN NULL;  -- 없음/소유아님/admin배정분 → 삭제 안 함
  END IF;

  -- 잠금 획득 후 새 스냅샷으로 일지 유무 재확인.
  IF EXISTS (SELECT 1 FROM consultation_reports r WHERE r.consultation_id = v_id) THEN
    RETURN NULL;  -- 일지 있음 → 삭제 금지(유실 방지)
  END IF;

  DELETE FROM consultations WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION interpreter_delete_added_consultation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION interpreter_delete_added_consultation(uuid, uuid) TO service_role;
