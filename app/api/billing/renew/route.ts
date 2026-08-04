import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase/admin';

// 자동 갱신(정기결제) — Vercel Cron이 매일 호출. 기간이 만료된 활성 구독을 빌링키로 재청구하고 다음 기간으로 연장.
// 예약된 주기 변경(pending_cycle)이 있으면 이번 결제부터 그 주기로 청구/전환.
const PRICE = { monthly: 9900, yearly: 99000 } as const;
type Cycle = keyof typeof PRICE;
const TOSS_API = 'https://api.tosspayments.com/v1';

function tossAuthHeader() {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error('TOSS_SECRET_KEY 누락');
  return 'Basic ' + Buffer.from(`${secret}:`).toString('base64');
}

export async function GET(request: Request) {
  // Vercel Cron 인증: CRON_SECRET 설정 시 Authorization: Bearer 로 전달됨
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from('user_plan')
    .select('user_id, cycle, pending_cycle, current_period_end')
    .eq('status', 'active')
    .eq('tier', 'pro')
    .lte('current_period_end', nowIso);

  const results: Record<string, unknown>[] = [];

  for (const row of due ?? []) {
    const { data: cred } = await admin
      .from('billing_credential')
      .select('billing_key, customer_key')
      .eq('user_id', row.user_id)
      .maybeSingle();
    if (!cred) { results.push({ user: row.user_id, skipped: 'no billing key' }); continue; }

    const nextCycle = ((row.pending_cycle ?? row.cycle) ?? 'monthly') as Cycle;
    const amount = PRICE[nextCycle];
    const orderId = `spira-renew-${String(row.user_id).slice(0, 8)}-${Date.now()}`;

    try {
      const res = await fetch(`${TOSS_API}/billing/${cred.billing_key}`, {
        method: 'POST',
        headers: { Authorization: tossAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerKey: cred.customer_key,
          amount,
          orderId,
          orderName: `Spira Pro (${nextCycle === 'monthly' ? '월간' : '연간'})`,
        }),
      });
      const charge = await res.json();
      if (!res.ok || charge.status !== 'DONE') {
        await admin.from('user_plan').update({ status: 'past_due', updated_at: nowIso }).eq('user_id', row.user_id);
        results.push({ user: row.user_id, failed: charge?.message ?? 'charge failed' });
        continue;
      }
      // 다음 기간 = 이전 종료일(또는 지금) + 1주기
      const base = row.current_period_end ? new Date(row.current_period_end) : new Date();
      if (base.getTime() < Date.now()) base.setTime(Date.now());
      if (nextCycle === 'monthly') base.setMonth(base.getMonth() + 1);
      else base.setFullYear(base.getFullYear() + 1);

      await admin.from('user_plan').update({
        cycle: nextCycle,
        pending_cycle: null,
        status: 'active',
        current_period_end: base.toISOString(),
        updated_at: nowIso,
      }).eq('user_id', row.user_id);
      results.push({ user: row.user_id, charged: amount, cycle: nextCycle });
    } catch (e) {
      results.push({ user: row.user_id, error: e instanceof Error ? e.message : 'error' });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
