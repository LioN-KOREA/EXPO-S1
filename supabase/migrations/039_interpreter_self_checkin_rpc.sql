-- ============================================
-- 통역사 본인 QR 출석 RPC (Phase E)
-- ============================================
-- 배경:
--   마이그 038 (attendances_insert_self_qr) 로 통역사가 본인 attendances 행을
--   직접 INSERT 할 수 있게 했지만, admin 이 "출석표 생성/추가" 로 status=NONE
--   default 행을 미리 만들어 둔 경우 QR 스캔이 UNIQUE(event_id, user_id, date)
--   충돌 → 클라의 upsert(ignoreDuplicates: true) 가 skip → status='NONE' 그대로
--   남아 출석이 반영되지 않는 버그가 발견됨.
--
--   본 RPC 는 "본인 INSERT + NONE→WAITING UPDATE" 를 서버측에서 원자적으로
--   처리한다. INSERT … ON CONFLICT DO NOTHING + 재조회 패턴으로 동시 스캔 race
--   ( 두 트랜잭션이 동시에 행 없음을 관찰 → 둘 다 INSERT 시도 → UNIQUE 23505 )
--   를 안전하게 처리한다.
--
-- 마이그 038 정책과의 관계 (defense-in-depth):
--   본 RPC 가 SECURITY DEFINER 라서 RLS 를 우회하지만, 정책
--   attendances_insert_self_qr 는 의도적으로 유지한다 — 만약 클라가 RPC 를
--   우회해 직접 INSERT 를 시도하더라도 정책이 한 번 더 막아준다.
--
-- 보안 제약 (마이그 038 과 동일 9 조건 + 클라 위조 차단):
--   1) auth.uid() 가 존재해야 함 (인증된 세션)
--   2) 호출자 profiles.role = 'interpreter'
--   3) event_interpreters 매핑 존재 (본인이 배정된 행사)
--   4) events 활성 (deleted_at IS NULL AND start_date<=today<=end_date)
--   5) account_type 은 서버에서 'INTERPRETER' 강제 (INSERT 경로)
--   6) work_type 은 서버에서 'REGULAR' 강제 (INSERT 경로). UPDATE 경로에서는
--      account_type/work_type 이 INTERPRETER/REGULAR 인 기존 행만 승격 — admin
--      이 RESERVE 또는 SELLER 행을 미리 만든 경우는 NO-OP (의도적)
--   7) date 는 서버에서 CURRENT_DATE 강제
--   8) status='NONE' 만 'WAITING' 으로 승격, 그 외는 NO-OP (LEAVE 등 상위 상태
--      덮어쓰기 차단)
--   9) attendance_status_logs 에 change_method='QR' 감사 로그 동시 INSERT
--
-- 에러 코드:
--   raise_exception '42501' (insufficient_privilege) 로 통일.
--   MESSAGE 는 클라 i18n 매핑용 영문 키워드:
--     - 'unauthenticated'
--     - 'not_interpreter'
--     - 'not_assigned'
--     - 'event_inactive'
--
-- 반환값:
--   jsonb { attendance_id, status, action: 'inserted'|'updated'|'noop' }
-- ============================================

