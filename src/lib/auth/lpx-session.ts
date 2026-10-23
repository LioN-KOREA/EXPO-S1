// 임직원 로그인(OIDC) ↔ Supabase 세션 브리지. 서버 전용.
//
// 앱의 admin 화면·API·RLS 는 전부 Supabase 세션(auth.uid())을 전제로 한다. 그래서 OIDC 로그인이
// 끝나면 같은 사용자의 일반 Supabase 세션을 발급하고, OIDC 토큰은 oidc_sessions 에 서버 전용으로
// 보관한다 (supabase_session_id 로 연결). proxy / guards 가 admin 요청마다 checkOidcSession 을 불러
// 60초마다 권한을 재확인하고, 회수·만료 시 Supabase 세션을 끊는다.
// 테이블 설명: supabase/migrations/055_oidc_employee_login.sql

import * as oidc from 'openid-client';
import * as jose from 'jose';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchUserInfo,
  getLpxConfig,
  getOidcConfig,
  isSessionEnded,
  revokeRefreshToken,
  verifyAccessToken,
} from '@/lib/auth/lpx';

const AUTHORITY_TTL_MS = 60_000; // 권한 회수 지연 = 이 값
const LEASE_MS = 30_000; // 리프레시 직렬화 lease
const REFRESH_SKEW_MS = 30_000; // 만료 30초 전부터 갱신
const OUTAGE_GRACE_MS = 5 * 60_000; // 인증 서버 일시 장애 시, 마지막 성공 확인 후 이 시간까지는 통과
const SESSION_ROW_RETENTION_MS = 2 * 24 * 60 * 60_000; // 리프레시 토큰 수명(24h)보다 넉넉히

type AuthClient = Pick<SupabaseClient, 'auth'>;

export type RevokeReason = 'forbidden' | 'session_ended' | 'oidc_required' | 'logout';

export type OidcCheck =
  | { status: 'ok' } // OIDC 세션이고 권한 확인됨
  | { status: 'not_oidc' } // 비밀번호 로그인 세션 — 기존 동작 유지
  | { status: 'revoked'; reason: RevokeReason } // Supabase 세션을 끊어야 함
  | { status: 'unavailable' }; // 인증 서버 장애가 유예시간을 넘김 — 이번 요청만 거부

/** 로그인 화면 ?error= 코드 */
export function loginErrorFor(reason: RevokeReason): string {
  return reason === 'forbidden' || reason === 'oidc_required' ? reason : 'session_ended';
}

/**
 * 현재 Supabase 세션의 session_id. 반드시 auth.getUser() 로 토큰을 검증한 뒤에 호출할 것
 * (여기서는 서명 검증 없이 디코드만 한다).
 */
export async function getSupabaseSessionId(supabase: AuthClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? sessionIdOf(session) : null;
}

function sessionIdOf(session: Session): string | null {
  try {
    const sid = jose.decodeJwt(session.access_token).session_id;
    return typeof sid === 'string' ? sid : null;
  } catch {
    return null;
  }
}

// ─── 로그인 (콜백) ────────────────────────────────────────────────────────────

export type ProvisionError = 'account_conflict' | 'not_admin' | 'failed';

/**
 * sub 로 연결된 admin 계정을 찾고, 없으면 이메일이 같은 기존 admin 에 연결하거나 새로 만든다.
 * 같은 이메일의 비-admin 계정은 승격하지 않는다 (account_conflict).
 */
