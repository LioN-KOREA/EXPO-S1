// 라이온코리아 계정관리 시스템 (OIDC provider) 프로토콜 계층.
// 연동안내서: /라이온코리아-계정관리시스템-연동안내서.md, /SKILL.md
//
// - 프로토콜은 openid-client 가 처리 (authorization code + PKCE S256, public client).
// - 액세스 토큰 검증은 jose (kid 로 키 선택 / RS256 고정 / iss·aud·token_use·exp).
// - 권한(authority)은 토큰에 없으므로 /lpx/auth/userInfo 로 조회한다.
// 서버 전용 — 브라우저 번들에 포함되면 안 된다.

import * as oidc from 'openid-client';
import * as jose from 'jose';

export interface LpxConfig {
  discoveryUrl: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  adminAuthority: string;
}

// 관리자 콘솔(앱 클라이언트 관리 → 연동 정보)에서 받은 값. 환경별(로컬 등)로 env 로 덮어쓴다.
export function getLpxConfig(): LpxConfig {
  return {
    discoveryUrl:
      process.env.LPX_DISCOVERY_URL || 'https://accounts.lion-korea.it.kr/.well-known/openid-configuration',
    clientId: process.env.LPX_CLIENT_ID || '40lhje2m38pkobqfru376si1pd',
    redirectUri: process.env.LPX_REDIRECT_URI || 'https://context.wordcat.it.kr/auth/callback',
    postLogoutRedirectUri:
      process.env.LPX_POST_LOGOUT_REDIRECT_URI || 'https://context.wordcat.it.kr/auth/logout',
    adminAuthority: process.env.LPX_ADMIN_AUTHORITY || '64f26421-4822-4403-8f43-6e79c86ac79b',
  };
}

/** 앱의 공개 origin 기준 절대 URL. Lambda 뒤에서는 request.url 의 host 가 내부값일 수 있어 redirect URI 를 기준으로 삼는다. */
export function appUrl(path: string): URL {
  return new URL(path, getLpxConfig().redirectUri);
}

/**
 * /auth/login → /auth/callback 사이에 PKCE verifier·state·nonce 를 보관하는 HttpOnly 쿠키.
 * https 에서는 __Host- 접두사로 형제 서브도메인(*.wordcat.it.kr)의 쿠키 덮어쓰기를 막는다.
 * SameSite=Lax: 인증 서버에서 돌아오는 최상위 GET 이동에는 전송된다.
 */
export function flowCookie() {
  const secure = getLpxConfig().redirectUri.startsWith('https://');
  return {
    name: secure ? '__Host-lpx_flow' : 'lpx_flow',
    options: { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: 600 },
  };
}

let configPromise: Promise<oidc.Configuration> | null = null;

/** discovery 결과는 프로세스 단위로 캐시. 실패는 캐시하지 않는다. */
export function getOidcConfig(): Promise<oidc.Configuration> {
  if (!configPromise) {
    const { discoveryUrl, clientId } = getLpxConfig();
    // 클라이언트 시크릿 없음 — public client, PKCE 가 증명을 담당.
    configPromise = oidc.discovery(new URL(discoveryUrl), clientId, undefined, oidc.None()).catch((e) => {
      configPromise = null;
      throw e;
    });
  }
  return configPromise;
}

let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

async function getJwks() {
  if (!jwks) {
    const { jwks_uri } = (await getOidcConfig()).serverMetadata();
    if (!jwks_uri) throw new Error('discovery 문서에 jwks_uri 가 없습니다');
    // 5분 캐시. 모르는 kid 는 jose 가 쿨다운을 두고 한 번 다시 받는다.
    jwks = jose.createRemoteJWKSet(new URL(jwks_uri), { cacheMaxAge: 300_000 });
  }
  return jwks;
}

export type LpxAccessTokenPayload = jose.JWTPayload & { sub: string };

export async function verifyAccessToken(token: string): Promise<LpxAccessTokenPayload> {
  const { issuer } = (await getOidcConfig()).serverMetadata();
  const { payload } = await jose.jwtVerify(token, await getJwks(), {
    issuer,
    audience: getLpxConfig().clientId,
    algorithms: ['RS256'], // 고정 — 토큰 헤더가 알고리즘을 고르게 두지 않는다
    clockTolerance: 60,
  });
  if (payload.token_use !== 'access') throw new Error('액세스 토큰이 아닙니다');
  if (!payload.sub) throw new Error('액세스 토큰에 sub 가 없습니다');
  return payload as LpxAccessTokenPayload;
}

export interface LpxUserInfo {
  sub: string | null;
  email: string | null;
  name: string | null;
  authorities: string[];
}

/** 토큰이 더 이상 유효하지 않음 (invalid_grant, userInfo 401) — 재시도하지 말고 로그아웃시킨다. */
export class LpxSessionEndedError extends Error {}

export function isSessionEnded(e: unknown): boolean {
  return (
    e instanceof LpxSessionEndedError ||
    (e instanceof oidc.ResponseBodyError && e.error === 'invalid_grant')
  );
}

/** 계정관리 시스템 자체 엔드포인트. 권한 목록은 여기서만 얻을 수 있다. 실패는 throw (호출부에서 캐시 금지). */
export async function fetchUserInfo(accessToken: string): Promise<LpxUserInfo> {
  const { issuer } = (await getOidcConfig()).serverMetadata();
  const res = await fetch(`${issuer.replace(/\/$/, '')}/lpx/auth/userInfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (res.status === 401) throw new LpxSessionEndedError('userInfo 401');
  if (!res.ok) throw new Error(`userInfo ${res.status}`);
  const data = (await res.json())?.data ?? {};
  return {
    sub: typeof data.lkAccountSub === 'string' ? data.lkAccountSub : null,
    email: typeof data.lkAccountEmail === 'string' ? data.lkAccountEmail : null,
    name: typeof data.lkAccountName === 'string' ? data.lkAccountName : null,
    authorities: Array.isArray(data.authorities) ? data.authorities : [],
  };
}

/** 리프레시 체인 폐기 (best effort). SSO 세션은 유지된다 — 로그아웃은 end_session 으로. */
export async function revokeRefreshToken(refreshToken: string | null | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    await oidc.tokenRevocation(await getOidcConfig(), refreshToken, { token_type_hint: 'refresh_token' });
  } catch (e) {
    console.error('[lpx] refresh token revoke 실패', e);
  }
}
