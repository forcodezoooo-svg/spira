'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// 토스 카드 등록 성공 후 리다이렉트되는 페이지.
// 쿼리(authKey·customerKey·cycle)를 서버(/api/billing/confirm)로 넘겨 빌링키 발급 + 첫 결제 + Pro 활성화.
function SuccessInner() {
  const params = useSearchParams();
  const [state, setState] = useState<'processing' | 'done' | 'error'>('processing');
  const [msg, setMsg] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const authKey = params.get('authKey');
    const customerKey = params.get('customerKey');
    const cycle = params.get('cycle');
    if (!authKey || !customerKey || !cycle) { setState('error'); setMsg('결제 정보가 올바르지 않아요.'); return; }
    (async () => {
      try {
        const res = await fetch('/api/billing/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authKey, customerKey, cycle }),
        });
        const data = await res.json();
        if (!res.ok) { setState('error'); setMsg(data.error ?? '결제 처리에 실패했어요.'); return; }
        setState('done');
      } catch {
        setState('error'); setMsg('네트워크 오류가 발생했어요.');
      }
    })();
  }, [params]);

  return (
    <div className="max-w-md mx-auto py-20 text-center">
      {state === 'processing' && (
        <>
          <div className="w-12 h-12 mx-auto mb-5 rounded-full border-[3px] border-neutral-200 border-t-[#9DFE3B] animate-spin" />
          <p className="text-[15px] font-semibold" style={{ color: '#5B6560' }}>결제를 확인하고 있어요…</p>
        </>
      )}
      {state === 'done' && (
        <>
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-[22px] font-black mb-2" style={{ color: '#16211E' }}>Pro 구독이 시작됐어요!</h1>
          <p className="text-[14px] mb-8" style={{ color: '#5B6560' }}>이제 Spira의 모든 기능을 제한 없이 사용하실 수 있어요.</p>
          <Link href="/home" className="inline-block px-6 py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>홈으로 가기</Link>
        </>
      )}
      {state === 'error' && (
        <>
          <div className="text-5xl mb-4">😢</div>
          <h1 className="text-[22px] font-black mb-2" style={{ color: '#16211E' }}>결제를 완료하지 못했어요</h1>
          <p className="text-[14px] mb-8" style={{ color: '#FF696C' }}>{msg}</p>
          <Link href="/pricing" className="inline-block px-6 py-3 rounded-2xl text-[15px] font-bold" style={{ backgroundColor: '#F1F1EB', color: '#16211E' }}>요금제로 돌아가기</Link>
        </>
      )}
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto py-20 text-center text-[15px]" style={{ color: '#9AA39D' }}>불러오는 중…</div>}>
      <SuccessInner />
    </Suspense>
  );
}
