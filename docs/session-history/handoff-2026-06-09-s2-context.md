# Handoff — PRD #19 S2/S4 완료 + contEXT 리네임 Phase 1 (2026-06-09)

## 컨텍스트

직전 (`handoff-2026-06-08-s1-wrap.md`) = S1 정식 마무리 (M4 폴백 + Vitest 22 + Codex 5건 반영). 본 세션 = S2 (M5/M6/M7) + S4 (M9) + 라우트명 통일 + 팀장 요청 EXCON→contEXT 리네임 Phase 1.

## 잡은 작업

1. PRD #19 잔여 모듈 (M5 5-pool 캐시 / M6 rate limit / M7 API orchestrate / M9 admin 카드)
2. 라우트 `/api/ai/test` → `/api/ai/auto-answer` 통일
3. 브랜드 EXCON → contEXT (ex-con 슬랭 회피, 팀 합의)

## 변경 파일

### PRD #19 신규 (8 파일)

| 파일 | 변경 |
|---|---|
| `src/lib/ai/pool-manager.ts` (신규) | K1 캐시 (consultation_id, context_hash='v1'). lookup/insert. UNIQUE 충돌 시 canonicalContent 반환 |
| `src/lib/ai/rate-limiter.ts` (신규) | 분당 10 sliding window + 일일 $10 SUM (Asia/Seoul 경계). DB 오류 시 안전망 = allowed |
| `src/lib/ai/__tests__/pool-manager.test.ts` (신규) | 11 케이스 (clampIndex wrap·negative·NaN·constants) |
| `src/lib/ai/__tests__/rate-limiter.test.ts` (신규) | 13 케이스 (KST 경계·분당·일일·통합) |
| `src/app/api/ai/auto-answer/route.ts` (신규) | M5+M6+kill switch+폴백+ai_call_logs orchestrate. HTTP 200 + source='template_fallback' 통일 |
| `src/app/api/ai/test/route.ts` (삭제) | |
| `src/app/api/admin/events/[id]/ai-stats/route.ts` (신규) | 4수치 집계 (todayCalls / failureRate / dailyCostUsd / poolHitRate). 분모 = success+cache_hit |
| `src/components/admin/dashboard/AiUsageCard.tsx` (신규) | 30초 polling 수평바 4종 (파이차트 금지 룰 준수) |

### 기존 수정 (3 파일)

| 파일 | 변경 |
|---|---|
| `src/components/interpreter/MultiStepReportForm.tsx` | fetch URL 1줄 (`/api/ai/test` → `/api/ai/auto-answer`) |
| `src/app/admin/events/[id]/dashboard/page.tsx` | AiUsageCard 마운트 2줄 |
| `supabase/migrations/046_ai_auto_answer.sql` | status 주석 11종으로 보강 (CHECK 미적용, 향후 확장 호환) |

### contEXT 리네임 Phase 1 (14 파일)

| 영역 | 파일 |
|---|---|
| UI 브랜드 | `Logo.tsx`, `app/login/page.tsx`, `app/layout.tsx` (metadata.title), `app/landing/variant-c/page.tsx` (nav + footer) |
| QR | `QrIssueButton.tsx` (페이로드 `CONTEXT:`, 풋터 contEXT), `QrScannerModal.tsx` (`CONTEXT:` 우선, `EXCON:` 백워드 호환) |
| 비밀번호 fallback | `password.ts` (`excon00` → `context0` 8자), `UserEditDialog.tsx` (옛 fallback 인식 유지) |
| 주석/테스트 | `users-parser.ts`, `sanity.test.tsx`, `interpreter-repository.integration.test.ts`, `scheduled-notice-rpc.integration.test.ts` |
| 스크립트 | `gen-test-event-data.mjs` (`excon-test.kr` → `context-test.kr`), `seed-test-data.js` (이벤트명) |
| 매뉴얼 | `docs/MANUAL.md` (제목/본문 3건) |

총 25 파일, 마이그 변경 0 (046 주석만), 의존성 0.

## Codex 검수 라운드 3회 — 8건 모두 반영

### 라운드 1 (HIGH 1 / MEDIUM 1 / LOW 1)

| 등급 | 발견 | 수정 |
|---|---|---|
| HIGH | 폴백 template null + LLM 실패/kill switch 시 503/5xx 반환 → PRD §Solution "통역사 실패 비노출" 위반 | `minimalFallback` (회사명·국가 1줄) 도입. `serveFallback()` 가 항상 non-null. 모든 분기 HTTP 200 |
| HIGH | insertPoolEntry UNIQUE race 시 미저장 LLM 결과를 success 로그·응답 → 캐시·응답 불일치 | `InsertResult.canonicalContent` 도입. 충돌 시 DB 진실 재조회 후 반환 |
| MEDIUM | LLM 실패 후 fallback 성공 시 status='template_fallback' 으로 덮어 원인 손실 | status = 원인 (timeout/http_5xx/...) 유지. error_message 끝에 `;fallback_served=true` 태그 |
| LOW | ai-stats poolHitRate 분모 = total → 실패 status 섞이면 hit율 과소 | 분모 = success+cache_hit (실패 제외) |

