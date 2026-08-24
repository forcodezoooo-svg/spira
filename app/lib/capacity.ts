import { WorkspaceEntry, WorkSchedule, CapacitySettings, OperatingMode } from './types';
import { getSubtaskTasksForDate, SubtaskTask } from './goalTasks';

// Time Management — 가용시간(Capacity) 계산 레이어.
// 기존 구조(Goal→…→Task)를 바꾸지 않고, 실행/배분에 필요한 시간량만 순수 함수로 계산한다.
// 모든 값은 '분(minute)' 단위. 시간 표시는 UI에서 변환.

export const DEFAULT_BUFFER_PERCENT = 0.15;

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dowOf = (date: string) => new Date(date + 'T00:00:00').getDay();

// 그 날짜의 기본 가용시간(분): 날짜 override 우선, 없으면 요일 업무시간(시작~종료)
export function baseMinForDate(schedule: WorkSchedule, capacity: CapacitySettings | undefined, date: string): number {
  const ov = capacity?.dateOverrides?.[date];
  if (ov !== undefined && ov !== null) return Math.max(0, Math.round(ov * 60));
  const wd = schedule[dowOf(date)];
  if (!wd || !wd.on) return 0;
  return Math.max(0, toMin(wd.end) - toMin(wd.start));
}

// 그 요일에 활성인 루틴 task의 예상 소요시간(분) 합 — Capacity에서 차감
export function routineMinForDate(entries: WorkspaceEntry[], date: string): number {
  const dow = dowOf(date);
  let sum = 0;
  for (const e of entries) {
    for (const rs of e.routineSystems ?? []) {
      if (rs.startDate && date < rs.startDate) continue;
      for (const t of rs.tasks ?? []) {
        const active = (t.days ?? []).length === 0 || t.days.includes(dow);
        if (active) sum += t.durationMin ?? 0;
      }
    }
  }
  return sum;
}

// 그 날짜의 고정 일정(fixed) task/quickTask의 예상 소요시간(분) 합
export function fixedMinForDate(entries: WorkspaceEntry[], date: string): number {
  let sum = 0;
  for (const t of getSubtaskTasksForDate(entries, date, { onlyFromPlan: true })) {
    if (t.schedulingType === 'fixed') sum += t.durationMin ?? 0;
  }
  for (const e of entries) {
    for (const q of e.quickTasks ?? []) {
      if (q.date === date && q.schedulingType === 'fixed') sum += q.durationMin ?? 0;
    }
  }
  return sum;
}

// 그 날짜에 배치된 '프로젝트 작업(비-fixed)'의 예상 소요시간(분) 합 = Planned
export function plannedProjectMinForDate(entries: WorkspaceEntry[], date: string): number {
  let sum = 0;
  for (const t of getSubtaskTasksForDate(entries, date, { onlyFromPlan: true })) {
    if (t.done) continue;
    if (t.schedulingType === 'fixed') continue; // fixed는 별도 차감
    sum += t.durationMin ?? 0;
  }
  for (const e of entries) {
    for (const q of e.quickTasks ?? []) {
      if (q.date === date && !q.completed && q.schedulingType !== 'fixed') sum += q.durationMin ?? 0;
    }
  }
  return sum;
}

export interface DayCapacity {
  date: string;
  baseMin: number;             // 기본 가용시간
  routineMin: number;          // 루틴 차감
  fixedMin: number;            // 고정 일정 차감
  bufferMin: number;           // 예비 시간
  availableProjectMin: number; // 프로젝트에 실제 쓸 수 있는 시간
  plannedProjectMin: number;   // 그 날 배치된 프로젝트 작업량
  overMin: number;             // 초과분 (planned − available, 음수면 0)
}

export function computeDayCapacity(
  entries: WorkspaceEntry[], schedule: WorkSchedule, capacity: CapacitySettings | undefined, date: string,
): DayCapacity {
  const baseMin = baseMinForDate(schedule, capacity, date);
  const routineMin = routineMinForDate(entries, date);
  const fixedMin = fixedMinForDate(entries, date);
  const bufferPct = capacity?.bufferPercent ?? DEFAULT_BUFFER_PERCENT;
  const bufferMin = Math.round(baseMin * bufferPct);
  const availableProjectMin = Math.max(0, baseMin - routineMin - fixedMin - bufferMin);
  const plannedProjectMin = plannedProjectMinForDate(entries, date);
  const overMin = Math.max(0, plannedProjectMin - availableProjectMin);
  return { date, baseMin, routineMin, fixedMin, bufferMin, availableProjectMin, plannedProjectMin, overMin };
}

