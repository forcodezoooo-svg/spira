-- 프로그램 피드백 수집 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 1회 실행하세요.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  type       text not null check (type in ('bug', 'feature', 'inquiry')),
  message    text not null,
  page       text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- 로그인 사용자는 '자신의' 피드백만 남길 수 있음
drop policy if exists "insert own feedback" on public.feedback;
create policy "insert own feedback" on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 본인이 남긴 피드백만 조회 (전체 조회는 관리자 service_role 로만)
drop policy if exists "read own feedback" on public.feedback;
create policy "read own feedback" on public.feedback
  for select to authenticated
  using (auth.uid() = user_id);

-- 관리자 조회용 인덱스
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