CREATE OR REPLACE FUNCTION public.interpreter_self_checkin(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_inserted_id uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_account_type text;
  v_existing_work_type text;
BEGIN
  -- 1) 인증
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- 2) 통역사 role
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'interpreter'
  ) THEN
    RAISE EXCEPTION 'not_interpreter' USING ERRCODE = '42501';
  END IF;

  -- 3) 행사 활성
  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.deleted_at IS NULL
      AND e.start_date <= v_today
      AND e.end_date >= v_today
  ) THEN
    RAISE EXCEPTION 'event_inactive' USING ERRCODE = '42501';
  END IF;

  -- 4) 본인이 해당 행사에 배정됨
  IF NOT EXISTS (
    SELECT 1 FROM public.event_interpreters ei
    WHERE ei.event_id = p_event_id
      AND ei.interpreter_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
  END IF;

  -- 5) INSERT 우선 시도 (race 안전: 두 트랜잭션이 동시에 들어와도 UNIQUE 가
  --    한 쪽만 통과시키고, 나머지는 ON CONFLICT DO NOTHING 으로 v_inserted_id
  --    가 NULL 이 됨). 마이그 038 정책 조건과 동일하게 세팅.
  INSERT INTO public.attendances (
    event_id, user_id, date, account_type, work_type, status,
    eval, memo, booth_id
  ) VALUES (
    p_event_id, v_user_id, v_today, 'INTERPRETER', 'REGULAR', 'WAITING',
    NULL, NULL, NULL
  )
  ON CONFLICT (event_id, user_id, date) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    -- 새로 INSERT 됨 → 감사로그 + 반환
    INSERT INTO public.attendance_status_logs (
      attendance_id, prev_status, new_status, changed_by, change_method
    ) VALUES (
      v_inserted_id, NULL, 'WAITING', v_user_id, 'QR'
    );

    RETURN jsonb_build_object(
      'attendance_id', v_inserted_id,
      'status', 'WAITING',
      'action', 'inserted'
    );
  END IF;

  -- 6) ON CONFLICT 로 INSERT skip 됨 → 기존 행 존재. row lock 후 상태 평가.
  --    여기서는 행이 반드시 존재하므로 FOR UPDATE 가 race 직렬화에 충분.
  SELECT id, status, account_type, work_type
    INTO v_existing_id, v_existing_status, v_existing_account_type, v_existing_work_type
    FROM public.attendances
    WHERE event_id = p_event_id
      AND user_id = v_user_id
      AND date = v_today
    FOR UPDATE;

  -- 6a) 매우 드문 케이스: 동시 트랜잭션의 ON CONFLICT 가 막 들어왔다가 사라진 경우
  --     (DELETE 동시 발생). 정상 운영 시나리오는 아니므로 NO-OP 반환.
  IF v_existing_id IS NULL THEN
    RETURN jsonb_build_object(
      'attendance_id', NULL,
      'status', NULL,
      'action', 'noop'
    );
  END IF;

  -- 6b) admin 이 미리 만들어둔 status=NONE INTERPRETER/REGULAR 행 → WAITING 승격
  --     account_type/work_type 이 다르면 (SELLER 또는 RESERVE) NO-OP — 9 조건의
  --     "INTERPRETER 본인 정규출석" 의미를 UPDATE 경로에서도 일관 유지.
  IF v_existing_status = 'NONE'
     AND v_existing_account_type = 'INTERPRETER'
     AND v_existing_work_type = 'REGULAR'
  THEN
    UPDATE public.attendances
       SET status = 'WAITING'
     WHERE id = v_existing_id;

    INSERT INTO public.attendance_status_logs (
      attendance_id, prev_status, new_status, changed_by, change_method
    ) VALUES (
      v_existing_id, 'NONE', 'WAITING', v_user_id, 'QR'
    );

    RETURN jsonb_build_object(
      'attendance_id', v_existing_id,
      'status', 'WAITING',
      'action', 'updated'
    );
  END IF;

  -- 6c) 이미 WAITING / COMING / IN_CONSULT / DONE / LEAVE 등 상위 상태이거나
  --     account_type/work_type 이 본 RPC 의 INTERPRETER/REGULAR 와 일치하지
  --     않는 경우 → idempotent NO-OP. 감사 로그도 남기지 않는다.
  RETURN jsonb_build_object(
    'attendance_id', v_existing_id,
    'status', v_existing_status,
    'action', 'noop'
  );
END;
$$;

-- 권한: 인증된 사용자만 실행 가능. anon / public 차단.
REVOKE ALL ON FUNCTION public.interpreter_self_checkin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.interpreter_self_checkin(uuid) TO authenticated;
