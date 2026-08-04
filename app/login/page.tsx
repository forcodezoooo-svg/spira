'use client';
import { useState } from 'react';
import { createClient } from '../lib/supabase/client';

export default function LoginPage() {
  const [supabase] = useState(() => createClient());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<'google' | 'kakao' | null>(null);

  const oauth = async (provider: 'google' | 'kakao') => {
    setMsg('');
    setBusy(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // 카카오: 이메일(사업자 인증 필요)은 요청하지 않고 닉네임만 받는다
        ...(provider === 'kakao' ? { scopes: 'profile_nickname' } : {}),
        // 구글: 매번 계정 선택 화면을 띄운다(자동 재로그인 방지 → 계정 전환 가능)
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    });
    if (error) {
      setMsg(error.message);
      setBusy(null);
    }
    // 성공 시 provider 로그인 페이지로 리다이렉트됨
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F8F8' }}>
      <div className="bg-white border rounded-[24px] px-10 py-12 flex flex-col items-center gap-7 w-[360px]" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
        <div className="flex flex-col items-center text-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Spira" className="w-11 h-auto" />
          <div>
            <h1 className="text-[24px] font-black tracking-[-0.02em] mb-0.5" style={{ color: '#16211E' }}>Spira</h1>
            <p className="text-[13px]" style={{ color: '#9AA39D' }}>1인 창업가를 위한 사업 운영 OS</p>
          </div>
        </div>

        <div className="w-full flex flex-col gap-3">
          {/* 카카오 로그인 — 1차 웹 배포에서는 숨김 (사업자 인증 후 STEP 6에서 재설정). 코드 보존.
          <button
            onClick={() => oauth('kakao')}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2.5 w-full px-4 py-3.5 rounded-xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
            style={{ backgroundColor: '#FEE500', color: '#191600' }}
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3.5C6.9 3.5 2.75 6.79 2.75 10.85c0 2.6 1.72 4.88 4.32 6.19-.19.68-.69 2.5-.79 2.89-.12.48.18.47.37.34.15-.1 2.39-1.62 3.36-2.28.65.09 1.31.14 1.99.14 5.1 0 9.25-3.29 9.25-7.35S17.1 3.5 12 3.5z" />
            </svg>
            {busy === 'kakao' ? '이동 중…' : '카카오로 계속하기'}
          </button>
          */}

          {/* 구글 */}
          <button
            onClick={() => oauth('google')}
            disabled={busy !== null}
            className="flex items-center justify-center gap-3 w-full px-4 py-3.5 bg-white border text-[15px] font-medium rounded-xl transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
            style={{ borderColor: 'var(--spira-border-strong)', color: '#16211E' }}
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {busy === 'google' ? '이동 중…' : 'Google로 계속하기'}
          </button>
        </div>

        {msg && <p className="text-[12px] text-center leading-relaxed" style={{ color: '#FF696C' }}>{msg}</p>}

        <p className="text-[11px] text-center leading-relaxed" style={{ color: '#C4CCC4' }}>
          계속하면 <a href="/terms" className="underline hover:text-neutral-500">서비스 이용약관</a>과 <a href="/privacy" className="underline hover:text-neutral-500">개인정보 처리방침</a>에<br />동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}
