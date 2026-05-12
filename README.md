# EXCON - 수출상담회 관리 플랫폼

수출상담회에서 바이어-셀러 간 상담을 관리하는 웹 플랫폼입니다.
통역사가 상담일지를 작성하고, 관리자가 전체를 운영합니다.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + TailwindCSS + shadcn/ui
- **Backend**: Supabase (Auth + PostgreSQL + RLS)
- **배포**: AWS CloudFront + S3 + Lambda (OpenNext)

## 사용자 역할

| 역할 | 경로 | 주요 기능 |
|------|------|----------|
| **관리자** | `/admin` | 상담회 CRUD, 사용자 관리, 타임테이블, 통역사 배정, 상담일지 승인/반려, 대시보드 |
| **통역사** | `/interpreter` | 상담일지 작성/자동저장/제출, 수정요청 대응 |
| **셀러** | `/seller` | 스케줄 조회 + 제출완료 일지 열람 |
| **바이어** | `/buyer` | 스케줄 조회 + 요약통계 (영어 UI) |

## 주요 기능

- **사용자 관리**: 엑셀 일괄등록 (바이어/셀러/통역사 통합), 수동 생성, 수정, 삭제
- **타임테이블**: 엑셀 업로드, 4개 뷰 (바이어/부스/통역사/셀러), 셀 클릭 수정 (검색 드롭다운)
- **상담일지**: 6단계 상태 (작성전 → 작성중 → 검토중 → 승인/수정요청/반려), 3초 자동저장, 낙관적 락
- **대시보드**: 총 수출상담액, 상담일지 현황, 거래가능성, 실적순위 (금액 기준), 국가별 성과지표
- **엑셀 양식 다운로드**: 사용자/타임테이블/통역사/상담일지 양식
- **국가 코드**: ISO 3166-1 약 200개국 지원
- **다국어**: 한국어/영어 (바이어는 영어 기본)
- **테마**: 다크/라이트 모드 전환

## 로컬 개발

### 사전 요구사항

- Node.js 18+
- Docker Desktop (로컬 Supabase 사용 시)

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 로컬 Supabase 시작 (Docker 필요)
npx supabase start

# 개발 서버 실행
npm run dev
```

http://localhost:3000 에서 접속

### 환경변수

```bash
# .env.local (로컬 개발)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

### Supabase CLI

```bash
# 로그인
npx supabase login --token <토큰>

# 프로젝트 링크
npx supabase link --project-ref <project_ref>

# 마이그레이션 적용 (클라우드)
npx supabase db push

# 로컬 DB 초기화
npx supabase db reset
```

## DB 마이그레이션

| # | 파일 | 내용 |
|---|------|------|
| 1 | 001_initial_schema.sql | 기본 스키마 + RLS |
| 2 | 002_security_fixes.sql | RLS 강화 |
| 3 | 003_must_change_password.sql | 비밀번호 변경 플래그 |
| 4 | 004_soft_delete.sql | 소프트 삭제 |
| 5 | 005_timetable_rpc.sql | 트랜잭션 RPC |
| 6 | 006_concurrent_constraints.sql | 동시 배정 제약 |
| 7 | 007_report_version.sql | 낙관적 락 |
| 8 | 008_upload_lock.sql | 업로드 잠금 |
| 9 | 009_report_status.sql | 상담일지 6단계 상태 |
| 10 | 010_consultation_memo.sql | 상담 메모/비고 |
| 11 | 011_report_rejected.sql | 반려 상태 추가 |
| 12 | 012_profiles_company_country.sql | 회사명/국가/추가정보 |
| 13 | 013_rejected_rls_fix.sql | 반려 재작성 RLS |
| 14 | 014_rls_remove_submitted_from_update.sql | 제출 후 수정 차단 |

## 프로젝트 구조

```
src/
├── app/
│   ├── admin/          # 관리자 페이지
│   ├── interpreter/    # 통역사 페이지
│   ├── seller/         # 셀러 페이지
│   ├── buyer/          # 바이어 페이지
│   ├── api/            # API 라우트
│   ├── login/          # 로그인
│   └── change-password/# 비밀번호 변경
├── components/
│   ├── admin/          # 관리자 컴포넌트
│   ├── interpreter/    # 통역사 컴포넌트
│   └── ui/             # 공통 UI (shadcn)
├── lib/
│   ├── supabase/       # Supabase 클라이언트
│   ├── excel/          # 엑셀 파서
│   ├── constants/      # 국가 코드 등 상수
│   ├── utils/          # 유틸리티
│   └── i18n/           # 다국어
└── types/              # TypeScript 타입
supabase/
└── migrations/         # DB 마이그레이션 (14개)
```

## 배포

AWS CloudFront + S3 + Lambda (OpenNext 기반)

```
CloudFront → S3 (정적 파일)
           → Lambda SSR (서버 렌더링)
           → Lambda Image (이미지 최적화)
```

배포 인프라 코드: `infra/` (Pulumi)
