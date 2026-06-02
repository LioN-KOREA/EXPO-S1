# Handoff — EXCON 수출상담회 (2026-06-02 night2, F1 다른 role layout 방어 패치)

## 세션 핵심

직전 (`handoff-2026-06-02-night.md`) 후속 작업으로 F1 (interpreter/buyer/seller layout 동일 방어 패치) 진행. admin/layout S1 패턴을 3개 role layout 에 일관 적용. Codex BLOCK 0.

| 항목 | 상태 | 비고 |
|---|---|---|
| interpreter/layout.tsx 방어 패치 | ✅ 완료 | + getInterpreterStats fail 시 zero stats fallback |
| buyer/layout.tsx 방어 패치 | ✅ 완료 | select 컬럼 최소화 (name, role) |
| seller/layout.tsx 방어 패치 | ✅ 완료 | 동일 |
| tsc + vitest 회귀 | ✅ pass | 94/94 |
| Codex 검수 | ✅ BLOCK 0 | WARN 1 = 의도된 degrade |

## 1. 패치 내용

3개 파일 모두 admin/layout 의 S1 패턴 일관 적용:

- `auth.getUser()` try/catch → `authFailed` 플래그
- `.single()` → `.maybeSingle()` + try/catch → `profileFailed` 플래그
- `redirect()` 는 catch 바깥 호출 (NEXT_REDIRECT 안전)
- profile null / role 불일치 / fetch fail → silent `/login` redirect
- `console.error('[role/layout] ...')` 운영 단서 확보

interpreter 만 추가:
- `getInterpreterStats(userId)` try/catch → fail 시 `{ totalCount: 0, submittedCount: 0, unreadNotices: 0 }` fallback
- 헤더 카운터 0 으로 떨어지지만 페이지 본문은 살아남음 (의도된 degrade)

buyer/seller `select` 컬럼 최소화 (`name, role` 만 — 기존 `*` 에서 축소). InterpreterHeader props 는 optional default 라 영향 없음.

## 2. Codex 검수 결과

- **BLOCK 0**
- **WARN 1**: interpreter getInterpreterStats fallback 시 카운터 0 — 의도된 degrade, 반영 불필요
- **SUGGEST 0** (안전성 확인만)

검증:
- `git diff --check` 통과
- tsc 통과
- vitest 94/94 pass

## 3. 후속 (별도 슬라이스, 미진행)

- buyer/seller `error.tsx` 부재 — 현재 `global-error.tsx` 가 폴백. 별도 role 톤 에러 메시지 필요 시 슬라이스 추가
- API routes 의 `.single()` 패턴 (~25 곳) 일괄 점검 — RLS 조합별 0/N 행 가능성 검토 필요 시
- E2E (Playwright) — 4개 role layout 모두 auth guard 회귀 테스트

## 4. 운영 룰 준수

- 코딩 후 Codex 검수 = 1회 ✅
- 큰 변경 보고 = 사용자 "F1 진행" 직접 지시 ✅
- 파괴적 작업 = 없음
- 보안 = 인증 catch 시 항상 `/login`, console.error 만 (PII 노출 없음) ✅
- DB 컬럼명/UI 더미 = 0
- 마이그 = 0
- 매뉴얼 동기 = 동작 변경 없음 → 갱신 불필요

## 5. 다음 세션 즉시 작업 (우선순위)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | **PRD #10 사용자 수동 검증 + close** | 대기 | `handoff-2026-06-02-late2.md` §4, 사용자 의존 |
| 2 | PRD #16~#19 슬라이스 grab 결정 | 미진행 | demo feedback PRDs |
| 3 | buyer/seller error.tsx 추가 | 미진행 | 본 핸드오프 §3 |
| 4 | API routes .single() 점검 | 미진행 | 본 핸드오프 §3 |
| 5 | CloudFront Free→Standard plan 전환 | 미진행 | distribution 다음 변경 전 |
| 6 | 변호사 검토 (처리방침 + 동의서) | 외부 | — |
| 7 | 시연 배포 freeze 정책 문서화 | 신규 | #20 교훈 |

## 참고

- 직전 핸드오프: `handoff-2026-06-02-night.md`
- 본 세션 변경 파일: `src/app/interpreter/layout.tsx`, `src/app/buyer/layout.tsx`, `src/app/seller/layout.tsx`
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 테스트: 전체 94/94 passed
