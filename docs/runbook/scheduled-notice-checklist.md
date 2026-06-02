# 메시지 전송 예약 — 운영 통합 체크리스트 (PRD #10 / S4 #15)

본 문서는 PRD #10 종착점인 HITL(Human-In-The-Loop) 검증용 체크리스트다.
S2(작성/수정/취소) / S3(목록 탭) 운영 배포 후 본 절차를 따라 admin·통역사 사이드 동작과
회귀 안전성을 한 번에 검증한다.

## 0. 전제 조건

- DB 마이그 040/041/042 운영 적용 완료 (2026-05-29)
- pg_cron extension 활성화 + `dispatch_due_scheduled_notices_minutely` job 등록 (`pg_cron-setup.md` 참조)
- `cron.job_run_details` 에 매분 실행 흔적 확인 가능
- S2 commit `166ead1` (작성/수정/취소) + S3 commit `adc31aa` (목록 탭) 운영 배포 완료
- admin 계정 1개 + interpreter 계정 최소 2개 보유 (대상자 부분집합 검증용)

## 1. admin 시나리오

### 1-1. 작성 (S2 / scheduled)

1. admin 로그인 → `/admin/events/[id]/attendance`
2. 통역사 필터 적용 (또는 전체) — 대상자 1명 이상 확보
3. "메시지 전송 예약" 버튼 클릭 → 다이얼로그 오픈
4. "작성" 탭에서:
   - 본문 입력 (예: "테스트 공지 — {YYYY-MM-DD HH:MM:SS}")
   - "지금 발송" 체크 안 함
   - datetime-local 입력 → 현재 시각 + 2분
5. "예약" 클릭 → toast "예약이 등록되었습니다"
6. 다이얼로그가 "예약 목록" 탭으로 자동 전환되고 방금 등록한 row 가 보임 (상태=대기)

검증: ✅ / ❌

### 1-2. 발송 (cron dispatcher)

1. 예약 시각까지 대기 (최대 1분 지연 허용)
2. "예약 목록" 탭 새로고침 또는 30초 폴링 대기
3. 해당 row 상태 = `발송됨` (sent)
4. DB 직접 확인 (Supabase Dashboard SQL Editor):
   ```sql
   SELECT id, status, sent_notice_id, updated_at
     FROM scheduled_notices
    WHERE id = '<row-id>';
   ```
   - `status = 'sent'`, `sent_notice_id NOT NULL`
5. `notices` 테이블에서 `recipient_user_ids` 가 admin 입력 user_ids 와 일치 확인

검증: ✅ / ❌

### 1-3. 지금 발송 (sendNow)

1. 다이얼로그 "작성" 탭 → 새 본문 입력
2. "지금 발송" 토글 ON → datetime input 비활성 확인
3. "예약" 클릭 → toast + 목록 탭 전환
4. 1분 내 status = sent 전이 확인

검증: ✅ / ❌

### 1-4. 수정 (S2 + S3)

