# Handoff — EXCON 수출상담회 (2026-05-27 야간 세션)

## 세션 핵심

내일(2026-05-28) 시연 대비 + S0 단위테스트 인프라 머지. PRD #10 본격 구현은 시연 후 재개.

이 핸드오프는 2026-05-27 1차 핸드오프(`handoff-2026-05-27.md`) 의 연장. 1차 = QR 출석 fix + PRD #10 발행. 본 핸드오프 = S0 머지 + 시연 안전화.

## 커밋 (최신 → 과거)

| 커밋 | 요약 |
|---|---|
| `0dc9bcd` | refactor(attendance): 셀러 탭 제거, 통역사 전용으로 단순화 |
| `d683f63` | chore(admin): 시연용 셀러 탭 + 옵션 메뉴 일시 숨김 (선행 — 다음 커밋에서 셀러 정식 제거로 대체) |
| `c380a15` | chore(attendance): 메시지 전송 예약 버튼 시연용 일시 숨김 |
| `f243024` | test(infra): Vitest + RTL + MSW + CI 단위테스트 인프라 도입 (#11) |

모두 `EXPO-S1` push 완료. GitHub Actions 자동 배포 트리거.

## 1. #11 S0 단위테스트 인프라 머지 (`f243024`)

### 변경
- `vitest.config.mts`, `vitest.setup.ts` — Vitest + jsdom + MSW lifecycle
- `src/test/msw/{server,handlers}.ts` — strict mode MSW
- `src/test/__tests__/sanity.test.tsx` — RTL + jest-dom + MSW fetch 3건
- `.github/workflows/ci.yml` — PR/EXPO-S1 push: tsc + test 게이트
- `.github/workflows/deploy-prod.yml` — build 전 `npm test` 게이트
- `docs/testing.md` — 가이드 (디렉터리 컨벤션, 외부행동 원칙, MSW, Supabase service_role/impersonated 패턴)

### devDeps
`vitest@4.1.7`, `@vitejs/plugin-react@6.0.2`, `jsdom@29.1.1`,
`@testing-library/{react@16.3.2,dom@10.4.1,jest-dom@6.9.1}`, `msw@2.14.6`

### 검증
- `npm test` 3/3 pass
- `npx tsc --noEmit` 클린
- `npm run build` — **사전존재 Windows webpack 이슈** (`WasmHash._updateWithBuffer`) → 우리 변경 무관 (stash 후 재현). Linux Lambda runner 영향 X 예상.

### Codex 검수 반영
- CI typecheck 게이트 추가
- env 이름 표준화 (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`)
- sanity 테스트에 MSW fetch 케이스 1건 추가

### 후속 (별건)
- `@testing-library/user-event` — S1 진입 시 추가
- 기존 lint 에러 1k+개 클린업 별도 슬라이스
- Windows 로컬 빌드 이슈 트러블슈팅 별건

## 2. 시연 안전화 (`c380a15` → `d683f63` → `0dc9bcd`)

내일 시연 대비. 미완성 UI/스텁 노출 차단.

### 메시지 전송 예약 버튼 (`c380a15`)
- `src/app/admin/events/[id]/attendance/page.tsx:175-181` — `{false &&}` 가드로 버튼만 숨김
- 다이얼로그/state 유지 → S2 (#13) 구현 시 가드 한 줄 제거로 즉시 복원

### 셀러 탭 정식 제거 (`0dc9bcd`)
- attendance page 에서 `Tabs/TabsList/TabsTrigger` 전부 제거
- `AccountType` 타입 + `accountTab` state 제거
- fetch / POST body `account_type` = `'INTERPRETER'` 고정
- 부제 "통역사·셀러" → "통역사"
- 다이얼로그 desc ternary 단순화
- **API (`/api/attendance/route.ts`) 는 셀러 지원 유지** — 향후 별도 페이지 확장 여지

### 옵션 사이드바 메뉴 숨김 (`d683f63`)
- `src/components/admin/AdminSidebar.tsx:58` — `{ suffix: '/settings', label: '옵션', ... }` 주석 처리
- 정책 정리 후 주석 해제로 복원

## 3. 미해결 — 출석표 통역사 9건 이슈

### 증상
사용자 관찰: "2025 상담회" 출석표에서 통역사 5명 배정인데 **9건 기록**으로 표시.

### 진단 (코드 측 확인된 사실)
- `event_interpreters` 테이블에 `UNIQUE(event_id, interpreter_id)` 존재 (`001_initial_schema.sql:34`) → 같은 통역사 중복 X
- `attendances` 테이블에 `UNIQUE(event_id, user_id, date)` (마이그 039 ON CONFLICT 패턴) → 같은 (사용자, 날짜) 중복 X
- `/api/attendance/route.ts` 의 GET 은 `date` 파라미터 적용 → 한 날짜만 반환

### 가능한 원인 (DB 확인 필요)
1. `POST /api/attendance` 가 여러 날짜로 호출됨 → 누적 누적된 행이 UI 의 `rows.length` 에 노출 (단, UI 가 date 필터 적용 → 한 날짜만 보임. 이 가설은 약함)
2. **2025 상담회**가 실제 운영 행사가 아닌 테스트 시드인 경우 → 시드에서 의도적으로 다중 행을 만들었을 가능성
3. 통역사 외에 셀러도 카운트에 포함됐을 가능성 → **해소됨** (`0dc9bcd` 로 INTERPRETER 고정)
4. `event_interpreters` 에 추가로 4명이 더 있는데 `통역사 배정` 페이지에서 5명만 표시되는 stale 카운트 (1차 핸드오프 `B` 항목 — 배정 페이지 stale 카운트 minor fix)

### 다음 세션 우선 작업
- 운영 DB 또는 로컬 시드에서 SQL 실행:
  ```sql
  SELECT e.id, e.name,
         (SELECT count(*) FROM event_interpreters WHERE event_id = e.id) AS ei_cnt,
         (SELECT count(*) FROM attendances WHERE event_id = e.id) AS att_total,
         (SELECT count(*) FROM attendances WHERE event_id = e.id AND date = CURRENT_DATE) AS att_today
    FROM events e
   WHERE e.name LIKE '%2025%';
  ```
- 결과에 따라 (a) 시드 데이터 정리 또는 (b) 배정 페이지 stale 카운트 fix 결정

## 4. PRD #10 — 시연 후 재개

### 상태
- PRD #10 + S0~S4 이슈 발행 (1차 핸드오프 참조)
- **S0 (#11) 완료** ← 본 세션
- S1~S4 (#12~#15) 미구현 — 시연 후 재개

### 보류된 산출물 (로컬 working tree)
S1 에이전트가 작업 중 사용자 인터럽트 → 다음 파일들이 **untracked** 상태로 남음:
- `supabase/migrations/040_scheduled_notices.sql`
- `docs/runbook/` (pg_cron 설정 절차서 추정)
- `src/test/__tests__/scheduled-notice-migration.test.ts`
- `src/test/__tests__/scheduled-notice-rpc.integration.test.ts`
- `vitest.integration.config.mts`, `vitest.setup.integration.ts`

`package.json` + `vitest.config.mts` 에 통합 테스트 트랙 추가 흔적 (modified, uncommitted).

→ **재개 시**: 이 파일들을 검토하고 받아들일지(부분 활용) 또는 폐기 후 S1 재시작할지 결정. Codex 검수 미완.

### 재개 순서
1. **로컬 untracked 040/test 파일 검토 → keep/discard 결정**
2. **#12 S1** — 마이그 040 + RPC 5개 + pg_cron + 단위테스트 (Codex 검수 필수)
3. **#13 S2** — admin repository + 작성/수정/취소 다이얼로그
4. **#14 S3** — 예약 목록 탭
5. **#15 S4 HITL** — 통역사 검증 + 매뉴얼 + 운영 db push

### 핵심 결정 변경 사항 없음
PRD #10 의 모든 결정 그대로 유효 (별도 `scheduled_notices` 테이블, `notices.recipient_user_ids` 추가, pg_cron 매분, KST→UTC, admin only).

## 다음 세션 즉시 작업 (우선순위)

| # | 항목 | 시작점 |
|---|---|---|
| **0** | **9건 이슈 SQL 진단** | 위 §3 쿼리 실행 → 시드 또는 stale 카운트 원인 식별 |
| 1 | 로컬 untracked S1 산출물 검토 | `git status` → 040 + 통합테스트 파일 검토 후 keep/discard |
| 2 | #12 (S1) 재개 또는 재시작 | Codex 검수 필수 |
| 3 | #13~#15 의존성 순서 | — |
| A | 모바일 Chrome QR 캐시 헤더 | 1차 핸드오프 `A` 항목 |
| B | 통역사 배정 페이지 stale 카운트 minor fix | 9건 이슈와 동일 원인일 가능성 |
| C | 카메라 권한 자동 차단 매뉴얼 안내 | 1차 핸드오프 `C` 항목 |

## 환경 변동
- 신규 CI 워크플로 `.github/workflows/ci.yml` 등록 (push 후 GitHub Actions 에서 첫 실행 확인 필요)
- `deploy-prod.yml` 에 `npm test` 게이트 삽입 (빌드 시간 +30초)
- 마이그 040 **로컬 working tree 만** 존재. 운영 DB 미적용.

## 다음 세션 추천 스킬
- **세션복기** — `handoff-2026-05-27-late.md` 진입 직후 흡수
- **excon-coding** — #12 재개/재시작
- **codex 직접 exec** — 마이그/RPC 검수
- **caveman:caveman-commit** — 커밋 메시지

## 참고
- 운영: https://excon.wordcat.it.kr
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- PRD #10: https://github.com/LioN-KOREA/EXPO-S1/issues/10
- 직전 핸드오프 (1차): `handoff-2026-05-27.md`
- 매뉴얼: `docs/MANUAL.md`
