# 수출상담회 관리 시스템 - 서버 구축 가이드

## 1. 프로젝트 개요

수출상담회에서 바이어-셀러 간 상담을 관리하는 웹 플랫폼입니다.
통역사가 상담일지를 작성하고, 관리자가 전체를 운영합니다.

### 주요 기능
- 상담회 생성 및 관리 (소프트 삭제/복구 지원)
- 타임테이블 엑셀 업로드 (프리뷰 검증 → 확인 후 저장, 트랜잭션 RPC)
- 통역사 배정 및 관리
- 상담일지 양식 동적 생성 (엑셀 기반)
- 통역사 상담일지 작성/자동저장/임시저장/제출
- 상담일지 엑셀 다운로드
- 4가지 역할별 대시보드
- 다국어 지원 (한국어/영어, 바이어는 영어 기본)
- 최초 로그인 비밀번호 변경 강제

---

## 2. 기술 스택

| 구분 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 16.2.5 |
| 언어 | TypeScript | 5.x |
| 백엔드/DB | Supabase (Auth + PostgreSQL + RLS) | 로컬 Docker |
| 스타일링 | TailwindCSS + shadcn/ui (base-ui 기반) | 4.x |
| 엑셀 처리 | xlsx (SheetJS) + ExcelJS | - |
| 아이콘 | lucide-react | - |
| 알림 | sonner (토스트) | - |
| 다국어 | 자체 구현 (Context + Dictionary) | - |
| 테마 | next-themes (다크/라이트 모드 토글) | 0.4.6 |

---

## 3. 프로젝트 구조

```
export-consultation/
├── src/
│   ├── app/                        # Next.js App Router 페이지
│   │   ├── layout.tsx              # 루트 레이아웃
│   │   ├── page.tsx                # / → /login 리다이렉트
│   │   ├── login/page.tsx          # 로그인 페이지 (한/영 전환)
│   │   ├── change-password/page.tsx # 최초 로그인 비밀번호 변경
│   │   ├── admin/                  # 관리자 페이지
│   │   │   ├── layout.tsx          # 사이드바 + 인증 체크
│   │   │   ├── page.tsx            # 대시보드 (통계, 진행률, 최근일지)
│   │   │   ├── users/page.tsx      # 사용자 관리 (CRUD, 필터, 일괄삭제)
│   │   │   └── events/
│   │   │       ├── page.tsx        # 상담회 목록 (삭제된 항목 복구)
│   │   │       ├── new/page.tsx    # 상담회 생성
│   │   │       └── [id]/
│   │   │           ├── page.tsx        # 상담회 상세 (관리 메뉴)
│   │   │           ├── timetable/      # 타임테이블 업로드 + 프리뷰 + 그리드뷰 + 통역사 배정
│   │   │           ├── interpreters/   # 통역사 엑셀 업로드 + 배정
│   │   │           ├── template/       # 상담일지 양식 업로드
│   │   │           └── reports/
│   │   │               ├── page.tsx            # 일지 목록 (필터: 전체/제출/작성중/미작성)
│   │   │               └── [consultationId]/   # 일지 상세 보기
│   │   ├── interpreter/            # 통역사 페이지
│   │   │   ├── layout.tsx          # 헤더 + 인증 체크 + i18n(ko)
│   │   │   ├── page.tsx            # 대시보드 (상담회 목록 + 진행률)
│   │   │   └── events/[id]/
│   │   │       ├── page.tsx        # 상담 목록 (날짜별 그룹핑 + 진행률)
│   │   │       └── consultation/[consultationId]/
│   │   │           └── page.tsx    # 상담일지 작성 (동적 폼 + 자동저장)
│   │   ├── seller/                 # 셀러 페이지
│   │   │   ├── layout.tsx          # i18n(ko)
│   │   │   ├── page.tsx            # 스케줄 + 일지 조회
│   │   │   └── report/[consultationId]/
│   │   │       └── page.tsx        # 일지 상세 보기 (제출완료만)
│   │   ├── buyer/                  # 바이어 페이지
│   │   │   ├── layout.tsx          # i18n(en) - 영어 기본
│   │   │   └── page.tsx            # 스케줄 조회 (영어 UI)
│   │   └── api/                    # API Routes (서버사이드)
│   │       ├── events/[id]/route.ts          # DELETE(소프트삭제) + PATCH(복구)
│   │       ├── export/reports/route.ts       # GET 엑셀 다운로드
│   │       ├── preview/timetable/route.ts    # POST 타임테이블 프리뷰 (파싱만)
│   │       ├── upload/
│   │       │   ├── timetable/route.ts        # POST 타임테이블 (RPC 트랜잭션)
│   │       │   ├── interpreters/route.ts     # POST 사용자 수동 생성
│   │       │   ├── interpreters-excel/route.ts # POST 통역사 엑셀 업로드
│   │       │   └── template/route.ts         # POST 양식 엑셀 업로드
│   │       └── users/[id]/route.ts           # DELETE 사용자 삭제
│   ├── components/
│   │   ├── admin/
│   │   │   ├── AdminSidebar.tsx    # 관리자 사이드바 네비게이션
│   │   │   ├── DeleteEventButton.tsx # 상담회 삭제 버튼 (소프트 삭제)
│   │   │   ├── ExcelUploader.tsx   # 범용 엑셀 업로더 컴포넌트
│   │   │   └── ReportsFilter.tsx   # 일지 상태 필터 (클라이언트)
│   │   ├── interpreter/
│   │   │   ├── DynamicForm.tsx     # 동적 폼 렌더러 (양식 기반)
│   │   │   └── InterpreterHeader.tsx # 공통 헤더 (언어 전환 버튼 포함)
│   │   ├── I18nWrapper.tsx         # i18n Provider 래퍼
│   │   ├── LanguageToggle.tsx      # 한/영 전환 버튼
│   │   └── ui/                     # shadcn/ui 컴포넌트
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # 브라우저용 Supabase 클라이언트
│   │   │   ├── server.ts           # 서버용 Supabase 클라이언트 (쿠키)
│   │   │   ├── admin.ts            # Service Role 클라이언트 (RLS 우회)
│   │   │   └── middleware.ts       # 인증 + 역할별 라우팅 + 비밀번호 변경 체크
│   │   ├── excel/
│   │   │   ├── timetable-parser.ts # 타임테이블 엑셀 자동 파싱
│   │   │   └── template-parser.ts  # 상담일지 양식 엑셀 파싱
│   │   ├── i18n/
│   │   │   ├── dictionaries.ts     # 한/영 번역 딕셔너리
│   │   │   └── context.tsx         # i18n Context + useI18n 훅
│   │   └── utils.ts                # 유틸 함수 (cn)
│   └── types/index.ts              # TypeScript 타입 정의
├── supabase/
│   ├── config.toml                 # Supabase 로컬 설정
│   └── migrations/
│       ├── 001_initial_schema.sql  # 초기 스키마 (9 테이블 + RLS)
│       ├── 002_security_fixes.sql  # 보안 패치 (RLS 강화)
│       ├── 003_must_change_password.sql # 비밀번호 변경 플래그
│       ├── 004_soft_delete.sql     # 소프트 삭제
│       └── 005_timetable_rpc.sql   # 트랜잭션 RPC 함수
└── .env.local                      # 환경변수
```

