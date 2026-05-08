---
name: export-consultation-frontend
description: 수출상담회 웹사이트 프론트엔드 UI/UX 디자인 스킬
version: 1.0.0
author: Lionkorea
tags: [frontend, design, nextjs, tailwind, shadcn, korean-ui]
---

# 수출상담회 프론트엔드 디자인 스킬

## 목적
수출상담회 통역사 관리 웹사이트의 고품질 UI/UX 컴포넌트를 생성합니다.

## 기술 스택
- Next.js 14+ (App Router)
- TailwindCSS v4
- shadcn/ui 컴포넌트 라이브러리
- Lucide React 아이콘
- TypeScript

## 디자인 원칙
1. **반응형 우선**: 모바일(통역사 현장 사용) → 태블릿 → 데스크톱
2. **한국어 UI**: 모든 텍스트 한국어, 날짜/시간 한국 형식
3. **역할 분리**: 관리자(진한 사이드바 + 넓은 대시보드) / 통역사(카드 기반 심플 뷰)
4. **접근성**: 충분한 대비, 큰 터치 영역, 명확한 상태 표시
5. **세련된 스타일**: 그라데이션 강조, 부드러운 그림자, 미세한 애니메이션

## 컬러 팔레트
- Primary: 남색 계열 (#1e3a5f → 신뢰감)
- Accent: 청록 (#0ea5e9 → 활력)
- Success: 초록 (#22c55e → 완료/제출)
- Warning: 주황 (#f59e0b → 진행중)
- Danger: 빨강 (#ef4444 → 미제출/주의)

## 핵심 컴포넌트 목록
- `AdminLayout`: 사이드바 + 헤더 + 콘텐츠 영역
- `InterpreterLayout`: 모바일 친화 헤더 + 콘텐츠
- `EventCard`: 상담회 카드 (상태 뱃지, 날짜, 참가자 수)
- `TimetableGrid`: 타임테이블 그리드 뷰 (시간 × 바이어 매트릭스)
- `ConsultationCard`: 개별 상담 카드 (바이어/셀러 정보, 상태)
- `DynamicForm`: JSONB 기반 동적 폼 렌더러
- `ExcelUploader`: 드래그앤드롭 엑셀 업로드
- `DataTable`: 정렬/필터/페이지네이션 테이블
- `StatsCard`: 대시보드 통계 카드

## 사용법
이 스킬은 `frontend-design` 플러그인과 함께 사용하여 각 페이지/컴포넌트를 생성합니다.