export type WeekLoadStatus = 'light' | 'ok' | 'tight' | 'over';
export interface WeekCapacity {
  days: DayCapacity[];
  baseMin: number;
  routineMin: number;
  fixedMin: number;
  bufferMin: number;
  availableProjectMin: number;
  plannedProjectMin: number;
  status: WeekLoadStatus;
}

// 주 시작(월요일)부터 7일 합산
export function computeWeekCapacity(
  entries: WorkspaceEntry[], schedule: WorkSchedule, capacity: CapacitySettings | undefined, weekStart: string,
): WeekCapacity {
  const days: DayCapacity[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push(computeDayCapacity(entries, schedule, capacity, ds));
  }
  const sum = (f: (d: DayCapacity) => number) => days.reduce((s, d) => s + f(d), 0);
  const availableProjectMin = sum(d => d.availableProjectMin);
  const plannedProjectMin = sum(d => d.plannedProjectMin);
  const ratio = availableProjectMin > 0 ? plannedProjectMin / availableProjectMin : (plannedProjectMin > 0 ? 2 : 0);
  const status: WeekLoadStatus = ratio > 1 ? 'over' : ratio >= 0.9 ? 'tight' : ratio < 0.7 ? 'light' : 'ok';
  return {
    days,
    baseMin: sum(d => d.baseMin),
    routineMin: sum(d => d.routineMin),
    fixedMin: sum(d => d.fixedMin),
    bufferMin: sum(d => d.bufferMin),
    availableProjectMin, plannedProjectMin, status,
  };
}

// ── Operating Mode: 주간 Capacity 배분 추천 ──
// 모드별 '상대 가중치'(하드코딩 비율 아님 — 추천 시작값일 뿐, 사용자가 시간으로 덮어씀)
export const MODE_WEIGHT: Record<OperatingMode, number> = { development: 3, update: 3, management: 1 };
export const MODE_META: Record<OperatingMode, { label: string; bg: string; fg: string }> = {
  development: { label: '개발', bg: '#E7F0FF', fg: '#2B62C4' },
  update: { label: '업데이트', bg: '#F3F0FF', fg: '#7C3AED' },
  management: { label: '운영', bg: '#F0F0EA', fg: '#5B6560' },
};

// 그 날짜에 배치된 특정 비즈니스의 프로젝트 작업(분)
export function plannedProjectMinForDateWs(entries: WorkspaceEntry[], date: string, wsId: string): number {
  let sum = 0;
  for (const t of getSubtaskTasksForDate(entries, date, { onlyFromPlan: true })) {
    if (t.wsId !== wsId || t.done || t.schedulingType === 'fixed') continue;
    sum += t.durationMin ?? 0;
  }
  const e = entries.find(x => x.workspace.id === wsId);
  for (const q of e?.quickTasks ?? []) {
    if (q.date === date && !q.completed && q.schedulingType !== 'fixed') sum += q.durationMin ?? 0;
  }
  return sum;
}

// 한 주(월~일) 특정 비즈니스의 계획된 프로젝트 작업(분)
export function plannedWeekMinForWs(entries: WorkspaceEntry[], weekStart: string, wsId: string): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    sum += plannedProjectMinForDateWs(entries, ds, wsId);
  }
  return sum;
}

export interface BusinessAllocation {
  wsId: string;
  wsName: string;
  color: string;
  mode: OperatingMode;
  allocatedMin: number;   // 사용자가 배분한 시간(없으면 추천값)
  recommendedMin: number; // 모드 가중치 기반 추천
  plannedMin: number;     // 이번 주 실제 계획된 작업량
  isUserSet: boolean;     // 사용자가 직접 배분했는지
}

