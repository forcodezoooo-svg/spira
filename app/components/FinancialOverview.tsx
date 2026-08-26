'use client';
import { useStore } from '../lib/useStore';
import { computeFinancialSummary, periodActuals } from '../lib/finance';
import type { FinancialPlan } from '../lib/types';

const won = (n: number) => `${n < 0 ? '−' : ''}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// §21 Overview — 현재 자금 상태 + 핵심 Forecast를 한눈에
export default function FinancialOverview({ onGoPlan }: { onGoPlan: () => void }) {
  const store = useStore();
  const plans: FinancialPlan[] = store.financialPlans;
  const plan = plans.find(p => p.status === 'active') ?? plans[0] ?? null;
  const bizName = store.data.workspace?.name ?? '내 비즈니스';
  const goals = store.data.plan.goals ?? [];
  const subscriptions = store.data.subscriptions ?? [];
  const entries = store.data.resources ?? [];

  if (!plan) {
    return (
      <div className="rounded-[20px] border p-8 text-center" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <p className="text-[14px] font-bold mb-1" style={{ color: '#16211E' }}>재무계획을 먼저 세워보세요</p>
        <p className="text-[12px] mb-4" style={{ color: '#9AA39D' }}>현재 자금과 목표를 입력하면, 실제 투자 가능한 금액과 예상 보유자금을 계속 계산해줘요.</p>
        <button onClick={onGoPlan} className="text-[13px] font-bold rounded-full px-4 py-2" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>재무계획 만들기</button>
      </div>
    );
  }

  const s = computeFinancialSummary(plan, subscriptions, goals);
  const today = todayStr();
  const toNow = periodActuals(entries.filter(e => e.date <= today), plan.startDate, plan.endDate);
  const currentFunds = s.startingFunds + toNow.income - toNow.expense; // 지금 실제 보유(추정)
  const committed = s.operating + s.allocated; // 이미 약속된 지출(운영비+배분)
  // Financial Health: 예상 보유자금이 Reserve를 얼마나 웃도는지
  const health = s.forecastEndingCash >= s.reserve * 1.2 ? { label: '여유', bg: '#E4F5E0', color: '#3E6B1F' }
    : s.forecastEndingCash >= s.reserve ? { label: '적정', bg: '#EAF3FF', color: '#2B62C4' }
    : s.forecastEndingCash >= 0 ? { label: '주의', bg: '#FCF6EC', color: '#96631A' }
    : { label: '위험', bg: '#FFF1F1', color: '#C0392B' };

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px]" style={{ color: '#5B6560' }}>{label}</span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: color ?? '#16211E' }}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border p-5" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff', boxShadow: 'var(--spira-shadow)' }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[12px] font-semibold" style={{ color: '#9AA39D' }}>{bizName} · 현재 보유 자금</span>
          <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5" style={{ backgroundColor: health.bg, color: health.color }}>{health.label}</span>
        </div>
        <p className="text-[30px] font-black tabular-nums leading-tight" style={{ color: '#16211E' }}>{won(currentFunds)}</p>
        <div className="grid grid-cols-2 gap-x-6 mt-3 pt-3 border-t" style={{ borderColor: 'var(--spira-border-subtle)' }}>
          <Row label="이 기간 수익" value={`+${won(toNow.income)}`} color="#3E7A2E" />
          <Row label="이 기간 지출" value={`−${won(toNow.expense)}`} color="#C0392B" />
          <Row label="약속된 지출" value={won(committed)} />
          <Row label="Reserve" value={won(s.reserve)} color="#96631A" />
        </div>
      </div>

      <div className="rounded-[20px] border-2 p-4" style={{ borderColor: '#DDF4C4', backgroundColor: '#FAFDF3' }}>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold" style={{ color: '#3E7A2E' }}>지금 안전하게 투자 가능</p>
            <p className="text-[10px]" style={{ color: '#9AA39D' }}>미배정 {won(s.unallocated)}</p>
          </div>
          <p className="text-[22px] font-black tabular-nums" style={{ color: '#2F5E1E' }}>{won(s.safeToAllocate)}</p>
        </div>
      </div>

      <div className="rounded-[20px] border p-4" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <Row label="예상 수익 실현 시 추가 여력" value={`+${won(s.potentialAdditional)}`} color="#6A8F4E" />
        <div className="rounded-xl px-3 py-2 mt-1" style={{ backgroundColor: '#F6FAF0', border: '1px solid #E4EFD4' }}>
          <p className="text-[13px]" style={{ color: '#16211E' }}>현재 계획대로라면 <b>{plan.endDate.slice(0, 7)}</b> 예상 보유자금 <b className="tabular-nums">{won(s.forecastEndingCash)}</b></p>
        </div>
      </div>
    </div>
  );
}
