# Handoff — PRD #19 AI 자동 답변 PoC (2026-06-05 ai-poc)

## 컨텍스트

직전 세션 (`handoff-2026-06-05-ai-design.md`) = 설계 7건 확정. 본 세션 = 사용자가 OpenAI 키 발급(GitHub Actions secrets 등록) 후 PoC 코드 작성 + 로컬 dev 검증. 답변 품질 합격 → 사용자 만족 → PoC 마무리.

## 세션 결과 한 줄

PoC 3파일 작성 + 로컬 dev 시드 + 통역사 UI 임시 LLM 연동 + 답변 품질 합격. kill switch + 디버그 제거 후 commit/push 예정.

## 작성한 파일 (운영 push 대상)

| 파일 | 역할 | 상태 |
|---|---|---|
| `src/lib/ai/prompt-builder.ts` | SYSTEM_PROMPT 상수 + 양식 키 fallback + variant temp/힌트 + label:value 포맷 (pure) | 신규 |
| `src/lib/ai/openai-client.ts` | fetch + `OpenAI-Beta: no-training` + 10s timeout + 비용 계산 + OpenAIError | 신규 |
| `src/app/api/ai/test/route.ts` | POST, **interpreter only + 본인 배정 only + kill switch** (`AI_AUTO_ANSWER_ENABLED='true'` 일 때만 동작). 응답 = `{variant_index, content}` 만, prompt 비노출 | 신규 |
| `src/components/interpreter/MultiStepReportForm.tsx` | textarea AI 버튼 = `/api/ai/test` fetch 로 교체, variant 0~4 순환 state | 수정 |
| `src/app/interpreter/events/[id]/consultation/[consultationId]/page.tsx` | MultiStepReportForm 에 `consultationId` prop 추가 | 수정 |
| `docs/prd/PRD-19-ai-auto-answer.md` | 결정사항 보강 (D1~D7) — 직전 세션 산출물 | 수정 |

## 운영 안전 가드

- **Kill switch**: `process.env.AI_AUTO_ANSWER_ENABLED === 'true'` 일 때만 동작. 기본 false → 운영 배포 즉시 503 응답.
- **권한**: interpreter role + 본인 배정 consultation 만 허용 (`consultations.eq('interpreter_id', user.id)`).
- **응답 prompt 비노출**: PoC 단계의 `debug.user_message` 출력 제거. 응답 = `{variant_index, content}` 만.
- **클라이언트 디버그 console.log 제거**.

## PoC 시 사용자 검증 사항

- 답변 자연스러움 ✅ (사용자: "마음에 든다")
- 12 규칙 준수 (보고문 톤, 3-6 문장, 한 문단) ✅
- variant 0~4 다양화 ✅
- 양식 키 fallback (시드 양식 = `consultation_product` / `consultation_detail` / `contract_push_amount` 등) ✅
- 응답 시간 = ~2.4초 / 비용 = ~$0.0002 회당
- 시스템 프롬프트 라벨 1건 사용자 요청 수정: `국내기업 업종 또는 주요품목` → **`상담품목`** (시스템 + user msg 양쪽)

## 운영 배포 시 절차

1. `git push EXPO-S1` → GitHub Actions 자동 배포
2. 기본은 비활성 (`AI_AUTO_ANSWER_ENABLED` 미설정 = false). 사용 시:
3. GitHub Actions secrets 에 `AI_AUTO_ANSWER_ENABLED=true` 추가 후 재배포
4. 다시 끄려면 secret 값 `false` 로 변경 또는 삭제 후 재배포

## 잔여 (S1 정식 구현 시)

- M5 5-pool 캐시 (마이그 046 `ai_answer_pool` 활용) — 비용 통제
- M6 rate limit (분당 10회 + 일일 $10) — 메모리 sliding window
- `ai_call_logs` 인서트 (prompt 평문 저장, admin 모니터링)
- M9 admin 카드 (`/admin/events/[id]/dashboard` 4수치 수평바)
- Vitest 단위 (prompt-builder 스냅샷 + variant 매핑 + fallback) + Codex 검수
- `/api/ai/test` → `/api/ai/auto-answer` 정식 라우트로 분리 또는 통합
- PoC 디버그 잔재 정리 (현재는 kill switch 켜야만 동작)

## 사용자 액션

1. **OpenAI API 키 폐기 권장** — 세션 중 채팅에 2회 노출됨 (사용자 본인 키, 본인 결정)
2. 다음 세션: S1 정식 본격 구현 (1.5~2시간 + Codex)

## 운영 룰 준수

- 코딩 후 Codex 검수 = PoC 라 생략 (정식 S1 에서 필수)
- 큰 변경 보고 = 본 핸드오프
- 파괴적 작업 = 0
- 마이그 = 0
- 메모리 동기 갱신 = `project_ai_auto_answer.md` ✅
- 세션 히스토리 = 본 파일 ✅

## 참조

- 직전 세션 (설계): `handoff-2026-06-05-ai-design.md`
- 직전 직전 (마이그 push): `handoff-2026-06-05.md`
- PRD 본문: `docs/prd/PRD-19-ai-auto-answer.md` (D1~D7 보강 포함)
- 관련 마이그: 043 / 046
- 관련 컴포넌트: `MultiStepReportForm.tsx` (line 259~ AI 버튼)
