-- 구독 주기 '예약 변경'을 위한 컬럼 추가 (이미 user_plan 테이블이 있는 경우 이 파일을 실행)
-- pending_cycle: 다음 결제일에 적용할 주기 (예: 월간 → '연간으로 업그레이드' 예약)
alter table public.user_plan
  add column if not exists pending_cycle text check (pending_cycle in ('monthly', 'yearly'));
