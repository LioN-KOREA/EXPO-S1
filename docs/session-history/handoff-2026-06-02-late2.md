# Handoff — EXCON 수출상담회 (2026-06-02 late2, PRD #10 S2/S3/S4 일괄 완료)

## 세션 핵심

직전 세션 (`handoff-2026-06-02-late.md`) 의 우선순위 #1 (PRD #10 S2) 부터 시작해서 본 세션 동안 S2 → S3 → S4 까지 **한 번에 완주**. PRD #10 의 코드/문서 산출물 100% 완료. 남은 작업은 사용자 수동 검증 + 스크린샷 캡쳐.

| 항목 | 상태 | 비고 |
|---|---|---|
| S2 (#13) repository + 다이얼로그 작성/수정/취소 | ✅ 완료 | 커밋 `166ead1` 운영 배포 success |
| S3 (#14) 다이얼로그 예약 목록 탭 + 액션 트리거 | ✅ 완료 | 커밋 `adc31aa` 운영 배포 success |
| S4 (#15 HITL) 체크리스트 + 매뉴얼 + 메모리 | ✅ 코드/문서 | 사용자 수동 검증 대기 |

## 1. S2 (#13) 산출물

신규 파일:
- `src/lib/scheduled-notice/errors.ts` — 영문 키워드 → ScheduledNoticeError + ko/en 매핑 (단어 경계 regex)
- `src/lib/scheduled-notice/repository.ts` — 4 RPC 래퍼 (create/update/cancel/list)
- `src/lib/scheduled-notice/validate.ts` — UUID/길이/배열 사전 검증
- `src/app/api/scheduled-notices/route.ts` — POST/GET (ensureAdmin + validate)
- `src/app/api/scheduled-notices/[id]/route.ts` — PATCH/DELETE
- `src/components/admin/ScheduledNoticeDialog.tsx` — 다이얼로그 (S2 시점 작성 모드만)
- `src/test/__tests__/scheduled-notice-{errors,repository,validate,dialog}.test.ts`

수정:
- `src/app/admin/events/[id]/attendance/page.tsx` — "메시지 전송 예약" 버튼 + 다이얼로그 마운트
- `docs/MANUAL.md` — 2.9 출석표에 라인 추가

Codex 검수:
- BLOCK 0
- WARN 2 반영: substring → 단어 경계 regex, API route 사전 검증
- WARN 2 NOTE: KST 명시 변환(관리자 KST 가정), CSRF(프로젝트 레벨)

테스트: 본 슬라이스 43개 신규, 전체 71/71 pass

## 2. S3 (#14) 산출물

신규 파일:
- `src/components/admin/ScheduledNoticeList.tsx` — 목록 (상태 배지, 30초 폴링 visibility 가드, seq token race 차단, scheduled 만 수정/취소, failed 사유 토글)
- `src/components/admin/ScheduledNoticeComposeForm.tsx` — S2 폼 본문을 별도 파일로 추출
- `src/test/__tests__/scheduled-notice-{list,compose-form}.test.tsx`

수정:
- `src/components/admin/ScheduledNoticeDialog.tsx` — Tabs(작성/예약 목록) + 내부 state(tab, editInitial, refreshKey)
- `src/test/__tests__/scheduled-notice-dialog.test.tsx` — 탭 통합 시나리오로 재작성
- `src/app/admin/events/[id]/attendance/page.tsx` — mode prop 제거
- `docs/MANUAL.md` — 2.9 항목 단순화 (S4 에서 별도 §2.9.1 로 확장)

Codex 검수:
- **BLOCK 1 반영**: edit 모드 PATCH 의 `recipient_user_ids` = `initial.recipient_user_ids` 고정 — 부모(attendance) 가 전달한 현재 필터 결과로 row 원본 수신자가 조용히 덮이지 않게. 수정 = 본문/시각만, 대상자 변경 의도면 신규 예약 + 기존 취소.
- WARN 3 반영: 백그라운드 탭 폴링 중지 (document.hidden / visibilitychange), stale fetch race 차단 (seqRef 토큰), 수정 중 탭 직접 전환 시 editing 해제 (탭 라벨 복원)
- SUGGEST 2 반영: cancelled/failed 회귀 테스트 추가, confirm 메시지 preview 제거

테스트: 본 슬라이스 47개 신규/마이그레이트, 전체 90/90 pass

## 3. S4 (#15 HITL) 산출물

신규 파일:
- `docs/runbook/scheduled-notice-checklist.md` — 운영 통합 시나리오 체크리스트
  - 1-1 작성 / 1-2 cron 발송 / 1-3 지금 발송 / 1-4 수정 (BLOCK #1 회귀 포함) / 1-5 취소 / 1-6 실패 / 1-7 클라 엣지 / 1-8 race
  - 2-1 부분집합 노출 / 2-2 broadcast 회귀 / 2-3 notice_reads 무결성
  - 회귀 안전 (메신저/QR/broadcast notice)
  - 결과 보고 표 (issue #15 코멘트용)

수정:
- `docs/MANUAL.md` — §2.9.1 "메시지 전송 예약" 별도 섹션 (작성 탭 / 예약 목록 탭 / FAQ 표)
- `docs/MANUAL.md` — §3.6 통역사 공지 페이지에 부분집합 노출 동작 설명 추가

메모리:
- `project_scheduled_notice.md` 갱신 — 진행 상태 S0~S4, 클라이언트 구조, BLOCK 반영, S4 미해결 사용자 액션

## 4. 사용자 액션 (PRD #10 close 전)

1. **수동 검증** — `docs/runbook/scheduled-notice-checklist.md` 의 시나리오 A~D 실행
   - admin 계정으로 작성/수정/취소/cron 발송 확인
   - 통역사 계정 2~3개로 부분집합 노출 / broadcast 회귀 / notice_reads 무결성 확인
   - 결과를 issue #15 코멘트에 표 형식 기록
2. **스크린샷 캡쳐** — 운영 환경에서 4장 캡쳐 후 `docs/manual-screenshots/` 에 저장 + git add:
   - `28-attendance-message-schedule-button.png`
   - `29-message-schedule-dialog.png`
   - `30-message-schedule-list-tab.png`
   - `31-interpreter-notice-targeted.png`
3. **PRD #10 close** — 모든 시나리오 ✅ 면 issue #10 close

## 5. 운영 룰 준수 (본 세션)

- 코딩 후 Codex 검수 = 2회 (S2 / S3) ✅
- 큰 변경 사용자 보고 = "추천대로" 사용자 지시 → 진행 + 결과 보고 ✅
- 파괴적 작업 = 없음
- 보안 = ensureAdmin + RPC admin 재검증 + RLS + RPC status='scheduled' 가드, validate 사전 + UUID 검증 ✅
- DB 컬럼명/UI 더미 = 0
- 마이그 = 0 (마이그 040 = 이전 세션 운영 적용 완료)
- 매뉴얼 동기 = 본 세션 ✅ (§2.9.1 + §3.6)
- git commit/push = 2 커밋 (`166ead1` S2, `adc31aa` S3) ✅
- 진우 핑 = 0 (룰 `feedback_we_decide_jinwoo_handover.md`) ✅

## 6. 다음 세션 즉시 작업

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | **PRD #10 사용자 수동 검증 + close** | 대기 | 본 핸드오프 §4 |
| 2 | PRD #16~#19 슬라이스 grab 결정 | 미진행 | PRD #10 close 후 |
| 3 | 버그 #20 admin 목록 튕김 후속 S1 조사 | 미진행 | — |
| 4 | CloudFront Free→Standard plan 전환 검토 | 미진행 | distribution 다음 변경 전 |
| 5 | 변호사 검토 (처리방침 + 동의서) | 외부 | — |

## 참고

- 직전 핸드오프: `handoff-2026-06-02-late.md`
- 본 세션 commits: `166ead1` (S2), `adc31aa` (S3)
- 본 세션 미 commit: 체크리스트 + MANUAL 갱신 + 메모리 + 본 핸드오프 (다음 commit 에 포함)
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 테스트: 전체 90/90 passed
- PRD #10 이슈: https://github.com/LioN-KOREA/EXPO-S1/issues/10
