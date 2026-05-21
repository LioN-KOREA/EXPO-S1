# 2026-05-15 ~ 05-16 세션 기록

## 프로젝트
export-consultation (EXPO-S1 / EXCON 수출상담회 웹사이트, branch `EXPO-S1`)

## 한 줄 요약
Phase A 백엔드 도메인 5개 + Phase B+ 관리자 신규 5개 화면(+카테고리/접기) + 양식·일지 보강 + Phase E 통역사 사이트 풀 빌드(3라운드) + QR/마이그 028 보안 + 키오스크 모드까지 하루에 다 끝낸 대형 세션.

## 사용자가 시작한 요청
참고 사이트(BIS@T 0514 캡처) 스토리보드를 EXCON에 단계별 이식. Phase A부터 차례로 — 백엔드 도메인 → 관리자 화면 → 통역사 사이트 → 보안 검수 → 키오스크.

---

## 주요 결정사항

### 1. 운영 백엔드 = E1A (NestJS 폐기 확정)
- **결정자**: 진우 매니저 (2026-05-15)
- **사실**: `LioN-KOREA/E1A` (AWS Lambda + SAM) repo가 운영 백엔드. `excon-backend/` NestJS는 죽음.
- **근거**: Postgres RLS 규칙이 너무 많아 join/subquery에서 무한 recursion 빈발 (016/017 마이그가 그 증거). 권한 검사를 Lambda 단으로 옮겨 디버깅·테스트 가능하게 분리.
- **영향**: Phase A에서 만든 NestJS 4개 모듈(attendance/satisfaction/notice/message)은 **E1A로 이식 필요** (Phase F 작업).
- **메모리**: `project_backend_e1a.md`, `project_framework_migration.md` 갱신 완료.

### 2. git 워크플로
- Claude가 commit + push, 진우 매니저가 빌드(WSL OpenNext) + Pulumi up 하면 운영 반영.
- 오늘 6+ commit push 완료 (LioN-KOREA/EXPO-S1, branch `EXPO-S1`).
- 메모리 `feedback_git_workflow.md` 이미 있음 (변경 X).

### 3. Phase E 통역사 사이트 = BIS@T 패턴 모방
- 0515 통역사 사이트 스토리보드 `input/` 폴더 정리됨.
- 8개 화면 (IP1~IP8) 중 IP6 QR 스캔 / IP3 용어집 일부는 스텁.
- 멀티스텝 폼 + 조건분기 (`condition.equals` 또는 `condition.in`) 패턴 채택.

### 4. 양식 파서 패턴 확정
- 엑셀 헤더 라벨 끝 `*` → `required=true`
- `order` = 헤더 컬럼 순서 자동
- 분기 조건은 엑셀로 표현 X — **GUI 편집기 (TemplateEditor)** 사용

### 5. 키오스크 모드는 별도 라우트
- 인포데스크 디스플레이용 풀스크린 + 60초 자동 초기화.
- 개인정보 노출 금지 (이름·연락처 X, 부스/회사명만).

---

## 완료 작업 (시간순)

### Phase A — 백엔드 도메인 5개 (NestJS, E1A 이식 대기)
- `019_attendance.sql` 마이그
- `020_event_options.sql`
- `021_satisfaction.sql`
- `022_notice.sql`
- `023_message_system.sql`
- NestJS 모듈 4개 신규 (excon-backend/) — git 안 함, E1A 이식 대상

### Phase B+ — 관리자 신규 5개 화면 + 카테고리
- 마이그 `024_consultations_buyer_status.sql` / `025_report_template_branching.sql` / `026_report_status_excellent.sql`
- 신규 라우트:
  - `/admin/events/[id]/attendance`
  - `/admin/events/[id]/operate`
  - `/admin/events/[id]/settings`
  - `/admin/events/[id]/infodesk`
  - `/admin/events/[id]/notice`
- AdminSidebar 11개 메뉴 → 4카테고리 그룹화
- Breadcrumb + `events/[id]/layout.tsx` 신규
- 이벤트 상세 11카드 `<details><summary>` 접기/펼치기

### 양식 + 일지 보강
- `ReportActions`: 우수상담 지정 + 승인 취소
- `ReportsFilter`: excellent 탭 + 카운트
- `reports/page.tsx`: KPI 4종 (BIS@T P9 모방)
- 타임테이블: status 배지 (상담중/완료)
- 양식 파서: 라벨 `*` → required + order 자동
- `TemplateEditor`: GUI 양식 편집기 (필드 추가/조건분기/순서)

### Phase E — 통역사 사이트 (3라운드)
**라운드 1**:
- `InterpreterSideMenu` 신규
- IP1 대시보드 강화 (오늘 일정/미작성/공지)
- IP5 공지사항 리스트
- IP7 `BuyerStatusModal` (참석/연락처)

**라운드 2**:
- IP2 일정관리 신규
- `ConsultationScheduleCard` (시작/종료 토글)

**라운드 3**:
- `MultiStepReportForm` (조건분기 in 다중값 지원)
- 1초 자동저장 (debounce)
- 제출 모달
- AI 답변 스텁 (실제 연동은 Phase 후속)
- 마이그 `027_report_template_condition_in.sql`

### QR 시스템
- `html5-qrcode` + `QrScannerModal` (통역사 스캔용)
- `qrcode` + `QrIssueButton` (관리자 발급/인쇄)

