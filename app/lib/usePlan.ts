'use client';
import { useEffect, useState } from 'react';
import { createClient } from './supabase/client';

export type Plan = {
  tier: 'free' | 'pro';
  cycle?: 'monthly' | 'yearly';
  pendingCycle?: 'monthly' | 'yearly' | null; // 다음 결제일에 적용될 예약 주기
  status?: string;
  currentPeriodEnd?: string;
};

// 현재 로그인 사용자의 구독 플랜을 읽는다(기본 free). user_plan 테이블은 서버만 쓰고, 사용자는 읽기만 가능.
// Pro 판정 = tier가 pro이고, 만료일(current_period_end)이 없거나 아직 지나지 않음.
// status는 'active'(갱신 예정) / 'canceled'(해지 — 남은 기간까지만 유지)를 구분하기 위한 표시용.
export function usePlan() {
  const [plan, setPlan] = useState<Plan>({ tier: 'free' });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPlan({ tier: 'free' }); setLoading(false); return; }
    const { data } = await supabase
      .from('user_plan')
      .select('tier, cycle, pending_cycle, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    const active = data?.tier === 'pro'
      && (!data.current_period_end || new Date(data.current_period_end).getTime() > Date.now());
    if (active) {
      setPlan({ tier: 'pro', cycle: data!.cycle, pendingCycle: data!.pending_cycle, status: data!.status, currentPeriodEnd: data!.current_period_end });
    } else {
      setPlan({ tier: 'free' });
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return { plan, loading, refresh: load };
}
