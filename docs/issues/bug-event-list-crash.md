## 증상

2026-05-28 팀장 시연(`input/상담회 관련 회의 내용.txt` §3.2) 중 상담회 목록 화면이 갑자기 사라지거나 페이지가 튕기는 현상이 1회 이상 관찰됨. 회의록 인용:

> 상담회 관리 사이트는 현재 전반적으로 완성 단계에 가까운 것으로 평가되었다. 다만 회의 중 상담회 목록이 갑자기 사라지거나 화면이 튕기는 상황이 발생하여, 배포나 세션 문제 등으로 인해 일시적 오류가 발생할 수 있다는 가능성이 제기되었다.

운영 현장 행사에서 동일 현상 발생 시 운영 리스크가 크므로 사전 원인 분석 + 완화 조치 필요.

## 재현 절차

**현재 미상.** 시연 당시 정확한 클릭 시퀀스·브라우저·세션 상태가 기록되지 않음. 본 이슈의 1차 목표는 **재현 조건 확보** 이다.

## 영향 범위

- 가능성 1: admin `/admin/events` 목록 화면
- 가능성 2: 통역사 `/interpreter/events` 목록 화면
- 시연 당시 화면이 admin/interpreter 어느 쪽인지 미확정

## 원인 후보 (조사 결과, 우선순위 순)

| # | 후보 | 근거 | 심각도 |
|---|---|---|---|
| 1 | **Admin 에러 경계 부재** | `src/app/admin/error.tsx` 와 `src/app/global-error.tsx` 없음. 미포착 예외 시 blank/튕김 가능. 통역사 측은 `src/app/interpreter/error.tsx` 존재 | 중상 |
| 2 | **Supabase 인증/RLS 정책 변경 후유증** | 5월 27-28일 보안 refactor (커밋 `1bc3737`) 에서 API 인증 guard 중앙화. edge case RLS 거부 가능 | 중 |
| 3 | **AWS Lambda cold start timeout** | `middleware.ts:35-86` 인증 조회 시 네트워크 지연 → 504 가능 | 중 |
| 4 | **브라우저 캐시/세션 스토리지 충돌** | 메신저 hard delete (`7b1a634`) 후 클라이언트 메모리 상태 불일치 가능 | 중 |
| 5 | 세션 만료 | middleware 측 `/login` 리다이렉트 설계는 정상 → 단순 만료는 아님 | 낮 |
| 6 | useEffect 무한 루프 | 의존성 단순(`[]`), 구독 cleanup 있음 → 가능성 낮음 | 낮 |

`src/app/admin/events/page.tsx:22-42` = `'use client'` + `useState<Event[]>` + `useEffect(loadEvents, [])`. `setEvents(data || [])` falsy guard 있음. `.map()` 안전.

## 즉시 적용 가능한 완화책 (S0)

1. `src/app/admin/error.tsx` 신규 생성 (통역사 측 패턴 그대로 + admin 톤 한국어 메시지 + Retry 버튼)
2. `src/app/global-error.tsx` 신규 생성 (최후 폴백)
3. 두 파일 모두 client component, console.error 로깅 + Sentry 미도입이므로 일단 콘솔 + window.location.reload() 폴백

## 후속 조사 (S1)

1. **시연 브라우저 콘솔/네트워크 로그 확보** — 시연 참석자에게 스크린샷·HAR 요청 (가능 시)
2. **Supabase 쿼리 에러 로그** (Supabase Dashboard → Logs → API)
3. **AWS Lambda CloudWatch 메트릭** — 5월 28일 10:00-12:00 KST 구간 invocation·duration·error rate
4. **운영 staging 환경 재현 시도** — admin events 페이지에서 다음 시나리오 시도:
   - 세션 토큰 만료 직후 새로고침
   - 네트워크 끊김 → 복원 후 새로고침
   - 동시 2개 탭에서 로그인/로그아웃 시도
   - admin 권한 변경 직후 새로고침
5. **/api/admin/events 응답 시간** P95/P99 측정

## 슬라이스 윤곽

- **S0** 완화책 = admin/error.tsx + global-error.tsx 추가 (2시간 내)
- **S1** 후속 조사 = 시연 로그 확보 + Supabase/CloudWatch 로그 분석 (외부 데이터 의존)
- **S2** 근본 원인 fix = 원인 확정 시 별도 PR

## 출처

- 회의 원문: `input/상담회 관련 회의 내용.txt` §3.2 (2026-05-28 시연)
- 조사 보고: 2026-05-29 세션 Explore 에이전트
- 핸드오프: `docs/session-history/handoff-2026-05-29.md` "다음 세션 우선순위 2"
