import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest 설정 — Next.js 공식 가이드 기반
// (node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md)
//
// 정책:
// - 테스트는 `src/**/__tests__/` 또는 `*.test.{ts,tsx}` 패턴으로 co-located
// - jsdom 환경에서 React 컴포넌트 렌더 검증
// - msw 는 setup 파일에서 server 인스턴스만 노출, 사용자는 핸들러를 케이스별로 등록
// - tsconfig paths (`@/*` → `./src/*`) 는 Vite native 옵션 `resolve.tsconfigPaths` 로 해결
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // src/ 하위만 검색 (infra/.next/.open-next 제외)
    // 통합 테스트(*.integration.test.ts) 는 docs/testing.md §5.3 정책에 따라
    // 기본 단위 트랙에서 제외 — 로컬 supabase 인스턴스를 띄운 환경에서만 실행한다.
    // 실행: `npx vitest run src/**/*.integration.test.ts`
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '.next/**',
      '.open-next/**',
      'infra/**',
      'supabase/**',
      'src/**/*.integration.test.{ts,tsx}',
    ],
    css: false,
    // Next.js App Router 의 async Server Component 는 Vitest 미지원 — E2E 로 분리
    // 외부 행동(외부에서 보이는 DOM, 네트워크 응답)만 단언, 내부 구현(state shape, private fn) 단언 금지
  },
});
