'use client';
import { useEffect, useState } from 'react';
import { createClient } from './supabase/client';

export type Plan = {
  tier: 'free' | 'pro';
  cycle?: 'monthly' | 'yearly';
  status?: string;
  currentPeriodEnd?: string;
};

// 현재 로그인 사용자의 구독 플랜을 읽는다(기본 free). user_plan 테이블은 서버만 쓰고, 사용자는 읽기만 가능.
export function usePlan() {
  const [plan, setPlan] = useState<Plan>({ tier: 'free' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) { setPlan({ tier: 'free' }); setLoading(false); } return; }
      const { data } = await supabase
        .from('user_plan')
        .select('tier, cycle, status, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && data.tier === 'pro' && data.status === 'active') {
        setPlan({ tier: 'pro', cycle: data.cycle, status: data.status, currentPeriodEnd: data.current_period_end });
      } else {
        setPlan({ tier: 'free' });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { plan, loading };
}
