import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

// 구독 주기 변경 '예약' — 즉시 청구하지 않고, 다음 결제일(current_period_end)에 새 주기로 청구/전환.
// 요청 주기가 현재 주기와 같으면 예약 취소(pending 해제).
export async function POST(request: Request) {
  try {
    const { cycle } = (await request.json()) as { cycle?: 'monthly' | 'yearly' };
    if (cycle !== 'monthly' && cycle !== 'yearly') {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });

    const admin = createAdminClient();
    const { data: plan } = await admin
      .from('user_plan')
      .select('tier, cycle, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!plan || plan.tier !== 'pro' || plan.status !== 'active') {
      return NextResponse.json({ error: '활성 구독이 없어요' }, { status: 400 });
    }
    const { data: cred } = await admin
      .from('billing_credential')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!cred) return NextResponse.json({ error: '저장된 결제수단이 없어요' }, { status: 400 });

    const pending = cycle === plan.cycle ? null : cycle; // 같은 주기면 예약 취소
    const { error } = await admin
      .from('user_plan')
      .update({ pending_cycle: pending, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, pendingCycle: pending });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 });
  }
}
