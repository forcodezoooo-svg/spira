'use client';
import { useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useAuth } from './AuthProvider';

// 앱 라우터에선 페이지뷰가 자동으로 안 잡히므로 경로 변경 시 수동 캡처
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();
  useEffect(() => {
    if (!pathname || !ph) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    ph.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, ph]);
  return null;
}

// 로그인 사용자를 PostHog person과 연결(로그아웃 시 분리)
function PostHogIdentify() {
  const { user } = useAuth();
  const ph = usePostHog();
  const prevId = useRef<string | null>(null);
  useEffect(() => {
    if (!ph) return;
    if (user) {
      ph.identify(user.id, user.email ? { email: user.email } : undefined);
      prevId.current = user.id;
    } else if (prevId.current) {
      ph.reset(); // 이전에 식별된 사용자가 로그아웃 → 다음 사용자와 안 섞이게 초기화
      prevId.current = null;
    }
  }, [user, ph]);
  return null;
}

let inited = false;

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || inited) return; // 키 없으면(로컬 등) 아무것도 안 함
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only', // 익명 person 남발 방지(비용·노이즈↓). 이벤트는 그대로 수집됨
      capture_pageview: false,            // App Router에선 위에서 수동 캡처
      capture_pageleave: true,
    });
    inited = true;
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}><PostHogPageView /></Suspense>
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}
