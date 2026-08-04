import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

// 토스 자동결제(빌링) 승인 → 첫 결제 → Pro 구독 활성화.
// 흐름: 프론트에서 카드 등록(requestBillingAuth) 성공 → authKey/customerKey 받음 → 이 라우트로 전달.
const PRICE = { monthly: 9900, yearly: 99000 } as const;
type Cycle = keyof typeof PRICE;

const TOSS_API = 'https://api.tosspayments.com/v1';

function tossAuthHeader() {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error('TOSS_SECRET_KEY 누락');
  // Basic base64("{secretKey}:")  — 비밀번호는 빈 값
  return 'Basic ' + Buffer.from(`${secret}:`).toString('base64');
}

export async function POST(request: Request) {
  try {
    const { authKey, customerKey, cycle } = (await request.json()) as {
      authKey?: string; customerKey?: string; cycle?: Cycle;
    };
    if (!authKey || !customerKey || !cycle || !(cycle in PRICE)) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    // 1) 로그인 사용자 확인 — customerKey가 실제 본인인지 검증(타인 대신 결제/활성화 방지)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
    if (customerKey !== user.id) {
      return NextResponse.json({ error: '결제 정보가 일치하지 않아요' }, { status: 403 });
    }

    // 2) 빌링키 발급 (authKey → billingKey)
    const issueRes = await fetch(`${TOSS_API}/billing/authorizations/issue`, {
      method: 'POST',
      headers: { Authorization: tossAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
    });
    const issue = await issueRes.json();
    if (!issueRes.ok) {
      return NextResponse.json({ error: issue?.message ?? '카드 등록에 실패했어요' }, { status: 400 });
    }
    const billingKey: string = issue.billingKey;

    // 3) 첫 결제 승인
    const amount = PRICE[cycle];
    const orderId = `spira-${user.id.slice(0, 8)}-${Date.now()}`;
    const chargeRes = await fetch(`${TOSS_API}/billing/${billingKey}`, {
      method: 'POST',
      headers: { Authorization: tossAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerKey,
        amount,
        orderId,
        orderName: `Spira Pro (${cycle === 'monthly' ? '월간' : '연간'})`,
        customerEmail: user.email ?? undefined,
      }),
    });
    const charge = await chargeRes.json();
    if (!chargeRes.ok || charge.status !== 'DONE') {
      return NextResponse.json({ error: charge?.message ?? '결제 승인에 실패했어요' }, { status: 400 });
    }

    // 4) 서버(service_role)로 구독 상태 기록 — 사용자는 이 값을 직접 못 씀
    const admin = createAdminClient();
    const now = new Date();
    const end = new Date(now);
    if (cycle === 'monthly') end.setMonth(end.getMonth() + 1);
    else end.setFullYear(end.getFullYear() + 1);

    await admin.from('billing_credential').upsert({
      user_id: user.id,
      billing_key: billingKey,
      customer_key: customerKey,
      card_company: issue.card?.company ?? null,
      card_number: issue.card?.number ?? null,
      updated_at: now.toISOString(),
    });
    const { error: planErr } = await admin.from('user_plan').upsert({
      user_id: user.id,
      tier: 'pro',
      cycle,
      status: 'active',
      current_period_end: end.toISOString(),
      updated_at: now.toISOString(),
    });
    if (planErr) {
      return NextResponse.json({ error: '구독 저장에 실패했어요: ' + planErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tier: 'pro', cycle, currentPeriodEnd: end.toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
