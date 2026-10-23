// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as oidc from 'openid-client';

const AUTHORITY = '64f26421-4822-4403-8f43-6e79c86ac79b';

// ─── 가짜 service_role 클라이언트 (eq/is 필터 + lease 조건만 흉내) ─────────────
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { oidc_sessions: [], oidc_identities: [] };

function from(table: string) {
  const filters: [string, unknown][] = [];
  let op: 'select' | 'update' | 'delete' = 'select';
  let patch: Row = {};
  let leaseCheck = false;
  const run = async () => {
    let rows = db[table].filter((r) => filters.every(([k, v]) => (r[k] ?? null) === v));
    if (leaseCheck) {
      rows = rows.filter((r) => !r.refresh_lease_until || Date.parse(r.refresh_lease_until as string) < Date.now());
    }
    if (op === 'update') rows.forEach((r) => Object.assign(r, patch));
    if (op === 'delete') db[table] = db[table].filter((r) => !rows.includes(r));
    return { data: rows[0] ?? null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push([k, v]), b),
    is: (k: string, v: unknown) => (filters.push([k, v]), b),
    or: () => ((leaseCheck = true), b),
    lt: () => b,
    update: (p: Row) => ((op = 'update'), (patch = p), b),
    delete: () => ((op = 'delete'), b),
    insert: async (r: Row) => (db[table].push(r), { error: null }),
    maybeSingle: run,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));

const fetchUserInfo = vi.fn();
const verifyAccessToken = vi.fn();
const revokeRefreshToken = vi.fn();
vi.mock('@/lib/auth/lpx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/lpx')>()),
  getOidcConfig: vi.fn(async () => ({})),
  fetchUserInfo: (...a: unknown[]) => fetchUserInfo(...a),
  verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a),
  revokeRefreshToken: (...a: unknown[]) => revokeRefreshToken(...a),
}));

const refreshTokenGrant = vi.fn();
vi.mock('openid-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('openid-client')>()),
  refreshTokenGrant: (...a: unknown[]) => refreshTokenGrant(...a),
}));

const { checkOidcSession } = await import('@/lib/auth/lpx-session');
const { LpxSessionEndedError } = await import('@/lib/auth/lpx');

// ─── helpers ──────────────────────────────────────────────────────────────────
const SID = '11111111-1111-1111-1111-111111111111';
const USER = 'user-1';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: { access_token: `${b64({ alg: 'none' })}.${b64({ session_id: SID })}.sig` } },
    }),
  },
} as never;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

function seedSession(over: Row = {}): Row {
  const row: Row = {
    id: 'row-1',
    supabase_session_id: SID,
    user_id: USER,
    sub: 'sub-1',
    access_token: 'at-old',
    refresh_token: 'rt-old',
    access_token_expires_at: fromNow(4 * 60_000),
    authority_checked_at: ago(2 * 60_000),
    refresh_lease_until: null,
    revoked_at: null,
    revoke_reason: null,
    ...over,
  };
  db.oidc_sessions.push(row);
  return row;
}

beforeEach(() => {
  db.oidc_sessions = [];
  db.oidc_identities = [];
  vi.clearAllMocks();
  verifyAccessToken.mockResolvedValue({ sub: 'sub-1' });
  fetchUserInfo.mockResolvedValue({ sub: 'sub-1', email: 'a@b.c', name: 'A', authorities: [AUTHORITY] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('checkOidcSession', () => {
  it('세션 행이 없는 비밀번호 세션은 not_oidc', async () => {
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'not_oidc' });
  });

  it('임직원 로그인으로 생성된 계정의 비밀번호 세션은 거부 (oidc_required)', async () => {
    db.oidc_identities.push({ sub: 'sub-1', user_id: USER, provisioned_by_oidc: true });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'revoked', reason: 'oidc_required' });
  });

  it('이메일로 연결된 기존 admin 의 비밀번호 세션은 유지', async () => {
    db.oidc_identities.push({ sub: 'sub-1', user_id: USER, provisioned_by_oidc: false });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'not_oidc' });
  });

  it('폐기된 세션은 사유와 함께 revoked', async () => {
    seedSession({ revoked_at: ago(1000), revoke_reason: 'forbidden' });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'revoked', reason: 'forbidden' });
  });

  it('60초 이내에 확인했으면 userInfo 를 다시 부르지 않는다', async () => {
    seedSession({ authority_checked_at: ago(10_000) });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'ok' });
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });

  it('권한이 있으면 ok + 확인 시각 갱신 + lease 해제', async () => {
    const row = seedSession();
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'ok' });
    expect(Date.now() - Date.parse(row.authority_checked_at as string)).toBeLessThan(5000);
    expect(row.refresh_lease_until).toBeNull();
  });

  it('권한이 회수되면 forbidden 으로 폐기하고 토큰을 지운다', async () => {
    const row = seedSession();
    fetchUserInfo.mockResolvedValue({ sub: 'sub-1', email: null, name: null, authorities: ['other'] });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'revoked', reason: 'forbidden' });
    expect(row.revoked_at).not.toBeNull();
    expect(row.refresh_token).toBeNull();
    expect(revokeRefreshToken).toHaveBeenCalledWith('rt-old');
  });

  it('액세스 토큰이 곧 만료되면 갱신하고 회전된 refresh_token 을 저장', async () => {
    const row = seedSession({ access_token_expires_at: fromNow(5_000) });
    refreshTokenGrant.mockResolvedValue({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 300 });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'ok' });
    expect(refreshTokenGrant).toHaveBeenCalledWith(expect.anything(), 'rt-old');
    expect(row.refresh_token).toBe('rt-new');
    expect(fetchUserInfo).toHaveBeenCalledWith('at-new');
  });

  it('갱신이 invalid_grant 면 재시도 없이 session_ended', async () => {
    const row = seedSession({ access_token_expires_at: ago(1000) });
    const err = Object.assign(Object.create(oidc.ResponseBodyError.prototype), { error: 'invalid_grant' });
    refreshTokenGrant.mockRejectedValue(err);
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'revoked', reason: 'session_ended' });
    expect(row.revoked_at).not.toBeNull();
  });

  it('userInfo 401 도 session_ended', async () => {
    seedSession();
    fetchUserInfo.mockRejectedValue(new LpxSessionEndedError('401'));
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'revoked', reason: 'session_ended' });
  });

  it('일시 오류: 유예시간 안이면 통과, 실패는 캐시하지 않는다', async () => {
    const row = seedSession({ authority_checked_at: ago(2 * 60_000) });
    const checkedAt = row.authority_checked_at;
    fetchUserInfo.mockRejectedValue(new Error('userInfo 500'));
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'ok' });
    expect(row.authority_checked_at).toBe(checkedAt);
    expect(row.refresh_lease_until).toBeNull();
    expect(row.revoked_at).toBeNull();
  });

  it('일시 오류: 유예시간(5분)을 넘기면 unavailable', async () => {
    seedSession({ authority_checked_at: ago(10 * 60_000) });
    fetchUserInfo.mockRejectedValue(new Error('userInfo 500'));
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'unavailable' });
  });

  it('다른 요청이 lease 를 잡고 있으면 갱신하지 않는다 (동시 갱신 금지)', async () => {
    seedSession({ refresh_lease_until: fromNow(20_000), access_token_expires_at: ago(1000) });
    expect(await checkOidcSession(supabase, USER)).toEqual({ status: 'ok' });
    expect(refreshTokenGrant).not.toHaveBeenCalled();
    expect(fetchUserInfo).not.toHaveBeenCalled();
  });
});