// 비즈니스별 배분 현황 — weeklyAvailableMin(주간 총 가용 프로젝트 시간)을 모드 가중치로 추천 분배
export function businessAllocations(
  entries: WorkspaceEntry[], weeklyAvailableMin: number, weekStart: string, colorOf: (wsId: string) => string,
): BusinessAllocation[] {
  const active = entries.filter(e => (e.programs ?? []).some(p => p.fromPlan));
  const list = active.length ? active : entries;
  const totalWeight = list.reduce((s, e) => s + MODE_WEIGHT[e.operatingMode ?? 'development'], 0) || 1;
  return list.map(e => {
    const mode = e.operatingMode ?? 'development';
    const recommendedMin = Math.round(weeklyAvailableMin * MODE_WEIGHT[mode] / totalWeight);
    const isUserSet = e.weeklyCapacityHours !== undefined && e.weeklyCapacityHours !== null;
    return {
      wsId: e.workspace.id, wsName: e.workspace.name, color: colorOf(e.workspace.id), mode,
      allocatedMin: isUserSet ? Math.round((e.weeklyCapacityHours as number) * 60) : recommendedMin,
      recommendedMin,
      plannedMin: plannedWeekMinForWs(entries, weekStart, e.workspace.id),
      isUserSet,
    };
  });
}

// ── Replanning 제안 (P0: 결정적·승인식) ──
// 오늘 초과분을 없애기 위해 이동할 flexible/저우선 Task와 이동 날짜를 제안한다. (자동 적용 아님)
export interface ReplanMove {
  task: SubtaskTask;
  toDate: string;            // 이동 제안 날짜
  withinDeadline: boolean;   // 이동해도 task 기한 내인가
  projectName?: string;      // 소속 프로젝트 이름
  projectDeadline?: string;  // 프로젝트 마감일
  projectAffected?: boolean; // 이동일이 프로젝트 마감을 넘기는가 (§20 영향 전파)
  depEarliest?: string;      // 선행 작업 때문에 이 날짜 이전엔 못 옮김 (있으면)
}

interface SubIndexEntry { date?: string; deadline?: string; done: boolean }
// 전체 subtask(id → 날짜/완료) 색인 — 선행(dependsOn) 날짜 제약 계산용
export function buildSubIndex(entries: WorkspaceEntry[]): Map<string, SubIndexEntry> {
  const m = new Map<string, SubIndexEntry>();
  for (const e of entries) for (const p of e.programs) for (const dl of p.deadlines ?? []) for (const t of dl.todos ?? []) for (const s of t.subtasks ?? [])
    m.set(s.id, { date: s.date, deadline: s.deadline, done: !!s.done });
  return m;
}
// 선행 작업들 때문에 이 task가 시작 가능한 가장 이른 날 (미완료 선행의 마감/시작일 중 최대). 없으면 undefined
export function earliestFromDeps(idx: Map<string, SubIndexEntry>, dependsOn?: string[]): string | undefined {
  let earliest: string | undefined;
  for (const pid of dependsOn ?? []) {
    const pred = idx.get(pid);
    if (!pred || pred.done) continue; // 완료된 선행은 제약 없음
    const d = pred.deadline || pred.date;
    if (d && (!earliest || d > earliest)) earliest = d;
  }
  return earliest;
}
export interface ReplanProposal {
  date: string;
  overMin: number;          // 원래 초과분
  keep: SubtaskTask[];      // 오늘 유지
  move: ReplanMove[];       // 이동 제안
  resolvedMin: number;      // 이동으로 확보되는 시간
  stillOverMin: number;     // 이동 후에도 남는 초과분
}