---

## 4. 데이터베이스 스키마

### 테이블 관계도

```
events (상담회) ─── deleted_at (소프트 삭제)
  ├── time_slots (타임슬롯)
  ├── buyers (바이어)
  ├── sellers (셀러)
  ├── event_interpreters (통역사 배정)
  ├── report_templates (일지 양식)
  └── consultations (상담 스케줄) ─── UNIQUE(time_slot_id, buyer_id)
        └── consultation_reports (상담일지) ─── submitted 후 수정 차단

profiles (사용자) ─── email UNIQUE, must_change_password
  ├── linked_buyer_id → buyers
  └── linked_seller_id → sellers
```

### 주요 테이블

| 테이블 | 설명 | 주요 필드 |
|--------|------|----------|
| `profiles` | 사용자 (Auth 연동) | id, email, name, role, language, linked_buyer_id, linked_seller_id, must_change_password |
| `events` | 상담회 | name, start_date, end_date, status, deleted_at |
| `time_slots` | 시간대 | event_id, date, start_time, end_time, slot_order |
| `buyers` | 바이어 | event_id, company_name, buyer_name, country, phone, email |
| `sellers` | 셀러(참가업체) | event_id, company_name, company_name_kr, contact_name, email |
| `consultations` | 상담 스케줄 | event_id, time_slot_id, buyer_id, seller_id, interpreter_id, status |
| `report_templates` | 일지 양식 | event_id, fields (JSONB) |
| `consultation_reports` | 일지 데이터 | consultation_id, interpreter_id, data (JSONB), submitted |
| `event_interpreters` | 통역사-상담회 매핑 | event_id, interpreter_id |

