'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { useToast } from '../lib/ToastContext';
import { usePlan } from '../lib/usePlan';
import { createClient } from '../lib/supabase/client';
import { useAuth } from '../components/AuthProvider';

// 요금제 페이지 (Free / Pro · 월·연). 결제(토스페이먼츠) 연동은 다음 단계에서 '구독하기' 버튼에 붙는다.
type Cycle = 'monthly' | 'yearly';

const PRICE = {
  monthly: 9900,
  yearly: 99000, // 연간 = 2개월치 할인
};

const FREE_FEATURES = [
  '워크스페이스 1개',
  '기본 AI 어시스턴트(Sparky)',
  'Plan · Goals · Resources',
  '나의 여정 지도',
];

const PRO_FEATURES = [
  '워크스페이스 무제한',
  'AI 어시스턴트 무제한 · 우선 응답',
  '여정 지도 고해상도 이미지 추출',
  '데이터 백업 · 우선 지원',
];

export default function PricingPage() {
  const { toast } = useToast();
  const { plan, refresh } = usePlan();
  const { user } = useAuth();
  const router = useRouter();
  const goHome = () => router.push('/home');
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const displayName = (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || user?.email || '계정';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const isPro = plan.tier === 'pro';
  const isCanceled = isPro && plan.status === 'canceled';
  const viewingCurrentCycle = isPro && plan.cycle === cycle; // 지금 보고 있는 주기가 '구독 중인 주기'와 같은지

  const cancelSubscription = async () => {
    if (!window.confirm('구독을 해지할까요?\n남은 기간까지는 Pro를 계속 이용할 수 있어요.')) return;
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? '해지에 실패했어요.', 'error'); return; }
      toast('구독을 해지했어요. 남은 기간까지 Pro가 유지돼요.', 'success');
      void refresh();
    } catch {
      toast('네트워크 오류가 발생했어요.', 'error');
    }
  };
  // 구독 주기 변경 '예약' (즉시 청구 X — 다음 결제일에 전환)
  const changeCycle = async () => {
    try {
      const res = await fetch('/api/billing/change-cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycle }) });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? '변경에 실패했어요.', 'error'); return; }
      toast(`다음 결제일부터 ${cycle === 'yearly' ? '연간' : '월간'}으로 전환돼요.`, 'success');
      void refresh();
    } catch { toast('네트워크 오류가 발생했어요.', 'error'); }
  };
  // 예약된 주기 변경 취소
  const cancelPendingChange = async () => {
    try {
      const res = await fetch('/api/billing/change-cycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cycle: plan.cycle }) });
      if (res.ok) { toast('전환 예약을 취소했어요.', 'success'); void refresh(); }
    } catch { /* noop */ }
  };

  const periodDate = plan.currentPeriodEnd ? new Date(plan.currentPeriodEnd).toLocaleDateString('ko-KR') : '';
  const proPrice = PRICE[cycle];
  const proPerMonth = cycle === 'yearly' ? Math.round(PRICE.yearly / 12) : PRICE.monthly;

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) { toast('결제 설정이 아직 준비되지 않았어요.', 'error'); setBusy(false); return; }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast('로그인이 필요해요.', 'error'); setBusy(false); return; }

      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: user.id });
      // 카드 등록 창 → 성공 시 successUrl 로 이동(그 페이지에서 서버 승인 처리)
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/pricing/success?cycle=${cycle}`,
        failUrl: `${window.location.origin}/pricing?billing=fail`,
        customerEmail: user.email ?? undefined,
      });
    } catch {
      // 사용자가 결제창을 닫은 경우 등 — 조용히 복구
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F8F8' }}>
      {/* 단독 헤더 — 좌: 로고(홈으로), 우: 프로필 */}
      <header className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={goHome} title="홈으로" className="flex items-center transition-transform hover:-translate-x-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Spira" className="w-8 h-auto" />
        </button>
        <button onClick={goHome} title={displayName} className="w-9 h-9 rounded-full overflow-hidden border border-neutral-200 flex items-center justify-center bg-white transition-transform hover:-translate-y-0.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="프로필" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-sm font-extrabold" style={{ background: 'var(--spira-grad-avatar)', color: '#16211E' }}>{displayName[0]?.toUpperCase() ?? 'S'}</span>
          )}
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 pt-4 pb-16">
      <div className="text-center mb-8">
        <h1 className="text-[26px] sm:text-[30px] font-black tracking-[-0.02em]" style={{ color: '#16211E' }}>더 크게 성장할 준비가 되셨나요?</h1>
        <p className="text-[14px] mt-2" style={{ color: '#5B6560' }}>Pro로 업그레이드하고 제한 없이 Spira를 활용하세요.</p>
      </div>

      {/* 월/연 토글 */}
      <div className="flex items-center justify-center mb-8">
        <div className="inline-flex items-center rounded-full p-1" style={{ backgroundColor: '#F1F1EB' }}>
          {(['monthly', 'yearly'] as Cycle[]).map(c => {
            const on = cycle === c;
            return (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className="px-5 py-2 rounded-full text-[13px] font-bold transition-colors flex items-center gap-1.5"
                style={on ? { backgroundColor: '#16211E', color: '#EDFF9F' } : { color: '#5B6560' }}
              >
                {c === 'monthly' ? '월간' : '연간'}
                {c === 'yearly' && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: on ? '#9DFE3B' : '#DDF4C4', color: '#16211E' }}>2개월 무료</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {/* Free */}
        <div className="bg-white border rounded-3xl p-7" style={{ borderColor: 'rgba(0,41,41,0.1)' }}>
          <p className="text-[14px] font-bold mb-1" style={{ color: '#5B6560' }}>Free</p>
          <p className="text-[30px] font-black mb-1" style={{ color: '#16211E' }}>₩0</p>
          <p className="text-[13px] mb-6" style={{ color: '#9AA39D' }}>부담 없이 시작하기</p>
          <ul className="space-y-2.5">
            {FREE_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-[14px]" style={{ color: '#16211E' }}>
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-7 py-3 rounded-2xl text-center text-[14px] font-bold" style={{ backgroundColor: '#F1F1EB', color: '#9AA39D' }}>{isPro ? '기본 플랜' : '현재 이용 중'}</div>
        </div>

        {/* Pro */}
        <div className="rounded-3xl p-7 relative" style={{ backgroundColor: '#16211E', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
          <span className="absolute top-6 right-6 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>추천</span>
          <p className="text-[14px] font-bold mb-1" style={{ color: '#9DFE3B' }}>Pro</p>
          <div className="flex items-end gap-1.5 mb-1">
            <p className="text-[30px] font-black" style={{ color: '#F8F8F8' }}>₩{fmt(proPrice)}</p>
            <p className="text-[14px] mb-1.5" style={{ color: '#AEB8AE' }}>/ {cycle === 'monthly' ? '월' : '년'}</p>
          </div>
          <p className="text-[13px] mb-6" style={{ color: '#AEB8AE' }}>
            {cycle === 'yearly' ? `월 ₩${fmt(proPerMonth)} 꼴 · 매년 청구` : '매월 청구 · 언제든 해지'}
          </p>
          <ul className="space-y-2.5">
            {PRO_FEATURES.map(f => (
              <li key={f} className="flex items-start gap-2 text-[14px]" style={{ color: '#F8F8F8' }}>
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" style={{ color: '#9DFE3B' }}><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {f}
              </li>
            ))}
          </ul>
          {!isPro ? (
            // 미구독 → 첫 구독(즉시 결제)
            <button
              onClick={subscribe}
              disabled={busy}
              className="mt-7 w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
            >
              {busy ? '결제창 여는 중…' : 'Pro 구독하기'}
            </button>
          ) : viewingCurrentCycle ? (
            // 구독 중인 주기를 보고 있음 → 이용 중 / 해지 / (예약된 전환 안내)
            <div className="mt-7">
              <div className="w-full py-3 rounded-2xl text-center text-[15px] font-bold" style={{ backgroundColor: 'rgba(157,254,59,0.15)', color: '#9DFE3B' }}>
                {isCanceled ? '해지 예정' : '✓ 이용 중'}{periodDate ? ` · ${periodDate}까지` : ''}
              </div>
              {isCanceled ? (
                <p className="text-center text-[12px] mt-2.5" style={{ color: '#AEB8AE' }}>기간이 끝나면 자동으로 Free로 전환돼요.</p>
              ) : plan.pendingCycle ? (
                <p className="text-center text-[12px] mt-2.5" style={{ color: '#AEB8AE' }}>
                  {periodDate ? `${periodDate}부터 ` : '다음 결제일부터 '}{plan.pendingCycle === 'yearly' ? '연간' : '월간'}으로 전환 예정 · <button onClick={cancelPendingChange} className="underline hover:opacity-80">예약 취소</button>
                </p>
              ) : (
                <button onClick={cancelSubscription} className="w-full text-[13px] font-semibold py-2 mt-1 transition-colors hover:opacity-80" style={{ color: '#AEB8AE' }}>
                  구독 해지
                </button>
              )}
            </div>
          ) : plan.pendingCycle === cycle ? (
            // 다른 주기를 보고 있는데 그게 '예약된' 주기 → 예약됨 표시
            <div className="mt-7">
              <div className="w-full py-3 rounded-2xl text-center text-[15px] font-bold" style={{ backgroundColor: 'rgba(157,254,59,0.15)', color: '#9DFE3B' }}>
                {cycle === 'yearly' ? '연간' : '월간'} 전환 예약됨{periodDate ? ` · ${periodDate}부터` : ''}
              </div>
              <button onClick={cancelPendingChange} className="w-full text-[13px] font-semibold py-2 mt-1 transition-colors hover:opacity-80" style={{ color: '#AEB8AE' }}>
                예약 취소
              </button>
            </div>
          ) : (
            // 다른 주기 + 예약 없음 → 다음 결제일에 전환 '예약'(즉시 청구 X)
            <div className="mt-7">
              <button
                onClick={changeCycle}
                className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
              >
                {cycle === 'yearly' ? '연간으로 업그레이드' : '월간으로 변경'}
              </button>
              <p className="text-center text-[12px] mt-2.5" style={{ color: '#AEB8AE' }}>지금 청구되지 않고 다음 결제일에 전환돼요.</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[12px] mt-6" style={{ color: '#C4CCC4' }}>
        결제는 토스페이먼츠로 안전하게 처리됩니다. 구독은 언제든 해지할 수 있어요.
      </p>
      </div>
    </div>
  );
}
