-- AI 사용량(일별) 테이블 — 무료 플랜의 하루 대화 횟수 제한용
-- 서버(service_role)만 쓰고, 사용자는 본인 사용량 '읽기'만 가능.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,               -- KST 기준 날짜
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

drop policy if exists "read own usage" on public.ai_usage;
create policy "read own usage" on public.ai_usage
  for select to authenticated
  using (auth.uid() = user_id);
-- INSERT/UPDATE 정책 없음 → 서버(service_role)만 기록
