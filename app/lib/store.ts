import { AppData, PlanData, PlanItem, Program, RoutineSystem } from './types';
import { ERR } from './copy';

const KEY = 'spira';

// 목표(Program) 레벨 제거 마이그레이션 — 업무 영역별 1개의 "컨테이너 프로그램"으로 합친다.
// 데드라인·할일 내용은 100% 보존(목표 안의 내용이 영역 밖으로 나오는 형태). 멱등(재실행해도 동일).
// 구조: 업무 영역 > 데드라인 > 업무.  각 컨테이너 id = 해당 영역 id(1:1), 미분류는 합성 id.
function collapseToAreas(
  programs: Program[],
  plan: PlanData,
  routineSystems: RoutineSystem[],
  wsId: string,
): { programs: Program[]; routineSystems: RoutineSystem[] } {
  const areas = plan.workAreas ?? [];
  const validAreaIds = new Set(areas.map(a => a.id));
  const NONE = `__unassigned__:${wsId}`;
  const containers = new Map<string, Program>();
  const remap = new Map<string, string>(); // 옛 programId → 컨테이너 id (루틴 재매핑용)

  const containerFor = (areaId?: string): Program => {
    const valid = !!areaId && validAreaIds.has(areaId);
    const cid = valid ? areaId! : NONE;
    let c = containers.get(cid);
    if (!c) {
      const area = valid ? areas.find(a => a.id === areaId) : undefined;
      c = { id: cid, name: area?.name ?? '미분류', goal: '', color: area?.color ?? '', workAreaId: valid ? areaId : undefined, enabled: true, priority: 1, deadlines: [] };
      containers.set(cid, c);
    }
    return c;
  };

  // 정의된 모든 영역에 컨테이너 보장(빈 영역에도 데드라인을 추가할 수 있도록)
  for (const a of areas) containerFor(a.id);
  // 기존 프로그램의 데드라인을 소속 영역 컨테이너로 이관.
  // 단, Plan에서 '가져온 목표 프로그램'(fromPlan)은 흡수하지 않고 자기 정체성을 유지한다.
  // (안 그러면 로드할 때마다 미분류로 뭉개져 가져온 프로젝트가 사라지는 것처럼 보임)
  const fromPlanPrograms: Program[] = [];
  for (const p of programs) {
    if (p.fromPlan) { fromPlanPrograms.push(p); continue; }
    const c = containerFor(p.workAreaId);
    remap.set(p.id, c.id);
    c.deadlines = [...(c.deadlines ?? []), ...(p.deadlines ?? [])];
  }
  // 루틴 시스템의 programId 재매핑(끊긴 참조 방지)
  const newRoutines = routineSystems.map(rs =>
    rs.programId && remap.has(rs.programId) ? { ...rs, programId: remap.get(rs.programId)! } : rs,
  );
  // 영역 정의 순서대로, 미분류는 마지막, 가져온 목표 프로그램은 그 뒤에 원형 유지
  const ordered: Program[] = [];
  for (const a of areas) { const c = containers.get(a.id); if (c) ordered.push(c); }
  const none = containers.get(NONE); if (none) ordered.push(none);
  for (const p of fromPlanPrograms) ordered.push(p);
  return { programs: ordered, routineSystems: newRoutines };
}

export const emptyPlan: PlanData = {
  brandImages: [],
  brandingKeywords: [],
  tagline: '',
  problems: [],
  mission: '',
  vision: '',
  concept: '',
  valueProposition: { personal: '', social: '', environmental: '' },
  targetCustomers: [],
  solutions: [],
  revenueModel: [],
  growthStages: [],
  workAreas: [],
};

export const empty: AppData = {
  activeWorkspaceId: null,
  workspaces: [],
  homeHiddenTodos: {},
};

