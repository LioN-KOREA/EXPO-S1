# EXCON 테스트 가이드

S0 슬라이스(이슈 #11)로 도입된 테스트 인프라 사용법.
PRD #10 (메시지 전송 예약) S1~S4 슬라이스 및 이후 모든 신규 기능은 이 가이드를 따른다.

## 1. 스택

- **Vitest** — 테스트 러너 (Jest 호환 API, ESM 친화)
- **@testing-library/react** + **@testing-library/jest-dom** — 컴포넌트 렌더/단언
- **jsdom** — 브라우저 DOM 시뮬레이션
- **msw** — 네트워크 모킹 (Supabase REST 응답, 외부 API 등)

설정 파일:
- `vitest.config.mts` — Vitest 설정 (jsdom, globals, `@/*` 패스 매핑)
- `vitest.setup.ts` — `jest-dom` matcher 확장 + msw 서버 lifecycle

## 2. 디렉터리 컨벤션

**co-located `__tests__/` 디렉터리** 를 표준으로 채택한다.

```
src/
  app/
    interpreter/
      report/
        __tests__/
          MultiStepReportForm.test.tsx   <-- 컴포넌트 옆 __tests__/
        MultiStepReportForm.tsx
  lib/
    schedule/
      __tests__/
        compute-next-run.test.ts
      compute-next-run.ts
  test/                                  <-- 테스트 공용 유틸 (msw 등)
    msw/
      server.ts
      handlers.ts
```

- `*.test.{ts,tsx}` 또는 `*.spec.{ts,tsx}` 파일을 검색한다 (`vitest.config.mts` 의 `include` 패턴). 표준은 `.test.tsx` 이며, `.spec.*` 은 외부 라이브러리 컨벤션과의 호환을 위해 허용만 한다.
- 테스트는 항상 **테스트 대상 코드 옆** 의 `__tests__/` 하위에 둔다. 이렇게 하면 코드 이동 시 테스트도 따라간다.
- 공용 픽스처/모킹 인프라(msw 서버 등)는 `src/test/` 하위에 둔다.

## 3. 실행

```bash
npm test            # 1회 실행 (CI 와 동일)
npm run test:watch  # watch 모드 (로컬 개발용)
```

CI 는 `.github/workflows/ci.yml` 에서 PR / EXPO-S1 push 마다 다음을 순서대로 돌린다:

1. `npm ci`
2. `npx tsc --noEmit` (typecheck 회귀 차단)
3. `npm test` (Vitest 단위 테스트)

`deploy-prod.yml` 도 빌드 직전에 `npm test` 게이트를 거치므로, 테스트가 실패하면 배포 자체가 차단된다.

> Lint (`npm run lint`) 는 기존 코드베이스의 누적 부채(약 1k errors / 14k warnings)로 인해 현재 CI 게이트에서 제외돼 있다. 별도 클린업 슬라이스 후 다시 활성화한다.

## 4. 작성 원칙: 외부 행동만 테스트

> **테스트는 컴포넌트/모듈의 사용자가 관찰할 수 있는 것만 단언한다. 내부 구현을 단언하면 리팩터마다 깨진다.**

### YES — 외부에서 보이는 행동

- 사용자가 보는 DOM (`getByRole`, `getByText`, `getByLabelText`)
- 클릭/입력 후 화면 변화
- 외부 API 호출의 입력값 (msw 핸들러에서 검증)
- 함수의 입출력 (pure function)

### NO — 내부 구현

- `useState` 내부 변수명, hook 호출 순서
- private 헬퍼 함수 (외부 노출 안 한 것)
- "이 시점에 N번 렌더링됐다" 같은 React internals
- 클래스명/CSS 변수 (디자인 변경마다 깨짐)

### 예시

```tsx
// GOOD — 외부 행동
test('예약 시각이 과거면 저장 버튼이 비활성화된다', async () => {
  render(<ScheduleForm initialTime="2020-01-01T00:00" />);
  expect(screen.getByRole('button', { name: '예약 저장' })).toBeDisabled();
});

// BAD — 내부 구현
test('isPastTime state 가 true 가 된다', () => {
  // state 직접 접근은 RTL 철학에 어긋남. 사용자는 state 를 볼 수 없다.
});
```

## 5. Supabase 통합 테스트 패턴 (가이드)

> S0 단계에서는 **문서만** 제공한다. 실제 통합 테스트 헬퍼는 S1 이후 필요한 시점에 추가한다.

> 통합 테스트에서 사용하는 env 이름은 `NEXT_PUBLIC_SUPABASE_URL` (공용), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (공용), `SUPABASE_SERVICE_ROLE_KEY` (서버 전용) 로 통일한다. `.env.development.local` / GitHub Actions secrets 모두 이 이름을 사용한다.

### 5.1 service_role (관리자 권한)

서버 액션/RPC 의 로직 자체를 검증할 때 사용. RLS 를 우회하므로 **권한 검증이 필요한 시나리오에는 부적합**.

```ts
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// admin.from('messenger_messages').insert(...) — RLS 우회
```

### 5.2 impersonated 호출 (특정 사용자로 위장)

RLS 정책이 의도대로 작동하는지 검증할 때 사용. 권한 회귀 테스트의 핵심.

```ts
// 1) service_role 로 테스트용 user 발급
const { data: { user } } = await admin.auth.admin.createUser({
  email: `test-${crypto.randomUUID()}@excon.test`,
  email_confirm: true,
  user_metadata: { role: 'interpreter' },
});

// 2) 해당 user 의 access_token 발급 (admin.auth.admin.generateLink + 토큰 추출,
//    또는 signInWithPassword 로 로그인)
// 3) anon key + 토큰으로 client 생성 → RLS 가 적용된 상태로 호출
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
    auth: { persistSession: false },
  },
);

// 4) 시나리오 실행 후 admin 으로 cleanup
await admin.auth.admin.deleteUser(user!.id);
```

### 5.3 운영 정책

- **단위 테스트(Vitest jsdom)** 에서는 Supabase 를 직접 호출하지 않는다. msw 로 HTTP 응답을 모킹한다.
- **통합 테스트** 는 별도 트랙(`*.integration.test.ts`)으로 분리하고, 로컬 Supabase(`supabase start`) 에서만 돌린다.
- CI 에서는 단위 테스트만 돌린다 (Supabase 인스턴스 띄우는 비용 회피).
- 통합 테스트가 필요해지면 별도 슬라이스로 인프라(테스트용 schema 격리, fixture seeding) 를 추가한다.

## 6. msw 사용 예시

```ts
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';

test('예약 저장 API 가 호출되면 화면에 성공 토스트가 뜬다', async () => {
  server.use(
    http.post('*/rest/v1/scheduled_notices', () =>
      HttpResponse.json({ id: 'noti-1' }, { status: 201 }),
    ),
  );

  // ... user-event 로 폼 조작 후 단언
});
```

`vitest.setup.ts` 의 `onUnhandledRequest: 'error'` 정책 때문에, 핸들링하지 않은 요청은 테스트를 실패시킨다.
이로써 "의도하지 않은 네트워크 호출" 을 컴파일러처럼 잡아낸다.

## 7. 알려진 제약

- **async Server Component** 는 Vitest 미지원 (Next.js 공식 가이드 명시). E2E (Playwright 등) 로 검증한다.
- jsdom 은 `IntersectionObserver`, `matchMedia` 등 일부 브라우저 API 미구현 — 필요 시 `vitest.setup.ts` 에 polyfill 추가.

## 8. 참고

- Next.js 공식 가이드: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- [Vitest Docs](https://vitest.dev/)
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [Kent C. Dodds — Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
