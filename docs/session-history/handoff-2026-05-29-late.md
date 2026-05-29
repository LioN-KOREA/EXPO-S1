# Handoff — EXCON 수출상담회 (2026-05-29 후속, PRD #19 + 마이그 040/041/042 + 버그 #20)

## 세션 핵심

직전 세션(`handoff-2026-05-29.md`) 우선순위 표 0~2번 항목 완료.

1. **PRD #19 (AI 자동 답변 다양화·컨텍스트 강화)** 발행 — grill-me 14문답 결정 트리 + 사용자 제공 시스템 프롬프트 채택
2. **마이그 040/041/042 운영 DB 적용** — Supabase MCP 직접 push, pg_cron 자동 활성화
3. **버그 이슈 #20 (상담회 목록 튕김)** 발행 — 원인 후보 ranked + 완화책 윤곽

## 1. PRD #19 발행

- URL: https://github.com/LioN-KOREA/EXPO-S1/issues/19
- 로컬 경로: `docs/prd/PRD-19-ai-auto-answer.md`
- 라벨: `ready-for-agent`
- 분량: 41 user story / 10 모듈(M1~M10) / 6 슬라이스(S0~S5)
- 마이그 번호 = **046** 예약 (044 #16 / 045 #18 / 046 #19)

### 결정 트리 (Q1~Q14, 자세한 내용은 PRD 본문)

| Q | 결정 |
|---|---|
| Q1 | LLM 도입 |
| Q2 | gpt-4o-mini |
| Q3 | 단일 `AI 답변 생성` 버튼, 재생성 무제한 |
| Q4 | 5-variant 풀, 키 = `(consultation_id, hash(buyer_id+seller_id+품목+목적))` |
| Q5 | 컨텍스트 = 회사명·국가·양식 7개 시스템 필드 (개인명/연락처 제외) |
| Q6 | LLM 실패 시 기존 `auto_answer_template` 폴백 보존 |
| Q7 | temp 0.7~1.1 변동 + variant_index 힌트 + 사용자 제공 시스템 프롬프트 |
| Q8 | 시스템 필드 7종 강제 (`industry`/`consultation_content`/`key_discussion`/`expected_amount`/`buyer_reaction`/`follow_up`/`notes`) |
| Q9 | 통역사만 호출, admin 호출 불가 |
| Q10 | 이벤트 대시보드 카드 1장 (4수치 수평바) |
| Q11 | 처리방침 1줄 갱신 + ai_call_logs prompt 평문 저장 |
| Q12 | 타임아웃 10s / 분당 10회 / 일일 $10 / 폴백 7종 / 풀 6개월 |
| Q13 | 시안 N/5 chip / 폴백 시 통역사 알림 X |
| Q14 | S0(마이그) → S1(LLM lib) → S2(API+pool+limit) → S3(통역사 UI) ┬ S4(admin 카드) ┴ S5(매뉴얼+처리방침) |

### 사용자 제공 시스템 프롬프트 (확정, PRD §"Implementation Decisions" 에 전문 인용)

"너는 정부·기관 제출용 수출상담회 상담일지를 작성하는 전문 비즈니스 문서 작성 AI이다…" — 10가지 작성 규칙 + 출력 예시 2안. PRD 본문 참조.

## 2. 마이그 040/041/042 운영 적용

Supabase MCP `apply_migration` 으로 직접 적용. project_id = `zyqmtehupckkweafzyuc`.

| 마이그 | 운영 적용 | 검증 결과 |
|---|---|---|
| **042 messages_replica_identity** | ✅ | `public.messages.relreplident = full` |
| **041 messages_retention** | ✅ | RPC `purge_old_messages(int)` 등록 + cron `purge-old-messages-daily` `0 3 * * *` 활성 |
| **040 scheduled_notices** | ✅ | scheduled_notices 테이블 + 4 RLS + 5 RPC + notices.recipient_user_ids 컬럼 + GIN 인덱스 + cron `dispatch_due_scheduled_notices_minutely` `* * * * *` 활성 |

### 운영 환경 변동

- **pg_cron 자동 활성화 확인.** 마이그 040/041 의 DO 블록이 `CREATE EXTENSION IF NOT EXISTS pg_cron` 실행 → Supabase 가 권한 부여. 진우 매니저 Dashboard 수동 작업 불필요.
- `cron.job` 테이블 = 2건 활성 (purge-daily, dispatch-minutely)
- 040 = PRD #10 (메시지 예약) 클라이언트 코드 0% 상태이므로 `scheduled_notices` 테이블 비어있음. dispatch cron 매분 실행 = 빈 row 조회 = no-op. 비용·영향 0.
- 041 cron = 매일 03:00 UTC. 현재 메신저 운영 시작 ~9일 → 90일 미만 데이터만 존재 → 즉시 삭제 0건.

### 운영 DB 마이그 버전

- 마지막 = `20260528053534 ensure_system_template_fields` (= 로컬 043) → 본 세션 040/041/042 적용
- Supabase 측 version 표기 일관성 = 로컬 040/041/042 번호 그대로 적용됨 (migrations 목록 추후 확인 필요)

## 3. 버그 이슈 #20 발행

- URL: https://github.com/LioN-KOREA/EXPO-S1/issues/20
- 로컬 경로: `docs/issues/bug-event-list-crash.md`
- 라벨: `bug`
- 원인 후보 6종 ranked, 최상위 = **`src/app/admin/error.tsx` + `src/app/global-error.tsx` 미존재** → 미포착 예외 시 blank/튕김 가능
- 즉시 완화책 (S0) = admin/error.tsx + global-error.tsx 추가 (~2시간 분량)
- 후속 조사 (S1) = 시연 브라우저 콘솔/Supabase Logs/CloudWatch 메트릭

## 다음 세션 즉시 작업 (우선순위 순)

| # | 항목 | 상태 |
|---|---|---|
| 1 | **PRD #16/#17/#18/#19 슬라이스 분해 `to-issues`** — 4건 × S0~S5 ≈ 20 이슈. 1.5-2시간 분량 | 미진행 |
| 2 | 버그 #20 S0 완화책 = admin/error.tsx + global-error.tsx 추가 + Codex 검수 | 미진행 |
| 3 | PRD #10 (#12~#15) 메시지 전송 예약 재개 — 040 운영 적용 완료, 클라이언트 코드 0% 상태에서 시작 | 미진행 |
| 4 | GitHub Actions Node.js 20 → 24 (deadline **2026-06-02**, D-4) | 미진행 |
| 5 | S1 untracked 산출물 정리 (vitest config, scheduled-notice 테스트, 마이그 040 — **040 이미 운영 적용됨**) | 미진행 |
| 6 | 변호사 검토 (PRD #19 처리방침 OpenAI 위탁 1줄 + 동의서 갱신) — 메모리 `project_legal_compliance` 트랙 | 외부 일정 |

## 다음 세션 추천 스킬

- `to-issues` — 우선순위 1 (PRD 4건 슬라이스 분해)
- `excon-coding` — 우선순위 2 (admin/error.tsx 코드 작성)
- `codex:rescue` — 우선순위 2 작업 후 Codex 검수 (메모리 `feedback_codex_must_call` = `codex exec --skip-git-repo-check` 직접 호출)

## 운영 룰 준수 체크 (본 세션)

- DB 컬럼명 영어 snake_case ✅
- 영어 더미 금지 ✅ (PRD 한국어)
- 파이차트 금지 ✅ (PRD #19 admin 카드 = 수평바)
- 모바일 360px ✅ (PRD #19 명시)
- MANUAL.md 동기 갱신 → PRD #19 S5 에 포함
- Codex 검수 = 본 세션 코드 변경 0건 (마이그은 직전 세션 검수 완료, 운영 적용만)
- 마이그 = 수동 db push (Supabase MCP) + 검증 ✅
- 로컬 dev 자가 검증 = 본 세션 코드 변경 없음

## 잔여 untracked (변동 없음, 다음 세션 정리 대상)

```
infra/Pulumi.e1s.yaml                    M
output/사용자_일괄등록_테스트.xlsx       M
output/타임테이블_테스트.xlsx            M
package.json                             M (S1 test:integration)
supabase/.temp/cli-latest                M
vitest.config.mts                        M (S1 exclude)
docs/runbook/                            ?? (S1)
src/test/__tests__/scheduled-notice-migration.test.ts        ?? (S1)
src/test/__tests__/scheduled-notice-rpc.integration.test.ts  ?? (S1)
supabase/migrations/040_scheduled_notices.sql                ?? (S1) — 운영 적용됨, 커밋 필요
supabase/migrations/041_messages_retention.sql               ?? (S1) — 운영 적용됨, 커밋 필요
supabase/migrations/042_messages_replica_identity.sql        ?? (S1) — 운영 적용됨, 커밋 필요
vitest.integration.config.mts            ?? (S1)
vitest.setup.integration.ts              ?? (S1)
```

**주의:** 040/041/042 마이그 파일이 운영 DB 에는 적용되었으나 git 미커밋 상태. 다음 세션 시작 시 `git add supabase/migrations/04{0,1,2}*.sql && git commit` 필요.

## 신규 산출물 (이번 세션)

- `docs/prd/PRD-19-ai-auto-answer.md` (신규)
- `docs/issues/bug-event-list-crash.md` (신규)
- 운영 DB 마이그 = 040/041/042 + cron job 2건 활성

## 참고

- 직전 핸드오프: `handoff-2026-05-29.md`
- 회의 원문: `input/상담회 관련 회의 내용.txt`
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- PRD 목록: `gh issue list --label ready-for-agent`
- 버그 목록: `gh issue list --label bug`
- Supabase project_id: `zyqmtehupckkweafzyuc` (expo-s1-e1s, Northeast Asia Seoul)
- 발행 PRD/버그 (이번 세션): #19, #20
- 발행 PRD (직전 세션): #16, #17, #18
