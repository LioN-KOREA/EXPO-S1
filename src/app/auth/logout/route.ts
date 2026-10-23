// post_logout_redirect_uri (LPX_POST_LOGOUT_REDIRECT_URI 로 등록된 값).
// 계정관리 시스템에서 SSO 로그아웃이 끝나면 여기로 돌아온다. 앱 세션은 /auth/signout 에서 이미 정리됨.

import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/auth/lpx';

export function GET() {
  return NextResponse.redirect(appUrl('/login'));
}
