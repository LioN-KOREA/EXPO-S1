# Handoff — PRD #19 S1 정식 마무리 (2026-06-08 s1-wrap)

## 컨텍스트

직전 (`handoff-2026-06-05-ai-deploy.md`) = PoC 운영 활성화 + 시연 합격. 본 세션 = S1 정식 마무리 (M4 폴백 어댑터 정식 + Vitest + Codex 5건 반영).

## 잡은 작업

S1 정식 닫기. 사용자 의사 결정: "S1 정식 마무리 먼저" (M5 캐시보다 선결, PRD 의존성 따름).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/lib/ai/fallback-adapter.ts` (신규) | `buildTemplateFallback()` pure function. templateRow + formValues + consultation → content or null |
| `src/app/api/ai/test/route.ts` | M4 폴백 어댑터 연결, kill switch off 도 폴백 시도 (PRD §Solution 준수), `source: 'llm' \| 'template_fallback'` 라벨 |
| `src/lib/ai/prompt-builder.ts` | variantIndex NaN/분수/Infinity 가드 (`Number.isFinite` + `Math.floor`) |
| `src/lib/ai/__tests__/prompt-builder.test.ts` (신규) | 12 케이스 + SYSTEM_PROMPT 스냅샷 |
| `src/lib/ai/__tests__/fallback-adapter.test.ts` (신규) | 10 케이스 |
| `src/lib/ai/__tests__/__snapshots__/prompt-builder.test.ts.snap` (신규) | SYSTEM_PROMPT 13 규칙 잠금 |

총 6 파일, 마이그 0, 의존성 0.

## Codex 검수 5건 모두 반영

| 등급 | 발견 | 수정 |
|---|---|---|
| HIGH | kill switch off 가 503 즉시 종료 → PRD §Solution "kill switch 도 폴백 동봉" 위반 | 라우트 재구성. ensureRole + body parse + consultation/template 로드 먼저, 그다음 kill switch 검사. off 시 폴백 시도 → 없으면 503 |
| MEDIUM | `llm_error`/`llm_error_kind` 응답 노출 → 인터프리터에 내부 provider/config 오류 누출 | 두 필드 모두 제거. source 라벨만 유지 |
| MEDIUM | M4 폴백 분기 테스트 누락 | `fallback-adapter.ts` 로 pure function 분리 + 10 케이스 단위 테스트 |
| LOW | `ensureSystemFields` 가 `rawFields.length > 0` 조건일 때만 호출 | fallback-adapter 에서 무조건 호출 |
| LOW | variantIndex NaN/분수 시 `VARIANT_TABLE[undefined]` 런타임 오류 | `Number.isFinite` 가드 + `Math.floor` 추가 |

## 응답 컨트랙트 (현재)

```json
// LLM 성공
{ "variant_index": 0, "content": "...", "source": "llm" }

// LLM 실패 또는 kill switch off → 폴백 성공
{ "variant_index": 0, "content": "...", "source": "template_fallback" }

// 폴백도 불가 (auto_answer_template 없음)
// — kill switch off: 503 { error: "AI 자동 답변 기능이 비활성화 상태입니다." }
// — LLM 오류: 429/500/502/504 { error, kind }
```

PRD §Solution: "폴백 사실은 통역사 화면에 노출되지 않으며 admin 모니터링 카드에서만 인지" → `source` 필드는 admin 카드 (M9) 용도, 통역사 UI 에서는 무시.

## 테스트 결과

- `npx vitest run src/lib/ai/__tests__/` = **22/22 pass** (12 prompt-builder + 10 fallback-adapter)
- `npx tsc --noEmit` = 통과
- SYSTEM_PROMPT 스냅샷 잠금 → 향후 13 규칙 변경 시 명시적 `--update` 필요

## 운영 룰 준수

- 코딩 후 Codex 검수 ✅ (5건 발견 + 모두 반영)
- 큰 변경 보고 = 본 핸드오프 + 메모리 갱신
- 파괴적 작업 = 0
- 마이그 = 0 (046 까지 그대로)
- 인증 가드 변경 = 0 (`ensureRole(['interpreter'])` 유지)
- RLS 우회 = 0
- 메모리 동기 갱신 = `project_ai_auto_answer.md` ✅
- 세션 히스토리 = 본 파일 ✅

## 잔여 작업 (S2/S4)

| 우선 | 항목 | 비고 |
|---|---|---|
| 중 | S2 M5 5-pool DB 캐시 (`ai_answer_pool`) | 6번째+ 캐시 반환, 비용 통제 |
| 중 | S2 M6 rate limit (분당 10, 일일 $10) | sliding window + SUM 체크 |
| 중 | S2 M7 `ai_call_logs` 인서트 | admin 모니터링 + 분쟁 대비 |
| 중 | S4 M9 admin 카드 | `/admin/events/[id]/dashboard` 수평바 4수치 30초 캐시 |
| 저 | `/api/ai/test` → `/api/ai/auto-answer` 라우트 정리 | 이름 통일, S2 M7 동시 |

## 사용자 액션 (미완 — 직전 세션 이월)

- OpenAI 키 폐기 권장 (세션 중 채팅 2회 노출됨)
- 팀장 보고 직후 `AI_AUTO_ANSWER_ENABLED=false` 비활성화 고려

## 참조

- 직전 세션 (운영 활성화): `handoff-2026-06-05-ai-deploy.md`
- 직전 직전 (PoC 코드): `handoff-2026-06-05-ai-poc.md`
- PRD 본문: `docs/prd/PRD-19-ai-auto-answer.md` (§Solution line 18 = kill switch 폴백 동봉)
- 신규 코드: `src/lib/ai/fallback-adapter.ts`, `src/lib/ai/__tests__/prompt-builder.test.ts`, `src/lib/ai/__tests__/fallback-adapter.test.ts`
- 수정: `src/app/api/ai/test/route.ts`, `src/lib/ai/prompt-builder.ts`
