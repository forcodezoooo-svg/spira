// Financial Resource Planning 계산 (순수 함수) — capacity.ts와 동일 패턴.
// 핵심 원칙: 현재 보유자금 · 확정수익 · 예상수익 · 목표수익을 절대 동일한 가용자금으로 취급하지 않는다.
import type { FinancialPlan, Subscription, ResourceEntry, Goal, Program } from './types';

const num = (n?: number) => (Number.isFinite(n) ? (n as number) : 0);

// 계획된 수익 합계 (소스별 confirmed/expected/target 합산)
export function planRevenue(plan: FinancialPlan): { confirmed: number; expected: number; target: number } {
  const srcs = plan.revenueSources ?? [];
  const confirmed = srcs.reduce((s, r) => s + num(r.confirmed), 0);
  const expected = srcs.reduce((s, r) => s + num(r.expected), 0);
  const sourceTarget = srcs.reduce((s, r) => s + num(r.target), 0);
  return { confirmed, expected, target: sourceTarget };
}

// 이 재무계획의 Revenue Target — Goal 지표(metric criterion) 연결 우선, 없으면 직접 입력, 그것도 없으면 소스 target 합계
export function revenueTargetOf(plan: FinancialPlan, goals: Goal[]): number {
  if (plan.linkedGoalId && plan.linkedCriterionId) {
    const g = goals.find(x => x.id === plan.linkedGoalId);
    const c = g?.successCriteria?.find(x => x.id === plan.linkedCriterionId);
    if (c && Number.isFinite(c.targetValue)) return c.targetValue as number;
  }
  if (Number.isFinite(plan.revenueTargetAmount)) return plan.revenueTargetAmount as number;
  return planRevenue(plan).target;
}

// 기간 내 활성 구독(고정 운영비) 월 합계 × 개월 수
function monthsBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return 1;
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
}

// 운영비: (선택) 고정 구독 합계 × 개월 + operatingItems 합계
export function planOperating(plan: FinancialPlan, subscriptions: Subscription[]): { fixed: number; variable: number; total: number } {
  const includeSubs = plan.includeFixedSubscriptions !== false; // 기본 포함
  const months = monthsBetween(plan.startDate, plan.endDate);
  const startYM = plan.startDate.slice(0, 7);
  const subMonthly = includeSubs
    ? subscriptions.filter(s => !s.startMonth || s.startMonth <= plan.endDate.slice(0, 7)).reduce((s, x) => s + num(x.amount), 0)
    : 0;
  void startYM;
  const items = plan.operatingItems ?? [];
  const fixedItems = items.filter(i => i.kind === 'fixed').reduce((s, i) => s + num(i.amount), 0);
  const variable = items.filter(i => i.kind === 'variable').reduce((s, i) => s + num(i.amount), 0);
  const fixed = subMonthly * months + fixedItems;
  return { fixed, variable, total: fixed + variable };
}

// 이 계획에 연결된 실제 실적(트랜잭션) 합계 — financialPlanId로 연결된 것만
export function planActuals(plan: FinancialPlan, entries: ResourceEntry[]): { income: number; expense: number } {
  const rows = entries.filter(e => e.financialPlanId === plan.id);
  return {
    income: rows.filter(e => e.type === 'income').reduce((s, e) => s + num(e.amount), 0),
    expense: rows.filter(e => e.type === 'expense').reduce((s, e) => s + num(e.amount), 0),
  };
}

// 배분 합계 (§11)
export function allocatedTotal(plan: FinancialPlan): number {
  return (plan.allocations ?? []).reduce((s, a) => s + num(a.plannedAmount), 0);
}

// 기간 내 실제 실적 (해당 비즈니스 거래 중 계획 기간에 든 것) — 링크 없이 날짜로 집계
export function periodActuals(entries: ResourceEntry[], start: string, end: string): { income: number; expense: number } {
  const rows = entries.filter(e => e.date >= start && e.date <= end);
  return {
    income: rows.filter(e => e.type === 'income').reduce((s, e) => s + num(e.amount), 0),
    expense: rows.filter(e => e.type === 'expense').reduce((s, e) => s + num(e.amount), 0),
  };
}

// 특정 프로젝트에 연결된 실제 지출 (기간 제한 선택)
export function projectActualCost(entries: ResourceEntry[], projectId: string, start?: string, end?: string): number {
  return entries.filter(e => e.type === 'expense' && e.projectId === projectId && (!start || e.date >= start) && (!end || e.date <= end))
    .reduce((s, e) => s + num(e.amount), 0);
}

// 프로젝트에 필요한 시간(분) — 그 프로젝트(데드라인.projectId) 아래 미완료 task들의 예상 소요시간 합 (§19)
export function projectRequiredMin(programs: Program[], projectId: string): number {
  let m = 0;
  for (const p of programs) for (const dl of p.deadlines ?? []) {
    if (dl.projectId !== projectId) continue;
    for (const t of dl.todos ?? []) for (const s of t.subtasks ?? []) if (!s.done) m += num(s.durationMin);
  }
  return m;
}

export interface FinancialSummary {
  startingFunds: number;
  confirmed: number;
  expected: number;
  target: number;
  operating: number;
  reserve: number;
  allocated: number;      // Goal/Project에 배정한 투자 합계
  // 지금 안전하게 배정 가능한 금액 = 보유 + 확정 − 운영비 − Reserve
  safeToAllocate: number;
  // 아직 배정하지 않은 여력 = Safe − 배정합계 (음수면 과배정)
  unallocated: number;
  // 예상 수익이 실현되면 추가로 생기는 여력
  potentialAdditional: number;
  // 목표까지 남은 격차 (참고용, 확정 자금 아님)
  targetGap: number;
  // 계획대로 갈 때 기간말 예상 보유자금 (Confirmed+Expected − 운영비 − 투자배분)
  forecastEndingCash: number;
}

// 핵심: Target을 100% 확정 자금으로 취급하지 않음. Safe(지금)와 Potential(미래 수익 의존)을 분리.
export function computeFinancialSummary(plan: FinancialPlan, subscriptions: Subscription[], goals: Goal[]): FinancialSummary {
  const { confirmed, expected } = planRevenue(plan);
  const target = revenueTargetOf(plan, goals);
  const operating = planOperating(plan, subscriptions).total;
  const reserve = num(plan.reserveTarget);
  const startingFunds = num(plan.startingFunds);
  const allocated = allocatedTotal(plan);
  const safeToAllocate = Math.max(0, startingFunds + confirmed - operating - reserve);
  const unallocated = safeToAllocate - allocated;
  const potentialAdditional = expected;
  const targetGap = Math.max(0, target - confirmed - expected);
  const forecastEndingCash = startingFunds + confirmed + expected - operating - allocated;
  return { startingFunds, confirmed, expected, target, operating, reserve, allocated, safeToAllocate, unallocated, potentialAdditional, targetGap, forecastEndingCash };
}
