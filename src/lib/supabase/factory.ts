// Supabase 클라이언트 팩토리 — 향후 라우트가 공용으로 사용 가능한 진입점.
// 기존 createClient / createAdminClient 그대로 노출. 점진 마이그레이션 용도.
// "관리자 라우트는 항상 admin client" 같은 정책을 추가할 때 단일 출처.

export { createClient as getServerClient } from './server';
export { createAdminClient as getAdminClient } from './admin';
