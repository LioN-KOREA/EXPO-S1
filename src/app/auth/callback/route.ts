// 계정관리 시스템이 돌려보내는 redirect_uri (LPX_REDIRECT_URI 와 바이트 단위로 동일하게 등록되어 있어야 함).
// 코드 교환 → 액세스 토큰 검증 → 권한 확인 → admin 계정 연결/생성 → Supabase 세션 발급.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import * as oidc from 'openid-client';
import {
  appUrl,
  fetchUserInfo,
  flowCookie,
  getLpxConfig,
  getOidcConfig,
  revokeRefreshToken,
  verifyAccessToken,
} from '@/lib/auth/lpx';
import { provisionAdminAccount, recordOidcSession, startSupabaseSession } from '@/lib/auth/lpx-session';
import { createAdminClient } from '@/lib/supabase/admin';

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2] };

export async function GET(request: NextRequest) {
  const cookie = flowCookie();
  const redirect = (path: string) => {
    const res = NextResponse.redirect(appUrl(path));
    res.cookies.set(cookie.name, '', { ...cookie.options, maxAge: 0 });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  };
  const fail = (code: string) => redirect(`/login?error=${code}`);

  let flow: { v: string; s: string; n: string };
  try {
    flow = JSON.parse(request.cookies.get(cookie.name)?.value ?? '');
  } catch {
    // 쿠키 없음: 만료(10분), 다른 도메인에서 시작, 또는 콜백 직접 접근
    return fail('failed');
  }

  const config = getLpxConfig();
  // Lambda 뒤에서 request.url 의 host 는 내부값일 수 있으므로 등록된 redirect URI 에 쿼리만 붙인다.
  const currentUrl = new URL(config.redirectUri);
  currentUrl.search = request.nextUrl.search;

  let tokens: oidc.TokenEndpointResponse;
  let sub: string;
  try {
    tokens = await oidc.authorizationCodeGrant(await getOidcConfig(), currentUrl, {
      pkceCodeVerifier: flow.v,
      expectedState: flow.s,
      expectedNonce: flow.n,
      idTokenExpected: true,
    });
    sub = (await verifyAccessToken(tokens.access_token)).sub;
  } catch (e) {
    console.error('[lpx] 코드 교환/토큰 검증 실패', e);
    return fail('failed');
  }

  let info;
  try {
    info = await fetchUserInfo(tokens.access_token);
  } catch (e) {
    console.error('[lpx] userInfo 조회 실패', e);
    await revokeRefreshToken(tokens.refresh_token);
    return fail('failed');
  }
  if (info.sub && info.sub !== sub) {
    console.error('[lpx] userInfo sub 불일치');
    await revokeRefreshToken(tokens.refresh_token);
    return fail('failed');
  }
  if (!info.authorities.includes(config.adminAuthority)) {
    await revokeRefreshToken(tokens.refresh_token);
    return fail('forbidden');
  }

  const provisioned = await provisionAdminAccount({ sub, email: info.email, name: info.name });
  if ('error' in provisioned) {
    await revokeRefreshToken(tokens.refresh_token);
    return fail(provisioned.error);
  }

  // Supabase 세션 쿠키는 모아뒀다가 성공 응답에만 싣는다.
  const pending: CookieToSet[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          pending.push(...cookiesToSet);
        },
      },
    }
  );

  let session;
  try {
    session = await startSupabaseSession(supabase, provisioned.userId);
  } catch (e) {
    console.error('[lpx] Supabase 세션 발급 실패', e);
    await revokeRefreshToken(tokens.refresh_token);
    return fail('failed');
  }

  try {
    await recordOidcSession({ session, userId: provisioned.userId, sub, tokens });
  } catch (e) {
    // 권한 재확인 대상이 아닌 세션이 남지 않도록 즉시 끊는다.
    console.error('[lpx] oidc_sessions 기록 실패', e);
    await createAdminClient().auth.admin.signOut(session.access_token, 'local');
    await revokeRefreshToken(tokens.refresh_token);
    return fail('failed');
  }

  const res = redirect('/admin');
  pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
  return res;
}
