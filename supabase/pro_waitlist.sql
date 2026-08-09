-- 유료 플랜 출시 알림 대기자 (무료 제한에 걸린 유저가 '알림 받기'를 누르면 저장)
create table if not exists public.pro_waitlist (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  reason     text,       -- 어떤 제한에서 신청했는지(ai_limit / workspace / autofill 등)
  created_at timestamptz not null default now()
);

alter table public.pro_waitlist enable row level security;

drop policy if exists "insert own waitlist" on public.pro_waitlist;
create policy "insert own waitlist" on public.pro_waitlist for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own waitlist" on public.pro_waitlist;
create policy "update own waitlist" on public.pro_waitlist for update to authenticated using (auth.uid() = user_id);
drop policy if exists "read own waitlist" on public.pro_waitlist;
create policy "read own waitlist" on public.pro_waitlist for select to authenticated using (auth.uid() = user_id);
-- 전체 명단은 관리자(service_role)로 조회
