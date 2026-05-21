# Phase E — 통역사 페이지 작업 분해

작성: 2026-05-15
선행 의존: Phase A (백엔드 도메인 5개) + Phase B+ (마이그 + 5개 관리자 화면) **완료**
대상: 통역사 시점 8개 화면 (IP1~IP8) — BIS@T 통역사 매뉴얼/스토리보드 기반

---

## 우선순위 + 작업 분해

### E-1 (필수, 1주차) — 핵심 기능
| 화면 | 라우트 | 주요 컴포넌트 |
|---|---|---|
| IP1 대시보드 | `/interpreter` 또는 `/interpreter/events/[id]` | 헤더(상담회/날짜), 인사말, QR출석 버튼, 담당바이어 카드, 일정관리 요약 |
| IP2 일정관리 | `/interpreter/events/[id]/schedule` | 통계바, 일자/상태 필터, 스케줄 카드 리스트, 시작/종료 토글 |
| IP4 사이드메뉴 | 공통 햄버거 컴포넌트 | 프로필/QR/제출현황/공지/용어집/다른상담회/언어/로그아웃 |
| IP8 상담일지 작성 | `/interpreter/events/[id]/consultation/[id]/journal` | **멀티스텝 폼** (진척도/이전/다음/자동저장/제출모달) |

### E-2 (중요, 2주차) — 부가 기능
| 화면 | 라우트 |
|---|---|
| IP5 공지사항 | `/interpreter/notice` |
| IP7 바이어 만남확인 모달 | IP1 내부 모달 |
| IP3 무역 용어집 | `/interpreter/glossary` (정적 콘텐츠 우선) |
| IP6 QR 출석 | IP1/IP4 내부 (zxing 라이브러리) |

### E-3 (후속) — AI / 다국어
- AI 답변 생성 (IP8 세부 상담내용) — Claude API 연동, 프롬프트 설계
- 다국어 (한국어/영어) — i18n 도입
- 우수상담 UI (관리자 ReportActions.tsx) — Codex 미반영 후속

---

## 필요 백엔드 (대부분 Phase A 재사용)

### 신규 엔드포인트
```
GET  /api/interpreter/dashboard?event_id=
GET  /api/interpreter/schedule?event_id=&date=
PATCH /api/consultations/:id/status      # 시작/종료 토글
PATCH /api/consultations/:id/buyer-status # 바이어 만남상태
PATCH /api/consultation-reports/:id/draft # 자동저장 (debounce)
POST /api/consultation-reports/:id/submit
POST /api/attendance/qr-checkin           # 이미 Phase A에 스텁
GET  /api/notices/my?event_id=
GET  /api/satisfaction/forms-for-me
POST /api/satisfaction/responses
GET  /api/glossary                         # 신규 도메인 (선택)
```

### 기존 자산 활용
- `consultations.buyer_status` (Phase B+ 추가) → IP7
- `consultation_reports` (`condition`/`order` jsonb) → IP8 멀티스텝
- `attendances` + `attendance_status_logs` (Phase A) → IP6
- `notices` + `notice_reads` (Phase A) → IP5
- `satisfaction_forms` + `satisfaction_responses` (Phase A) → IP1 진입점

---

## 신규 디자인 결정 필요 항목

1. **모바일 우선 디자인** — BIS@T 매뉴얼은 모바일 화면이 핵심. EXCON 통역사 페이지도 모바일 fit
2. **상담일지 분기 로직 에디터** — 관리자측 `report_templates.fields.condition` 편집 UI (Phase E 또는 별도)
3. **QR 라이브러리** — `@zxing/library` 또는 `html5-qrcode`
4. **다국어** — 영어 추가 시점 (Phase E 또는 후속)
5. **AI 답변 생성 모델** — Claude Sonnet vs Haiku, 비용/품질

---

## 작업 순서 (위임 단위)

### Sprint 1 (E-1 핵심)
1. excon-design — IP1/IP2/IP8 시안 (모바일 우선)
2. excon-ui — 멀티스텝 폼 컴포넌트 구조 정의
3. excon-coding — IP1 + IP2 + IP4 구현 → Codex 검수
4. excon-coding — IP8 멀티스텝 폼 구현 → Codex 검수

### Sprint 2 (E-2 부가)
5. excon-coding — IP5 + IP7 + IP3 → Codex 검수
6. excon-coding — IP6 QR (zxing) → Codex 검수

### Sprint 3 (E-3 후속)
7. AI 답변 생성 (Claude API) — Anthropic SDK + 프롬프트 카드 캐싱
8. 다국어 (i18n)
9. 관리자 ReportActions 우수상담 UI

---

## 리스크 / 미해결

- 모바일 환경 테스트 (실기 또는 BrowserStack)
- QR 카메라 권한 — HTTPS 필수 (운영 CloudFront는 HTTPS ✅)
- AI 답변 비용 — 1상담 약 1k 입력 + 500 출력 토큰 추정. Claude Haiku 기준 ≈ $0.001/건
- 멀티스텝 폼 자동저장 — debounce + optimistic UI
- 통역사 권한 가드 — 본인 배정 상담만 접근 (`event_interpreters` 매핑 + RLS)

---

## 착수 조건
- Phase A + B+ 운영 배포 완료 (진우 매니저)
- 운영 검증 통과
- 사용자 OK
