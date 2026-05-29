# pg_cron 설치/등록 절차 (메시지 전송 예약)

PRD #10 / 마이그 040 의존성. 본 프로젝트 첫 pg_cron 도입.

## 0. 적용 대상

- 로컬 supabase (`supabase start`) — extension 사전 포함, 별도 절차 불필요
- 운영 Supabase (cloud) — Dashboard 에서 1회 활성화 필요

## 1. 운영 Supabase 사전 활성화

Supabase Dashboard 에서:

1. Project Settings → Database → **Extensions**
2. `pg_cron` 검색 → **Enable** 토글
3. Settings → API → **postgres role 권한 확인** (cron schema 사용 가능해야 함)

활성화 후 마이그 040 push 시 `CREATE EXTENSION IF NOT EXISTS pg_cron` 가 통과한다.

## 2. cron job 자동 등록

마이그 040 의 마지막 `DO $cron$` 블록이 다음을 시도한다:

```sql
PERFORM cron.schedule(
  'dispatch_due_scheduled_notices_minutely',
  '* * * * *',
  $job$SELECT public.dispatch_due_scheduled_notices();$job$
);
```

권한이 충분하면 자동 등록 완료. `RAISE NOTICE 'pg_cron 자동 등록 실패: ...'` 가 뜨면 아래 수동 등록.

## 3. 수동 등록 (자동 실패 시)

Supabase Dashboard → SQL Editor 에서 `postgres` role 로 다음 실행:

```sql
SELECT cron.schedule(
  'dispatch_due_scheduled_notices_minutely',
  '* * * * *',
  $$SELECT public.dispatch_due_scheduled_notices();$$
);
```

확인:

```sql
SELECT jobid, jobname, schedule, command, active
  FROM cron.job
 WHERE jobname = 'dispatch_due_scheduled_notices_minutely';
```

실행 이력:

```sql
SELECT runid, jobid, status, start_time, end_time, return_message
  FROM cron.job_run_details
 WHERE jobid = (
   SELECT jobid FROM cron.job
    WHERE jobname = 'dispatch_due_scheduled_notices_minutely'
 )
 ORDER BY start_time DESC
 LIMIT 10;
```

## 4. cron job 일시 정지 / 삭제

운영 중 일시 정지:

```sql
UPDATE cron.job SET active = false
 WHERE jobname = 'dispatch_due_scheduled_notices_minutely';
```

완전 삭제:

```sql
SELECT cron.unschedule('dispatch_due_scheduled_notices_minutely');
```

## 5. 트러블슈팅

### 권한 오류 (`permission denied for schema cron`)

postgres role 로 실행하지 않았거나 Dashboard 에서 pg_cron 이 비활성화. 위 1번 단계 재확인.

### dispatch_due_scheduled_notices() 가 실행은 되는데 row 안 잡힘

- `scheduled_notices` 의 `status='scheduled'` AND `scheduled_at <= now()` 인 row 존재 확인
- timezone 확인: 서버는 UTC, 클라가 KST 로 입력했어도 `timestamptz` 컬럼이라 자동 변환됨

### sent_notice_id 가 NULL 인데 status='sent'

이론상 불가능. 발생 시 `notices` INSERT 직후 DELETE 발생 의심. RLS 정책 변경 이력 확인.

### status='failed' 가 누적됨

`failed_reason` 컬럼 확인. 가능한 원인:
- `notices.target_roles` CHECK 위반 (마이그 022 의 `validate_notice_target_roles`)
- `events.id` 가 cascade 삭제됐는데 row 가 남아있는 경합 (외래키 ON DELETE CASCADE 라 사실상 발생 X)
