-- ============================================
-- PRD #16 후속 하드닝 (슬라이스 #21 Codex 검수 WARN 2 + SUGGEST 1).
--
-- 1. interpreter_evaluations 에 (event_id, interpreter_id) → event_interpreters(...) 복합 FK 추가
--    → upsertEvaluation 의 TOCTOU 봉합 (사전 SELECT 검증 직후 배정 삭제돼도 평가 INSERT 차단).
--    → event_interpreters 의 UNIQUE(event_id, interpreter_id) 가 target unique 역할.
--    → ON DELETE CASCADE = 배정 해제 시 평가 row 자동 정리.
--
-- 2. role=interpreter 검증 트리거 추가
--    → RPC update_interpreter_global_fields 외부 경로(직접 INSERT) 에서도 무결성 보장.
--    → interpreter_global_meta + interpreter_evaluations 두 테이블 대상.
--    → INSERT/UPDATE 전 BEFORE 트리거. interpreter_id 가 profiles.role='interpreter' 가
--       아니면 RAISE EXCEPTION 'target_not_interpreter'.
-- ============================================

-- ----- 1. 복합 FK -----
-- 마이그 044 가 만든 interpreter_evaluations 에 추가 제약.
-- idempotent: 이미 있으면 skip.
-- NOT VALID 로 추가 → 기존 데이터 검증 생략 (배포 abort 회피),
-- 이후 VALIDATE CONSTRAINT 로 신규/갱신 row 부터 강제. 운영 데이터에 고아 평가가 있어도 배포 통과.
-- 기존 데이터 정합성은 별도 정리 SQL 로 처리 (운영팀 결정).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interpreter_evaluations_assignment_fk'
      AND conrelid = 'interpreter_evaluations'::regclass
  ) THEN
    ALTER TABLE interpreter_evaluations
      ADD CONSTRAINT interpreter_evaluations_assignment_fk
      FOREIGN KEY (event_id, interpreter_id)
      REFERENCES event_interpreters (event_id, interpreter_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- 운영 데이터 0 가정 (PRD #16 = 신규 기능, 마이그 044 적용 직후). 고아 row 없으면 VALIDATE 즉시 통과.
-- 고아 row 가 있으면 본 명령이 RAISE → 운영팀이 사전 정리 후 재실행.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interpreter_evaluations_assignment_fk'
      AND conrelid = 'interpreter_evaluations'::regclass
      AND convalidated = false
  ) THEN
    ALTER TABLE interpreter_evaluations
      VALIDATE CONSTRAINT interpreter_evaluations_assignment_fk;
  END IF;
END $$;

-- ----- 2. role=interpreter 검증 트리거 -----
CREATE OR REPLACE FUNCTION enforce_target_interpreter_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = NEW.interpreter_id
      AND role = 'interpreter'
  ) THEN
    RAISE EXCEPTION 'target_not_interpreter'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- interpreter_global_meta
DROP TRIGGER IF EXISTS enforce_target_interpreter_role_meta ON interpreter_global_meta;
CREATE TRIGGER enforce_target_interpreter_role_meta
BEFORE INSERT OR UPDATE OF interpreter_id ON interpreter_global_meta
FOR EACH ROW EXECUTE FUNCTION enforce_target_interpreter_role();

-- interpreter_evaluations
DROP TRIGGER IF EXISTS enforce_target_interpreter_role_eval ON interpreter_evaluations;
CREATE TRIGGER enforce_target_interpreter_role_eval
BEFORE INSERT OR UPDATE OF interpreter_id ON interpreter_evaluations
FOR EACH ROW EXECUTE FUNCTION enforce_target_interpreter_role();