### RLS (Row Level Security) 정책

| 테이블 | SELECT | INSERT/UPDATE/DELETE |
|--------|--------|---------------------|
| profiles | 모든 인증 사용자 | 본인만 (role/linked_id/email 변경 불가) |
| events | 인증 사용자 (deleted_at IS NULL), Admin은 삭제된 것도 조회 | Admin만 |
| buyers/sellers | 모든 인증 사용자 | Admin만 (Service Role) |
| consultations | Admin: 전체, 통역사: 자기 것, 바이어/셀러: 자기 것 | Admin: 전체, 통역사: status만 변경 가능 |
| consultation_reports | Admin: 전체, 통역사: 자기 것, 셀러: 제출완료된 자기 것 | 통역사: 자기 것 (submitted=true 후 수정 차단) |
| report_templates | 모든 인증 사용자 | Admin만 |

### PostgreSQL RPC 함수

| 함수명 | 설명 |
|--------|------|
| `upload_timetable(p_event_id, p_time_slots, p_buyers, p_sellers, p_consultations)` | 타임테이블 데이터 삽입을 하나의 트랜잭션으로 처리. 중간 실패 시 전체 롤백. |

---

## 5. 4가지 사용자 역할

### Admin (관리자)
- **홈**: `/admin`
- **UI 언어**: 한국어
- 상담회 CRUD (소프트 삭제 + 복구)
- 타임테이블 엑셀 업로드 (프리뷰 → 검증 → 확인 후 저장)
- 통역사 엑셀 업로드 및 배정
- 상담일지 양식 엑셀 업로드
- 전체 상담일지 조회 (필터: 전체/제출/작성중/미작성)
- 상담일지 엑셀 다운로드
- 사용자 관리 (역할별 필터, 수동 생성, 일괄 삭제)

### Interpreter (통역사)
- **홈**: `/interpreter`
- **UI 언어**: 한국어 (영어 전환 가능)
- 배정된 상담회 목록 + 일지 진행률 확인
- 상담 목록 (날짜별 그룹핑)
- 상담일지 작성 (동적 폼) → **3초 Debounce 자동 저장** / 수동 임시 저장 / 최종 제출
- 제출 후 수정 불가 (DB 레벨 차단)

### Seller (셀러/참가업체)
- **홈**: `/seller`
- **UI 언어**: 한국어 (영어 전환 가능)
- 내 상담 스케줄 (날짜별 그룹핑, 요약 통계)
- 제출 완료된 상담일지 열람

### Buyer (바이어)
- **홈**: `/buyer`
- **UI 언어**: **영어 기본** (한국어 전환 가능)
- 내 상담 스케줄 (날짜별 그룹핑, 요약 통계)
- 상담일지 열람 불가

---

## 6. 계정 생성 및 인증

### 계정 생성 방식

| 방식 | 대상 | 비밀번호 | 최초 로그인 |
|------|------|----------|------------|
| 타임테이블 엑셀 업로드 | 바이어, 셀러 | 전화번호 뒤 4자리 | 비밀번호 변경 강제 |
| 통역사 엑셀 업로드 | 통역사 | 전화번호 뒤 4자리 | 비밀번호 변경 강제 |
| 수동 생성 (관리자 페이지) | 모든 역할 | 관리자가 직접 입력 | 변경 강제 안 함 |

### 최초 로그인 비밀번호 변경
- 엑셀로 자동 생성된 계정은 `must_change_password: true`
- 로그인 성공 시 미들웨어가 `/change-password`로 강제 리다이렉트
- 새 비밀번호 설정 완료 후 역할별 홈으로 이동
- 수동 생성 계정은 관리자가 비밀번호를 직접 설정하므로 강제 변경 안 함

---

## 7. API 라우트

| 경로 | 메서드 | 기능 | 인증 |
|------|--------|------|------|
| `/api/preview/timetable` | POST | 타임테이블 프리뷰 (파싱 + 검증만) | Admin |
| `/api/upload/timetable` | POST | 타임테이블 저장 (RPC 트랜잭션) | Admin |
| `/api/upload/interpreters` | POST | 사용자 수동 생성 (JSON) | Admin |
| `/api/upload/interpreters-excel` | POST | 통역사 엑셀 업로드 + 이벤트 배정 | Admin |
| `/api/upload/template` | POST | 상담일지 양식 엑셀 업로드 | Admin |
| `/api/export/reports` | GET | 상담일지 엑셀 다운로드 | Admin |
| `/api/events/[id]` | DELETE | 상담회 소프트 삭제 | Admin |
| `/api/events/[id]` | PATCH | 상담회 복구 | Admin |
| `/api/users/[id]` | DELETE | 사용자 삭제 (Auth + Profile) | Admin |

