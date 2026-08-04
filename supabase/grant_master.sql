-- 마스터 계정(결제 없이 모든 기능 = 영구 Pro) 지정
-- 아래 이메일을 마스터로 쓸 계정 이메일로 바꾼 뒤 Supabase SQL Editor에서 실행하세요.
-- current_period_end = null → 만료 없음(영구), 자동갱신 크론도 건드리지 않음(청구 안 됨).

insert into public.user_plan (user_id, tier, cycle, status, current_period_end)
select id, 'pro', 'yearly', 'active', null
from auth.users
where email = 'joonyoung422@gmail.com'   -- ← 마스터로 지정할 이메일
on conflict (user_id) do update
  set tier = 'pro', status = 'active', current_period_end = null;

-- (해제하려면: 아래를 실행)
-- update public.user_plan set tier = 'free', status = 'active', current_period_end = null, cycle = null
-- where user_id = (select id from auth.users where email = 'joonyoung422@gmail.com');
