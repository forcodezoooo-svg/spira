'use client';
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { AppData, WorkspaceEntry, Program, RoutineSystem, ResourceEntry, Subscription, RevenueTarget, Workspace, PlanData, Project, QuickTask, CalendarEvent, TaskProof, TaskTimeRecord, WorkSchedule, WorkDay } from './types';
import { empty, emptyPlan, load, save, uid, todayStr, todayDow } from './store';

// ── 전역 공유 스토어 ──────────────────────────────────────────────────────────
// 모든 useStore() 인스턴스가 '같은' 데이터를 본다. (예전엔 컴포넌트마다 독립 useState라
// 페이지·상주 컴포넌트 간 데이터가 어긋나고, 오래된 복사본이 삭제를 되살리는 버그가 있었음)
let globalData: AppData = empty;
let hydrated = false;
const storeListeners = new Set<() => void>();
const emitStore = () => { for (const l of storeListeners) l(); };
const subscribeStore = (cb: () => void) => { storeListeners.add(cb); return () => { storeListeners.delete(cb); }; };
const getClientData = () => globalData;
const getServerData = () => empty;
// 외부(SyncProvider)에서 서버/초기 데이터로 교체할 때 사용 — 모든 화면을 즉시 갱신
export function setGlobalStoreData(d: AppData) { globalData = d; hydrated = true; emitStore(); }
import { workspaceColor } from './goalTasks';
import { useToast } from './ToastContext';
import { ERR } from './copy';

const emptyEntry: Omit<WorkspaceEntry, 'workspace'> = {
  plan: emptyPlan,
  programs: [],
  routineSystems: [],
  resources: [],
  subscriptions: [],
  completions: {},
  skipped: {},
  quickTasks: [],
  events: [],
  proofs: [],
  timeRecords: [],
};

