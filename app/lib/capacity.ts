import { WorkspaceEntry, WorkSchedule, CapacitySettings } from './types';
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

// ── Replanning 제안 (P0: 결정적·승인식) ──
// 오늘 초과분을 없애기 위해 이동할 flexible/저우선 Task와 이동 날짜를 제안한다. (자동 적용 아님)
export interface ReplanMove {
  task: SubtaskTask;
  toDate: string;       // 이동 제안 날짜
  withinDeadline: boolean; // 이동해도 기한 내인가
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
  const move: ReplanMove[] = [];
  const movedIds = new Set<string>();
  let resolved = 0;
  for (const t of candidates) {
    if (resolved >= day.overMin) break;
    const dur = t.durationMin ?? 0;
    // 이 task가 들어갈 수 있는 가장 이른 날 (여유 ≥ 소요), 없으면 내일
    let slot = slack.find(s => s.freeMin >= dur && dur > 0);
    if (!slot) slot = slack[0];
    const toDate = slot?.date ?? addDays(date, 1);
    if (slot) slot.freeMin = Math.max(0, slot.freeMin - dur);
    move.push({ task: t, toDate, withinDeadline: !t.deadline || toDate <= t.deadline });
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
