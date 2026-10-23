import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkOidcSession, loginErrorFor } from '@/lib/auth/lpx-session';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  interpreter: '/interpreter',
  buyer: '/buyer',
  seller: '/seller',
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const path = request.nextUrl.pathname;

  // 루트 → 로그인
  if (path === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 임직원 로그인(OIDC) 라우트 — 자체적으로 처리
  if (path.startsWith('/auth/')) {
    return supabaseResponse;
  }

  // 로그인/API/비밀번호변경은 인증 불필요 (또는 별도 처리)
  if (path === '/login' || path.startsWith('/api/') || path === '/change-password') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (path === '/login' && user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const home = ROLE_HOME[profile?.role || ''];
        if (home) return NextResponse.redirect(new URL(home, request.url));
      }
    } catch { /* ignore */ }
    return supabaseResponse;
  }

  // 보호된 경로
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL('/login', request.url));

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.redirect(new URL('/login', request.url));

    const role = profile.role;

    // 임직원 로그인 세션: 60초마다 계정관리 시스템 권한 재확인. 회수·만료 시 세션 종료.
    if (role === 'admin') {
      const check = await checkOidcSession(supabase, user.id);
      if (check.status === 'revoked') {
        await supabase.auth.signOut();
        const res = NextResponse.redirect(new URL(`/login?error=${loginErrorFor(check.reason)}`, request.url));
        supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
      if (check.status === 'unavailable') {
        // /login 으로 보내면 로그인 상태라 다시 /admin 으로 돌아와 루프가 되므로 503 으로 응답
        return new NextResponse('인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30' },
        });
      }
    }

    const rolePrefix = `/${role}`;

    // 자기 역할 경로가 아니면 자기 홈으로 리다이렉트
    if (!path.startsWith(rolePrefix)) {
      const home = ROLE_HOME[role];
      if (home) return NextResponse.redirect(new URL(home, request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}