export function useStore() {
  const appData = useSyncExternalStore(subscribeStore, getClientData, getServerData);
  const [ready, setReady] = useState(hydrated);
  const { toast } = useToast();

  useEffect(() => {
    // 최초 1회만 localStorage → 전역 스토어 로드 후 전체 갱신 (모든 인스턴스 공유)
    if (!hydrated) { globalData = load(); hydrated = true; emitStore(); }
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (!ready) setReady(true);
  }, [ready]);

  const update = useCallback((updater: (d: AppData) => AppData) => {
    const next = { ...updater(globalData), updatedAt: Date.now() }; // 변경 시각 스탬프 → 새로고침 시 최신본 유지
    globalData = next;
    try {
      save(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : ERR.generic, 'error');
    }
    emitStore();
  }, [toast]);

  const updateActive = useCallback((updater: (e: WorkspaceEntry) => WorkspaceEntry) => {
    update(d => ({
      ...d,
      workspaces: d.workspaces.map(e =>
        e.workspace.id === d.activeWorkspaceId ? updater(e) : e
      ),
    }));
  }, [update]);

  const activeEntry = appData.workspaces.find(e => e.workspace.id === appData.activeWorkspaceId) ?? null;

  const data = {
    workspace: activeEntry?.workspace ?? null,
    plan: { ...emptyPlan, ...(activeEntry?.plan ?? {}) },
    programs: activeEntry?.programs ?? [],
    routineSystems: activeEntry?.routineSystems ?? [],
    resources: activeEntry?.resources ?? [],
    subscriptions: activeEntry?.subscriptions ?? [],
    revenueSources: activeEntry?.revenueSources ?? [],
    revenueSourceBiz: activeEntry?.revenueSourceBiz ?? {},
    revenueSourceTargets: activeEntry?.revenueSourceTargets ?? {},
    expenseCategories: activeEntry?.expenseCategories ?? [],
    expenseCategoryTargets: activeEntry?.expenseCategoryTargets ?? {},
    revenueTarget: activeEntry?.revenueTarget,
    annualGoals: activeEntry?.annualGoals ?? {},
    growthStageIndex: activeEntry?.growthStageIndex ?? 0,
    achievedAreaGoals: activeEntry?.achievedAreaGoals ?? [],
    completions: activeEntry?.completions ?? {},
  };

  const allWorkspaces = appData.workspaces.map(e => e.workspace);
  const allWorkspacesEntries = appData.workspaces;

  // 날짜별 Home 숨김 (구버전 배열 데이터는 무시 → 날짜 바뀌면 다시 표시)
  const hiddenToday = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const hiddenMapOf = (d: AppData): Record<string, string[]> => {
    const m = d.homeHiddenTodos;
    return m && !Array.isArray(m) ? m : {};
  };
  const homeHiddenToday = hiddenMapOf(appData)[hiddenToday] ?? [];
  const hideTodoFromHome = (key: string) =>
    update(d => {
      const m = hiddenMapOf(d);
      return { ...d, homeHiddenTodos: { ...m, [hiddenToday]: [...(m[hiddenToday] ?? []), key] } };
    });
  const unhideTodoFromHome = (key: string) =>
    update(d => {
      const m = hiddenMapOf(d);
      return { ...d, homeHiddenTodos: { ...m, [hiddenToday]: (m[hiddenToday] ?? []).filter(k => k !== key) } };
    });

  // 출근(on)/오프(off) 데이
  const offDays = appData.offDays ?? [];
  const isOffDay = (dateStr: string) => offDays.includes(dateStr);
  const toggleOffDay = (dateStr: string) =>
    update(d => ({
      ...d,
      offDays: (d.offDays ?? []).includes(dateStr)
        ? (d.offDays ?? []).filter(x => x !== dateStr)
        : [...(d.offDays ?? []), dateStr],
    }));

  // 주간 업무시간 타임테이블 (요일별 근무 가능 시간). 기본값: 월~금 09:00-18:00
  const DEFAULT_WORK_SCHEDULE: WorkSchedule = Array.from({ length: 7 }, (_, i) => ({
    on: i >= 1 && i <= 5, start: '09:00', end: '18:00',
  }));
  const workSchedule: WorkSchedule = (appData.workSchedule && appData.workSchedule.length === 7)
    ? appData.workSchedule
    : DEFAULT_WORK_SCHEDULE;
  const setWorkDay = (day: number, patch: Partial<WorkDay>) =>
    update(d => {
      const base = (d.workSchedule && d.workSchedule.length === 7) ? d.workSchedule : DEFAULT_WORK_SCHEDULE;
      return { ...d, workSchedule: base.map((wd, i) => (i === day ? { ...wd, ...patch } : wd)) };
    });

  // Time Management — 가용시간(Capacity) 설정 (Buffer 비율 + 날짜별 예외)
  const capacity = appData.capacity ?? {};
  const setBufferPercent = (p: number) =>
    update(d => ({ ...d, capacity: { ...(d.capacity ?? {}), bufferPercent: Math.min(0.5, Math.max(0, p)) } }));
  const setDateCapacityOverride = (date: string, hours: number | null) =>
    update(d => {
      const ov = { ...(d.capacity?.dateOverrides ?? {}) };
      if (hours === null) delete ov[date]; else ov[date] = Math.max(0, hours);
      return { ...d, capacity: { ...(d.capacity ?? {}), dateOverrides: ov } };
    });
  // 주별 업무시간표 override — 그 주(월요일 키)에 한해 요일 근무시간을 조정 (기본 workSchedule은 유지)
  const setWeekWorkDay = (weekStart: string, day: number, patch: Partial<WorkDay>) =>
    update(d => {
      const base = (d.workSchedule && d.workSchedule.length === 7) ? d.workSchedule : DEFAULT_WORK_SCHEDULE;
      const weeks = { ...(d.capacity?.weekSchedules ?? {}) };
      const cur = (weeks[weekStart] && weeks[weekStart].length === 7) ? weeks[weekStart] : base;
      weeks[weekStart] = cur.map((wd, i) => (i === day ? { ...wd, ...patch } : wd));
      return { ...d, capacity: { ...(d.capacity ?? {}), weekSchedules: weeks } };
    });
  // 그 주를 기본 스케줄로 되돌리기 (override 제거)
  const resetWeekSchedule = (weekStart: string) =>
    update(d => {
      const weeks = { ...(d.capacity?.weekSchedules ?? {}) };
      delete weeks[weekStart];
      return { ...d, capacity: { ...(d.capacity ?? {}), weekSchedules: weeks } };
    });

  // 카테고리 보드 템플릿 (산출물+task 세트)
  const boardTemplates = appData.boardTemplates ?? [];
  const addBoardTemplate = (tpl: Omit<import('./types').BoardTemplate, 'id' | 'createdAt'>) =>
    update(d => ({ ...d, boardTemplates: [...(d.boardTemplates ?? []), { ...tpl, id: uid(), createdAt: new Date().toISOString() }] }));
  const deleteBoardTemplate = (id: string) =>
    update(d => ({ ...d, boardTemplates: (d.boardTemplates ?? []).filter(t => t.id !== id) }));

  // 업무 영역 표시 순서 (이름 기준). Goals에서 사용자가 조정
  const areaOrder = appData.areaOrder ?? [];
  const moveArea = (name: string, dir: -1 | 1) =>
    update(d => {
      const cur = [...(d.areaOrder ?? [])];
      // 저장된 순서에 없는 이름이면 뒤에 추가해 기준 인덱스를 확보
      if (!cur.includes(name)) cur.push(name);
      const i = cur.indexOf(name);
      const j = i + dir;
      if (j < 0 || j >= cur.length) return d;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      return { ...d, areaOrder: cur };
    });
  const setAreaOrder = (names: string[]) =>
    update(d => ({ ...d, areaOrder: names }));

  // 월별 캘린더 메모
  const calendarMemos = appData.calendarMemos ?? {};
  const setCalendarMemo = (ym: string, text: string) =>
    update(d => ({ ...d, calendarMemos: { ...(d.calendarMemos ?? {}), [ym]: text } }));

  const updateWorkspace = useCallback((wsId: string, updater: (e: WorkspaceEntry) => WorkspaceEntry) =>
    update(d => ({
      ...d,
      workspaces: d.workspaces.map(e => e.workspace.id === wsId ? updater(e) : e),
    })), [update]);

  const addProgramToWs = (wsId: string, p: Omit<Program, 'id'>) =>
    updateWorkspace(wsId, e => ({ ...e, programs: [...e.programs, { ...p, id: uid() }] }));

  const updateProgramInWs = (wsId: string, p: Program) =>
    updateWorkspace(wsId, e => ({ ...e, programs: e.programs.map(x => x.id === p.id ? p : x) }));

  const deleteProgramInWs = (wsId: string, id: string) =>
    updateWorkspace(wsId, e => ({ ...e, programs: e.programs.filter(x => x.id !== id) }));

  const setWorkspaceColor = (wsId: string, color: string) =>
    updateWorkspace(wsId, e => ({ ...e, workspace: { ...e.workspace, color } }));

  // Operating Mode & 주간 Capacity 배분 (비즈니스별)
  const setOperatingMode = (wsId: string, mode: import('./types').OperatingMode) =>
    updateWorkspace(wsId, e => ({ ...e, operatingMode: mode }));
  const setWeeklyCapacityHours = (wsId: string, hours: number | null) =>
    updateWorkspace(wsId, e => ({ ...e, weeklyCapacityHours: hours === null ? undefined : Math.max(0, hours) }));

  // Goals의 프로그램 → 데드라인 → 할일 완료 토글 (완료일 기록 → 완료일 이후 숨김)
  const toggleProgramTodo = (wsId: string, programId: string, deadlineId: string, todoId: string, dateStr?: string) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => t.id === todoId
            ? { ...t, done: !t.done, doneDate: !t.done ? dateStr : undefined }
            : t),
        }),
      }),
    }));

  // 목표 할일 별표(중요) 토글
  const toggleProgramTodoStar = (wsId: string, programId: string, deadlineId: string, todoId: string) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => t.id === todoId ? { ...t, starred: !t.starred } : t),
        }),
      }),
    }));

  // 목표 할일 무게(가벼운 작업) 토글
  const toggleProgramTodoLight = (wsId: string, programId: string, deadlineId: string, todoId: string) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => t.id === todoId ? { ...t, light: !t.light } : t),
        }),
      }),
    }));

  // 매주 반복 할일의 특정 날짜 완료 토글 (날짜별로 완수 기록)
  const toggleProgramTodoDate = (wsId: string, programId: string, deadlineId: string, todoId: string, dateStr: string) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => {
            if (t.id !== todoId) return t;
            const dates = t.doneDates ?? [];
            return { ...t, doneDates: dates.includes(dateStr) ? dates.filter(x => x !== dateStr) : [...dates, dateStr] };
          }),
        }),
      }),
    }));

  // 할일 필드 편집 (이름/시작날짜/매주반복/완수기한 등)
  const updateProgramTodo = (wsId: string, programId: string, deadlineId: string, todoId: string, patch: Partial<import('./types').ProgramTodo>) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => t.id === todoId ? { ...t, ...patch } : t),
        }),
      }),
    }));

  // Task(ProgramSubtask) 부분 수정 — Home 토글/Replanning 적용/actual 기록 공용
  const updateProgramSubtask = (wsId: string, programId: string, deadlineId: string, todoId: string, subtaskId: string, patch: Partial<import('./types').ProgramSubtask>) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => t.id !== todoId ? t : {
            ...t,
            subtasks: (t.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, ...patch } : s),
          }),
        }),
      }),
    }));

  // 완수한 할일에 기록(메모/이미지/링크) 저장
  const setProgramTodoRecord = (wsId: string, programId: string, deadlineId: string, todoId: string, record: import('./types').TodoRecord | undefined) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(p => p.id !== programId ? p : {
        ...p,
        deadlines: (p.deadlines ?? []).map(d => d.id !== deadlineId ? d : {
          ...d,
          todos: d.todos.map(t => t.id === todoId ? { ...t, record } : t),
        }),
      }),
    }));

  const setAnnualGoalInWs = (wsId: string, year: number, goal: string) =>
    updateWorkspace(wsId, e => ({ ...e, annualGoals: { ...(e.annualGoals ?? {}), [String(year)]: goal } }));

  // 사업 성장 단계 진행: 달성 시 다음 단계로
  const advanceGrowthStage = (wsId: string) =>
    updateWorkspace(wsId, e => ({ ...e, growthStageIndex: (e.growthStageIndex ?? 0) + 1 }));
  const setGrowthStageIndex = (wsId: string, idx: number) =>
    updateWorkspace(wsId, e => ({ ...e, growthStageIndex: Math.max(0, idx) }));
  // 업무 영역 목표 달성 토글 — 달성하면 여정 지도에 깃발 추가, 해제하면 제거
  const toggleAreaGoalAchieved = (wsId: string, areaId: string) =>
    update(d => {
      const entry = d.workspaces.find(e => e.workspace.id === wsId);
      if (!entry) return d;
      const cur = entry.achievedAreaGoals ?? [];
      const isAchieved = cur.includes(areaId);
      const area = (entry.plan.workAreas ?? []).find(a => a.id === areaId);
      const workspaces = d.workspaces.map(e =>
        e.workspace.id === wsId
          ? { ...e, achievedAreaGoals: isAchieved ? cur.filter(x => x !== areaId) : [...cur, areaId] }
          : e,
      );
      let flags = d.journeyFlags ?? [];
      if (isAchieved) {
        flags = flags.filter(f => !(f.wsId === wsId && f.areaId === areaId));
      } else if (area) {
        if (!flags.some(f => f.wsId === wsId && f.areaId === areaId)) {
          flags = [...flags, {
            id: uid(),
            wsId,
            wsName: entry.workspace.name,
            areaId,
            areaName: area.name,
            goal: area.goal,
            color: workspaceColor(d.workspaces, wsId),
            achievedAt: new Date().toISOString(),
          }];
        }
      }
      return { ...d, workspaces, journeyFlags: flags };
    });

  // 데드라인 끝내기 토글 — 완료 시 소요시간 기록 + 여정 지도에 깃발 증정, 해제 시 깃발 제거
  const toggleDeadlineDone = (wsId: string, programId: string, deadlineId: string) =>
    update(d => {
      const entry = d.workspaces.find(e => e.workspace.id === wsId);
      const prog = entry?.programs.find(p => p.id === programId);
      const dl = prog?.deadlines?.find(x => x.id === deadlineId);
      if (!entry || !prog || !dl) return d;
      const willDone = !dl.done;
      const now = new Date().toISOString();
      const totalSeconds = (dl.todos ?? []).reduce((s, t) => s + (t.record?.seconds ?? 0), 0);
      const workspaces = d.workspaces.map(e => e.workspace.id === wsId ? {
        ...e,
        programs: e.programs.map(p => p.id === programId ? {
          ...p,
          deadlines: (p.deadlines ?? []).map(x => x.id === deadlineId
            ? (willDone ? { ...x, done: true, doneAt: now, totalSeconds } : { ...x, done: false, doneAt: undefined })
            : x),
        } : p),
      } : e);
      const area = (entry.plan.workAreas ?? []).find(a => a.id === prog.workAreaId);
      let flags = d.journeyFlags ?? [];
      if (willDone) {
        if (!flags.some(f => f.deadlineId === deadlineId)) {
          flags = [...flags, {
            id: uid(), wsId, wsName: entry.workspace.name,
            areaId: prog.workAreaId ?? '', areaName: area?.name ?? prog.name,
            deadlineId, goal: dl.name, totalSeconds,
            color: workspaceColor(d.workspaces, wsId),
            achievedAt: now,
          }];
        }
      } else {
        flags = flags.filter(f => f.deadlineId !== deadlineId);
      }
      return { ...d, workspaces, journeyFlags: flags };
    });

  // 오프 기간: fromDate(포함) 이후의 모든 일정 날짜를 days만큼 뒤로 밀기 (전체 사업)
  const addDaysStr = (ds: string, n: number) => {
    const d = new Date(ds); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const shiftAllSchedulesAfter = (fromDate: string, days: number) => {
    if (days <= 0) return;
    const shift = (d?: string) => (d && d >= fromDate ? addDaysStr(d, days) : d);
    update(dt => ({
      ...dt,
      workspaces: dt.workspaces.map(e => ({
        ...e,
        programs: e.programs.map(p => ({
          ...p,
          startDate: shift(p.startDate),
          deadline: shift(p.deadline),
          deadlines: (p.deadlines ?? []).map(dl => ({
            ...dl,
            date: shift(dl.date) ?? dl.date,
            startDate: shift(dl.startDate),
            todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })),
          })),
        })),
      })),
    }));
  };

  const reorderProgramsInWs = (wsId: string, ids: string[]) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: ids.map(id => e.programs.find(p => p.id === id)!).filter(Boolean),
    }));

  const addRoutineToWs = (wsId: string, rs: Omit<RoutineSystem, 'id'>) =>
    updateWorkspace(wsId, e => ({ ...e, routineSystems: [...e.routineSystems, { ...rs, id: uid() }] }));

  const updateRoutineInWs = (wsId: string, rs: RoutineSystem) =>
    updateWorkspace(wsId, e => ({ ...e, routineSystems: e.routineSystems.map(x => x.id === rs.id ? rs : x) }));

  const deleteRoutineInWs = (wsId: string, id: string) =>
    updateWorkspace(wsId, e => ({ ...e, routineSystems: e.routineSystems.filter(x => x.id !== id) }));

  const updatePlanInWs = (wsId: string, plan: PlanData) =>
    updateWorkspace(wsId, e => ({ ...e, plan }));

  // ── 프로젝트 (Plan에서 정의, Goals에서 조직화) ──────────────────────────────
  const addProject = (wsId: string, p: Omit<Project, 'id'>) =>
    updateWorkspace(wsId, e => ({ ...e, plan: { ...e.plan, projects: [...(e.plan.projects ?? []), { ...p, id: uid() }] } }));
  const updateProject = (wsId: string, id: string, patch: Partial<Project>) =>
    updateWorkspace(wsId, e => ({ ...e, plan: { ...e.plan, projects: (e.plan.projects ?? []).map(x => x.id === id ? { ...x, ...patch } : x) } }));
  // 프로젝트 삭제 — 소속 데드라인은 유지하되 미지정으로 되돌린다.
  const removeProject = (wsId: string, id: string) =>
    updateWorkspace(wsId, e => ({
      ...e,
      plan: { ...e.plan, projects: (e.plan.projects ?? []).filter(x => x.id !== id) },
      programs: e.programs.map(pr => ({ ...pr, deadlines: (pr.deadlines ?? []).map(d => d.projectId === id ? { ...d, projectId: undefined } : d) })),
    }));
  // 데드라인을 프로젝트에 배정/해제 (projectId undefined = 미지정)
  const setDeadlineProject = (wsId: string, programId: string, deadlineId: string, projectId?: string) =>
    updateWorkspace(wsId, e => ({
      ...e,
      programs: e.programs.map(pr => pr.id !== programId ? pr : { ...pr, deadlines: (pr.deadlines ?? []).map(d => d.id !== deadlineId ? d : { ...d, projectId }) }),
    }));

  const setWorkspace = (workspace: Workspace) =>
    update(d => {
      const exists = d.workspaces.find(e => e.workspace.id === workspace.id);
      if (exists) {
        return {
          ...d,
          workspaces: d.workspaces.map(e => e.workspace.id === workspace.id ? { ...e, workspace } : e),
        };
      }
      return {
        ...d,
        activeWorkspaceId: workspace.id,
        workspaces: [...d.workspaces, { ...emptyEntry, workspace }],
      };
    });

  const addWorkspace = (name: string): string => {
    const ws: Workspace = { id: uid(), name };
    update(d => ({
      ...d,
      activeWorkspaceId: ws.id,
      workspaces: [...d.workspaces, { ...emptyEntry, workspace: ws }],
    }));
    return ws.id;
  };

  const switchWorkspace = (id: string) =>
    update(d => ({ ...d, activeWorkspaceId: id }));

  const deleteWorkspace = (id: string) =>
    update(d => {
      const remaining = d.workspaces.filter(e => e.workspace.id !== id);
      return {
        ...d,
        workspaces: remaining,
        activeWorkspaceId: d.activeWorkspaceId === id ? (remaining[0]?.workspace.id ?? '') : d.activeWorkspaceId,
      };
    });

  const updatePlan = (plan: PlanData) =>
    updateActive(e => ({ ...e, plan }));

  const addProgram = (p: Omit<Program, 'id'>) =>
    updateActive(e => ({ ...e, programs: [...e.programs, { ...p, id: uid() }] }));

  const updateProgram = (p: Program) =>
    updateActive(e => ({ ...e, programs: e.programs.map(x => x.id === p.id ? p : x) }));

  const deleteProgram = (id: string) =>
    updateActive(e => ({ ...e, programs: e.programs.filter(x => x.id !== id) }));

  const reorderPrograms = (ids: string[]) =>
    updateActive(e => ({
      ...e,
      programs: ids.map(id => e.programs.find(p => p.id === id)!).filter(Boolean),
    }));

  const addRoutineSystem = (rs: Omit<RoutineSystem, 'id'>) =>
    updateActive(e => ({ ...e, routineSystems: [...e.routineSystems, { ...rs, id: uid() }] }));

  const updateRoutineSystem = (rs: RoutineSystem) =>
    updateActive(e => ({ ...e, routineSystems: e.routineSystems.map(x => x.id === rs.id ? rs : x) }));

  const deleteRoutineSystem = (id: string) =>
    updateActive(e => ({ ...e, routineSystems: e.routineSystems.filter(x => x.id !== id) }));

  const key = todayStr();
  const dow = todayDow();
  // 오늘 요일에 해당하는 할 일이 하나라도 있는 루틴만 표시
  const todayRoutines = data.routineSystems.filter(rs =>
    rs.tasks.some(t => (t.days ?? []).length === 0 || t.days.includes(dow))
  );
  const completed = data.completions[key] || [];

  const toggleTask = (rsId: string, taskId: string) => {
    const k = `${rsId}:${taskId}`;
    updateActive(e => {
      const prev = e.completions[key] || [];
      const next = prev.includes(k) ? prev.filter((x: string) => x !== k) : [...prev, k];
      return { ...e, completions: { ...e.completions, [key]: next } };
    });
  };

  const isCompleted = (rsId: string, taskId: string) =>
    completed.includes(`${rsId}:${taskId}`);

  const addResource = (r: Omit<ResourceEntry, 'id'>) =>
    updateActive(e => ({ ...e, resources: [...e.resources, { ...r, id: uid() }] }));

  const deleteResource = (id: string) =>
    updateActive(e => ({ ...e, resources: e.resources.filter(x => x.id !== id) }));

  // 특정 비즈니스(워크스페이스)의 거래/구독 수정 — Resources 통합 뷰에서 소유 워크스페이스로 라우팅
  const deleteResourceInWs = (wsId: string, id: string) =>
    updateWorkspace(wsId, e => ({ ...e, resources: e.resources.filter(x => x.id !== id) }));

  const setRevenueTarget = (target: RevenueTarget | undefined) =>
    updateActive(e => ({ ...e, revenueTarget: target }));

  // 수익원(수익 수단) 카테고리 — 금액 입력과 별개로 먼저 정의
  const addRevenueSource = (name: string) =>
    updateActive(e => {
      const list = e.revenueSources ?? [];
      if (list.includes(name)) return e;
      return { ...e, revenueSources: [...list, name] };
    });

  // 카테고리는 전 워크스페이스 합산 표시라, 삭제/지정도 모든 워크스페이스에 적용해야 정합
  const deleteRevenueSource = (name: string) =>
    update(d => ({ ...d, workspaces: d.workspaces.map(e => {
      const biz = { ...(e.revenueSourceBiz ?? {}) };
      delete biz[name];
      return { ...e, revenueSources: (e.revenueSources ?? []).filter(s => s !== name), revenueSourceBiz: biz };
    }) }));

  // 수익원 -> 소속 비즈니스(workspace id) 지정 (빈 값이면 해제) — 전 워크스페이스에 반영
  const setRevenueSourceBiz = (name: string, wsId: string) =>
    update(d => ({ ...d, workspaces: d.workspaces.map(e => {
      const biz = { ...(e.revenueSourceBiz ?? {}) };
      if (wsId) biz[name] = wsId; else delete biz[name];
      return { ...e, revenueSourceBiz: biz };
    }) }));

  // 수익 카테고리 목표 비중(%)
  const setRevenueSourceTarget = (name: string, pct: number) =>
    updateActive(e => ({ ...e, revenueSourceTargets: { ...(e.revenueSourceTargets ?? {}), [name]: pct } }));

  // 비용 카테고리 (수익과 별개)
  const addExpenseCategory = (name: string) =>
    updateActive(e => {
      const list = e.expenseCategories ?? [];
      if (list.includes(name)) return e;
      return { ...e, expenseCategories: [...list, name] };
    });
  const deleteExpenseCategory = (name: string) =>
    update(d => ({ ...d, workspaces: d.workspaces.map(e => {
      const t = { ...(e.expenseCategoryTargets ?? {}) };
      delete t[name];
      return { ...e, expenseCategories: (e.expenseCategories ?? []).filter(s => s !== name), expenseCategoryTargets: t };
    }) }));
  const setExpenseCategoryTarget = (name: string, pct: number) =>
    updateActive(e => ({ ...e, expenseCategoryTargets: { ...(e.expenseCategoryTargets ?? {}), [name]: pct } }));

  const addSubscription = (s: Omit<Subscription, 'id'>) => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    updateActive(e => ({ ...e, subscriptions: [...(e.subscriptions ?? []), { startMonth: ym, ...s, id: uid() }] }));
  };

  const deleteSubscription = (id: string) =>
    updateActive(e => ({ ...e, subscriptions: (e.subscriptions ?? []).filter(x => x.id !== id) }));

  const updateSubscription = (s: Subscription) =>
    updateActive(e => ({ ...e, subscriptions: (e.subscriptions ?? []).map(x => x.id === s.id ? s : x) }));

  const deleteSubscriptionInWs = (wsId: string, id: string) =>
    updateWorkspace(wsId, e => ({ ...e, subscriptions: (e.subscriptions ?? []).filter(x => x.id !== id) }));

  const updateSubscriptionInWs = (wsId: string, s: Subscription) =>
    updateWorkspace(wsId, e => ({ ...e, subscriptions: (e.subscriptions ?? []).map(x => x.id === s.id ? s : x) }));

  const skipTask = (rsId: string, taskId: string, date: string) => {
    const k = `${rsId}:${taskId}`;
    updateActive(e => {
      const prev = (e.skipped ?? {})[date] || [];
      if (prev.includes(k)) return e;
      return { ...e, skipped: { ...(e.skipped ?? {}), [date]: [...prev, k] } };
    });
  };

  const isTaskSkipped = (rsId: string, taskId: string, date: string): boolean =>
    ((activeEntry?.skipped ?? {})[date] || []).includes(`${rsId}:${taskId}`);

  const moveQuickTask = (id: string, newDate: string) =>
    updateActive(e => ({
      ...e,
      quickTasks: (e.quickTasks ?? []).map((t: QuickTask) => t.id === id ? { ...t, date: newDate } : t),
    }));

  const addProof = (proof: Omit<TaskProof, 'id'>) =>
    updateActive(e => ({
      ...e,
      proofs: [...(e.proofs ?? []), { ...proof, id: uid() }],
    }));

  const removeProof = (rsId: string, taskId: string, date: string) =>
    updateActive(e => ({
      ...e,
      proofs: (e.proofs ?? []).filter(
        (p: TaskProof) => !(p.rsId === rsId && p.taskId === taskId && p.date === date)
      ),
    }));

  const getAllProofs = (): TaskProof[] =>
    [...(activeEntry?.proofs ?? [])].sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const addQuickTask = (name: string, date: string) =>
    updateActive(e => ({
      ...e,
      quickTasks: [...(e.quickTasks ?? []), { id: uid(), name, date, completed: false }],
    }));

  // 긴급/ad-hoc 업무 추가 (프로젝트 비종속) — 소요시간/기한/우선순위 포함 (§11)
  const addUrgentTask = (name: string, opts?: { date?: string; durationMin?: number; deadline?: string; priority?: number }) =>
    updateActive(e => ({
      ...e,
      quickTasks: [...(e.quickTasks ?? []), {
        id: uid(), name, completed: false,
        date: opts?.date ?? todayStr(),
        durationMin: opts?.durationMin,
        deadline: opts?.deadline,
        priority: opts?.priority ?? 3,
        schedulingType: 'flexible' as const,
      }],
    }));

  const toggleQuickTask = (id: string) =>
    updateActive(e => ({
      ...e,
      quickTasks: (e.quickTasks ?? []).map((t: QuickTask) => t.id === id ? { ...t, completed: !t.completed } : t),
    }));

  const toggleQuickTaskStar = (id: string) =>
    updateActive(e => ({
      ...e,
      quickTasks: (e.quickTasks ?? []).map((t: QuickTask) => t.id === id ? { ...t, starred: !t.starred } : t),
    }));

  const toggleQuickTaskLight = (id: string) =>
    updateActive(e => ({
      ...e,
      quickTasks: (e.quickTasks ?? []).map((t: QuickTask) => t.id === id ? { ...t, light: !t.light } : t),
    }));

  const setQuickTaskTime = (id: string, startTime: string | undefined) =>
    updateActive(e => ({
      ...e,
      quickTasks: (e.quickTasks ?? []).map((t: QuickTask) => t.id === id ? { ...t, startTime } : t),
    }));

  const deleteQuickTask = (id: string) =>
    updateActive(e => ({
      ...e,
      quickTasks: (e.quickTasks ?? []).filter((t: QuickTask) => t.id !== id),
    }));

  const getQuickTasksForDate = (date: string): QuickTask[] => {
    const tasks = activeEntry?.quickTasks ?? [];
    const forDate = tasks.filter((t: QuickTask) => t.date === date);
    // 오늘 날짜를 조회할 때만 과거의 미완료 업무도 함께 표시 (자동 이월)
    if (date !== todayStr()) return forDate;
    const pastUncompleted = tasks.filter((t: QuickTask) => t.date < date && !t.completed);
    return [...pastUncompleted, ...forDate];
  };

  const addEvent = (name: string, date: string) =>
    updateActive(e => ({
      ...e,
      events: [...(e.events ?? []), { id: uid(), name, date }],
    }));

  const deleteEvent = (id: string) =>
    updateActive(e => ({
      ...e,
      events: (e.events ?? []).filter((ev: CalendarEvent) => ev.id !== id),
    }));

  const getEventsForDate = (date: string): CalendarEvent[] =>
    (activeEntry?.events ?? []).filter((ev: CalendarEvent) => ev.date === date);

  return {
    data, ready,
    allWorkspaces,
    setWorkspace, addWorkspace, switchWorkspace, deleteWorkspace,
    updatePlan,
    allWorkspacesEntries,
    addProgram, updateProgram, deleteProgram, reorderPrograms,
    addProgramToWs, updateProgramInWs, deleteProgramInWs, reorderProgramsInWs,
    setAnnualGoalInWs, advanceGrowthStage, setGrowthStageIndex, toggleAreaGoalAchieved, toggleDeadlineDone, shiftAllSchedulesAfter,
    journeyFlags: appData.journeyFlags ?? [],
    setWorkspaceColor, toggleProgramTodo, toggleProgramTodoDate, toggleProgramTodoStar, toggleProgramTodoLight, setProgramTodoRecord, updateProgramTodo, updateProgramSubtask,
    offDays, isOffDay, toggleOffDay,
    workSchedule, setWorkDay,
    capacity, setBufferPercent, setDateCapacityOverride, setWeekWorkDay, resetWeekSchedule,
    boardTemplates, addBoardTemplate, deleteBoardTemplate,
    setOperatingMode, setWeeklyCapacityHours,
    areaOrder, moveArea, setAreaOrder,
    calendarMemos, setCalendarMemo,
    homeHiddenToday, hideTodoFromHome, unhideTodoFromHome,
    addRoutineSystem, updateRoutineSystem, deleteRoutineSystem,
    addRoutineToWs, updateRoutineInWs, deleteRoutineInWs,
    updatePlanInWs,
    addProject, updateProject, removeProject, setDeadlineProject,
    todayRoutines, toggleTask, isCompleted,
    addResource, deleteResource, deleteResourceInWs,
    addSubscription, deleteSubscription, updateSubscription, deleteSubscriptionInWs, updateSubscriptionInWs,
    setRevenueTarget, addRevenueSource, deleteRevenueSource, setRevenueSourceBiz,
    setRevenueSourceTarget, addExpenseCategory, deleteExpenseCategory, setExpenseCategoryTarget,
    addQuickTask, addUrgentTask, toggleQuickTask, toggleQuickTaskStar, toggleQuickTaskLight, setQuickTaskTime, deleteQuickTask, getQuickTasksForDate,
    addEvent, deleteEvent, getEventsForDate,
    addProof, removeProof, getAllProofs,
    skipTask, isTaskSkipped, moveQuickTask,
    addTimeRecord: (r: Omit<TaskTimeRecord, 'id'>) =>
      updateActive(e => ({ ...e, timeRecords: [...(e.timeRecords ?? []), { ...r, id: uid() }] })),
    getAverageSeconds: (rsId: string, taskId: string): number | null => {
      const records = (activeEntry?.timeRecords ?? [])
        .filter((r: TaskTimeRecord) => r.rsId === rsId && r.taskId === taskId && r.seconds > 0);
      if (!records.length) return null;
      return Math.round(records.reduce((s: number, r: TaskTimeRecord) => s + r.seconds, 0) / records.length);
    },
  };
}