export async function provisionAdminAccount(input: {
  sub: string;
  email: string | null;
  name: string | null;
}): Promise<{ userId: string } | { error: ProvisionError }> {
  const admin = createAdminClient();

  const { data: identity, error: idErr } = await admin
    .from('oidc_identities')
    .select('user_id')
    .eq('sub', input.sub)
    .maybeSingle();
  if (idErr) return fail('identity 조회', idErr);

  if (identity) {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', identity.user_id)
      .maybeSingle();
    if (error) return fail('profile 조회', error);
    // 앱 안에서 다른 역할로 바뀐 계정은 자동으로 되돌리지 않는다.
    if (profile?.role !== 'admin') return { error: 'not_admin' };
    return { userId: identity.user_id };
  }

  const email = input.email?.trim().toLowerCase();
  if (!email) return fail('userInfo 에 이메일 없음');

  const { data: existing, error: exErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();
  if (exErr) return fail('profile(email) 조회', exErr);

  if (existing) {
    if (existing.role !== 'admin') return { error: 'account_conflict' };
    const { error } = await admin
      .from('oidc_identities')
      .insert({ sub: input.sub, user_id: existing.id, provisioned_by_oidc: false });
    // 23505: 이 계정이 이미 다른 sub 에 연결됨
    if (error) return error.code === '23505' ? { error: 'account_conflict' } : fail('identity 연결', error);
    return { userId: existing.id };
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: input.name, oidc_sub: input.sub },
  });
  // 프로필 없는 auth 사용자가 같은 이메일로 이미 있음
  if (createErr || !created.user) return createErr?.status === 422 ? { error: 'account_conflict' } : fail('auth 사용자 생성', createErr);

  const userId = created.user.id;
  const { error: profileErr } = await admin.from('profiles').insert({
    id: userId,
    email,
    name: input.name?.trim() || email.split('@')[0],
    role: 'admin',
    must_change_password: false,
  });
  const { error: linkErr } = profileErr
    ? { error: profileErr }
    : await admin.from('oidc_identities').insert({ sub: input.sub, user_id: userId, provisioned_by_oidc: true });
  if (profileErr || linkErr) {
    await admin.auth.admin.deleteUser(userId); // profiles / identities 는 cascade
    return fail('admin 계정 생성', profileErr ?? linkErr);
  }
  return { userId };
}

function fail(step: string, err?: unknown): { error: 'failed' } {
  console.error(`[lpx] ${step} 실패`, err ?? '');
  return { error: 'failed' };
}

/**
 * 해당 사용자의 일반 Supabase 세션을 발급한다. generateLink 는 메일을 보내지 않고 token_hash 만
 * 돌려주며, verifyOtp 가 supabase 클라이언트의 setAll 로 세션 쿠키를 쓴다.
 */
export async function startSupabaseSession(supabase: AuthClient, userId: string): Promise<Session> {
  const admin = createAdminClient();
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId);
  if (uErr || !u.user?.email) throw uErr ?? new Error('auth 사용자 이메일 없음');

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: u.user.email,
  });
  if (linkErr) throw linkErr;

  const { data, error } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  });
  if (error || !data.session) throw error ?? new Error('Supabase 세션 발급 실패');
  return data.session;
}

export async function recordOidcSession(input: {
  session: Session;
  userId: string;
  sub: string;
  tokens: oidc.TokenEndpointResponse;
}): Promise<void> {
  const supabaseSessionId = sessionIdOf(input.session);
  if (!supabaseSessionId) throw new Error('Supabase 세션 ID 없음');
  if (!input.tokens.refresh_token) throw new Error('refresh_token 미발급');

  const admin = createAdminClient();
  const now = Date.now();
  const { error } = await admin.from('oidc_sessions').insert({
    supabase_session_id: supabaseSessionId,
    user_id: input.userId,
    sub: input.sub,
    access_token: input.tokens.access_token,
    refresh_token: input.tokens.refresh_token,
    access_token_expires_at: new Date(now + (input.tokens.expires_in ?? 300) * 1000).toISOString(),
    authority_checked_at: new Date(now).toISOString(),
  });
  if (error) throw error;

  // 오래된 행 정리 (best effort)
  await admin
    .from('oidc_sessions')
    .delete()
    .eq('user_id', input.userId)
    .lt('created_at', new Date(now - SESSION_ROW_RETENTION_MS).toISOString());
}

// ─── 요청마다 (proxy / guards) ────────────────────────────────────────────────

