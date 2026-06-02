# Handoff — EXCON 수출상담회 (2026-06-02 후속, GHA Node 24 메이저 업 + PRD #10 사전 조사)

## 세션 핵심

직전 핸드오프(`handoff-2026-06-02.md`) 의 우선순위 #1 (GHA Node 20 → Node 24 메이저 업) 처리 완료. #2 (PRD #10 메시지 예약 클라이언트) 는 사전 조사까지만 수행. 사용자가 본 세션 종료 + 핸드오프 작성 지시.

1. **GHA actions 메이저 업 완료** (commit `ed522f0`), CI 검증 ✅, Deploy in_progress
2. **PRD #10 S2 사전 조사 완료** (코드 X, issue 본문/구현 범위 확정)
3. 다음 세션 = S2 구현부터 시작 가능

## 1. GHA Node 24 메이저 업 (우선순위 #1 완료)

### 조사
`gh api repos/<owner>/<repo>/releases/latest` 로 각 action 의 최신 메이저 확인:
- `actions/checkout`: v4 → **v6.0.2** (v5 = Node 24 transition, v6 = cred persist refactor)
- `actions/setup-node`: v4 → **v6.4.0** (v5 = packageManager 자동 캐시 + Node 24, v6 = npm 전용 자동 캐시)
- `aws-actions/configure-aws-credentials`: v4 → **v6.2.0** (Node 24 + runner v2.327.1+ 필요)
- `pulumi/actions`: v6 → **v7.0.0** (Node 24)

### 검수
- Codex run `bmxsloh12` = HIGH 0, MEDIUM 0, LOW 3 (전부 미래 권장, 우려 없음)
  - SHA 핀 권장 (현재 major tag = 운영 OK)
  - pulumi/actions v7 = 설치만 담당이라 후속 shell `pulumi login`/`up` 무영향
  - aws-creds v6 = OIDC `role-to-assume` 흐름 변경 없음
- `cache: npm` 명시 사용이라 setup-node v5/v6 의 자동 캐시 변경 = no-op

### 변경 파일
- `.github/workflows/ci.yml` = checkout/setup-node 메이저 업
- `.github/workflows/deploy-prod.yml` = 4 actions 모두 메이저 업

### 커밋
- `ed522f0` chore(ci): GitHub Actions Node 20 → Node 24 메이저 업

### GHA 검증
- CI run **26797865258 = ✅ success** (checkout@v6 + setup-node@v6 동작 확인)
- Deploy run **26797865232 = in_progress** (수동 모니터링 백그라운드 task `bhwgo8er7`, 사용자 인계 시점 미완)
- 직전 deploy(직전 핸드오프 push 트리거된 26797593355) = ✅ success 로 v4 액션의 마지막 정상 동작 확인

## 2. PRD #10 메시지 예약 클라이언트 사전 조사 (우선순위 #2, 코드 0%)

### 슬라이스 매핑 (GitHub issues)
| 슬라이스 | issue | 상태 |
|---|---|---|
| S0 단위테스트 인프라 (Vitest + CI) | #11 | 직전 세션들에서 Vitest + CI gate 도입 완료 (deploy-prod 의 `npm test` step 활성) |
| S1 마이그 040 + RPC 5 + RLS + pg_cron | #12 | DB 마이그 040/041/042 **운영 적용 완료**(2026-05-29) |
| S2 admin repository + 작성/수정/취소 다이얼로그 | #13 | **다음 세션 시작 지점** |
| S3 admin 다이얼로그 예약 목록 탭 + 액션 트리거 | #14 | 미진행 |
| S4 (HITL) interpreter RLS 검증 + 매뉴얼 + 운영 통합 시나리오 | #15 | 미진행 |

### S2 (#13) 구현 범위 (issue 본문 요약)
1. **`src/lib/scheduled-notice/repository.ts`** = S1 RPC 4종 래퍼
   - `createScheduledNotice`, `updateScheduledNotice`, `cancelScheduledNotice`, (listScheduledNotices 는 S3)
   - 영문 키워드 에러 → i18n 매핑
   - 기존 `noticeRepository.ts` 패턴
2. **`src/components/admin/ScheduledNoticeDialog.tsx`**
   - props: `open`, `onClose`, `eventId`, `recipientUserIds`, `mode: 'create' | 'edit'`, `initial?`
   - 본문 textarea (1~4000자) + "지금 발송" 토글 + KST datetime picker + 대상자 카운트
   - 클라 1차 검증 (빈 본문 / 과거 시각 / 행사 종료 초과)
   - 수정 모드 = prefill + 취소 버튼
   - 모바일 반응형 (기존 attendance page 패턴)
