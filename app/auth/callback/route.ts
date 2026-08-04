import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';

// OAuth(Google 등) 로그인 후 돌아오는 콜백 — code를 세션으로 교환하고 홈으로 이동
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/home';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