### 라운드 2 (MEDIUM 3)

| 등급 | 발견 | 수정 |
|---|---|---|
| MEDIUM | race_lost 시 pool_size = currentPoolSize → DB 보다 1 작음 | DB +1 반영 |
| MEDIUM | race_lost 로그 completion_text = 패배한 LLM 결과 → 응답/캐시/로그 불일치 | log completion_text = canonical |
| MEDIUM | OpenAIError kind='unknown' → 'http_5xx' 부정확 | CallStatus 에 `unknown_error` 추가 |

### 라운드 3 (MEDIUM 1 / LOW 2)

| 등급 | 발견 | 수정 |
|---|---|---|
| MEDIUM | insertPoolEntry try/catch 가 race 외 DB 오류도 삼킨 후 success/+1 응답 → 캐시·응답 불일치 | `insertFailed` 분기 도입. 응답 pool_size 보정 (currentPoolSize 유지) + error_message=`cache_insert_failed` |
| LOW | layout.tsx metadata.title 갱신 누락 | 'contEXT - 수출상담회 관리 시스템' |
| LOW | 마이그 046 status 주석에 cache_hit/auth_error/unknown_error 미반영 | 주석 11종 보강 (CHECK 미적용 = 향후 확장 호환) |

## 응답 컨트랙트 (확정)

```json
// LLM 성공 (정상 캐시 저장)
{ "variant_index": N, "pool_size": K+1, "content": "...", "source": "llm" }

// LLM 성공 + race_lost (다른 호출이 먼저 채움)
{ "variant_index": N, "pool_size": K+1, "content": canonical, "source": "llm" }

// LLM 성공 + cache insert 실패 (DB 오류)
{ "variant_index": N, "pool_size": K, "content": llm_result, "source": "llm" }

// 캐시 hit
{ "variant_index": N, "pool_size": ?, "content": cached, "source": "llm" }

// kill switch / rate limit / daily cap / LLM 실패 → 폴백 동봉
{ "variant_index": N, "pool_size": K, "content": fallback_or_minimal, "source": "template_fallback" }
```

HTTP 200 = 통역사 화면 답변 수신 성공. 인증/입력 오류만 401/403/400.

## ai_call_logs status (11종)

success / cache_hit / timeout / http_5xx / rate_limit / kill_switch / daily_cap / invalid_response / template_fallback / auth_error / unknown_error

error_message 에 `;fallback_served=true` 또는 `cache_insert_failed: ...` 메타.

## 테스트 결과

- `npx vitest run src/lib/ai/__tests__/` = **46/46 pass** (12 prompt-builder + 10 fallback-adapter + 11 pool-manager + 13 rate-limiter)
- `npx vitest run src/test/__tests__/sanity.test.tsx` = 3/3 pass (contEXT 리네임 후)
- `npx tsc --noEmit` = clean
- SYSTEM_PROMPT 스냅샷 잠금 유지

## 운영 룰 준수

- 코딩 후 Codex 검수 ✅ (3 라운드 + 8건 발견 + 모두 반영)
- 큰 변경 보고 = 본 핸드오프 + 메모리 갱신
- 마이그 = 0 (046 주석만)
- 인증 가드 변경 = 0 (`ensureRole(['interpreter'])`, `ensureAdmin()` 유지)
- RLS 우회 = service_role 라우트 내부에만 (createAdminClient)
- 파괴적 작업 = 0
- session-history docs 보존 = 역사 기록 유지 결정 (Phase 1 = 활성 코드만)

## 잔여 (Phase 2 인프라)

- DNS A record `context.wordcat.it.kr`
- CloudFront alias 추가 (Pulumi `infra/frontend.ts`)
- env `NEXT_PUBLIC_SITE_URL` 갱신
- 옛 `excon.wordcat.it.kr` 도메인 = 백워드 호환 유지 (CloudFront alias 추가 후 점진 폐기)
- 진우 매니저 통해 배포 시점 결정

## 사용자 액션 (미완 — 본 세션 진행 안 함)

- OpenAI 키 폐기 권장 (지난 세션 채팅 2회 노출, 본 세션 미진행 — 사용자가 "괜찮아" 결정)

## 참조

- 직전 (S1 wrap): `handoff-2026-06-08-s1-wrap.md`
- PRD 본문: `docs/prd/PRD-19-ai-auto-answer.md`
- 신규 코드: `src/lib/ai/{pool-manager,rate-limiter}.ts`, `src/app/api/ai/auto-answer/route.ts`, `src/app/api/admin/events/[id]/ai-stats/route.ts`, `src/components/admin/dashboard/AiUsageCard.tsx`