3. **attendance page 연결** (`src/app/admin/events/[id]/attendance/page.tsx`)
   - line ~330 의 "Phase E에서 구현됩니다" toast 스텁 제거
   - 다이얼로그 마운트 + open state + `recipientUserIds = filtered.map(r => r.user_id)` 전달
4. **i18n 키 추가** (`src/lib/i18n/dictionaries.ts`) — ko/en
5. **단위테스트**
   - repository = RPC 모킹(msw 또는 supabase 클라 모킹) + 성공/실패 + i18n 매핑
   - dialog = RTL 사용자 시나리오 (작성/지금발송/검증실패/수정모드)
6. **Codex 검수** — 에러 매핑 누락 + 제출 race

### Acceptance criteria (issue #13)
- 다이얼로그 오픈 → DB scheduled row → 1분 내 발송 → 통역사 공지 등장 (수동)
- 지금발송 토글 → 1분 내 발송 (수동)
- 수정/취소 동작 (수동)
- 검증 에러 표시
- i18n ko/en
- 모바일 반응형
- `npm test` 통과
- Codex BLOCK 반영
- **목록 탭 미포함 (S3)**, S2 = 작성/수정/취소 단일 화면

### 본 세션 작업 = 사전 조사만
- 코드 변경 0
- 다음 세션 시작점 = `gh issue view 13` 본문 + `src/app/admin/events/[id]/attendance/page.tsx` line 317~338 스텁 위치 + `src/lib/notice-repository*.ts` (또는 동등 파일) 패턴 확인 후 repository 작성

## 3. 본 세션 산출물 종합

### 코드 변경
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-prod.yml`

### 커밋 (origin/EXPO-S1)
1. `ed522f0` chore(ci): GitHub Actions Node 20 → Node 24 메이저 업

### 메모리 갱신
- 본 세션 내 갱신 없음 (직전 세션 갱신만 유지)

### 운영 영향
- 코드 영향 0 (CI 액션만 메이저 업, 빌드 파이프라인 결과물 동일)
- 6/16 deprecation deadline 전 사일렌트 호환 이슈 차단 완료

## 4. 다음 세션 즉시 작업 (우선순위 재정렬)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | **PRD #10 S2 (#13) 구현** = repository + 다이얼로그 + attendance page 연결 + i18n + 단위테스트 | 다음 세션 시작점 | 본 핸드오프 §2 참조 |
| 2 | PRD #10 S3 (#14) admin 다이얼로그 예약 목록 탭 + 액션 트리거 | 미진행 | S2 종료 후 |
| 3 | PRD #10 S4 (#15) interpreter RLS 검증 + 매뉴얼 + 운영 통합 시나리오 | 미진행 | S3 종료 후 |
| 4 | 슬라이스 #21~#25 grab 결정 (PRD #16~#19 슬라이스) | 미진행 | PRD #10 종료 후 |
| 5 | 버그 #20 후속 S1 조사 | 미진행 | — |
| 6 | CloudFront Free→Standard plan 전환 검토 | 미진행 | distribution 다음 변경 전, 메모리 `project_cloudfront_drift.md` §미래 위험 |
| 7 | 변호사 검토 (처리방침 + 동의서) | 외부 | — |

## 5. 운영 룰 준수 (본 세션)

- 코딩 후 Codex 검수 = 1회 (GHA 메이저 업) ✅
- 큰 변경 사용자 보고 = GHA 메이저 업은 본 세션 시작 시 사용자 "우선순위대로 갖" 지시로 즉시 진행 → 결과 보고 ✅
- 파괴적 작업 = 없음
- 보안 = 외부 액션 메이저 업, SHA pin 향후 권장 (Codex LOW 1) ✅
- DB 컬럼명/UI 더미 = 0
- 마이그 = 0
- 매뉴얼 동기 = 사용자 가시 기능 변경 0
- git commit/push = 1 커밋 ✅
- 진우 핑 = 0 (룰 `feedback_we_decide_jinwoo_handover.md` 준수) ✅

## 참고

- 직전 핸드오프: `handoff-2026-06-02.md`
- 본 세션 GHA runs: 26797865258 (CI ✅), 26797865232 (Deploy in_progress)
- Codex review run: bmxsloh12 (GHA 메이저 업 검수)
- 본 세션 미완료 백그라운드 task: `bhwgo8er7` (Deploy run watch)
- PRD #10 issue: #10 (parent), #11~#15 (S0~S4 슬라이스)
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