function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function proposeReplan(
  entries: WorkspaceEntry[], schedule: WorkSchedule, capacity: CapacitySettings | undefined, date: string,
): ReplanProposal {
  const day = computeDayCapacity(entries, schedule, capacity, date);
  const tasks = getSubtaskTasksForDate(entries, date, { onlyFromPlan: true })
    .filter(t => !t.done && t.schedulingType !== 'fixed');
  // 이동 우선순위: 우선순위 낮은 것 → 기한 여유 많은 것(늦은 deadline) → 소요 큰 것
  const candidates = [...tasks].sort((a, b) =>
    (a.priority ?? 0) - (b.priority ?? 0)
    || (b.deadline ?? '9999').localeCompare(a.deadline ?? '9999')
    || (b.durationMin ?? 0) - (a.durationMin ?? 0),
  );
  // 이후 14일의 잔여 여유(분)를 미리 계산 (이동 배치용)
  const slack: { date: string; freeMin: number }[] = [];
  for (let i = 1; i <= 14; i++) {
    const ds = addDays(date, i);
    const dc = computeDayCapacity(entries, schedule, capacity, ds);
    slack.push({ date: ds, freeMin: Math.max(0, dc.availableProjectMin - dc.plannedProjectMin) });
  }
  const idx = buildSubIndex(entries);
  const move: ReplanMove[] = [];
  const movedIds = new Set<string>();
  let resolved = 0;
  for (const t of candidates) {
    if (resolved >= day.overMin) break;
    const dur = t.durationMin ?? 0;
    // 선행 작업(dependsOn) 때문에 이보다 이른 날엔 못 옮김
    const depEarliest = earliestFromDeps(idx, t.dependsOn);
    const okDate = (ds: string) => !depEarliest || ds >= depEarliest;
    // 이 task가 들어갈 수 있는 가장 이른 날 (선행 이후 + 여유 ≥ 소요), 없으면 선행 이후 첫 날
    let slot = slack.find(s => okDate(s.date) && s.freeMin >= dur && dur > 0);
    if (!slot) slot = slack.find(s => okDate(s.date));
    const toDate = slot?.date ?? (depEarliest && depEarliest > date ? depEarliest : addDays(date, 1));
    if (slot) slot.freeMin = Math.max(0, slot.freeMin - dur);
    move.push({
      task: t, toDate,
      withinDeadline: !t.deadline || toDate <= t.deadline,
      projectName: t.projectName, projectDeadline: t.projectDeadline,
      projectAffected: !!t.projectDeadline && toDate > t.projectDeadline,
      depEarliest,
    });
    movedIds.add(t.subtaskId);
    resolved += dur;
  }
  const keep = tasks.filter(t => !movedIds.has(t.subtaskId));
  return {
    date, overMin: day.overMin, keep, move,
    resolvedMin: resolved,
    stillOverMin: Math.max(0, day.overMin - resolved),
  };
}

// ── 예상 vs 실제 학습 (§15) ──
export interface AreaAccuracy {
  area: string;       // 업무 영역(programName)
  count: number;      // 예상·실제 둘 다 있는 task 수
  avgEstimate: number;// 평균 예상(분)
  avgActual: number;  // 평균 실제(분)
  factor: number;     // 실제/예상 배율 (1.29 = 예상보다 29% 더 걸림)
}

// 완료 task 중 예상(durationMin)·실제(actualMin) 둘 다 있는 것들을 업무 영역별로 집계
export function estimateAccuracy(entries: WorkspaceEntry[]): AreaAccuracy[] {
  const map = new Map<string, { est: number; act: number; n: number }>();
  for (const e of entries) for (const p of e.programs) for (const dl of p.deadlines ?? []) for (const t of dl.todos ?? []) for (const s of t.subtasks ?? []) {
    if (!s.durationMin || !s.actualMin) continue;
    const area = p.name || '업무';
    const g = map.get(area) ?? { est: 0, act: 0, n: 0 };
    g.est += s.durationMin; g.act += s.actualMin; g.n += 1;
    map.set(area, g);
  }
  return [...map.entries()].map(([area, g]) => ({
    area, count: g.n,
    avgEstimate: Math.round(g.est / g.n),
    avgActual: Math.round(g.act / g.n),
    factor: g.est > 0 ? g.act / g.est : 1,
  })).sort((a, b) => b.count - a.count);
}

// 특정 업무 영역의 개인화 배율 (충분한 표본이 있을 때만 1이 아닌 값). 표본 < min이면 1
export function areaFactor(entries: WorkspaceEntry[], area: string, minSamples = 3): number {
  const a = estimateAccuracy(entries).find(x => x.area === area);
  return a && a.count >= minSamples ? a.factor : 1;
}

// 분 → "Xh Ym" / "Xh" / "Ym" 표기
export function fmtMin(min: number): string {
  const m = Math.round(min);
  if (m <= 0) return '0m';
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

// 분 → 시간(소수 1자리) 문자열 "6" / "3.5"
export function fmtHours(min: number): string {
  const h = min / 60;
  return Number.isInteger(h) ? `${h}` : h.toFixed(1);
}
