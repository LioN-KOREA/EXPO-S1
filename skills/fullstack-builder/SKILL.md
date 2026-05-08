---
name: export-consultation-fullstack
description: 수출상담회 Next.js + Supabase 풀스택 빌드 스킬
version: 1.0.0
author: Lionkorea
tags: [nextjs, supabase, fullstack, api, auth, rls]
---

# 수출상담회 풀스택 빌드 스킬

## 목적
Next.js App Router + Supabase를 활용한 풀스택 기능 구현.

## 기술 스택
- Next.js 14+ (App Router, Server Actions, Route Handlers)
- Supabase (Auth, PostgreSQL, RLS, Admin API)
- TypeScript

## 핵심 기능 모듈

### 1. 인증 (Auth)
- Supabase Auth (이메일/비밀번호)
- 미들웨어 기반 역할 라우팅
- 서버/클라이언트 Supabase 클라이언트 분리

### 2. API 라우트
- `POST /api/upload/timetable` - 타임테이블 엑셀 업로드 및 DB 저장
- `POST /api/upload/template` - 상담일지 양식 업로드
- `POST /api/upload/interpreters` - 통역사 계정 대량 생성
- `GET /api/export/reports` - 상담일지 엑셀 다운로드

### 3. Server Actions
- 상담회 CRUD
- 상담일지 저장/제출
- 상담 상태 변경

### 4. DB 스키마
- 동적 폼: JSONB 기반 양식 정의 + 데이터 저장
- 유동적 타임슬롯: 상담회별 독립적 시간 구조
- RLS: 역할 기반 데이터 접근 제어

### 5. 보안
- Supabase RLS 정책 (통역사: 자기 데이터만, Admin: 전체)
- CSRF 보호 (Next.js 내장)
- Service Role Key는 서버 사이드에서만 사용
- 환경 변수로 키 관리

## 개발 환경
- Supabase 로컬: `npx supabase start`
- Next.js 개발: `npm run dev`
- DB 관리: Supabase Studio (localhost:54323)
