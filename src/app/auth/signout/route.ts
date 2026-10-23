// 로그아웃 시작 (admin 사이드바의 form POST).
// OIDC 세션이면 SSO 세션까지 끝내도록 계정관리 시스템의 end_session 으로 이동한다 — 로컬 쿠키만
// 지우면 다음 /authorize 에서 곧바로 다시 로그인된다. 비밀번호 세션은 기존처럼 /login 으로.

import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { createClient } from '@/lib/supabase/server';
import { appUrl, getLpxConfig, getOidcConfig } from '@/lib/auth/lpx';
import { endOidcSession } from '@/lib/auth/lpx-session';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let wasOidc = false;
  if (user) {
    try {
      wasOidc = await endOidcSession(supabase);
    } catch (e) {
      console.error('[lpx] OIDC 세션 종료 실패', e);
    }
  }
  await supabase.auth.signOut();

  let target = appUrl('/login');
  if (wasOidc) {
    try {
      target = oidc.buildEndSessionUrl(await getOidcConfig(), {
        post_logout_redirect_uri: getLpxConfig().postLogoutRedirectUri,
      });
    } catch (e) {
      console.error('[lpx] end_session URL 생성 실패', e);
    }
  }
  // 303: POST 뒤 GET 으로 이동
  return NextResponse.redirect(target, 303);
}
