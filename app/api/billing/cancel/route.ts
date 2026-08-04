import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

// 구독 해지 — 자동 갱신 중단 + 저장된 결제수단(빌링키) 삭제.
// 남은 기간(current_period_end)까지는 Pro 유지, 이후 자동으로 Free. (이미 낸 금액 환불은 별도)
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('user_plan')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 저장된 빌링키 삭제 → 이후 어떤 자동 청구도 불가능
    await admin.from('billing_credential').delete().eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
