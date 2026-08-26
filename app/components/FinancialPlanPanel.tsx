'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';
import { uid } from '../lib/store';
import { computeFinancialSummary, planOperating, revenueTargetOf } from '../lib/finance';
import type { FinancialPlan, FinRevenueSource, OperatingBudgetItem } from '../lib/types';

const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addMonthsStr = (ds: string, m: number) => { const d = new Date(ds + 'T00:00:00'); d.setMonth(d.getMonth() + m); d.setDate(0); return d.toISOString().slice(0, 10); };

// P0-Stage1: 재무계획(기간·보유자금·수익·운영비·Reserve) + Investment Capacity
export default function FinancialPlanPanel() {
  const store = useStore();
  const plans: FinancialPlan[] = store.financialPlans;
  const bizName = store.data.workspace?.name ?? '내 비즈니스';
  const goals = store.data.plan.goals ?? [];
  const subscriptions = store.data.subscriptions ?? [];
  const [selId, setSelId] = useState<string | null>(plans[0]?.id ?? null);
  const plan = plans.find(p => p.id === selId) ?? plans[0] ?? null;

  const createPlan = () => {
    const start = todayStr();
    const id = store.addFinancialPlan({ name: `${new Date().getFullYear()} 재무계획`, startDate: start, endDate: addMonthsStr(start, 3), startingFunds: 0, revenueSources: [], includeFixedSubscriptions: true, operatingItems: [], reserveTarget: 0, status: 'active' });
    setSelId(id);
  };
  const patch = (p: Partial<FinancialPlan>) => plan && store.updateFinancialPlan(plan.id, p);

  if (!plan) {
    return (
      <div className="rounded-[20px] border p-8 text-center" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <p className="text-[14px] font-bold mb-1" style={{ color: '#16211E' }}>{bizName} 재무계획이 아직 없어요</p>
        <p className="text-[12px] mb-4" style={{ color: '#9AA39D' }}>기간·보유자금·목표수익·운영비·Reserve를 세우면, 지금 실제로 투자할 수 있는 금액을 계산해줘요.</p>
        <button onClick={createPlan} className="text-[13px] font-bold rounded-full px-4 py-2" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>재무계획 만들기</button>
      </div>
    );
  }

  const s = computeFinancialSummary(plan, subscriptions, goals);
  const op = planOperating(plan, subscriptions);
  const linkedTarget = revenueTargetOf(plan, goals);
  const moneyCriteria = goals.flatMap(g => (g.successCriteria ?? []).filter(c => c.type === 'metric' && (c.unit === '원' || c.unit === '₩' || /매출|수익|revenue/i.test(c.name))).map(c => ({ goalId: g.id, goalName: g.name, c })));

  const sources = plan.revenueSources ?? [];
  const setSource = (id: string, p: Partial<FinRevenueSource>) => patch({ revenueSources: sources.map(x => x.id === id ? { ...x, ...p } : x) });
  const addSource = () => patch({ revenueSources: [...sources, { id: uid(), name: '' }] });
  const delSource = (id: string) => patch({ revenueSources: sources.filter(x => x.id !== id) });

  const items = plan.operatingItems ?? [];
  const setItem = (id: string, p: Partial<OperatingBudgetItem>) => patch({ operatingItems: items.map(x => x.id === id ? { ...x, ...p } : x) });
  const addItem = (kind: 'fixed' | 'variable') => patch({ operatingItems: [...items, { id: uid(), name: '', amount: 0, kind }] });
  const delItem = (id: string) => patch({ operatingItems: items.filter(x => x.id !== id) });

  const numInput = "w-28 text-[13px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400";
  const label = "text-[11px] font-semibold";

  return (
    <div className="space-y-4">
      {/* 헤더: 비즈니스 + 계획 선택 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-black" style={{ color: '#16211E' }}>{bizName}</span>
        <select value={plan.id} onChange={e => setSelId(e.target.value)} className="text-[12px] font-bold rounded-full px-3 py-1 border outline-none cursor-pointer" style={{ borderColor: 'var(--spira-border)' }}>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={createPlan} className="text-[12px] font-bold rounded-full px-3 py-1" style={{ backgroundColor: '#EAF3FF', color: '#2B62C4' }}>+ 새 계획</button>
        <button onClick={() => { if (window.confirm('이 재무계획을 삭제할까요?')) { store.deleteFinancialPlan(plan.id); setSelId(null); } }} className="ml-auto text-[11px] text-neutral-300 hover:text-red-500">삭제</button>
      </div>

      {/* 계획 기본 정보 */}
      <div className="rounded-[20px] border p-4 space-y-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <input value={plan.name} onChange={e => patch({ name: e.target.value })} placeholder="계획 이름 (예: 2026 Q4 Financial Plan)" className="w-full text-[15px] font-black bg-transparent outline-none" style={{ color: '#16211E' }} />
        <div className="flex items-center gap-2 flex-wrap text-[12px]" style={{ color: '#5B6560' }}>
          <input type="date" value={plan.startDate} onChange={e => patch({ startDate: e.target.value })} className="bg-white border rounded-lg px-2 py-1 outline-none" style={{ borderColor: 'var(--spira-border)' }} />
          <span>~</span>
          <input type="date" value={plan.endDate} min={plan.startDate} onChange={e => patch({ endDate: e.target.value })} className="bg-white border rounded-lg px-2 py-1 outline-none" style={{ borderColor: 'var(--spira-border)' }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={label} style={{ color: '#5B6560' }}>보유 자금 (Starting Funds) <span style={{ color: '#C4CCC4' }}>· 실제 있는 돈</span></span>
          <input type="number" value={plan.startingFunds || ''} onChange={e => patch({ startingFunds: Number(e.target.value) || 0 })} placeholder="0" className={numInput} style={{ borderColor: 'var(--spira-border)' }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={label} style={{ color: '#5B6560' }}>Reserve (남겨둘 돈) <span style={{ color: '#C4CCC4' }}>· AI가 기본 보호</span></span>
          <input type="number" value={plan.reserveTarget || ''} onChange={e => patch({ reserveTarget: Number(e.target.value) || 0 })} placeholder="0" className={numInput} style={{ borderColor: 'var(--spira-border)' }} />
        </div>
      </div>

      {/* 수익 목표 + 수익원 */}
      <div className="rounded-[20px] border p-4 space-y-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-black" style={{ color: '#16211E' }}>수익 목표 (Revenue Target)</span>
          <span className="text-[13px] font-black tabular-nums" style={{ color: '#3E7A2E' }}>{won(linkedTarget)}</span>
        </div>
        {moneyCriteria.length > 0 ? (
          <select value={plan.linkedCriterionId ?? ''} onChange={e => { const c = moneyCriteria.find(x => x.c.id === e.target.value); patch({ linkedGoalId: c?.goalId, linkedCriterionId: c?.c.id || undefined }); }}
            className="w-full text-[12px] rounded-lg border px-2 py-1.5 outline-none" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }}>
            <option value="">직접 입력 (목표 연결 안 함)</option>
            {moneyCriteria.map(x => <option key={x.c.id} value={x.c.id}>{x.goalName} · {x.c.name} ({won(x.c.targetValue ?? 0)})</option>)}
          </select>
        ) : (
          <p className="text-[11px]" style={{ color: '#9AA39D' }}>연결할 매출 지표가 있는 목표가 없어요. 아래에 직접 입력하세요.</p>
        )}
        {!plan.linkedCriterionId && (
          <div className="flex items-center justify-between gap-2">
            <span className={label} style={{ color: '#5B6560' }}>직접 입력 목표수익</span>
            <input type="number" value={plan.revenueTargetAmount || ''} onChange={e => patch({ revenueTargetAmount: Number(e.target.value) || 0 })} placeholder="0" className={numInput} style={{ borderColor: 'var(--spira-border)' }} />
          </div>
        )}
        {/* 수익원별 확정/예상 */}
        <div className="pt-1">
          <div className="flex items-center gap-2 text-[10px] font-bold px-1 mb-1" style={{ color: '#9AA39D' }}>
            <span className="flex-1">수익원</span><span className="w-24 text-right">확정</span><span className="w-24 text-right">예상</span><span className="w-5" />
          </div>
          <div className="space-y-1.5">
            {sources.map(src => (
              <div key={src.id} className="flex items-center gap-2">
                <input value={src.name} onChange={e => setSource(src.id, { name: e.target.value })} placeholder="예: 구독 매출" className="flex-1 min-w-0 text-[12px] bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                <input type="number" value={src.confirmed || ''} onChange={e => setSource(src.id, { confirmed: Number(e.target.value) || 0 })} placeholder="0" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                <input type="number" value={src.expected || ''} onChange={e => setSource(src.id, { expected: Number(e.target.value) || 0 })} placeholder="0" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                <button onClick={() => delSource(src.id)} className="w-5 text-neutral-300 hover:text-red-500 text-sm">×</button>
              </div>
            ))}
          </div>
          <button onClick={addSource} className="mt-2 text-[11px] font-semibold" style={{ color: '#7C3AED' }}>+ 수익원 추가</button>
        </div>
      </div>

      {/* 운영비 */}
      <div className="rounded-[20px] border p-4 space-y-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-black" style={{ color: '#16211E' }}>운영비 (Operating Budget)</span>
          <span className="text-[13px] font-black tabular-nums" style={{ color: '#C0392B' }}>{won(op.total)}</span>
        </div>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: '#5B6560' }}>
          <input type="checkbox" checked={plan.includeFixedSubscriptions !== false} onChange={e => patch({ includeFixedSubscriptions: e.target.checked })} />
          고정 구독료를 기간 운영비에 자동 포함 <span style={{ color: '#9AA39D' }}>(월 {won(subscriptions.reduce((a, x) => a + (x.amount || 0), 0))})</span>
        </label>
        <div className="space-y-1.5">
          {items.map(it => (
            <div key={it.id} className="flex items-center gap-2">
              <input value={it.name} onChange={e => setItem(it.id, { name: e.target.value })} placeholder="예: 임대료 / 재료비" className="flex-1 min-w-0 text-[12px] bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              <select value={it.kind} onChange={e => setItem(it.id, { kind: e.target.value as 'fixed' | 'variable' })} className="text-[11px] rounded-lg border px-1.5 py-1.5 outline-none" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }}>
                <option value="fixed">고정</option><option value="variable">변동</option>
              </select>
              <input type="number" value={it.amount || ''} onChange={e => setItem(it.id, { amount: Number(e.target.value) || 0 })} placeholder="0" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              <button onClick={() => delItem(it.id)} className="w-5 text-neutral-300 hover:text-red-500 text-sm">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => addItem('fixed')} className="text-[11px] font-semibold" style={{ color: '#7C3AED' }}>+ 고정비</button>
          <button onClick={() => addItem('variable')} className="text-[11px] font-semibold" style={{ color: '#7C3AED' }}>+ 변동비</button>
        </div>
      </div>

      {/* Investment Capacity */}
      <div className="rounded-[20px] border-2 p-4 space-y-3" style={{ borderColor: '#DDF4C4', backgroundColor: '#FAFDF3' }}>
        <span className="text-[13px] font-black" style={{ color: '#16211E' }}>투자 여력 (Investment Capacity)</span>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold" style={{ color: '#3E7A2E' }}>지금 안전하게 투자 가능</p>
            <p className="text-[10px]" style={{ color: '#9AA39D' }}>보유 + 확정 − 운영비 − Reserve</p>
          </div>
          <p className="text-[22px] font-black tabular-nums" style={{ color: '#2F5E1E' }}>{won(s.safeToAllocate)}</p>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: '#E4EFD4' }}>
          <span className="text-[12px]" style={{ color: '#5B6560' }}>예상 수익 실현 시 추가 여력</span>
          <span className="text-[13px] font-bold tabular-nums" style={{ color: '#6A8F4E' }}>+{won(s.potentialAdditional)}</span>
        </div>
        {s.targetGap > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px]" style={{ color: '#5B6560' }}>목표까지 남은 격차 <span style={{ color: '#9AA39D' }}>(확정 자금 아님)</span></span>
            <span className="text-[13px] font-bold tabular-nums" style={{ color: '#C4A24A' }}>{won(s.targetGap)}</span>
          </div>
        )}
        <div className="rounded-xl px-3 py-2 mt-1" style={{ backgroundColor: '#fff', border: '1px solid #E4EFD4' }}>
          <p className="text-[12px]" style={{ color: '#16211E' }}>현재 계획대로라면 <b>{plan.endDate.slice(0, 7)}</b> 예상 보유자금 <b className="tabular-nums">{won(s.forecastEndingCash)}</b></p>
        </div>
      </div>
    </div>
  );
}
