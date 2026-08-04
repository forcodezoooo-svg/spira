-- 구독 플랜 저장 테이블 (Supabase SQL Editor 에서 1회 실행)
-- 보안 원칙: 플랜 상태는 '서버(결제 승인)'만 씀. 사용자는 자기 플랜을 '읽기'만 가능.
--           빌링키(결제 수단)는 사용자가 아예 접근 못 하는 별도 테이블에 보관.

-- 1) 사용자 플랜 (사용자 읽기 허용 — 민감정보 없음)
create table if not exists public.user_plan (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  tier               text not null default 'free' check (tier in ('free', 'pro')),
  cycle              text check (cycle in ('monthly', 'yearly')),
  status             text not null default 'active' check (status in ('active', 'canceled', 'past_due')),
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.user_plan enable row level security;

-- 본인 플랜 '조회'만 허용. INSERT/UPDATE 정책은 두지 않음 → 사용자는 쓰기 불가(서버 service_role만 가능).
drop policy if exists "read own plan" on public.user_plan;
create policy "read own plan" on public.user_plan
  for select to authenticated
  using (auth.uid() = user_id);

-- 2) 결제 수단(빌링키) — 사용자 접근 정책 전혀 없음 → service_role(서버)만 접근
create table if not exists public.billing_credential (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  billing_key  text not null,
  customer_key text not null,
  card_company text,
  card_number  text,          -- 마스킹된 번호만(토스가 마스킹해서 줌)
  updated_at   timestamptz not null default now()
);

alter table public.billing_credential enable row level security;
-- 정책을 만들지 않음 → authenticated 사용자는 select/insert/update 모두 불가. service_role만 접근 가능.