1. 미래 시각으로 새 예약 등록 (시각: 현재 + 10분)
2. "예약 목록" 탭에서 해당 row 의 "수정" 클릭
3. "작성" 탭으로 자동 전환 + 본문/시각 prefill 확인
4. 본문 수정 → "수정" 클릭 → toast "예약이 수정되었습니다"
5. 목록 탭으로 자동 복귀 → row 본문 변경 반영
6. **회귀 검증 (BLOCK #1)**: 부모 출석표 필터를 다르게 바꾼 상태에서 수정해도
   해당 row 의 `recipient_user_ids` 가 변하지 않아야 함. DB 확인:
   ```sql
   SELECT recipient_user_ids FROM scheduled_notices WHERE id = '<row-id>';
   ```

검증: ✅ / ❌

### 1-5. 취소

1. 미래 시각 예약 1건 등록
2. "예약 목록" 탭에서 "취소" 클릭 → confirm 다이얼로그
3. 확인 → toast + 목록에서 상태 = `취소됨` (cancelled)
4. DB 확인: `status = 'cancelled'`
5. 예약 시각 도래해도 발송 X (cron 이 status='scheduled' 만 처리)

검증: ✅ / ❌

### 1-6. 실패 시나리오 (failed_reason)

의도적으로 실패 유도하는 방법:
- 옵션 A: `event_interpreters` 에서 대상 통역사 row 를 임시 제거 후 cron 실행 대기 → RPC 가
  recipient_not_interpreter 로 실패 (또는 notices INSERT 실패)
- 옵션 B: SQL Editor 에서 `notices` 테이블 권한을 일시적으로 제한 (운영에서 권장 X)
- 옵션 C: 수동 검증 생략 가능 — failed 코드패스는 단위테스트로 커버

검증 시:
1. `scheduled_notices.status = 'failed'`, `failed_reason NOT NULL`
2. admin "예약 목록" 탭에서 row 상태 = `실패` 배지 + "실패 사유" 버튼
3. 버튼 클릭 → 사유 텍스트 노출

검증: ✅ / ❌ / 생략

### 1-7. 엣지케이스 — 클라이언트 검증

1. 다이얼로그 "작성" 탭에서:
   - 빈 본문 → "예약" 클릭 → toast "메시지를 입력하세요" + POST 호출 안 됨
   - datetime 을 과거 시각(2020-01-01) → toast "과거 시각으로 예약할 수 없습니다"
2. RPC 검증 (클라 우회 시):
   - 행사 종료일 다음날 시각 → RPC `event_ended` 거부 (사용자 메시지: "행사 종료일 이후로는 예약할 수 없습니다")

검증: ✅ / ❌

### 1-8. Race — 수정 중 cron 발송

1. 수정 다이얼로그 열고 5초 머무름 (예약 시각이 막 도래한 row)
2. 그 사이 cron 이 발송 → status='sent' 전이
3. 수정 다이얼로그에서 "수정" 클릭 → RPC `not_scheduled` 거부 (사용자 메시지: "이미 발송되었거나 취소된 예약입니다")

검증: ✅ / ❌

## 2. 통역사 시나리오

### 2-1. 부분집합 노출 (recipient_user_ids 적용)

1. admin 으로 통역사 A, B 만 대상으로 예약 → 발송 완료까지 대기
2. **통역사 A 로 로그인** → `/interpreter/notice` 진입 → 해당 공지 보임
3. **통역사 C (대상 아님) 로 로그인** → `/interpreter/notice` 진입 → 해당 공지 **안 보임**
4. 사이드메뉴 unread badge:
   - A/B 에서는 +1 카운트
   - C 에서는 변화 없음

검증: ✅ / ❌

### 2-2. 기존 broadcast 회귀 (recipient_user_ids IS NULL)

1. admin 으로 기존 공지 페이지 (`/admin/events/[id]/notice`) 에서 broadcast 발송
   (target_roles 만 지정, scheduled 사용 X)
2. 통역사 A/B/C 모두에게 노출 + badge 증가
3. notice_reads INSERT 정상 (한 명이 읽음 처리 → 본인 badge 만 감소)

검증: ✅ / ❌

### 2-3. notice_reads 무결성

1. admin 이 통역사 A 만 대상으로 예약 → 발송
2. 통역사 C 가 임의로 notice_id 를 알아내 `notice_reads` INSERT 시도 (RLS 가 거부해야 함)
3. SQL Editor 에서 직접 INSERT 시도 (테스트 환경에서만):
   ```sql
   SET LOCAL ROLE authenticated;
   SET LOCAL request.jwt.claim.sub TO '<C_user_id>';
   INSERT INTO notice_reads (notice_id, user_id) VALUES ('<a_only_notice>', '<C_user_id>');
   -- 거부되어야 함 (마이그 040 의 notice_reads_insert_own 정책 강화)
   ```

검증: ✅ / ❌ / 환경 제약 시 생략

## 3. 매뉴얼 갱신

- `docs/MANUAL.md` 메시지 전송 예약 섹션 (2.9.x) 추가 완료
- `docs/manual-screenshots/` 캡쳐 4장 필요:
  - `28-attendance-message-schedule-button.png` — attendance 페이지 우측 상단 "메시지 전송 예약" 버튼
  - `29-message-schedule-dialog.png` — 작성 탭
  - `30-message-schedule-list-tab.png` — 예약 목록 탭 (상태 배지 다수)
  - `31-interpreter-notice-targeted.png` — 통역사 사이트 공지 페이지

스크린샷은 운영 환경에서 사용자가 캡쳐 후 git add.

## 4. 회귀 안전 검증

- [ ] 기존 admin 공지 페이지 (`/admin/events/[id]/notice`) broadcast 정상
- [ ] 메신저 (마이그 035~037) 정상 (관리자↔통역사 1:1)
- [ ] QR 자가 체크인 (마이그 039) 정상
- [ ] 통역사 사이드메뉴 unread badge 카운트 정확

검증: ✅ / ❌

## 5. 운영 db push + 배포 상태

- [x] 마이그 040 운영 적용 (2026-05-29)
- [x] 마이그 041 (messages retention) 운영 적용 (2026-05-29)
- [x] 마이그 042 (replica identity) 운영 적용 (2026-05-29)
- [x] pg_cron 활성화 + cron job 등록 확인 (`cron.job_run_details` 매분 흔적)
- [x] GitHub Actions 자동 배포 — S2 (commit 166ead1), S3 (commit adc31aa) success

## 6. 결과 보고

각 시나리오 결과를 issue #15 코멘트에 표 형식으로 기록:

```
| 시나리오 | 결과 | 비고 |
|---|---|---|
| 1-1 작성 | ✅ | |
| 1-2 발송 | ✅ | dispatcher 35초 지연 |
| 1-3 지금 발송 | ✅ | |
| 1-4 수정 (BLOCK #1 회귀 포함) | ✅ | recipient_user_ids 보존 확인 |
| 1-5 취소 | ✅ | |
| 1-6 실패 | 생략 | failed 코드패스는 단위테스트로 커버 |
| 1-7 엣지케이스 | ✅ | |
| 1-8 Race | ✅ | not_scheduled 거부 확인 |
| 2-1 부분집합 노출 | ✅ | |
| 2-2 broadcast 회귀 | ✅ | |
| 2-3 notice_reads 무결성 | ✅ | |
| 4 회귀 안전 | ✅ | |
```

모두 ✅ → PRD #10 close.