### 보안 사항
- 모든 API는 인증 + Admin 역할 확인
- 미들웨어에서 `/api/`, `/login`, `/change-password` 경로는 별도 처리
- 파일 업로드: 10MB 크기 제한
- 고아 계정 방지: Auth 생성 후 Profile 실패 시 Auth 자동 삭제
- 역할 화이트리스트 검증: 허용된 역할만 할당

---

## 8. 엑셀 업로드 플로우 (2단계)

### 타임테이블 업로드

```
1. [관리자] 엑셀 파일 선택
      │
2. [프리뷰 API] 파싱 + 검증
      │  → 바이어/셀러/타임슬롯 미리보기 테이블
      │  → 오류 하이라이트 (빈 필드, 중복 이메일)
      │  → 요약 통계 (N명 바이어, N개 슬롯 등)
      │
3. [관리자] "확인 후 저장" 클릭
      │
4. [업로드 API] RPC 트랜잭션 실행
      │  → 기존 데이터 삭제 + 새 데이터 삽입 (원자적)
      │  → 바이어/셀러 계정 자동 생성 (must_change_password: true)
```

### 파서 로직

**타임테이블 파서 (`timetable-parser.ts`)**
- 헤더 키워드 자동 탐지: 번호, 회사, 국가, 부스 등
- 시간 패턴 자동 인식: `HH:MM-HH:MM` 또는 `HH:MM~HH:MM`
- 빈 행 자동 건너뜀
- 날짜 자동 변환 (엑셀 시리얼 넘버 → 날짜)

**양식 파서 (`template-parser.ts`)**
- 빈 행 건너뛰고 3개 이상 데이터 있는 행을 헤더로 인식
- 라벨에서 필드 타입 자동 추론:
  - `금액`, `수량` → `number`
  - `여부`, `가능성` → `select`
  - `내용`, `비고` → `textarea`
  - 나머지 → `text`

---

## 9. 인증 및 라우팅 흐름

```
사용자 접속
  │
  ├── / → /login 리다이렉트
  │
  ├── /login (한/영 전환 가능)
  │     ├── 로그인 성공 → must_change_password 체크
  │     │     ├── true → /change-password 리다이렉트
  │     │     └── false → 역할별 홈으로 리다이렉트
  │     └── 이미 로그인 → 역할별 홈으로 리다이렉트
  │
  ├── /change-password (한/영 전환 가능)
  │     └── 비밀번호 변경 완료 → 역할별 홈으로 이동
  │
  └── /admin, /interpreter, /seller, /buyer
        ├── 미인증 → /login 리다이렉트
        ├── must_change_password → /change-password 리다이렉트
        ├── 다른 역할 경로 접근 → 자기 역할 홈으로 리다이렉트
        └── 각 layout.tsx에서 역할 2차 확인
```

### Supabase 클라이언트 사용 구분

| 클라이언트 | 용도 | RLS |
|-----------|------|-----|
| `createClient()` (client.ts) | 브라우저 컴포넌트 | 적용 |
| `createClient()` (server.ts) | 서버 컴포넌트/API | 적용 |
| `createAdminClient()` (admin.ts) | API Route (삭제/생성/RPC) | **우회** (Service Role) |

---

## 10. 다국어 (i18n) 구조

### 설계

| 역할 | 기본 언어 | 이유 |
|------|----------|------|
| Admin | 한국어 | 운영자는 한국인 |
| Interpreter | 한국어 | 통역사도 보통 한국인 |
| Seller | 한국어 | 국내 참가업체 |
| **Buyer** | **영어** | 해외 바이어 |

### 구현
- `src/lib/i18n/dictionaries.ts`: 한/영 번역 딕셔너리 (key-value 구조)
- `src/lib/i18n/context.tsx`: React Context + `useI18n()` 훅
- `src/components/I18nWrapper.tsx`: 서버 컴포넌트 → 클라이언트 Provider 래퍼
- `src/components/LanguageToggle.tsx`: 한/영 전환 버튼
- 각 역할 `layout.tsx`에서 `<I18nWrapper locale="en|ko">` 설정
- 로그인/비밀번호변경 페이지는 자체 locale 상태 관리

---

