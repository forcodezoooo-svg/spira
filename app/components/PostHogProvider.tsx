'use client';
import { useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useAuth } from './AuthProvider';

// 앱 라우터에선 페이지뷰가 자동으로 안 잡히므로 경로 변경 시 수동 캡처
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}

// 내부(운영자·테스트) 계정 — PostHog 수집 제외. 이메일 소문자로 추가.
const INTERNAL_EMAILS = ['joonyoung422@gmail.com'];

// 로그인 사용자를 PostHog person과 연결(로그아웃 시 분리). 내부 계정은 수집 자체를 끔.
function PostHogIdentify() {
  const { user } = useAuth();
  const prevId = useRef<string | null>(null);
  useEffect(() => {
    if (user) {
      // 내 계정(내부)은 이벤트를 아예 안 보냄 → PostHog에 안 찍힘
      if (user.email && INTERNAL_EMAILS.includes(user.email.toLowerCase())) {
        posthog.opt_out_capturing();
        return;
      }
      posthog.opt_in_capturing(); // 일반 사용자는 정상 수집(내부 브라우저에서 로그인해도 복구)
      if (prevId.current && prevId.current !== user.id) {
        posthog.reset(); // 직접 계정을 전환한 경우 이전 사용자와 연결되지 않게 초기화
      }
      posthog.identify(user.id, user.email ? { email: user.email } : undefined);
      prevId.current = user.id;
    } else if (prevId.current) {
      posthog.reset(); // 이전에 식별된 사용자가 로그아웃 → 다음 사용자와 안 섞이게 초기화
      prevId.current = null;
    }
  }, [user]);
  return null;
}

// 초기화는 instrumentation-client.ts에서 단일로 수행. 여기선 페이지뷰 캡처 + 사용자 식별만 담당.
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}><PostHogPageView /></Suspense>
      <PostHogIdentify />
      {children}
    </>
  );
}
