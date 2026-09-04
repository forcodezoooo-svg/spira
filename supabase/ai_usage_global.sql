-- 전역(서비스 전체) 일별 AI 사용량 — 신규 유저 급증 시 비용 폭탄 방지용 상한.
-- 무료+온보딩 호출 전체를 하루 단위로 합산한다. Pro는 카운트/상한에서 제외.
-- 서버(service_role)만 접근(사용자 정책 없음).
create table if not exists public.ai_usage_global (
  day   date primary key,          -- KST 기준 날짜
  count int  not null default 0
);

alter table public.ai_usage_global enable row level security;
-- 사용자용 정책 없음 → service_role만 읽고 씀.

-- 원자적 증가: 여러 요청이 동시에 들어와도 정확히 +1 (경쟁 상태로 인한 누락 방지)
create or replace function public.incr_ai_global(p_day date)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage_global(day, count) values (p_day, 1)
  on conflict (day) do update set count = public.ai_usage_global.count + 1
  returning count;
$$;