### 마이그 028 — Codex 보안 검수 6건 일괄 fix
1. `profiles` admin UPDATE 정책
2. `satisfaction_responses` 불변필드 트리거
3. `notice_reads` INSERT 강화
4. `validate_notice_target_roles` PL/pgSQL 안전
5. `upload_timetable` `search_path` 고정
6. FK `ON DELETE SET NULL`

### MultiStepReportForm 검토 step
- `visible+1`로 검토 step 추가 (제출 직전 전체 답변 확인)

### 인포데스크 키오스크
- `InfodeskKioskClient`: 풀스크린 + 60초 자동 초기화
- 개인정보 안 노출 (부스/회사명만)

---

## 미완료 / 보류 (다음 세션)

- **i18n 실제 컴포넌트 적용** — dictionary는 ko/en 확장됐으나 컴포넌트에서 `t.xxx` 사용 X. 통역사 사이트부터 우선.
- **Next.js client-side Supabase → E1A API 전환 (Phase F)** — `supabase.from(...)` 직접 호출 점진 제거. E1A `EventsAPIOps.ts` 패턴.
- **Phase A NestJS 4개 모듈 → E1A 이식** (Phase F 일부)
- **AI 답변 생성 실제 연동** — 현재 스텁만. 모델 선정 + 비용/지연시간 검토 필요.
- **멀티스텝 폼 → admin 양식 미리보기** — 양식 편집 후 미리보기로 통역사 시점 확인하는 기능.

---

## 새로 학습한 룰 / 주의점

### 사용자 선호 패턴 (이번 세션 재확인)
- **큰 변경 보고 → OK → 진행** (Phase 단위로 끊어 보고)
- **Codex 검수 반드시** (마이그 028이 그 결과물)
- **분할 commit 선호** (오늘 6+ commit, Phase별로 분리)
- **모바일 우선** (통역사 화면)
- **사이드바 카테고리 그룹화 + 접기/펼치기** (선호 확인)
- **빨간 점 / 배지** 등 시각적 표시 선호
- **키오스크 모드 의식** (현장 디스플레이 — 개인정보 노출 금지)

### 마이그 컨벤션
- 하루에 019~028까지 10개 진행. NNN_description.sql (3자리) 컨벤션 유지.
- 보안 검수 결과는 **하나의 마이그(028)에 묶음** — 마이그 폭증 방지.

---

## 환경 / 맥락

### 신규 의존성
- `html5-qrcode` (통역사 QR 스캔)
- `qrcode` (관리자 QR 발급/인쇄)

### 로컬 Supabase 시드 (유지됨)
- admin: `admin@test.com / test1234`
- interpreter: `interpreter@test.com / test1234`
- 테스트 이벤트 id: `11111111-1111-1111-1111-111111111111`
- 양식 12개 필드 + 조건분기 시드됨

### 마이그 적용 상태
- 로컬: 019~028 적용 완료
- 클라우드: **진우 매니저 supabase db push 필요** (오늘 push한 commit과 함께)

---

## 사용자 피드백 패턴 (다음 세션 주의)
- 라운드/Phase 단위로 보고 받는 거 좋아함 (작업 끝나고 한 번에 다 보고 X)
- "키오스크 모드" "현장" 키워드 나오면 → 개인정보 노출 여부 즉시 점검
- 통역사 화면은 모바일 우선, 관리자 화면은 데스크톱 우선
- BIS@T 스토리보드는 **참고**일 뿐 — 100% 모방 X, 우리 도메인 맞게 조정

---

## 다음 세션 시작할 때 할 일

1. **진우 매니저 배포 상태 확인**
   - 오늘 push한 commit (Phase A~E 전체) AWS 반영됐는지
   - 마이그 019~028 클라우드 적용됐는지
2. **i18n 컴포넌트 적용 시작** — 통역사 사이트(IP1~IP8)부터
3. **Phase F 시작** — E1A repo에 attendance/satisfaction/notice/message 4개 도메인 이식
4. (사용자 확인 필요) AI 답변 생성 모델 선정 — Claude / GPT / 한국어 특화 중 어디?
5. (사용자 확인 필요) MultiStepReportForm admin 미리보기 기능 우선순위

---

## 참고

### 관련 메모리 (전부 갱신 완료)
- `project_export_consultation.md` — Phase A/B+/E 추가 필요 (이 세션 후 갱신)
- `project_backend_e1a.md` — E1A 운영 백엔드 사실 정리됨
- `project_framework_migration.md` — NestJS 폐기 명시됨
- `feedback_git_workflow.md` — Claude commit/push, 매니저 배포

### 신규 라우트 정리
- 관리자: `/admin/events/[id]/{attendance,operate,settings,infodesk,notice}`
- 통역사: `/interpreter/{dashboard,schedule,report/[id],notice,buyer/[id]}`
- 키오스크: `/kiosk/infodesk/[eventId]` (풀스크린)

### 신규 마이그 (10개)
019_attendance / 020_event_options / 021_satisfaction / 022_notice / 023_message_system / 024_consultations_buyer_status / 025_report_template_branching / 026_report_status_excellent / 027_report_template_condition_in / 028_security_audit_fixes

### 신규 핵심 컴포넌트
- `AdminSidebar` (4카테고리)
- `Breadcrumb`
- `TemplateEditor` (GUI 양식 편집기)
- `InterpreterSideMenu`
- `BuyerStatusModal`
- `ConsultationScheduleCard`
- `MultiStepReportForm` (조건분기 + 자동저장 + 검토 step)
- `QrScannerModal` / `QrIssueButton`
- `InfodeskKioskClient`
