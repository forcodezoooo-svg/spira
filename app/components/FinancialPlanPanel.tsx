'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';
import { uid } from '../lib/store';
import { computeFinancialSummary, planOperating, revenueTargetOf, periodActuals, projectActualCost, projectRequiredMin } from '../lib/finance';
import { computeDayCapacity } from '../lib/capacity';
import type { FinancialPlan, FinRevenueSource, OperatingBudgetItem, BudgetAllocation } from '../lib/types';
import { useChatContext } from '../lib/ChatContext';
import { useUI } from '../lib/UIContext';

const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addMonthsStr = (ds: string, m: number) => { const d = new Date(ds + 'T00:00:00'); d.setMonth(d.getMonth() + m); d.setDate(0); return d.toISOString().slice(0, 10); };
const addDaysStr = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// P0-Stage1: 재무계획(기간·보유자금·수익·운영비·Reserve) + Investment Capacity
export default function FinancialPlanPanel() {
  const store = useStore();
  const chat = useChatContext();
  const { openChat } = useUI();
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

  // ── 배분 (Budget Allocation) + 실적 ──
  const projects = store.data.plan.projects ?? [];
  const entries = store.data.resources ?? [];
  const allocs = plan.allocations ?? [];
  const setAlloc = (id: string, p: Partial<BudgetAllocation>) => patch({ allocations: allocs.map(x => x.id === id ? { ...x, ...p } : x) });
  const addAlloc = () => patch({ allocations: [...allocs, { id: uid(), plannedAmount: 0 }] });
  const delAlloc = (id: string) => patch({ allocations: allocs.filter(x => x.id !== id) });
  const allocTargetVal = (a: BudgetAllocation) => a.projectId ? `p:${a.projectId}` : a.goalId ? `g:${a.goalId}` : '';
  const setAllocTarget = (id: string, v: string) => {
    if (v.startsWith('p:')) setAlloc(id, { projectId: v.slice(2), goalId: undefined });
    else if (v.startsWith('g:')) setAlloc(id, { goalId: v.slice(2), projectId: undefined });
    else setAlloc(id, { projectId: undefined, goalId: undefined });
  };
  const actual = periodActuals(entries, plan.startDate, plan.endDate); // 이 기간 실제 수입/지출
  const revProgress = s.target > 0 ? Math.round((actual.income / s.target) * 100) : 0;

  // ── 실행 가능성 (Time + Money, §19) ──
  const programs = store.data.programs ?? [];
  const today = todayStr();
  const availMin = (() => {
    let sum = 0; let d = today > plan.startDate ? today : plan.startDate;
    for (let i = 0; i < 200 && d <= plan.endDate; i++) { sum += computeDayCapacity(store.allWorkspacesEntries, store.workSchedule, store.capacity, d).availableProjectMin; d = addDaysStr(d, 1); }
    return sum;
  })();
  const allocProjects = allocs.filter(a => a.projectId).map(a => {
    const p = projects.find(x => x.id === a.projectId!);
    const reqMin = projectRequiredMin(programs, a.projectId!);
    const spent = projectActualCost(entries, a.projectId!, plan.startDate, plan.endDate);
    const reqBudget = Math.max(0, a.plannedAmount - spent); // 남은 필요 예산
    return { id: a.projectId!, name: p?.name ?? '프로젝트', reqMin, reqBudget, planned: a.plannedAmount };
  });
  const totalReqMin = allocProjects.reduce((s2, p) => s2 + p.reqMin, 0);
  const totalReqBudget = allocProjects.reduce((s2, p) => s2 + p.reqBudget, 0);
  const timeOk = availMin >= totalReqMin;
  const moneyOk = s.safeToAllocate >= totalReqBudget;
  const fmtH = (min: number) => `${Math.round(min / 60)}h`;

  // AI 재무 재조정 상담 — 현재 재무상태 + 프로젝트 우선순위/상태를 컨텍스트로 전달(§25 원칙 적용, 자동 변경 없음)
  const askAI = () => {
    if (!chat) return;
    const lines = ['[재무 재조정 상담 요청]', `비즈니스: ${bizName} · 기간 ${plan.startDate}~${plan.endDate}`];
    lines.push(`보유자금 ${won(s.startingFunds)} / 확정수익 ${won(s.confirmed)} / 예상수익 ${won(s.expected)} / 목표수익 ${won(s.target)}`);
    lines.push(`운영비 ${won(s.operating)} / Reserve ${won(s.reserve)}`);
    lines.push(`지금 안전 투자여력(Safe) ${won(s.safeToAllocate)} / 미배정 ${won(s.unallocated)}${s.unallocated < 0 ? ' (과배정)' : ''} / 예상실현시 추가 +${won(s.potentialAdditional)}`);
    lines.push(`기간말 예상 보유자금 ${won(s.forecastEndingCash)} / 이 기간 실제 수익 ${won(actual.income)}·실제 지출 ${won(actual.expense)}`);
    if (allocs.length) {
      lines.push('■ 투자 배분 & 프로젝트 상태');
      for (const a of allocs) {
        const proj = a.projectId ? projects.find(p => p.id === a.projectId) : null;
        const goal = a.goalId ? goals.find(g => g.id === a.goalId) : null;
        const tgt = proj ? `프로젝트 "${proj.name}"(상태 ${proj.status ?? 'planned'}${proj.importance ? `, 중요도 ${proj.importance}` : ''})` : goal ? `목표 "${goal.name}"` : '기타(공통)';
        const spent = a.projectId ? projectActualCost(entries, a.projectId, plan.startDate, plan.endDate) : 0;
        lines.push(`- ${tgt}: 배정 ${won(a.plannedAmount)}${a.projectId ? ` · 실지출 ${won(spent)}` : ''}`);
      }
    }
    lines.push('');
    lines.push('운영비와 Reserve를 보호하면서 현재 투자계획을 유지할 수 있는지 판단하고, 부족하거나 조정이 필요하면 프로젝트 우선순위·상태를 고려한 재조정안(유지/예산조정/시점이동 등)을 제시해줘. 임의로 확정하지 말고 제안 형태로.');
    openChat();
    chat.sendMessage(lines.join('\n'), 'AI에게 현재 재무 상황 기준 재조정 상담 받기', { financeMode: true });
  };

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
        <button onClick={askAI} className="w-full flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#16211E', color: '#fff' }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" /></svg>
          AI 재무 재조정 상담
        </button>
      </div>

      {/* 배분 (Budget Allocation) */}
      <div className="rounded-[20px] border p-4 space-y-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-black" style={{ color: '#16211E' }}>투자 배분 (Goal · Project)</span>
          <span className="text-[12px] font-bold" style={{ color: s.unallocated < 0 ? '#C0392B' : '#5B6560' }}>
            미배정 <span className="tabular-nums">{won(s.unallocated)}</span>{s.unallocated < 0 ? ' · 과배정' : ''}
          </span>
        </div>
        <div className="space-y-1.5">
          {allocs.map(a => {
            const spent = a.projectId ? projectActualCost(entries, a.projectId, plan.startDate, plan.endDate) : 0;
            return (
              <div key={a.id} className="flex items-center gap-2">
                <select value={allocTargetVal(a)} onChange={e => setAllocTarget(a.id, e.target.value)} className="flex-1 min-w-0 text-[12px] rounded-lg border px-2 py-1.5 outline-none" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }}>
                  <option value="">기타(공통)</option>
                  {projects.length > 0 && <optgroup label="프로젝트">{projects.map(p => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>}
                  {goals.length > 0 && <optgroup label="목표">{goals.map(g => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}
                </select>
                <input type="number" value={a.plannedAmount || ''} onChange={e => setAlloc(a.id, { plannedAmount: Number(e.target.value) || 0 })} placeholder="0" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                {a.projectId && <span className="text-[10px] tabular-nums w-24 text-right flex-shrink-0" style={{ color: spent > a.plannedAmount ? '#C0392B' : '#9AA39D' }} title="이 프로젝트에 연결된 실제 지출">쓴 {won(spent)}</span>}
                <button onClick={() => delAlloc(a.id)} className="w-5 text-neutral-300 hover:text-red-500 text-sm">×</button>
              </div>
            );
          })}
        </div>
        <button onClick={addAlloc} className="text-[11px] font-semibold" style={{ color: '#7C3AED' }}>+ 배분 추가</button>
      </div>

      {/* 계획 대비 실적 (Planned vs Actual) */}
      <div className="rounded-[20px] border p-4 space-y-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
        <span className="text-[13px] font-black" style={{ color: '#16211E' }}>계획 대비 실적 <span className="text-[11px] font-medium" style={{ color: '#9AA39D' }}>· {plan.startDate.slice(0, 7)}~{plan.endDate.slice(0, 7)}</span></span>
        {/* 수익 진행 */}
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span style={{ color: '#5B6560' }}>수익 목표</span>
            <span style={{ color: '#5B6560' }}>실제 <b className="tabular-nums" style={{ color: '#3E7A2E' }}>{won(actual.income)}</b> / {won(s.target)} <b>({revProgress}%)</b></span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F0F0EA' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, revProgress)}%`, backgroundColor: '#9DFE3B' }} />
          </div>
        </div>
        {/* 지출: 계획(운영비+배분) vs 실제 */}
        <div className="flex items-center justify-between text-[12px]">
          <span style={{ color: '#5B6560' }}>지출 계획 <span style={{ color: '#9AA39D' }}>(운영비+배분)</span></span>
          <span style={{ color: '#5B6560' }}>실제 <b className="tabular-nums" style={{ color: '#C0392B' }}>{won(actual.expense)}</b> / {won(s.operating + s.allocated)}</span>
        </div>
        {/* Variance 메시지 */}
        {(() => {
          const plannedOut = s.operating + s.allocated;
          const diff = actual.expense - plannedOut;
          if (Math.abs(diff) < 1) return null;
          return <p className="text-[12px] rounded-lg px-3 py-2" style={{ backgroundColor: diff > 0 ? '#FFF1F1' : '#F1F8EE', color: diff > 0 ? '#C0392B' : '#3E7A2E' }}>
            {diff > 0 ? `지출이 계획보다 ${won(diff)} 많습니다.` : `지출이 계획보다 ${won(-diff)} 적습니다.`}
          </p>;
        })()}
        {revProgress > 0 && revProgress < 60 && (
          <p className="text-[12px] rounded-lg px-3 py-2" style={{ backgroundColor: '#FCF6EC', color: '#96631A' }}>
            수익 진행이 {revProgress}%로, 남은 기간에 예상 수익 실현이 필요합니다.
          </p>
        )}
      </div>

      {/* 실행 가능성 (Time + Money, §19/§20) */}
      {allocProjects.length > 0 && (
        <div className="rounded-[20px] border p-4 space-y-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
          <span className="text-[13px] font-black" style={{ color: '#16211E' }}>실행 가능성 <span className="text-[11px] font-medium" style={{ color: '#9AA39D' }}>· 시간 + 자금</span></span>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: timeOk ? '#F1F8EE' : '#FFF1F1' }}>
              <p className="text-[11px] font-bold mb-0.5" style={{ color: '#5B6560' }}>시간 (Time)</p>
              <p className="text-[13px] tabular-nums" style={{ color: '#16211E' }}>필요 {fmtH(totalReqMin)} / 가용 {fmtH(availMin)}</p>
              <p className="text-[12px] font-bold mt-0.5" style={{ color: timeOk ? '#3E7A2E' : '#C0392B' }}>{timeOk ? '충분' : `${fmtH(totalReqMin - availMin)} 부족`}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: moneyOk ? '#F1F8EE' : '#FFF1F1' }}>
              <p className="text-[11px] font-bold mb-0.5" style={{ color: '#5B6560' }}>자금 (Money)</p>
              <p className="text-[13px] tabular-nums" style={{ color: '#16211E' }}>필요 {won(totalReqBudget)} / Safe {won(s.safeToAllocate)}</p>
              <p className="text-[12px] font-bold mt-0.5" style={{ color: moneyOk ? '#3E7A2E' : '#C0392B' }}>{moneyOk ? '충분' : `${won(totalReqBudget - s.safeToAllocate)} 부족`}</p>
            </div>
          </div>
          {(!timeOk || !moneyOk) && (
            <p className="text-[12px] rounded-lg px-3 py-2" style={{ backgroundColor: '#FCF6EC', color: '#96631A' }}>
              {timeOk && !moneyOk && `현재 일정으로는 수행 가능하지만, Reserve를 지키면 약 ${won(totalReqBudget - s.safeToAllocate)}의 추가 자금이 필요합니다.`}
              {!timeOk && moneyOk && `자금은 충분하지만, 배정한 프로젝트를 모두 하려면 시간이 약 ${fmtH(totalReqMin - availMin)} 부족합니다.`}
              {!timeOk && !moneyOk && `시간·자금 모두 부족합니다. 프로젝트 범위·시점·예산 조정이 필요해요.`}
            </p>
          )}
          <div className="space-y-1">
            {allocProjects.map(p => (
              <div key={p.id} className="flex items-center justify-between text-[12px]">
                <span className="truncate min-w-0 flex-1" style={{ color: '#5B6560' }}>{p.name}</span>
                <span className="tabular-nums flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtH(p.reqMin)} · {won(p.reqBudget)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
