# 진우 매니저 배포 요청 — Phase A + B+ + E

요청 시점: 2026-05-15 (갱신)
대상: 진우 매니저 (`jinwoo@lion-korea.com`)
요청자: 박태준
브랜치: `LioN-KOREA/EXPO-S1` (branch `EXPO-S1`)

## 요약
EXCON 운영 사이트에 **Phase A 백엔드 도메인** + **Phase B+ 관리자 5개 신규 화면** + **Phase E 통역사 사이트 전체 강화** 배포 필요. 분할 commit 4개로 push 완료.

---

## 배포 범위

### Commit 1 — Supabase 마이그레이션 9건
`85aa64c feat: Supabase 마이그레이션 019~027`

| 마이그 | 내용 |
|---|---|
| 019_attendance | 출석 + 상태로그 (8단계 상태, 5근태평가) |
| 020_event_options | events.options jsonb |
| 021_satisfaction | 사전 설문 폼/응답 |
| 022_notice | 공지사항 + 읽음 트래킹 + validate 함수 |
| 023_message_system | 카카오/SMS 템플릿 + 로그 (시스템 구조만) |
| 024_consultations_buyer_status | 통역사용 바이어 만남확인 컬럼 |
| 025_report_template_branching | 양식 분기/순서 메타 검증 함수 |
| 026_report_status_excellent | 우수상담 상태 추가 |
| 027_report_template_condition_in | 조건분기 in 다중값 지원 |

### Commit 2 — 관리자 운영 화면 5종 + 사이드바
`3214197 feat: 관리자 운영 화면 5종 + 사이드바 카테고리 그룹화 + 브레드크럼`

신규 페이지: `/admin/events/[id]/{attendance,operate,settings,infodesk,notice}`
신규 API: `/api/attendance`, `/api/events/[id]/options`, `/api/notice`
UI: AdminSidebar 4카테고리 (분석/준비/운영/기록), Breadcrumb, 11개 카드 그룹화

### Commit 3 — 일지 우수상담 + 타임테이블 상태 + 양식 파서
`a1e3016 feat: 상담일지 우수상담/승인취소 + KPI + 타임테이블 상태 배지 + 양식 파서 확장`

- ReportActions: 우수상담 지정 / 승인 취소
- ReportsFilter: 우수상담 탭 / viewMode 그룹핑
- KPI 4종 (수출상담액/계약추진액/총 일지/승인·우수·미작성)
- 타임테이블: 상담중/완료 배지
- 양식 파서: 라벨 `*` → required, order 자동

### Commit 4 — 통역사 사이트 강화
`f8fd838 feat: 통역사 사이트 강화`

신규 페이지: `/interpreter/{notice,glossary,events/[id]/schedule}`
신규 컴포넌트: InterpreterSideMenu, BuyerCardList, BuyerStatusModal, ConsultationScheduleCard, MultiStepReportForm, QrAttendButton
강화: 인사말 + QR + 담당 바이어 카드 + 일정관리 진입 + 멀티스텝 일지 + 상담 시작/종료 토글 + 1초 자동저장

---

## 배포 절차

### Step 1 — 마이그레이션 적용 (운영 Supabase)
```
cd export-consultation
npx supabase db push
```
또는 Supabase Dashboard SQL Editor 019 → 020 → 021 → 022 → 023 → 024 → 025 → 026 → 027 순서.

**025 적용 직후** (운영 데이터 점검 후):
```sql
ALTER TABLE report_templates VALIDATE CONSTRAINT report_templates_fields_valid_chk;
```

### Step 2 — Next.js 빌드 + Pulumi up
```
cd export-consultation
npm install   # 변경 없으면 생략
npm run build
```
Pulumi up (CloudFront/S3/Lambda SSR).

---

## 검증 체크리스트 (배포 후)

### 관리자
- [ ] 사이드바 카테고리 그룹화 (분석/준비/운영/기록)
- [ ] 브레드크럼 표시 (상담회 관리 > 이벤트명 > 페이지)
- [ ] 이벤트 상세 11개 카드 + 접기/펼치기
- [ ] `/admin/events/[id]/attendance` 진입 + 8단계 상태 배지
- [ ] `/admin/events/[id]/operate` 진입 + 10초 polling + status 배지
- [ ] `/admin/events/[id]/settings` 옵션 토글 5종
- [ ] `/admin/events/[id]/infodesk` 참가자 검색
- [ ] `/admin/events/[id]/notice` 발송 + 보낸함 + 읽음 통계
- [ ] 상담일지 조회 페이지 KPI 4종 표시
- [ ] 상담일지 검토 페이지 우수상담 지정 / 승인 취소 버튼
- [ ] 타임테이블 셀에 상담중/완료 배지

### 통역사
- [ ] `/interpreter` 진입 (햄버거 + 빨간 점)
- [ ] 사이드 메뉴 드로어 (QR/제출현황/공지/용어집/다른상담회)
- [ ] 이벤트 상세: 인사말 + QR + 담당 바이어 카드 + 일정관리 진입
- [ ] 바이어 카드 클릭 → 만남확인 모달 (7개 상태)
- [ ] 일정관리 페이지: 시작/종료 토글
- [ ] 상담일지 페이지: 멀티스텝 폼 + 진척도 + 조건분기
- [ ] 자동저장 1초 (작성 후 1초 뒤 "X시X분 저장됨" 표시)
- [ ] 제출 모달 ("제출 후 수정 불가")

### 기존 회귀
- [ ] 대시보드/일지 목록/등록/타임테이블/통역사 배정/양식 정상

---

## 운영 URL
- 프론트: `https://d3ckhtcgsvrhp0.cloudfront.net`
- DB: Supabase Project (운영)
- repo: `LioN-KOREA/EXPO-S1` branch `EXPO-S1`

## 리스크 & 롤백
- 마이그레이션 모두 **추가만** (027 함수 교체 제외)
- 025/026 CHECK 제약 — 기존 데이터가 새 enum 외 값 가지면 실패. NOT VALID 적용으로 신규 row만 검증
- 022 notice — validate_notice_target_roles 함수 사전 필요 (마이그에 포함)
- 롤백 시: 마이그 역순 DDL + 이전 빌드 재배포

## E1A 백엔드 통합
- Phase A NestJS 모듈 4개는 **현재 commit에 포함 X** (excon-backend는 git X)
- E1A repo (`LioN-KOREA/E1A`)로 이식 별도 작업 (Phase F)
- Next.js client-side Supabase 호출 → E1A 호출 전환도 Phase F

---
연락처: 박태준 (`ptj@lion-korea.com`, 010-4786-7881)