## 11. 로컬 개발 환경 설정

### 사전 요구사항
- Node.js 18+
- Docker Desktop (Supabase 로컬용)

### 설치 및 실행

```bash
# 1. 의존성 설치
npm install

# 2. Supabase 로컬 시작
npx supabase start

# 3. 환경변수 설정 (.env.local)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start에서 출력된 anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase start에서 출력된 service_role key>

# 4. DB 마이그레이션 적용 (초기 설정 또는 리셋)
npx supabase db reset

# 5. 개발 서버 시작
npm run dev
```

### Supabase 관리 도구
- **Studio** (DB 관리): http://127.0.0.1:54323
- **Mailpit** (이메일 확인): http://127.0.0.1:54324
- **DB 직접 접속**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

---

## 12. 테스트 계정

> 테스트 계정 정보는 보안을 위해 별도 파일(`TEST_ACCOUNTS.md`)에 관리합니다.
> 이 파일은 `.gitignore`에 추가하거나 비공개로 유지하세요.

---

## 13. 보안 상세

### RLS 정책 상세

**profiles 테이블 (002_security_fixes.sql)**
- 본인 UPDATE 시 화이트리스트 방식: `name`, `phone`, `language`, `must_change_password`만 변경 가능
- `role`, `email`, `linked_buyer_id`, `linked_seller_id`는 WITH CHECK에서 기존 값과 동일한지 검증 → **변경 시도 시 거부**
- 따라서 통역사가 자기 `linked_buyer_id`를 바꿔 다른 바이어의 일지를 보는 것은 **불가능**

**셀러 일지 열람 (002_security_fixes.sql)**
- `reports_select_seller` 정책: `consultations.seller_id = profiles.linked_seller_id` 조인으로 본인 상담의 제출완료 일지만 조회 가능

**RPC 함수 권한 (005_timetable_rpc.sql)**
- `upload_timetable`은 `SECURITY DEFINER`로 선언 → 함수 소유자(postgres) 권한으로 실행
- API 레이어에서 admin 역할 확인 후 Service Role(`createAdminClient`)로만 호출
- 일반 사용자가 anon key로 직접 RPC 호출해도 API를 거치지 않으면 호출 불가 (RLS가 함수 호출 자체를 차단하지는 않으나, API 레이어의 인증 체크가 방어)
- 추가 안전장치: RPC 내부에서도 호출자 권한 체크 가능 (현재는 API 레이어에서 처리)

### 비밀번호 정책
- **초기 비밀번호**: 전화번호 뒤 4자리 (관리자가 "비밀번호는 전화번호 뒤 4자리입니다"로 일괄 안내)
- **최초 로그인 시 강제 변경** (`must_change_password: true`)
- 미들웨어에서 `must_change_password` 체크 → `/change-password` 외 **모든 경로 차단** (API 포함하지 않음 - 비밀번호 변경 API 자체가 Supabase Auth의 `updateUser`)
- 수동 생성 계정은 관리자가 직접 비밀번호를 설정하므로 강제 변경 없음

---

## 14. 배포 시 주의사항

### 환경변수
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (**서버에서만 사용, 절대 노출 금지**)

### DB 마이그레이션
- `001_initial_schema.sql`: 기본 스키마 + RLS
- `002_security_fixes.sql`: 보안 패치 (역할 변경 차단, 일지 잠금 등)
- `003_must_change_password.sql`: 비밀번호 변경 플래그
- `004_soft_delete.sql`: 소프트 삭제
- `005_timetable_rpc.sql`: 트랜잭션 RPC 함수
- `006_concurrent_constraints.sql`: 셀러/통역사 동시 배정 제약
- `007_report_version.sql`: 상담일지 낙관적 락 (version 컬럼)
- `008_upload_lock.sql`: 업로드 중 이벤트 잠금 플래그
- 반드시 순서대로 적용

### 보안 체크리스트
- [ ] Service Role Key가 클라이언트에 노출되지 않는지 확인
- [ ] 최초 로그인 비밀번호 변경이 정상 동작하는지 확인
- [ ] HTTPS 적용
- [ ] Supabase 프로젝트의 RLS 정책 활성화 확인
- [ ] 소프트 삭제된 데이터 정기 정리 정책 수립
- [ ] Rate Limiting 설정 (Supabase Cloud 내장 또는 WAF)
- [ ] 에러 트래킹 설정 (Sentry 등)

---

## 15. 데이터 무결성 보호

