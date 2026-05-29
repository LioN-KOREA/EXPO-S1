import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 통합 테스트 전용 설정 — 로컬 supabase 인스턴스(`supabase start`) + .env.development.local 필요.
// docs/testing.md §5.3 정책에 따라 단위 트랙(`npm test`)과 분리.
// 실행: `npm run test:integration`
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node', // supabase-js 만 호출 — DOM 불필요
    globals: true,
    setupFiles: ['./vitest.setup.integration.ts'],
    include: ['src/**/*.integration.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', '.open-next/**', 'infra/**', 'supabase/**'],
    css: false,
    // 통합 테스트는 race 검증 등 시간 의존 → 타임아웃 여유
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