export function load(): AppData {
  if (typeof window === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);

    // migrate from old single-workspace format
    if ('workspace' in parsed && !('workspaces' in parsed)) {
      if (!parsed.workspace) return empty;
      return {
        activeWorkspaceId: parsed.workspace.id,
        workspaces: [{
          workspace: { id: parsed.workspace.id, name: parsed.workspace.name },
          plan: { ...emptyPlan, vision: parsed.workspace.vision ?? '' },
          programs: parsed.programs ?? [],
          routineSystems: parsed.routineSystems ?? [],
          resources: parsed.resources ?? [],
          subscriptions: parsed.subscriptions ?? [],
          completions: parsed.completions ?? {},
          skipped: parsed.skipped ?? {},
          quickTasks: parsed.quickTasks ?? [],
          events: parsed.events ?? [],
          proofs: parsed.proofs ?? [],
          timeRecords: parsed.timeRecords ?? [],
        }],
      };
    }

    // ensure each entry has plan
    if (parsed.workspaces) {
      parsed.workspaces = parsed.workspaces.map((e: WorkspaceEntry) => {
        const plan = { ...emptyPlan, ...(e.plan ?? {}) };
        // migrate single brandImage → brandImages array
        if (!plan.brandImages?.length && (e.plan as { brandImage?: string })?.brandImage) {
          plan.brandImages = [(e.plan as { brandImage: string }).brandImage];
        }
        // migrate string[] → PlanItem[] for solutions and revenueModel
        const toItems = (arr: unknown[]): PlanItem[] =>
          (arr ?? []).map(i => typeof i === 'string' ? { title: i, memo: '' } : i as PlanItem);
        plan.solutions = toItems(plan.solutions);
        plan.revenueModel = toItems(plan.revenueModel);
        // 프로그램에 연도/분기/데드라인 기본값 부여 (기존 데이터 보존)
        const programs0 = (e.programs ?? []).map((p: Program) => {
          const ref = p.deadline || p.startDate;
          const refDate = ref ? new Date(ref) : new Date();
          const year = p.year ?? refDate.getFullYear();
          const quarter = p.quarter ?? (Math.floor(refDate.getMonth() / 3) + 1);
          return { ...p, year, quarter, deadlines: p.deadlines ?? [] };
        });
        // 목표 레벨 제거: 업무 영역 컨테이너로 병합 (데드라인·할일 보존)
        const { programs, routineSystems } = collapseToAreas(programs0, plan, e.routineSystems ?? [], e.workspace?.id ?? '');
        // 구독: startMonth 없는 기존 구독은 '이번 달'부터 반영되도록 보정(이전 달 소급 방지)
        const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const subscriptions = (e.subscriptions ?? []).map((s: Record<string, unknown>) => s.startMonth ? s : { ...s, startMonth: nowYM });
        return { ...e, plan, programs, routineSystems, subscriptions, events: e.events ?? [], annualGoals: e.annualGoals ?? {}, revenueTarget: e.revenueTarget };
      });
    }

    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkspaceEntry = any;

// 서버 동기화 훅 — SyncProvider가 로그인 후 등록한다. (디바운스는 pusher 쪽에서 처리)
let serverPusher: ((d: AppData) => void) | null = null;
export function setServerPusher(fn: ((d: AppData) => void) | null): void {
  serverPusher = fn;
}

// localStorage 에만 기록 (서버로 되쏘지 않음) — 서버에서 받은 데이터를 로컬에 반영할 때 사용
export function writeLocalRaw(data: AppData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // localStorage 용량 초과 시 이미지 데이터만 제거 후 재시도
    const stripped = {
      ...data,
      workspaces: data.workspaces.map(e => ({
        ...e,
        proofs: (e.proofs ?? []).map(p => ({ ...p, image: '' })),
      })),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(stripped));
    } catch {
      // 그래도 실패하면 무시
    }
    throw new Error(ERR.imageTooLarge);
  }
}

export function save(data: AppData): void {
  let err: unknown = null;
  try {
    writeLocalRaw(data);
  } catch (e) {
    err = e; // 로컬 저장 실패해도 서버 저장은 시도
  }
  serverPusher?.(data); // 로그인 상태면 서버에도 저장(디바운스)
  if (err) throw err;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function todayDow(): number {
  return new Date().getDay();
}
