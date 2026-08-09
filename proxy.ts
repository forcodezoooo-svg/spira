import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// (Next.js 16: middleware → proxy 규칙)
// 모든 요청에서 Supabase 세션을 갱신하고, 비로그인 사용자는 /login 으로 보낸다.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // 공개 경로: 랜딩('/') · 로그인 · OAuth 콜백 · 약관/개인정보 · SEO/공유용 메타(OG 이미지·사이트맵·robots).
  const isPublicRoute = path === '/' || path === '/login' || path.startsWith('/auth') || path === '/terms' || path === '/privacy'
    || path.startsWith('/opengraph-image') || path.startsWith('/twitter-image') || path === '/sitemap.xml' || path === '/robots.txt';

  // 로그인 안 했는데 공개 경로가 아니면 → 로그인으로
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  // 로그인 했는데 랜딩/로그인 페이지면 → 앱 홈으로
  if (user && (path === '/' || path === '/login')) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return response;
}

export const config = {
  // 정적 파일·이미지·API는 제외
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
