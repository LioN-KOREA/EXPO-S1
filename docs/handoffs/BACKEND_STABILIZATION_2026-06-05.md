# 진우 매니저 인수인계서 — 백엔드 안정화 요청

**작성일**: 2026-06-05
**작성자**: 사용자 + Claude
**대상**: 진우 매니저
**요청 범위**: 백엔드(데이터/마이그/환경/배포) 안정화 및 운영 인수

---

## TL;DR (한눈 요약)

- 최근 2주 동안 시연 후속 PRD 4건(#16~#19)의 첫 슬라이스(S0/S1)와 후속 하드닝까지 코드 작업 완료.
- **앱 코드와 마이그 SQL 모두 커밋·푸시 완료** (브랜치 `EXPO-S1`, 최신 커밋 `dec75b7`).
- GitHub Actions 자동 배포는 트리거됨 — 앱 코드는 운영 반영 가능 상태.
- **다만 신규 마이그 045/046/047 은 운영 DB 에 아직 적용 안 됨** + PRD #10 의 잔여 마이그 040~042 도 미적용 상태.
- 본 인수인계서로 **백엔드 안정화(마이그 운영 적용, env 추가, 운영 점검) 진행을 요청** 드립니다.

---

## 1. 지금까지 구현된 것 (사용자가 알아두면 좋은 큰 그림)

### 1.1 메뉴/화면 단위 진행 상황

| 영역 | 상태 | 비고 |
|---|---|---|
| Admin: 상담회 관리 | 운영 중 | 안정 |
| Admin: 사용자 관리 (전 역할 통합) | 운영 중 | 안정 |
| Admin: 통역사 관리 (`/admin/interpreters`) | **이번 추가** | 목록 + 상세 + 글로벌 운영 필드 편집. 마이그 047 운영 push 필요 |
| Admin: 출석표 / 대시보드 / 공지 / 메시지 / 상담일지 | 운영 중 | 안정 |
| Admin: 출석률 카드 (대시보드) | 데이터 레이어만 (S0) | 코드 = `src/lib/attendance/stats.ts`. UI 는 다음 슬라이스에서 |
| Interpreter: 전체 동선 (체크인/일지/공지/메시지) | 운영 중 | 안정 |
| Interpreter: 공지 실시간 토스트 | 데이터 레이어만 (S0) | 마이그 045 운영 push 필요. hook/Toaster 는 다음 슬라이스 |
| Interpreter: AI 자동 답변 | 데이터 레이어만 (S0) | 마이그 046 운영 push + OpenAI 키 필요. API/UI 는 다음 슬라이스 |
| Seller/Buyer: 정보 페이지 | 운영 중 | 안정 |

### 1.2 데이터 레이어(테이블/RPC) 정리

신규로 들어온 것 (운영 적용 필요 = 회색 표시):

| 마이그 | 목적 | 운영 적용 |
|---|---|---|
| 040~042 | PRD #10 메시지 전송 예약 (`scheduled_notices` + retention + replica identity) | ⚠️ 미적용 |
| 044 | PRD #16 S0 — `interpreter_global_meta`, `interpreter_evaluations`, RPC `update_interpreter_global_fields` | ✅ 적용 완료(이전 세션) |
| **045** | PRD #18 S0 — `notices` 를 `supabase_realtime` publication 에 추가 | ⚠️ 미적용 |
| **046** | PRD #19 S0 — `ai_answer_pool`, `ai_call_logs`, `report_templates.fields` 시스템 필드 7종 강제 + RLS | ⚠️ 미적용 |
| **047** | PRD #16 하드닝 — `interpreter_evaluations` 복합 FK + role=interpreter 트리거 | ⚠️ 미적용 |

### 1.3 코드 품질 게이트(이번 세션 기준)

- TypeScript: `tsc --noEmit` clean
- 단위 테스트: 126/126 통과 (114 → 126, +12 attendance-stats)
- 통합 테스트: 20/20 통과 (interpreter-repository, 이전 세션 작성, 변경 없음)
- 정적 검수: Codex 2회 — BLOCK 0, WARN 3 반영 + 2 후속, SUGGEST 3 모두 반영

---

## 2. 진우님께 요청드리는 백엔드 안정화 작업

### 2.1 즉시 처리 (운영 반영 필요)

#### A. 마이그 운영 적용 — 순서대로

```bash
# 운영 DB 적용 순서
1. 040~042  (PRD #10 잔여)
2. 045      (notices Realtime publication)
3. 046      (AI 인프라 + 시스템 필드 7종)
4. 047      (interpreter 하드닝 — 복합 FK + 트리거)
```

각 단계 후 검증 SQL:

```sql
-- 045 검증
SELECT * FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='notices';
-- → 1행 나오면 OK

-- 046 검증
SELECT count(*) FROM ai_answer_pool;       -- 0 (테이블 존재)
SELECT count(*) FROM ai_call_logs;         -- 0
-- 시스템 필드 7종 주입 확인 (event 하나 골라서)
SELECT jsonb_array_elements(fields) ->> 'key'
FROM report_templates LIMIT 1 OFFSET 0;
-- → consultation_type / industry / consultation_content / key_discussion /
--    expected_amount / buyer_reaction / follow_up / notes / absence_reason 순으로 보이면 OK

-- 047 검증
SELECT conname FROM pg_constraint
WHERE conrelid = 'interpreter_evaluations'::regclass
  AND conname = 'interpreter_evaluations_assignment_fk';
-- → 1행 (convalidated=true 확인)
SELECT tgname FROM pg_trigger
WHERE tgrelid IN ('interpreter_global_meta'::regclass, 'interpreter_evaluations'::regclass)
  AND tgname LIKE 'enforce_target_interpreter_role%';
-- → 2행
```

> **참고**: 047 의 복합 FK 는 `NOT VALID` → `VALIDATE CONSTRAINT` 패턴으로 작성되어 있어, 기존 운영 데이터에 고아 평가 row 가 없으면 자동으로 통과합니다. 만약 `VALIDATE` 가 실패하면 고아 row 정리 후 재실행.

#### B. 환경변수 추가 — PRD #19 (AI 자동 답변) 대비

`.env.production` 또는 운영 secret store 에 추가:

```
OPENAI_API_KEY=sk-...          # 운영 발급 후 입력 (아직 미발급이면 placeholder 만)
AI_AUTO_ANSWER_ENABLED=true    # kill switch (false 로 즉시 비활성화 가능)
```

> 본 슬라이스(S0)는 데이터 레이어만 작성. API/통역사 UI 는 다음 슬라이스 예정이라 키 없어도 운영 트래픽에 즉시 영향 없음. 다만 키 발급/입력은 다음 슬라이스 이전 완료 필요.

#### C. 배포 검증

- `git push EXPO-S1` 으로 GitHub Actions 자동 배포 트리거됨 (커밋 `dec75b7`).
- 운영 사이트에서 `/admin/interpreters` 진입 가능 여부 확인 부탁드립니다.
- 단, 047 미적용 시 글로벌 필드 편집의 일부 invariant(role 트리거)는 비활성 상태. 마이그 push 후 정상화됨.

### 2.2 백엔드 안정화(전반) — 진우님 재량으로 봐주실 부분

다음 영역들은 평소 진우님이 인프라/운영 측면에서 더 잘 보시는 부분이라, 이번 마이그/배포 작업과 묶어 점검 부탁드립니다.

#### (1) 운영 DB 상태 점검

- Supabase 대시보드의 슬로우 쿼리·인덱스 사용률 확인.
- `attendances`, `consultations`, `consultation_reports` 의 row 수와 인덱스 정합성.
- 메신저(`messages`) Realtime publication 정상 동작 (메신저 사용 시 문제 없는지).

#### (2) AWS / 배포 인프라

- CloudFront drift 가 한 차례 해소됐지만(`project_cloudfront_drift`), Free → Standard 전환 보류 상태. 비용/성능 측면에서 한 번 재검토 부탁드립니다.
- Lambda 콜드 스타트 빈도, 메모리 점유.
- S3 정적 자산 캐시 정책.

#### (3) 로그·모니터링

- 에러 트래킹(Sentry/CloudWatch 둘 중 무엇이 활성인지) 확인 + 최근 5xx 추세.
- Supabase Auth 실패 로그 점검.
- 메시지 전송 예약(PRD #10) S3 운영 배포 후 실제 발송 성공률 확인 (관련 RPC: `list_scheduled_notices`).

#### (4) 백업·복구

- Supabase 자동 백업 보관 기간 확인.
- 마지막 PITR(point-in-time-recovery) 리허설 시점.
- `interpreter_evaluations` / `ai_call_logs` 같은 운영 누적 테이블의 백업 포함 여부.

#### (5) Secret / Key 관리

- `OPENAI_API_KEY` 추가 시 secret 위치(어디에 저장하는지) 명문화.
- Supabase service_role key 노출 위험 검토 (특히 GitHub Actions 환경).
- Pulumi passphrase 복구 이후 안정 상태 유지 여부.

> 위 항목 중 우선순위/일정은 진우님 판단에 일임합니다. 이번 배포 직후 1차 점검 → 그 결과를 기준으로 후속 작업을 잡으면 좋겠습니다.

---

## 3. 검수에서 의도적으로 보류한 항목 2건

Codex 검수에서 다음 2건은 정당한 이유로 **본 슬라이스에서는 적용하지 않았습니다**. 추후 별도 PRD/슬라이스에서 처리 예정.

### 3.1 `SYSTEM_FIELD_KEYS` 7종 확장 (PRD #19 후속)

- 마이그 046 이 양식 시스템 필드 7종(industry 등)을 DB에 강제 주입하지만, 앱 측 `src/lib/template/defaults.ts` 의 `SYSTEM_FIELD_KEYS` 는 여전히 2종(`consultation_type`/`absence_reason`)만 포함.
- 그대로 7종을 추가하면 `isSystemFieldKey` 가 label 변경까지 잠가버려, PRD #19 §24("label 만 변경 가능, key/type 잠금")와 충돌.
- 별도 슬라이스에서 (1) label 잠금과 key/type 잠금을 분리한 뒤 (2) 7종을 추가하는 순서로 처리.

### 3.2 `profiles.role` 변경 시 interpreter meta cleanup (PRD #16 후속)

- 047 의 트리거는 `interpreter_id` 컬럼 변경에만 발동. admin 이 `profiles.role` 을 interpreter → 다른 역할로 변경하면 cleanup 안 됨.
- cleanup = destructive (평가 이력 삭제) → 운영 정책 결정 필요.
- 운영 빈도가 매우 낮고, invariant 위반 시에도 admin 화면 영향이 사실상 0 (목록이 `role='interpreter'` 필터로 자동 제외).
- 별도 PRD 로 정책 확정 후 트리거 추가.

---

## 4. 잔여 트랙 (작업 큐 — 참고용)

다음 슬라이스는 진우님과 별개로 사용자/Claude 가 이어가는 트랙입니다. 인수인계 범위 밖이지만 전체 그림 차원에서 공유.

| PRD | 다음 슬라이스 | 작업 요약 |
|---|---|---|
| #16 | S2 (#27) | 글로벌 필드 편집 모달 (현재는 인라인) |
| #16 | S3 (#28) | 평가 모달 + event 통역사 페이지 보강 |
| #16 | S4 (#29) | RLS 검증 + 매뉴얼 갱신 + 회귀 |
| #17 | S1+ | 출석률 카드 (대시보드) + batch API + 일괄 변경 UI + 매뉴얼 |
| #18 | S1+ | 통역사 실시간 공지 토스트 + hook + 사이드바 unread sync + 매뉴얼 |
| #19 | S1+ | OpenAI 호출 + 5-pool + rate limit + 통역사 UI + admin 모니터링 + 매뉴얼·처리방침 |

---

## 5. 관련 파일 참조

### 이번 세션의 변경 파일

```
# 신규 (10)
docs/session-history/handoff-2026-06-05.md
src/app/admin/interpreters/page.tsx
src/app/admin/interpreters/[id]/page.tsx
src/app/api/admin/interpreters/[id]/global/route.ts
src/components/admin/InterpreterGlobalFieldsForm.tsx
src/components/admin/InterpreterListFilter.tsx
src/lib/attendance/stats.ts
src/test/__tests__/attendance-stats.test.ts
supabase/migrations/045_notices_realtime.sql
supabase/migrations/046_ai_auto_answer.sql
supabase/migrations/047_interpreter_management_hardening.sql

# 수정 (2)
src/components/admin/AdminSidebar.tsx          # 통역사 관리 메뉴 1줄 추가
src/lib/interpreter/repository.ts              # PostgREST .or() 인젝션 차단 escape
```

### 최신 커밋 / 푸시

- 브랜치: `EXPO-S1`
- 최신 커밋: `dec75b7`
- 원격: `https://github.com/LioN-KOREA/EXPO-S1.git`
- 푸시 완료 후 GitHub Actions 자동 배포 진행 중.

### 추가 컨텍스트가 필요할 때

- 직전 세션 핸드오프: `docs/session-history/handoff-2026-06-02-night3.md`
- 본 세션 핸드오프(상세): `docs/session-history/handoff-2026-06-05.md`
- PRD: GitHub Issues #16 / #17 / #18 / #19
- 이전 인수인계서: `docs/handoffs/E1A_HANDOFF_2026-05-16.md`, `docs/handoffs/DEPLOY_PHASE_A_B.md`

---

## 마무리

이번 작업의 코어는 **데이터 레이어와 글로벌 운영 UI를 안정적으로 깔아 둔 것**입니다. 이제 진우님이 그 위에 운영 DB·환경·인프라를 단단히 잡아주시면, 다음 슬라이스(통역사/관리자 측 UI)들이 그 안정 위에서 매끄럽게 올라갈 수 있습니다.

질문/이슈는 사용자(또는 본 디렉터리의 `docs/session-history/`)로 회신 부탁드립니다.

감사합니다.
