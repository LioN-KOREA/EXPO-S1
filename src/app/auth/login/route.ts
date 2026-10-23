// [임직원 로그인] — 계정관리 시스템의 /authorize 로 최상위 이동시킨다.
// code_verifier / state / nonce 는 시도마다 새로 만들어 HttpOnly 쿠키에 보관 (콜백에서 검증).

import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { appUrl, flowCookie, getLpxConfig, getOidcConfig } from '@/lib/auth/lpx';

export async function GET() {
  let config: oidc.Configuration;
  try {
    config = await getOidcConfig();
  } catch (e) {
    console.error('[lpx] discovery 실패', e);
    return NextResponse.redirect(appUrl('/login?error=failed'));
  }

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: getLpxConfig().redirectUri,
    scope: 'openid',
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  const res = NextResponse.redirect(authorizationUrl);
  const cookie = flowCookie();
  res.cookies.set(cookie.name, JSON.stringify({ v: codeVerifier, s: state, n: nonce }), cookie.options);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