/** admin 역할 요청에서 호출. 권한 재확인이 필요하면 (60초) 토큰 갱신 + userInfo 조회까지 수행. */
export async function checkOidcSession(supabase: AuthClient, userId: string): Promise<OidcCheck> {
  const sid = await getSupabaseSessionId(supabase);
  if (!sid) return { status: 'not_oidc' };

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from('oidc_sessions')
    .select('*')
    .eq('supabase_session_id', sid)
    .maybeSingle();
  if (error) {
    console.error('[lpx] oidc_sessions 조회 실패', error);
    return { status: 'unavailable' };
  }

  if (!row) {
    // 비밀번호 세션. 단, 임직원 로그인으로 생성된 계정은 OIDC 로만 사용 가능 (권한 회수 우회 방지).
    const { data: identity, error: idErr } = await admin
      .from('oidc_identities')
      .select('provisioned_by_oidc')
      .eq('user_id', userId)
      .maybeSingle();
    if (idErr) return { status: 'unavailable' };
    return identity?.provisioned_by_oidc ? { status: 'revoked', reason: 'oidc_required' } : { status: 'not_oidc' };
  }

  if (row.revoked_at) return { status: 'revoked', reason: (row.revoke_reason as RevokeReason) ?? 'session_ended' };

  const now = Date.now();
  const lastChecked = Date.parse(row.authority_checked_at);
  if (now - lastChecked < AUTHORITY_TTL_MS) return { status: 'ok' };
  const withinGrace = now - lastChecked < OUTAGE_GRACE_MS;

  // lease 획득 — 같은 세션의 동시 요청 중 하나만 갱신한다.
  const nowIso = new Date(now).toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from('oidc_sessions')
    .update({ refresh_lease_until: new Date(now + LEASE_MS).toISOString() })
    .eq('id', row.id)
    .is('revoked_at', null)
    .or(`refresh_lease_until.is.null,refresh_lease_until.lt."${nowIso}"`)
    .select('*')
    .maybeSingle();
  if (claimErr || !claimed) return withinGrace ? { status: 'ok' } : { status: 'unavailable' };

  const release = (patch: Record<string, unknown> = {}) =>
    admin.from('oidc_sessions').update({ ...patch, refresh_lease_until: null }).eq('id', row.id);

  // lease 를 기다리는 사이 다른 요청이 확인을 끝냈을 수 있다.
  if (now - Date.parse(claimed.authority_checked_at) < AUTHORITY_TTL_MS) {
    await release();
    return { status: 'ok' };
  }

  try {
    let accessToken: string = claimed.access_token;
    if (!accessToken || Date.parse(claimed.access_token_expires_at) - now < REFRESH_SKEW_MS) {
      const tokens = await oidc.refreshTokenGrant(await getOidcConfig(), claimed.refresh_token);
      accessToken = tokens.access_token;
      // 회전된 리프레시 토큰은 즉시 저장 (예전 값을 다시 쓰면 세션 전체가 폐기됨)
      const { error: saveErr } = await admin
        .from('oidc_sessions')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? claimed.refresh_token,
          access_token_expires_at: new Date(now + (tokens.expires_in ?? 300) * 1000).toISOString(),
        })
        .eq('id', row.id);
      if (saveErr) console.error('[lpx] 회전된 refresh_token 저장 실패', saveErr);
    }

    const payload = await verifyAccessToken(accessToken);
    if (payload.sub !== claimed.sub) throw new Error('sub 불일치');

    const info = await fetchUserInfo(accessToken);
    if (!info.authorities.includes(getLpxConfig().adminAuthority)) {
      await revokeOidcSession(row.id, 'forbidden', claimed.refresh_token);
      return { status: 'revoked', reason: 'forbidden' };
    }

    await release({ authority_checked_at: new Date(now).toISOString() });
    return { status: 'ok' };
  } catch (e) {
    if (isSessionEnded(e)) {
      await revokeOidcSession(row.id, 'session_ended', null); // 이미 무효인 토큰 — revoke 호출 불필요
      return { status: 'revoked', reason: 'session_ended' };
    }
    // 일시 오류는 캐시하지 않는다 — 다음 요청이 다시 시도.
    console.error('[lpx] 권한 재확인 실패', e);
    await release();
    return withinGrace ? { status: 'ok' } : { status: 'unavailable' };
  }
}

async function revokeOidcSession(id: string, reason: RevokeReason, refreshToken: string | null) {
  const admin = createAdminClient();
  await admin
    .from('oidc_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: reason,
      access_token: null,
      refresh_token: null,
      refresh_lease_until: null,
    })
    .eq('id', id);
  await revokeRefreshToken(refreshToken);
}

/** 로그아웃: 현재 세션이 OIDC 세션이면 폐기하고 true. 호출부는 end_session 으로 이동해야 한다. */
export async function endOidcSession(supabase: AuthClient): Promise<boolean> {
  const sid = await getSupabaseSessionId(supabase);
  if (!sid) return false;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('oidc_sessions')
    .select('id, refresh_token, revoked_at')
    .eq('supabase_session_id', sid)
    .maybeSingle();
  if (!row) return false;
  if (!row.revoked_at) await revokeOidcSession(row.id, 'logout', row.refresh_token);
  return true;
}
