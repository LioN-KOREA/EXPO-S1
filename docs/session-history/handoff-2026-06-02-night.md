# Handoff — EXCON 수출상담회 (2026-06-02 night, 버그 #20 close)

## 세션 핵심

직전 (`handoff-2026-06-02-late2.md`) 의 우선순위 #3 (버그 #20 S1 후속 조사) 진행. 정적 분석으로 가장 의심되는 silent crash 경로 발견하고 방어 패치 적용 + Codex 검수 + 테스트 완료. **그 후 사용자 확인 결과 시연 튕김의 root cause = 배포 일시 다운타임 (운영 silent crash 아님). 이슈 #20 close.**

S0 + S1 방어 패치는 미래 RLS edge case / silent crash 대비로 유지 (회귀 영향 없음, 테스트 94/94 pass).

**교훈**: 시연/데모 중 배포 절대 금지. 다음 시연 일정 확보 시 배포 freeze 윈도우 설정.

| 항목 | 상태 | 비고 |
|---|---|---|
| #20 S1 정적 분석 (silent crash 경로) | ✅ 완료 | `admin/layout.tsx` `.single()` PGRST throw 후보 #1 (가설) |
| #20 S1 방어 패치 코드 | ✅ 완료 | 3 파일 변경, 94/94 테스트 pass |
| #20 S1 Codex 검수 | ✅ 완료 | BLOCK 0, WARN 2 + SUGGEST 1 반영 |
| #20 root cause | ✅ 확정 | **배포 일시 다운타임 (사용자 확인)** — 운영 silent crash 아님 |
| #20 issue close | ✅ 완료 | https://github.com/LioN-KOREA/EXPO-S1/issues/20 |

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

## 6. Root cause 확정 (#20 close)

사용자 확인: 시연 중 화면 튕긴 시점 = **배포 중 일시 다운타임**. 운영 silent crash 아님.

- 가설 A (profile PGRST116/117) 폐기 — Supabase Logs grep 불필요
- 운영 silent crash 재현 사례 없음
- S0 + S1 패치는 미래 RLS edge case / silent crash 대비로 유지 (회귀 영향 없음)
- 코멘트: https://github.com/LioN-KOREA/EXPO-S1/issues/20#issuecomment-4601411138
- close 완료

**교훈**: 시연/데모 중 배포 절대 금지. 다음 시연 일정 확보 시 배포 freeze 윈도우 설정 검토.

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
| 2 | PRD #16~#19 슬라이스 grab 결정 | 미진행 | demo feedback PRDs |
| 3 | F1 (interpreter/buyer/seller layout 방어 패치) | 미진행 | 본 핸드오프 §7 |
| 4 | CloudFront Free→Standard plan 전환 검토 | 미진행 | distribution 다음 변경 전 |
| 5 | 변호사 검토 (처리방침 + 동의서) | 외부 | — |
| 6 | 시연 freeze 윈도우 정책 문서화 | 신규 | #20 교훈 |

## 참고

- 직전 핸드오프: `handoff-2026-06-02-late2.md`
- 본 세션 변경 파일: `src/app/admin/layout.tsx`, `src/app/admin/events/page.tsx`, `src/test/__tests__/admin-events-page.test.tsx` (+ 메모리 `project_event_list_crash_bug.md`)
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 테스트: 전체 94/94 passed
- 이슈: https://github.com/LioN-KOREA/EXPO-S1/issues/20