### 동시 배정 제약
- `UNIQUE(time_slot_id, buyer_id)`: 같은 시간에 바이어 중복 상담 방지
- `UNIQUE(time_slot_id, seller_id)`: 같은 시간에 셀러 중복 상담 방지
- `UNIQUE(time_slot_id, interpreter_id)`: 같은 시간에 통역사 중복 배정 방지 (NULL 제외)

### 낙관적 락 (Optimistic Locking)
- `consultation_reports.version` 컬럼 (자동 증가 트리거 `trg_report_version`)
- 저장 시 `.eq('version', currentVersion)` 조건부 업데이트
- 다른 디바이스에서 먼저 수정했으면 충돌 감지 → "새로고침해주세요" 알림

### 업로드 잠금
- `events.is_uploading` 플래그로 동시 업로드 방지
- 업로드 시작 시 `true`, 완료/실패 시 `false`로 해제
- 다른 관리자가 동시에 업로드 시도하면 409 에러

### 재업로드 보호
- 타임테이블 재업로드 시 기존 상담일지 존재 여부 체크
- 작성중/제출완료 일지가 있으면 빨간 경고 배너 + confirm 이중 확인

### 행 수 제한
- 엑셀 파일의 바이어 수가 5,000건 초과 시 거부 (DoS 방지)

---

## 16. 운영 정책

### 시간대 (Timezone)
- 모든 시간은 **KST (Asia/Seoul)** 고정
- DB의 `time_slots.start_time`/`end_time`은 KST 기준 로컬 시간
- `TIMESTAMPTZ` 컬럼 (created_at, updated_at 등)은 UTC 저장 → 표시 시 KST 변환

### 백업 및 복구
- **로컬 개발**: `npx supabase db reset`으로 초기 상태 복구
- **운영 환경**: Supabase Cloud의 PITR (Point-in-Time Recovery) 활성화 권장
- **소프트 삭제**: 상담회는 즉시 삭제되지 않으며 복구 가능
- **정기 백업**: 운영 시 주간 단위 DB 덤프 스크립트 설정 권장

### 파일 업로드 정책
- 엑셀 파일만 허용 (.xlsx, .xls), 확장자 + Content-Type 검증
- 최대 10MB, 최대 5,000행
- 파싱 후 파일은 보관하지 않음 (메모리에서 처리 후 즉시 폐기)
- 매크로 파일(.xlsm)은 xlsx 라이브러리가 매크로를 실행하지 않으므로 안전
- 업로드 중 이벤트 잠금으로 동시 업로드 방지

### 에러 응답 포맷
```json
{
  "error": "에러 메시지 (사용자에게 표시)"
}
// 성공 시
{
  "success": true,
  "data": { ... }
}
```

---

## 17. 주요 데이터 흐름

### 상담회 운영 흐름

```
1. [관리자] 상담회 생성 (이름, 기간)
      │
2. [관리자] 타임테이블 엑셀 업로드
      │  → 프리뷰 테이블에서 데이터 검증
      │  → "확인 후 저장" 클릭
      │  → RPC 트랜잭션으로 타임슬롯/바이어/셀러/상담 일괄 생성
      │  → 바이어/셀러 계정 자동 생성 (비밀번호 변경 필수)
      │
3. [관리자] 통역사 엑셀 업로드 + 배정
      │  → 통역사 계정 생성 (비밀번호 변경 필수)
      │  → 이벤트에 배정
      │  → 타임테이블에서 상담별 통역사 배정
      │
4. [관리자] 상담일지 양식 엑셀 업로드
      │  → 동적 필드 정의 (JSONB)
      │
5. [통역사] 최초 로그인 → 비밀번호 변경
      │
6. [통역사] 상담일지 작성
      │  → 동적 폼으로 데이터 입력
      │  → 3초 Debounce 자동 저장 (네트워크 끊김 대비)
      │  → 수동 임시 저장 (여러 번 가능)
      │  → 최종 제출 (제출 후 DB 레벨에서 수정 차단)
      │
7. [관리자] 상담일지 조회 (필터) + 엑셀 다운로드
      │
8. [셀러] 제출된 상담일지 열람
      │
9. [바이어] 영어 UI로 자기 스케줄 확인
```

### 소프트 삭제 흐름

```
[관리자] 상담회 삭제
  → events.deleted_at = now() (데이터 보존)
  → 일반 조회에서 자동 제외 (RLS)
  → 상담회 목록에서 "삭제된 상담회 보기" 토글
  → "복구" 버튼 → events.deleted_at = NULL
```
