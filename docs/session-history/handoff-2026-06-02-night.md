# Handoff — EXCON 수출상담회 (2026-06-02 night, 버그 #20 S1 정적 패치)

## 세션 핵심

직전 (`handoff-2026-06-02-late2.md`) 의 우선순위 #3 (버그 #20 S1 후속 조사) 진행. 정적 분석으로 가장 의심되는 silent crash 경로 발견하고 방어 패치 적용 + Codex 검수 + 테스트 완료. 운영 메트릭 수집은 사용자 액션으로 잔존.

| 항목 | 상태 | 비고 |
|---|---|---|
| #20 S1 정적 분석 (silent crash 경로) | ✅ 완료 | `admin/layout.tsx` `.single()` PGRST throw 후보 #1 |
| #20 S1 방어 패치 코드 | ✅ 완료 | 3 파일 변경, 94/94 테스트 pass |
| #20 S1 Codex 검수 | ✅ 완료 | BLOCK 0, WARN 2 + SUGGEST 1 반영 |
| #20 S1 운영 메트릭 수집 | ⏳ 사용자 액션 | Supabase Logs + CloudWatch grep |

## 1. 정적 분석 결과 (silent crash 후보)

### 환경 사실 (직전 메모리와 다름)
- 루트 `middleware.ts` 없음 — `src/lib/supabase/middleware.ts` 헬퍼만 존재. 즉 인증은 각 role layout 의 server component 가 담당.
- `admin/layout.tsx` server component 가 `auth.getUser()` + `profiles.single()` 직접 호출.

### 후보 우선순위

| # | 위치 | throw 조건 | error boundary | 증상 |
|---|---|---|---|---|
| **A** | `admin/layout.tsx:16-20` `.single()` | profile 0행/2행+ → PGRST116/117 throw | ❌ admin/error.tsx 미캐치 (같은 dir layout throw). global-error.tsx fallback | **사이드바까지 사라짐 = 시연 증상 매치** |
| B | `admin/layout.tsx:12` `auth.getUser()` | Supabase 네트워크 fail | ❌ 동일. global-error.tsx | 전체 흰화면 |
| C | `admin/events/page.tsx` `loadEvents()` | useEffect 비동기 throw | ❌ React error boundary 비동기 promise 미캐치 | silent fail, 로딩 무한 |

## 2. 패치 산출물

수정:
- `src/app/admin/layout.tsx`
  - `.single()` → `.maybeSingle()` + `select('name, email, role')` (필요 컬럼만)
  - `auth.getUser()` + profile fetch 각각 try/catch
  - `redirect()` 는 catch 바깥에서 호출 (NEXT_REDIRECT 삼키지 않게) — Codex SUGGEST 반영
  - profile null / role !== 'admin' / fetch fail → 모두 `/login` redirect
- `src/app/admin/events/page.tsx`
  - `loadEvents` / `loadDeletedEvents` try/catch + toast.error + `finally setLoading(false)`
  - 재조회 실패 시 기존 목록 유지 (`setEvents([])` 제거) — Codex WARN 반영

신규:
- `src/test/__tests__/admin-events-page.test.tsx` — 4 회귀 케이스
  1. 정상 빈 목록 → placeholder + 로딩 해제, toast 호출 0
  2. loadEvents reject → toast.error + placeholder, 로딩 해제
  3. loadEvents error 객체 반환 → toast.error
  4. loadDeletedEvents reject → toast.error (사용자 클릭 후)

## 3. Codex 검수

`codex exec --sandbox read-only` 호출.
- **BLOCK 0**
- **WARN 2 반영**:
  - W1: loadEvents 실패 시 `setEvents([])` → 재조회 시 목록 증발 가능 → 빈 배열 제거
  - W2: 테스트 주석/실제 불일치 → loadDeletedEvents 케이스 추가
- **SUGGEST 1 반영**: redirect() try/catch 바깥 호출 (NEXT_REDIRECT 안전)
- **SUGGEST 1 미반영 (별도 후속)**: admin/layout.tsx 회귀 테스트 — async Server Component vitest 직접 어려움. Playwright E2E 또는 auth guard 추출 슬라이스로 분리.

## 4. 테스트 결과

`npx vitest run` → 10 file / **94 pass** (직전 90 → 신규 4 케이스 추가)

## 5. 운영 룰 준수

- 코딩 후 Codex 검수 = 1회 ✅ (`codex exec` 직접 호출)
- 큰 변경 보고 = 사용자에게 S1 방향 옵션 4개 제시 후 진행 ✅
- 파괴적 작업 = 없음
- 보안 = 인증 catch 시 항상 `/login` redirect, console.error 로깅 (admin 식별자 노출 없음) ✅
- DB 컬럼명/UI 더미 = 0
- 마이그 = 0
- 매뉴얼 동기 = 동작 변경 없음 (UI 비가시 방어 패치) → 갱신 불필요

## 6. 사용자 액션 (#20 S1 close 전)

운영 메트릭으로 가설 검증:

1. **Supabase Dashboard** → Logs → API → 2026-05-28 10:00-12:00 KST → `PGRST116` / `PGRST117` grep
   - hit 있음 = 가설 A 확정
   - hit 없음 = 다른 경로 (B/C 또는 미식별)
2. **AWS Lambda CloudWatch** → 동일 구간 invocation·duration·error rate
3. **/api/admin/events 응답 시간** P95/P99 측정 (Lambda cold start 후보 확인)
4. **시연 참석자에게** 브라우저 콘솔 ref 코드 요청 (S0 적용 후 발생 시 `ref:` 디지스트로 추적 가능)

운영 검증 결과를 issue #20 코멘트에 기록 → S1 close.

## 7. 후속 슬라이스 후보

| # | 작업 | 우선순위 | 비고 |
|---|---|---|---|
| F1 | interpreter/buyer/seller layout `.single()` 동일 방어 패치 | 중 | 동일 패턴, 시연 증상은 admin 만이라 본 세션 제외 |
| F2 | admin/layout.tsx 회귀 테스트 (E2E 또는 auth guard 추출) | 중 | Codex SUGGEST 미반영 |
| F3 | api routes `.single()` 점검 | 낮 | 25개 +, RLS 조합 검토 |

## 8. 다음 세션 즉시 작업 (우선순위)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | **PRD #10 사용자 수동 검증 + close** | 대기 | `handoff-2026-06-02-late2.md` §4, 사용자 의존 |
| 2 | **버그 #20 운영 메트릭 검증** | 대기 | 본 핸드오프 §6, 사용자 의존 |
| 3 | PRD #16~#19 슬라이스 grab 결정 | 미진행 | demo feedback PRDs |
| 4 | F1 (interpreter/buyer/seller layout 방어 패치) | 미진행 | 본 핸드오프 §7 |
| 5 | CloudFront Free→Standard plan 전환 검토 | 미진행 | distribution 다음 변경 전 |
| 6 | 변호사 검토 (처리방침 + 동의서) | 외부 | — |

## 참고

- 직전 핸드오프: `handoff-2026-06-02-late2.md`
- 본 세션 변경 파일: `src/app/admin/layout.tsx`, `src/app/admin/events/page.tsx`, `src/test/__tests__/admin-events-page.test.tsx` (+ 메모리 `project_event_list_crash_bug.md`)
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 테스트: 전체 94/94 passed
- 이슈: https://github.com/LioN-KOREA/EXPO-S1/issues/20
