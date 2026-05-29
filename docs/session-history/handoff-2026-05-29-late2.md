# Handoff — EXCON 수출상담회 (2026-05-29 후속2, 미커밋 일괄 push + 버그 #20 S0 + 슬라이스 20건 발행)

## 세션 핵심

직전 세션(`handoff-2026-05-29-late.md`) 우선순위 표 1·2번 항목 완료.

1. **미커밋 일괄 정리·push** — 8 커밋 푸시 (`0fc7486..ad69ec6`)
2. **버그 #20 S0 완화책** — admin/error.tsx + global-error.tsx 추가 + Codex 검수 + GitHub 코멘트
3. **PRD #16/#17/#18/#19 슬라이스 분해** — `to-issues` 스킬로 20 이슈 발행 (#21~#40)

## 1. 일괄 커밋·push (8건)

| # | hash | 종류 | 내용 |
|---|---|---|---|
| 1 | `1a549cf` | feat | 마이그 040 + pg_cron runbook |
| 2 | `e693112` | test | vitest 통합 트랙 + scheduled-notice 테스트 |
| 3 | `64c346d` | docs(prd) | #19 AI 자동 답변 |
| 4 | `51f895d` | docs(issue) | #20 admin 목록 튕김 |
| 5 | `c9d5ace` | docs(handoff) | 28-late2 + 29 + 29-late |
| 6 | `35ea5b3` | chore | `supabase/.temp/cli-latest` 추적 해제 |
| 7 | `acaee70` | chore(infra) | Pulumi e1s 시크릿 채움 |
| 8 | `74c72fb` | chore(output) | xlsx 테스트 산출물 갱신 |

push 완료 → GitHub Actions 자동 배포 트리거.

**직전 핸드오프 오기 정정:** 마이그 041/042 는 이미 커밋되어 있었음 (`7b1a634`, `2bc4986`). 본 세션에서 새로 커밋한 마이그 = 040 만.

## 2. 버그 #20 S0 완화책

커밋 `ad69ec6`.

- `src/app/admin/error.tsx` 신규 — admin 세그먼트 에러 바운더리 (interpreter/error.tsx 패턴 + admin 톤 한국어 + ChunkLoadError 분기)
- `src/app/global-error.tsx` 신규 — root layout 부재 대비 최후 폴백 (자체 html/body + 다크 inline + ChunkLoadError 분기 + role="alert" + aria-live="assertive")
- 두 파일 모두 `useEffect`로 `console.error` 로깅
- Sentry 미도입 → 새로고침/reset/로그인 폴백 3종

### Codex 검수 결과

- 심각 0건
- S1 권고 = global-error ChunkLoadError 분기 부재 → **반영 완료**
- S2 권고 = admin/error 다크모드 → interpreter 와 일관성 유지 위해 **미반영**
- S3 권고 = global-error 접근성 (`role="alert"`) → **반영 완료**

GitHub 이슈 #20 코멘트 = https://github.com/LioN-KOREA/EXPO-S1/issues/20#issuecomment-4573122159

## 3. PRD 슬라이스 분해 — 20 이슈 발행

`to-issues` 스킬 + 위상정렬 발행. 모두 라벨 = `ready-for-agent`.

### PRD #16 통역사 관리 (5 슬라이스)

| 이슈 | 제목 | 타입 | Blocked by |
|---|---|---|---|
| #21 | [S0] 마이그 044 + types + repository 골격 + 단위테스트 | AFK | — |
| #26 | [S1] 글로벌 통역사 목록 + 사이드바 메뉴 | AFK | #21 |
| #27 | [S2] 통역사 상세 + 글로벌 필드 편집 | AFK | #21 |
| #28 | [S3] 평가 모달 + 이벤트 통역사 화면 보강 | AFK | #21 |
| #29 | [S4] RLS 검증 + 매뉴얼 + 회귀 | HITL | #26, #27, #28 |

### PRD #17 출석 신뢰성 (5 슬라이스)

| 이슈 | 제목 | 타입 | Blocked by |
|---|---|---|---|
| #22 | [S0] attendance stats 집계 함수 + 단위테스트 | AFK | — |
| #23 | [S2] POST /api/attendance/batch + 통합테스트 | AFK | — |
| #30 | [S1] 출석률 카드 컴포넌트 + 대시보드 보강 | AFK | #22 |
| #31 | [S3] 출석표 체크박스 + sticky 액션바 | AFK | #23 |
| #32 | [S4] 매뉴얼 + 회귀 | HITL | #30, #31 |

