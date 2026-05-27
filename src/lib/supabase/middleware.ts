import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
