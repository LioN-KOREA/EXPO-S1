// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const AUTHORITY = '64f26421-4822-4403-8f43-6e79c86ac79b';

const authorizationCodeGrant = vi.fn();
vi.mock('openid-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('openid-client')>()),
  authorizationCodeGrant: (...a: unknown[]) => authorizationCodeGrant(...a),
}));

const fetchUserInfo = vi.fn();
const revokeRefreshToken = vi.fn();
vi.mock('@/lib/auth/lpx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/lpx')>()),
  getOidcConfig: vi.fn(async () => ({})),
  verifyAccessToken: vi.fn(async () => ({ sub: 'sub-1' })),
  fetchUserInfo: (...a: unknown[]) => fetchUserInfo(...a),
  revokeRefreshToken: (...a: unknown[]) => revokeRefreshToken(...a),
}));

const provisionAdminAccount = vi.fn();
const startSupabaseSession = vi.fn();
const recordOidcSession = vi.fn();
vi.mock('@/lib/auth/lpx-session', () => ({
  provisionAdminAccount: (...a: unknown[]) => provisionAdminAccount(...a),
  startSupabaseSession: (...a: unknown[]) => startSupabaseSession(...a),
  recordOidcSession: (...a: unknown[]) => recordOidcSession(...a),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => ({
    // verifyOtp 가 세션 쿠키를 쓰는 동작 흉내
    _write: () => opts.cookies.setAll([{ name: 'sb-test-auth-token', value: 'tok', options: { path: '/' } }]),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { signOut: vi.fn() } } }) }));

const { GET } = await import('@/app/auth/callback/route');

const FLOW = '__Host-lpx_flow';
function callback(withFlow = true) {
  const req = new NextRequest('https://context.wordcat.it.kr/auth/callback?code=c&state=s');
  if (withFlow) req.cookies.set(FLOW, JSON.stringify({ v: 'verifier', s: 's', n: 'n' }));
  return GET(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  authorizationCodeGrant.mockResolvedValue({ access_token: 'at', refresh_token: 'rt', expires_in: 300 });
  fetchUserInfo.mockResolvedValue({ sub: 'sub-1', email: 'emp@lion-korea.it.kr', name: '홍길동', authorities: [AUTHORITY] });
  provisionAdminAccount.mockResolvedValue({ userId: 'user-1' });
  startSupabaseSession.mockImplementation(async (sb: { _write: () => void }) => {
    sb._write();
    return { access_token: 'sb-at' };
  });
  recordOidcSession.mockResolvedValue(undefined);
});

describe('GET /auth/callback', () => {
  it('flow 쿠키가 없으면 코드 교환 없이 실패', async () => {
    const res = await callback(false);
    expect(res.headers.get('location')).toBe('https://context.wordcat.it.kr/login?error=failed');
    expect(authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it('PKCE verifier·state·nonce 로 코드 교환한다', async () => {
    await callback();
    const [, url, checks] = authorizationCodeGrant.mock.calls[0];
    expect(String(url)).toBe('https://context.wordcat.it.kr/auth/callback?code=c&state=s');
    expect(checks).toMatchObject({ pkceCodeVerifier: 'verifier', expectedState: 's', expectedNonce: 'n' });
  });

  it('지정 권한이 없으면 forbidden — 계정 생성·세션 발급 안 함', async () => {
    fetchUserInfo.mockResolvedValue({ sub: 'sub-1', email: 'x@y.z', name: 'X', authorities: ['some.other'] });
    const res = await callback();
    expect(res.headers.get('location')).toBe('https://context.wordcat.it.kr/login?error=forbidden');
    expect(provisionAdminAccount).not.toHaveBeenCalled();
    expect(startSupabaseSession).not.toHaveBeenCalled();
    expect(revokeRefreshToken).toHaveBeenCalledWith('rt');
    expect(res.cookies.get('sb-test-auth-token')).toBeUndefined();
  });

  it('userInfo 의 sub 가 토큰과 다르면 실패', async () => {
    fetchUserInfo.mockResolvedValue({ sub: 'someone-else', email: 'x@y.z', name: 'X', authorities: [AUTHORITY] });
    const res = await callback();
    expect(res.headers.get('location')).toBe('https://context.wordcat.it.kr/login?error=failed');
    expect(provisionAdminAccount).not.toHaveBeenCalled();
  });

  it('계정 충돌은 사유 코드를 그대로 전달', async () => {
    provisionAdminAccount.mockResolvedValue({ error: 'account_conflict' });
    const res = await callback();
    expect(res.headers.get('location')).toBe('https://context.wordcat.it.kr/login?error=account_conflict');
  });

  it('세션 기록 실패 시 Supabase 세션 쿠키를 내리지 않는다', async () => {
    recordOidcSession.mockRejectedValue(new Error('db down'));
    const res = await callback();
    expect(res.headers.get('location')).toBe('https://context.wordcat.it.kr/login?error=failed');
    expect(res.cookies.get('sb-test-auth-token')).toBeUndefined();
  });

  it('성공: /admin 으로 이동 + 세션 쿠키 설정 + flow 쿠키 삭제', async () => {
    const res = await callback();
    expect(res.headers.get('location')).toBe('https://context.wordcat.it.kr/admin');
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('tok');
    expect(res.cookies.get(FLOW)?.value).toBe('');
    expect(provisionAdminAccount).toHaveBeenCalledWith({ sub: 'sub-1', email: 'emp@lion-korea.it.kr', name: '홍길동' });
  });
});