### PRD #18 공지 토스트 (4 슬라이스)

| 이슈 | 제목 | 타입 | Blocked by |
|---|---|---|---|
| #24 | [S0] 마이그 045 notices Realtime publication | AFK | — |
| #33 | [S1] useRealtimeNotices hook + InterpreterNoticeToaster + layout 통합 | AFK | #24 |
| #34 | [S2] 사이드바 unread 실시간 갱신 | AFK | #33 |
| #35 | [S3] 매뉴얼 + 회귀 | HITL | #34 |

### PRD #19 AI 자동 답변 (6 슬라이스)

| 이슈 | 제목 | 타입 | Blocked by |
|---|---|---|---|
| #25 | [S0] 마이그 046 + env + 시스템 필드 7종 | AFK | — |
| #36 | [S1] AI lib (prompt builder + OpenAI client + 폴백 어댑터) | AFK | #25 |
| #37 | [S2] 5-pool 매니저 + rate limit + POST /api/ai/auto-answer | AFK | #36 |
| #38 | [S3] 통역사 UI (버튼 + chip + 폴백) | AFK | #37 |
| #39 | [S4] admin 모니터링 카드 (4수치 수평바) | AFK | #37 |
| #40 | [S5] 매뉴얼 + 처리방침 OpenAI 위탁 절 | HITL | #38, #39 |

### 즉시 grabbable (no blocker)

#21, #22, #23, #24, #25 — 5건 병렬 가능.

## 다음 세션 즉시 작업 (우선순위 순)

| # | 항목 | 상태 |
|---|---|---|
| 1 | **GitHub Actions Node.js 20 → 24** (deadline **2026-06-02 D-4**) | 미진행 |
| 2 | PRD #10 (#12~#15) 메시지 전송 예약 재개 — 040 운영 적용 완료, 클라이언트 코드 0% | 미진행 |
| 3 | 슬라이스 #21~#25 (5 grabbable) 중 우선순위 결정 → 1건 grab | 미진행 |
| 4 | 변호사 검토 (처리방침 OpenAI 위탁 1줄 + 동의서) — 외부 일정 | 외부 일정 |
| 5 | 버그 #20 후속 S1 조사 — 시연 콘솔/Supabase Logs/CloudWatch (외부 데이터 의존) | 미진행 |

## 다음 세션 추천 스킬

- `excon-coding` — 우선순위 1 (Node 24 업그레이드 코드/CI 변경)
- `codex:rescue` — 우선순위 1 검수
- `to-issues` 추가 사용 없음 (4 PRD 분해 완료)

## 운영 룰 준수 체크 (본 세션)

- DB 컬럼명 영어 snake_case ✅
- 영어 더미 금지 ✅ (이슈 한국어)
- 파이차트 금지 ✅ (이슈 명세에 수평바 강제 반영)
- 모바일 360px ✅ (각 슬라이스 acceptance 에 명시)
- MANUAL.md 동기 갱신 → 각 PRD HITL 슬라이스 (#29/#32/#35/#40) 에 포함
- Codex 검수 = error boundary 2종 검수 완료 (심각 0)
- 마이그 = 본 세션 신규 마이그 0 (#21/#22/#24/#25 슬라이스에서 후속 생성 예정)
- 로컬 dev 자가 검증 = error boundary 는 tsc clean 으로 갈음 (UI 변경 시연 검증 추후)
- git commit/push = 8 커밋 직접 push ✅

## 잔여 untracked (없음)

```
working tree clean
```

## 신규 산출물 (이번 세션)

- `src/app/admin/error.tsx`
- `src/app/global-error.tsx`
- 본 핸드오프 = `docs/session-history/handoff-2026-05-29-late2.md`
- GitHub 이슈 = #21~#40 (20건)
- GitHub 코멘트 = #20 S0 보고

## 참고

- 직전 핸드오프: `handoff-2026-05-29-late.md`
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- PRD 목록: `gh issue list --label ready-for-agent`
- 발행 슬라이스: #21~#40 (PRD #16/#17/#18/#19)
- 발행 PRD (직전 직전 세션): #16, #17, #18, #19
- Supabase project_id: `zyqmtehupckkweafzyuc`
- 운영 cron 활성 2건: `purge-old-messages-daily`, `dispatch_due_scheduled_notices_minutely`
- pg_cron runbook: `docs/runbook/pg_cron-setup.md`
