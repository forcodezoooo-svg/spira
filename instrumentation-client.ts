import posthog from 'posthog-js';

// PostHog 단일 초기화 지점(공식 방식). 키가 없으면 조용히 no-op → 로컬/미설정 환경에서도 안전.
// 키 환경변수는 둘 중 아무 이름이나 지원(NEXT_PUBLIC_POSTHOG_KEY 권장, 마법사가 쓰는 PROJECT_TOKEN도 허용).
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (key) {
  posthog.init(key, {
    api_host: '/ingest',                // 리버스 프록시(광고차단기 회피) — next.config rewrites로 us.i.posthog.com 연결
    ui_host: 'https://us.posthog.com',  // 대시보드 링크용(US)
    person_profiles: 'identified_only', // 익명 person 남발 방지(비용·노이즈↓). 이벤트는 그대로 수집
    capture_pageview: false,            // App Router에선 PostHogProvider에서 수동 캡처
    capture_pageleave: true,
    capture_exceptions: true,
    defaults: '2026-01-30',
    debug: process.env.NODE_ENV === 'development',
  });
}
