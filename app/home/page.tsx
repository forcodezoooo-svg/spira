'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { DashboardSkeleton } from '../components/Skeleton';
import { EmptyState, SuccessState } from '../components/EmptyState';
import { useUI } from '../lib/UIContext';
import { getGoalTasksForDate, getSubtaskTasksForDate, GoalTask, SubtaskTask, workspaceColor } from '../lib/goalTasks';
import TaskTimerButton from '../components/TaskTimerButton';
import TodoEditModal from '../components/TodoEditModal';
import MusicTimer from '../components/MusicTimer';
import GoalsCalendar from '../components/GoalsCalendar';
import WorkHoursPanel from '../components/WorkHoursPanel';
import ReplanProposalModal from '../components/ReplanProposalModal';
import ActualTimeModal from '../components/ActualTimeModal';
import { useTimer } from '../lib/TimerContext';
import { ProgramTodo } from '../lib/types';
import { computeDayCapacity, proposeReplan, buildSubIndex, earliestFromDeps, estimateAccuracy, fmtMin, ReplanProposal, ReplanMove } from '../lib/capacity';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function calcDday(deadline: string): { label: string; urgent: boolean; overdue: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(deadline); end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (diff > 0) return { label: `D-${diff}`, urgent: diff <= 3, overdue: false };
  if (diff === 0) return { label: 'D-Day', urgent: true, overdue: false };
  return { label: `D+${Math.abs(diff)}`, urgent: false, overdue: true };
}

export default function Home() {
  const store = useStore();
  const router = useRouter();
  const { closeChat } = useUI();
  const { stopTaskTimer, getDisplaySeconds } = useTimer();
  const [workspaceName, setWorkspaceName] = useState('');
  const [editTodoTarget, setEditTodoTarget] = useState<GoalTask | null>(null);
  const [homeFilterWs, setHomeFilterWs] = useState<string | null>(null); // 오늘의 업무 비즈니스 필터 (null = 전체)
  const [homeOrder, setHomeOrder] = useState<string[]>([]);
  const [showYesterday, setShowYesterday] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null); // 캘린더에서 클릭한 날짜(그 날짜 업무 목록)
  const [replanOpen, setReplanOpen] = useState(false); // 재배치 제안 모달
  const [aiReplan, setAiReplan] = useState<{ proposal: ReplanProposal; reply: string } | null>(null); // AI가 만든 재배치 제안
  const [aiReplanBusy, setAiReplanBusy] = useState(false);
  const [urgentOpen, setUrgentOpen] = useState(false); // 긴급 업무 입력
  const [urgentName, setUrgentName] = useState('');
  const [urgentDur, setUrgentDur] = useState('');
  const [editDurKey, setEditDurKey] = useState<string | null>(null); // 소요시간 편집 중인 task
  const [editDurVal, setEditDurVal] = useState('');
  const [actualTarget, setActualTarget] = useState<SubtaskTask | null>(null); // 완료 시 실제시간 입력 대상
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // 마운트 시 localStorage에서 초기값 로드 (SSR 하이드레이션 불일치 방지 위해 effect에서 세팅 — 의도된 패턴)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try { setHomeOrder(JSON.parse(localStorage.getItem('spira_home_task_order') ?? '[]')); }
    catch { setHomeOrder([]); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Home을 떠날 때 열려 있던 채팅 오버레이는 닫기
  useEffect(() => {
    return () => { closeChat(); };
  }, [closeChat]);

  if (!store.ready) return <DashboardSkeleton />;

  // ── 온보딩: 워크스페이스가 하나도 없을 때 ──────────────────────────────────
  if (!store.data.workspace) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <p className="text-2xl font-semibold mb-2">Spira에 오신 걸 환영합니다</p>
          <p className="text-neutral-400 text-sm mb-8">워크스페이스 이름을 입력해 시작하세요</p>
          <div className="flex gap-2 justify-center">
            <input
              autoFocus
              className="bg-white text-neutral-900 border border-neutral-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-violet-500 w-64 transition-colors"
              placeholder="예: 아이바이마이"
              value={workspaceName}
              onChange={e => setWorkspaceName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && workspaceName.trim()) {
                  store.setWorkspace({ id: 'ws', name: workspaceName.trim() });
                  router.push('/plan');
                }
              }}
            />
            <button
              disabled={!workspaceName.trim()}
              onClick={() => {
                store.setWorkspace({ id: 'ws', name: workspaceName.trim() });
                router.push('/plan');
              }}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-neutral-900 transition-colors"
            >
              시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  // 로컬 날짜 기준 (UTC 변환으로 인한 하루 밀림 방지 — Task/Goals와 일치)
  const localDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateStr = localDateStr(today);
  const tomorrowDate = new Date(today); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrowDate);
  // 오늘 작업하던 업무를 내일로 이어서 옮기기
  const moveGoalToTomorrow = (t: GoalTask) => {
    const patch: Partial<ProgramTodo> = { date: tomorrowStr };
    // 시작 날짜가 내일이면 기한도 내일 이후가 되도록 보정 (안 그러면 내일에 안 보임)
    if (!t.deadline || t.deadline < tomorrowStr) patch.deadline = tomorrowStr;
    store.updateProgramTodo(t.wsId, t.programId, t.deadlineId, t.todoId, patch);
  };


  // ── 오늘의 업무 (현재 분기 프로그램만) ────────────────────────────────────────
  const isOffToday = store.isOffDay(dateStr);
  const quickTasks = store.getQuickTasksForDate(dateStr);
  // Goals(프로그램→데드라인→할일)에서 오늘 표시할 할일 (Home에서 숨긴 항목 제외)
  const goalTasks = getGoalTasksForDate(store.allWorkspacesEntries, dateStr, dow)
    .filter(t => !store.homeHiddenToday.includes(t.key));
  // 캘린더(Plan에서 가져온 목표)에 오늘 날짜로 배치된 task(세부 산출물 하위 task)
  const subtaskTasks = getSubtaskTasksForDate(store.allWorkspacesEntries, dateStr, { onlyFromPlan: true, carryUnits: true });
  // task(subtask) 완료 토글 — 캘린더/카테고리 보드와 동일 저장 경로
  const toggleSubtaskDone = (t: SubtaskTask) => {
    if (t.days?.length) {
      // 반복 task: 오늘 날짜만 완료 토글 (doneDates)
      const has = (t.doneDates ?? []).includes(dateStr);
      const next = has ? (t.doneDates ?? []).filter(d => d !== dateStr) : [...(t.doneDates ?? []), dateStr];
      store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { doneDates: next });
      return;
    }
    const nowDone = !t.done;
    store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { done: nowDone, status: nowDone ? 'done' : 'todo' });
    // 완료로 표시할 때 실제 소요시간을 아직 안 적었으면 물어본다 (§14, 강제 아님)
    if (nowDone && t.actualMin === undefined) setActualTarget(t);
  };
  // 다른 날짜의 task를 오늘로 옮기기
  const moveSubtaskToToday = (t: SubtaskTask) =>
    store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { date: dateStr, deadline: dateStr });
  // 오늘 task를 내일로 옮기기
  const moveSubtaskToTomorrow = (t: SubtaskTask) =>
    store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { date: tomorrowStr, deadline: tomorrowStr });
  // task의 세부작업(unit) 완료 토글
  const toggleSubtaskUnit = (t: SubtaskTask, unitId: string) =>
    store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { units: (t.units ?? []).map(u => {
      if (u.id !== unitId) return u;
      if (t.days?.length) { // 반복 task의 세부작업 — 오늘 날짜만 토글(doneDates), 영구 done은 건드리지 않음
        const has = (u.doneDates ?? []).includes(dateStr);
        return { ...u, doneDates: has ? (u.doneDates ?? []).filter(d => d !== dateStr) : [...(u.doneDates ?? []), dateStr] };
      }
      return { ...u, done: !u.done };
    }) });
  // 세부작업 오늘 완료 여부 (반복이면 날짜별, 아니면 영구 done)
  const unitDoneToday = (t: SubtaskTask, u: { done: boolean; doneDates?: string[] }) => (t.days?.length ? (u.doneDates ?? []).includes(dateStr) : u.done);
  const fmtDur = (min?: number) => (!min ? '' : min >= 60 ? (min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min / 60}시간`) : `${min}분`);

  // ── 주간 집중 지표 — 한 주(월~일)에 배치된 업무를 업무 영역별로 점수화(임박도×2 + 업무 수) ──
  const weekStartOf = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
  const addDaysD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const ddayNum = (deadline?: string) => deadline ? Math.round((new Date(deadline + 'T00:00:00').getTime() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000) : 999;
  const wsNameOf = (id: string) => store.allWorkspaces.find(w => w.id === id)?.name ?? '';
  type WeekArea = { key: string; name: string; wsId: string; wsName: string; color: string; count: number; minDday: number; score: number };
  const weekAreas = (weekStart: Date): { areas: WeekArea[]; hasTasks: boolean } => {
    const map = new Map<string, WeekArea & { seen: Set<string> }>();
    for (let i = 0; i < 7; i++) {
      const day = addDaysD(weekStart, i);
      for (const t of getGoalTasksForDate(store.allWorkspacesEntries, localDateStr(day), day.getDay())) {
        if (t.done) continue;
        // 업무 영역명 기준으로 묶어 모든 비즈니스의 같은 영역을 통합 (Goals와 동일)
        const key = t.programName ?? 'area';
        let a = map.get(key);
        if (!a) { a = { key, name: t.programName || '업무', wsId: t.wsId, wsName: wsNameOf(t.wsId), color: t.color, count: 0, minDday: 999, score: 0, seen: new Set() }; map.set(key, a); }
        if (!a.seen.has(t.key)) { a.seen.add(t.key); a.count += 1; }
        const dn = ddayNum(t.deadline);
        if (dn < a.minDday) a.minDday = dn;
      }
    }
    const areas: WeekArea[] = [...map.values()]
      .map(a => { const urgency = a.minDday <= 7 ? Math.max(0, 8 - Math.max(0, a.minDday)) : 0; return { key: a.key, name: a.name, wsId: a.wsId, wsName: a.wsName, color: a.color, count: a.count, minDday: a.minDday, score: urgency * 2 + a.count }; })
      .sort((x, y) => y.score - x.score);
    return { areas, hasTasks: areas.length > 0 };
  };
  const thisWeekStart = weekStartOf(today);
  const currentWeekAreas = weekAreas(thisWeekStart).areas; // 오늘 업무 그룹 정렬용(이번 주 기준)

  // ── Time Management: 오늘 가용시간(Capacity) ──
  const entries = store.allWorkspacesEntries;
  const dayCap = computeDayCapacity(entries, store.workSchedule, store.capacity, dateStr);
  const capPct = dayCap.availableProjectMin > 0 ? Math.min(1, dayCap.plannedProjectMin / dayCap.availableProjectMin) : (dayCap.plannedProjectMin > 0 ? 1 : 0);
  // 재배치 제안 (초과일 때만 계산). 규칙 기반이 기본, AI 제안이 있으면 그걸 표시
  const ruleReplan: ReplanProposal | null = dayCap.overMin > 0 ? proposeReplan(entries, store.workSchedule, store.capacity, dateStr) : null;
  const shownReplan = aiReplan?.proposal ?? ruleReplan;
  const applyReplan = (p: ReplanProposal) => {
    for (const m of p.move) {
      const patch: Partial<import('../lib/types').ProgramSubtask> = { date: m.toDate };
      // 기한이 이동일보다 앞서면 기한도 함께 이동 (안 그러면 그날 목록에서 사라짐)
      if (!m.task.deadline || m.task.deadline < m.toDate) patch.deadline = m.toDate;
      store.updateProgramSubtask(m.task.wsId, m.task.programId, m.task.deadlineId, m.task.todoId, m.task.subtaskId, patch);
    }
    setReplanOpen(false); setAiReplan(null);
  };
  // AI에게 더 나은 재배치 제안 요청 (§23) — 규칙 제안의 이동후보 + 향후 14일 여유를 넘김
  const requestAiReplan = async () => {
    if (!ruleReplan || aiReplanBusy) return;
    setAiReplanBusy(true);
    try {
      const movable = [...ruleReplan.keep, ...ruleReplan.move.map(m => m.task)];
      const upcoming: { date: string; freeMin: number }[] = [];
      for (let i = 1; i <= 14; i++) {
        const ds = localDateStr(addDaysD(today, i));
        const dc = computeDayCapacity(entries, store.workSchedule, store.capacity, ds);
        upcoming.push({ date: ds, freeMin: Math.max(0, dc.availableProjectMin - dc.plannedProjectMin) });
      }
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        mode: 'replan', today: dateStr,
        replan: {
          date: dateStr, availableMin: dayCap.availableProjectMin, plannedMin: dayCap.plannedProjectMin, overMin: dayCap.overMin,
          tasks: movable.map(t => ({ id: t.subtaskId, name: t.name, durationMin: t.durationMin, deadline: t.deadline, priority: t.priority ?? 0, schedulingType: t.schedulingType, dependsOn: t.dependsOn, projectDeadline: t.projectDeadline })),
          upcoming,
        },
      }) });
      const data = await res.json().catch(() => ({}));
      const moves = (Array.isArray(data.moves) ? data.moves : []) as { id: string; toDate: string }[];
      const byId = new Map(movable.map(t => [t.subtaskId, t]));
      const idx = buildSubIndex(entries);
      const built: ReplanMove[] = [];
      for (const mv of moves) {
        const t = byId.get(mv.id);
        if (t) built.push({
          task: t, toDate: mv.toDate, withinDeadline: !t.deadline || mv.toDate <= t.deadline,
          projectName: t.projectName, projectDeadline: t.projectDeadline,
          projectAffected: !!t.projectDeadline && mv.toDate > t.projectDeadline,
          depEarliest: earliestFromDeps(idx, t.dependsOn),
        });
      }
      const movedIds = new Set(built.map(m => m.task.subtaskId));
      const resolvedMin = built.reduce((s, m) => s + (m.task.durationMin ?? 0), 0);
      setAiReplan({
        reply: String(data.reply ?? '').trim(),
        proposal: { date: dateStr, overMin: dayCap.overMin, keep: movable.filter(t => !movedIds.has(t.subtaskId)), move: built, resolvedMin, stillOverMin: Math.max(0, dayCap.overMin - resolvedMin) },
      });
    } catch { /* 실패 시 규칙 제안 유지 */ }
    finally { setAiReplanBusy(false); }
  };

  // ── 예상 vs 실제 학습 (§15) ──
  const accuracy = estimateAccuracy(entries).filter(a => a.count >= 2);
  const saveActual = (t: SubtaskTask, min: number) => {
    store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { actualMin: min });
    setActualTarget(null);
  };
  const focusArea = currentWeekAreas[0] ?? null; // 이번 주 가장 집중해야 할 업무 영역
  const areaReason = (a: WeekArea) => (a.minDday < 0 ? '기한 지남' : a.minDday === 0 ? '오늘 마감' : a.minDday <= 7 ? `D-${a.minDday} 임박` : `업무 ${a.count}개`) + (a.minDday <= 7 ? ` · 업무 ${a.count}개` : '');

  // ── 어제 못한 업무 — 어제 예정이었는데 완료 안 한 업무를 '복구'하도록 보여줌 ──
  const yDate = new Date(today); yDate.setDate(yDate.getDate() - 1);
  const yStr = localDateStr(yDate);
  const yDow = yDate.getDay();
  // 오늘 목록에 이미 있는(자동 이월 등) 업무는 제외 → 중복 없음. 반복 업무는 '오늘로'가 의미 없어 제외.
  const todayKeys = new Set([...goalTasks.map(t => t.key), ...quickTasks.map(t => `quick:${t.id}`)]);
  const yGoalUndone = getGoalTasksForDate(store.allWorkspacesEntries, yStr, yDow)
    .filter(t => !t.done && !t.recurring && !todayKeys.has(t.key));
  const yQuickUndone = store.getQuickTasksForDate(yStr).filter(t => !t.completed && !todayKeys.has(`quick:${t.id}`));
  const yesterdayUndoneCount = yGoalUndone.length + yQuickUndone.length;
  // 오늘로 가져오기
  const carryGoalToToday = (t: GoalTask) => {
    const patch: Partial<ProgramTodo> = { date: dateStr };
    if (!t.deadline || t.deadline < dateStr) patch.deadline = dateStr;
    store.updateProgramTodo(t.wsId, t.programId, t.deadlineId, t.todoId, patch);
  };

  // 오늘의 업무 통합 목록 (목표 + 캘린더 task + 추가 업무) — 수동 순서 적용
  type TodayItem = { key: string; kind: 'goal' | 'quick' | 'subtask'; goal?: GoalTask; quick?: typeof quickTasks[number]; subtask?: SubtaskTask };
  const todayItems: TodayItem[] = [
    ...goalTasks.map(t => ({ key: t.key, kind: 'goal' as const, goal: t })),
    ...subtaskTasks.map(t => ({ key: t.key, kind: 'subtask' as const, subtask: t })),
    ...quickTasks.map(t => ({ key: `quick:${t.id}`, kind: 'quick' as const, quick: t })),
  ];
  const orderIndex = (k: string) => { const i = homeOrder.indexOf(k); return i === -1 ? 9999 : i; };
  const itemDone = (item: TodayItem) => item.kind === 'goal' ? item.goal!.done : item.kind === 'subtask' ? item.subtask!.done : item.quick!.completed;

  // 비즈니스 필터 (null = 전체). 추가 업무(quick)는 현재 활성 워크스페이스 소속으로 취급.
  const activeWsId = store.data.workspace?.id ?? null;
  const visibleItems = todayItems.filter(item =>
    !homeFilterWs ? true : item.kind === 'goal' ? item.goal!.wsId === homeFilterWs : item.kind === 'subtask' ? item.subtask!.wsId === homeFilterWs : activeWsId === homeFilterWs,
  );
  const totalTasks = visibleItems.length;
  const doneTasks = visibleItems.filter(itemDone).length;

  // 완료한 업무는 자동으로 하단으로, 그 외에는 수동 순서 유지
  const orderedItems = [...visibleItems].sort((a, b) => {
    const da = itemDone(a) ? 1 : 0, db = itemDone(b) ? 1 : 0;
    if (da !== db) return da - db;
    return orderIndex(a.key) - orderIndex(b.key);
  });

  // 업무 영역별 그룹핑 — 목표 업무는 영역명으로 묶고, 추가 업무는 '추가 업무' 그룹으로(맨 뒤)
  const QUICK_GROUP = '__quick__';
  const todayGroups: { key: string; name: string; color: string; items: TodayItem[] }[] = [];
  const groupMap = new Map<string, (typeof todayGroups)[number]>();
  for (const item of orderedItems) {
    // 업무 영역명 기준으로 묶어 모든 비즈니스의 같은 영역을 하나로 통합 (Goals와 동일)
    const key = item.kind === 'goal' ? (item.goal!.programName ?? 'area') : item.kind === 'subtask' ? (item.subtask!.programName ?? 'area') : QUICK_GROUP;
    const name = item.kind === 'goal' ? (item.goal!.programName || '업무') : item.kind === 'subtask' ? (item.subtask!.programName || '업무') : '추가 업무';
    const color = item.kind === 'goal' ? item.goal!.color : item.kind === 'subtask' ? item.subtask!.color : '#C4CCC4';
    let g = groupMap.get(key);
    if (!g) { g = { key, name, color, items: [] }; groupMap.set(key, g); todayGroups.push(g); }
    g.items.push(item);
  }
  // 이번 주 집중 순위대로 업무 영역 그룹 정렬 (추가 업무는 맨 뒤)
  const weekRank = new Map(currentWeekAreas.map((a, i) => [a.key, i]));
  todayGroups.sort((a, b) => {
    if (a.key === QUICK_GROUP) return 1;
    if (b.key === QUICK_GROUP) return -1;
    return (weekRank.get(a.key) ?? 999) - (weekRank.get(b.key) ?? 999);
  });

  // 드래그&드롭 순서 조정
  const handleDragEnd = () => { setDraggingKey(null); setDragOverKey(null); };
  const handleDrop = (targetKey: string) => {
    if (!draggingKey || draggingKey === targetKey) { handleDragEnd(); return; }
    const keys = orderedItems.map(i => i.key);
    const from = keys.indexOf(draggingKey);
    const to = keys.indexOf(targetKey);
    if (from === -1 || to === -1) { handleDragEnd(); return; }
    const next = [...keys];
    next.splice(from, 1);
    next.splice(to, 0, draggingKey);
    setHomeOrder(next);
    localStorage.setItem('spira_home_task_order', JSON.stringify(next));
    handleDragEnd();
  };
  // li에 적용할 드래그 속성
  const dragProps = (key: string) => ({
    draggable: true,
    onDragStart: () => setDraggingKey(key),
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragOverKey !== key) setDragOverKey(key); },
    onDrop: () => handleDrop(key),
    onDragEnd: handleDragEnd,
    className: `transition-all duration-150 ${
      dragOverKey === key && draggingKey !== key ? 'ring-2 ring-violet-300' :
      draggingKey === key ? 'opacity-50' : ''
    }`,
  });

  // ── 업커밍 데드라인 (전체 워크스페이스) ──────────────────────────────────────
  type Upcoming = { key: string; name: string; date: string; color: string; kind: '데드라인'; wsName: string };
  const upcoming: Upcoming[] = [];
  for (const entry of store.allWorkspacesEntries) {
    // Plan에서 가져온(=새로 만들어지는) 목표의 프로젝트 마감을 D-day로 표시 (로드맵/캘린더와 동일 소스)
    for (const p of entry.programs) {
      if (!p.fromPlan) continue;
      for (const dl of p.deadlines ?? []) {
        if (dl.enabled === false || dl.done || !dl.date || dl.date < dateStr) continue;
        upcoming.push({ key: `d-${dl.id}`, name: dl.name, date: dl.date, color: workspaceColor(store.allWorkspacesEntries, entry.workspace.id), kind: '데드라인', wsName: entry.workspace.name });
      }
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  // 같은 날짜에 끝나는 여정은 한 점으로 묶기
  const journeyGroups: { date: string; items: Upcoming[] }[] = [];
  for (const u of upcoming) {
    // 같은 날짜 + 같은 비즈니스만 한 점으로 묶기 (다른 비즈니스면 각각 따로)
    const g = journeyGroups.find(x => x.date === u.date && x.items[0].wsName === u.wsName);
    if (g) g.items.push(u);
    else journeyGroups.push({ date: u.date, items: [u] });
  }
  // 다가오는 목표: 컨테이너 폭에 맞춰 '잘리지 않을 개수'만 표시 (최대 5개)
  const journeyWrapRef = useRef<HTMLDivElement>(null);
  const [journeyCols, setJourneyCols] = useState(5);
  useEffect(() => {
    const el = journeyWrapRef.current; if (!el) return;
    const MIN = 176, GAP = 16; // 한 항목 최소 폭 + 간격
    const compute = () => setJourneyCols(Math.max(1, Math.floor((el.clientWidth + GAP) / (MIN + GAP))));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [journeyGroups.length]);
  const journey = journeyGroups.slice(0, Math.min(5, journeyCols));


  // ── Goals 캘린더용 데이터 — Plan에서 가져온 항목만 (기존 데이터는 가림, Goals와 동일) ──
  const calPrograms = store.allWorkspacesEntries.flatMap(e =>
    e.programs.filter(p => p.fromPlan).map(p => ({ ...p, wsId: e.workspace.id, wsName: e.workspace.name })));
  const calBusinessColor = (id: string) => workspaceColor(store.allWorkspacesEntries, id);
  const calResolveProject = (wsId: string, id?: string) =>
    id ? ((store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.plan.projects ?? []).find(p => p.id === id) ?? null) : null;


  // 드래그 손잡이 (잡아서 끌어 순서 변경)
  const DragHandle = () => (
    <span className="flex-shrink-0 text-neutral-300 group-hover:text-neutral-500 cursor-grab active:cursor-grabbing transition-colors" title="드래그해서 순서 변경">
      <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
        <circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" />
        <circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" />
      </svg>
    </span>
  );

  // 별표(중요) 버튼
  const StarButton = ({ starred, onClick }: { starred: boolean; onClick: () => void }) => (
    <button onClick={onClick} title="중요 표시" className="flex-shrink-0 transition-colors">
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill={starred ? '#E0B93A' : 'none'} stroke={starred ? '#E0B93A' : '#C7CEC7'} strokeWidth="1.4">
        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L2.2 7.7l5.4-.8L10 2z" strokeLinejoin="round" />
      </svg>
    </button>
  );

  // 목표 업무 한 줄 렌더
  const renderGoalTask = (t: GoalTask) => {
    const dday = t.deadline && !t.done ? calcDday(t.deadline) : null;
    // '오늘' 표시는 완수기한이 오늘인(오늘 안에 끝내야 하는) 업무만
    const isToday = !!t.deadline && t.deadline === dateStr && !t.done;
    const dp = dragProps(t.key);
    return (
      <li key={t.key} draggable={dp.draggable} onDragStart={dp.onDragStart} onDragOver={dp.onDragOver} onDrop={dp.onDrop} onDragEnd={dp.onDragEnd}
        style={{ borderColor: '#BCE89A', backgroundColor: t.done ? '#F8FBF3' : '#FFFFFF' }}
        className={`group flex flex-wrap items-center gap-x-2 gap-y-1.5 border-[1.5px] rounded-3xl px-5 py-3 transition-colors ${dp.className}`}>
        <DragHandle />
        <StarButton starred={t.starred} onClick={() => store.toggleProgramTodoStar(t.wsId, t.programId, t.deadlineId, t.todoId)} />
        <button
          onClick={() => {
            if (!t.done) stopTaskTimer(t.key);
            if (t.recurring) store.toggleProgramTodoDate(t.wsId, t.programId, t.deadlineId, t.todoId, dateStr);
            else store.toggleProgramTodo(t.wsId, t.programId, t.deadlineId, t.todoId, dateStr);
          }}
          style={{ borderColor: t.done ? '#9DFE3B' : '#C7CEC7', backgroundColor: t.done ? '#9DFE3B' : 'transparent' }}
          className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center"
        >
          {t.done && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#16211E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        {isToday && (
          <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>오늘</span>
        )}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
        <span className="font-bold flex-shrink-0 transition-colors" style={{ fontSize: 14, color: t.done ? '#9AA39D' : '#16211E', textDecoration: t.done ? 'line-through' : 'none' }}>
          {t.name}
        </span>
        <span className="text-[13px] truncate min-w-0" style={{ color: '#9AA39D' }}>{t.deadlineName}</span>
        <span className="flex-1" />
        {(t.days?.length ?? 0) > 0 && (
          <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ color: '#96852F', backgroundColor: '#F6EFC2' }}>매주</span>
        )}
        {dday && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={dday.urgent ? { color: '#fff', backgroundColor: '#FF696C' } : dday.overdue ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>
            {dday.label}
          </span>
        )}
        <TaskTimerButton taskId={t.key} done={t.done} />
        {!t.recurring && !t.done && (
          <button
            onClick={() => moveGoalToTomorrow(t)}
            className="text-[10px] text-neutral-400 hover:text-violet-800 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
            title="내일 이어서 하기"
          >
            내일 ↪
          </button>
        )}
        <button
          onClick={() => setEditTodoTarget(t)}
          className="text-[10px] text-neutral-400 hover:text-neutral-700 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
          title="업무 편집 (이름·날짜·기한)"
        >
          편집
        </button>
        <button
          onClick={() => store.hideTodoFromHome(t.key)}
          title={t.recurring ? '오늘 홈에서 숨기기' : '홈에서 숨기기 (Task에서 복구 가능)'}
          className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
        >
          ×
        </button>
      </li>
    );
  };

  // 추가 업무 한 줄 렌더
  const renderQuickTask = (t: typeof quickTasks[number]) => {
    const dp = dragProps(`quick:${t.id}`);
    return (
    <li key={`quick:${t.id}`} draggable={dp.draggable} onDragStart={dp.onDragStart} onDragOver={dp.onDragOver} onDrop={dp.onDrop} onDragEnd={dp.onDragEnd}
      style={{ borderColor: '#BCE89A', backgroundColor: t.completed ? '#F8FBF3' : '#FFFFFF' }}
      className={`group flex items-center gap-3 border-[1.5px] rounded-full px-5 py-3 transition-colors ${dp.className}`}>
      <DragHandle />
      <StarButton starred={!!t.starred} onClick={() => store.toggleQuickTaskStar(t.id)} />
      <button
        onClick={() => { if (!t.completed) stopTaskTimer(`quick:${t.id}`); store.toggleQuickTask(t.id); }}
        style={{ borderColor: t.completed ? '#9DFE3B' : '#C7CEC7', backgroundColor: t.completed ? '#9DFE3B' : 'transparent' }}
        className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center"
      >
        {t.completed && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#16211E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="text-[15px] font-bold flex-1 min-w-0 truncate transition-colors" style={{ color: t.completed ? '#9AA39D' : '#16211E', textDecoration: t.completed ? 'line-through' : 'none' }}>
        {t.name}
      </span>
      <TaskTimerButton taskId={`quick:${t.id}`} done={t.completed} />
      {!t.completed && (
        <button
          onClick={() => store.moveQuickTask(t.id, tomorrowStr)}
          className="text-[10px] text-neutral-400 hover:text-violet-800 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
          title="내일 이어서 하기"
        >
          내일 ↪
        </button>
      )}
      <button
        onClick={() => store.deleteQuickTask(t.id)}
        title="추가 업무 삭제"
        className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
      >
        ×
      </button>
    </li>
    );
  };

  // 소요시간 인라인 편집 (오늘의 업무 태그 클릭)
  const saveDur = (t: SubtaskTask) => {
    const n = Math.round(Number(editDurVal));
    store.updateProgramSubtask(t.wsId, t.programId, t.deadlineId, t.todoId, t.subtaskId, { durationMin: n > 0 ? n : undefined });
    setEditDurKey(null);
  };

  // 캘린더 task(세부 산출물 하위 task) 한 줄 렌더
  const renderSubtaskTask = (t: SubtaskTask) => {
    const dday = t.deadline && !t.done ? calcDday(t.deadline) : null;
    const isToday = !!t.deadline && t.deadline === dateStr && !t.done;
    const dp = dragProps(t.key);
    return (
      <li key={t.key} draggable={dp.draggable} onDragStart={dp.onDragStart} onDragOver={dp.onDragOver} onDrop={dp.onDrop} onDragEnd={dp.onDragEnd}
        style={{ borderColor: '#BCE89A', backgroundColor: t.done ? '#F8FBF3' : '#FFFFFF' }}
        className={`group flex flex-wrap items-center gap-x-2 gap-y-1.5 border-[1.5px] rounded-3xl px-5 py-3 transition-colors ${dp.className}`}>
        <DragHandle />
        <button
          onClick={() => { if (!t.done) stopTaskTimer(t.key); toggleSubtaskDone(t); }}
          style={{ borderColor: t.done ? '#9DFE3B' : '#C7CEC7', backgroundColor: t.done ? '#9DFE3B' : 'transparent' }}
          className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center"
        >
          {t.done && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#16211E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </button>
        {isToday && (
          <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>오늘</span>
        )}
        {(t.days?.length ?? 0) > 0 && (
          <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ color: '#7C3AED', backgroundColor: '#F3F0FF' }}>매주</span>
        )}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
        <span className="font-bold flex-shrink-0 transition-colors" style={{ fontSize: 14, color: t.done ? '#9AA39D' : '#16211E', textDecoration: t.done ? 'line-through' : 'none' }}>
          {t.name}
        </span>
        <span className="text-[13px] truncate min-w-0" style={{ color: '#9AA39D' }}>{t.deliverableName}</span>
        <span className="flex-1" />
        {editDurKey === t.key ? (
          <span className="flex items-center gap-1 flex-shrink-0" style={{ color: '#7C3AED' }} onClick={e => e.stopPropagation()}>
            <input autoFocus type="number" min={0} step={5} value={editDurVal} onChange={e => setEditDurVal(e.target.value)}
              onBlur={() => saveDur(t)} onKeyDown={e => { if (e.key === 'Enter') saveDur(t); else if (e.key === 'Escape') setEditDurKey(null); }}
              className="w-14 text-[11px] tabular-nums text-right px-2 py-0.5 rounded-full outline-none" style={{ backgroundColor: '#F3F0FF', border: '1px solid #C9BCF0', color: '#7C3AED' }} placeholder="분" />
            <span className="text-[10px]">분</span>
          </span>
        ) : t.durationMin ? (
          <span onClick={e => { e.stopPropagation(); setEditDurKey(t.key); setEditDurVal(String(t.durationMin)); }} title="소요시간 수정" className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 cursor-pointer hover:brightness-95" style={{ color: '#7C3AED', backgroundColor: '#F3F0FF' }}>{fmtDur(t.durationMin)}</span>
        ) : (
          <button onClick={e => { e.stopPropagation(); setEditDurKey(t.key); setEditDurVal(''); }} title="소요시간 입력" className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9AA39D', backgroundColor: '#F0F0EA' }}>+시간</button>
        )}
        {dday && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={dday.urgent ? { color: '#fff', backgroundColor: '#FF696C' } : dday.overdue ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>
            {dday.label}
          </span>
        )}
        <TaskTimerButton taskId={t.key} done={t.done} />
        {!t.done && !(t.days?.length) && (
          <button
            onClick={() => moveSubtaskToTomorrow(t)}
            className="text-[10px] text-neutral-400 hover:text-violet-800 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
            title="내일 이어서 하기"
          >
            내일 ↪
          </button>
        )}
        {(t.units?.length ?? 0) > 0 && (
          <ul className="w-full mt-1 ml-7 space-y-1">
            {t.units!.map(u => { const ud = unitDoneToday(t, u); return (
              <li key={u.id} className="flex items-center gap-2">
                <button onClick={() => toggleSubtaskUnit(t, u.id)} className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: ud ? '#5EA63A' : '#C7CEC7', backgroundColor: ud ? '#5EA63A' : 'transparent' }}>
                  {ud && <svg className="w-2 h-2" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, color: ud ? '#9AA39D' : '#5B6560', textDecoration: ud ? 'line-through' : 'none' }}>{u.name}</span>
                {u.durationMin ? <span className="text-[10px] flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtDur(u.durationMin)}</span> : null}
              </li>
            ); })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      {/* ── 왼쪽: 메인 ── */}
      <div className="min-w-0">
        {/* D-day 타임라인 */}
        {journey.length > 0 && (
          <div className="bg-white rounded-[22px] border mb-8" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)', padding: '24px 24px' }}>
            <div className="relative">
              {/* 다이아몬드 중앙(마커 행 높이 24px의 절반)을 지나는 연결선 */}
              <div className="absolute left-0 right-0 top-3 h-px -translate-y-1/2" style={{ backgroundColor: 'var(--spira-border)' }} />
              <div ref={journeyWrapRef} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${journey.length}, minmax(0, 1fr))` }}>
                {journey.map(group => {
                  const dday = calcDday(group.date);
                  const first = group.items[0];
                  const diamondColor = first.color; // 비즈니스 색
                  return (
                    <div key={`${group.date}-${first.wsName}`} className="min-w-0">
                      <div className="flex items-center gap-2 h-6 relative z-10">
                        <svg viewBox="0 0 15 15" className="w-3.5 h-3.5 flex-shrink-0"><path d="M7.3 14.61C5.33 11.75 2.85 9.27 0 7.31C2.86 5.34 5.34 2.86 7.3 0C9.27 2.86 11.75 5.34 14.6 7.3C11.74 9.27 9.26 11.75 7.3 14.6V14.61Z" fill={diamondColor} /></svg>
                        <span className="text-[12px] font-semibold rounded-full px-2.5 py-0.5 truncate" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>{dday.label}</span>
                      </div>
                      <div className="text-[14px] font-semibold line-clamp-2 break-words mt-2.5" style={{ color: '#16211E' }}>{first.name}</div>
                      <div className="text-[12px] mt-1 truncate" style={{ color: '#9AA39D' }}>
                        {first.wsName}{group.items.length > 1 ? ` 외 ${group.items.length - 1}개` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 인사 */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] mb-2" style={{ color: '#5B6560' }}>
              {`${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 ${DOW[dow]}요일`}
            </p>
            <h1 className="text-[32px] font-black leading-tight tracking-[-0.02em]" style={{ color: '#16211E' }}>
              안녕하세요.<br />오늘의 업무를 시작해볼까요?
            </h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/deco.svg" alt="" aria-hidden className="hidden md:block w-[262px] h-auto flex-shrink-0 pointer-events-none select-none" />
        </div>

        {/* 비즈니스 필터 (전체 + 각 사업) — 선택 시 그 사업의 오늘 업무만 표시 */}
        {store.allWorkspaces.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <button
              onClick={() => setHomeFilterWs(null)}
              className="px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
              style={!homeFilterWs ? { backgroundColor: '#16211E', color: '#fff' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
            >
              전체
            </button>
            {store.allWorkspaces.map(ws => {
              const sel = homeFilterWs === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setHomeFilterWs(sel ? null : ws.id)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                  style={sel ? { backgroundColor: '#DFF9C4', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: workspaceColor(store.allWorkspacesEntries, ws.id) }} />
                  {ws.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 오늘의 가용시간 (Time Management) */}
        {dayCap.baseMin > 0 && (
          <div className="mb-4 rounded-[20px] border p-4" style={{ boxShadow: 'var(--spira-shadow)', borderColor: dayCap.overMin > 0 ? '#F3C7C7' : 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
            <div className="flex items-center justify-between mb-2.5 flex-wrap gap-x-4 gap-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[13px] font-black" style={{ color: '#16211E' }}>오늘 가용시간</span>
                {/* 출근 / 퇴근 */}
                {(() => {
                  const att = store.attendance[dateStr] ?? {};
                  const hhmm = (ms?: number) => ms ? new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
                  return (
                    <div className="flex items-center gap-1.5">
                      {att.in ? (
                        <span className="text-[11px] font-bold rounded-full px-2 py-0.5 tabular-nums" style={{ backgroundColor: '#E4F5E0', color: '#3E6B1F' }} title="출근 시각 (눌러서 취소)"
                          onClick={() => window.confirm('출근 기록을 취소할까요?') && store.setClock(dateStr, 'in', null)} role="button">출근 {hhmm(att.in)}</span>
                      ) : (
                        <button onClick={() => store.setClock(dateStr, 'in', Date.now())} data-teach="hp-clockin" className="text-[11px] font-bold rounded-full px-2.5 py-0.5 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>출근</button>
                      )}
                      {att.out ? (
                        <span className="text-[11px] font-bold rounded-full px-2 py-0.5 tabular-nums" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }} title="퇴근 시각 (눌러서 취소)"
                          onClick={() => window.confirm('퇴근 기록을 취소할까요?') && store.setClock(dateStr, 'out', null)} role="button">퇴근 {hhmm(att.out)}</span>
                      ) : (
                        <button onClick={() => store.setClock(dateStr, 'out', Date.now())} disabled={!att.in} className="text-[11px] font-bold rounded-full px-2.5 py-0.5 transition-transform hover:-translate-y-0.5 disabled:opacity-30" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>퇴근</button>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-3 text-[12px]">
                <span style={{ color: '#5B6560' }}>가용 <b className="tabular-nums" style={{ color: '#16211E' }}>{fmtMin(dayCap.availableProjectMin)}</b></span>
                <span style={{ color: '#5B6560' }}>계획 <b className="tabular-nums" style={{ color: dayCap.overMin > 0 ? '#C0392B' : '#3E7A2E' }}>{fmtMin(dayCap.plannedProjectMin)}</b></span>
                <span style={{ color: '#9AA39D' }}>Buffer <span className="tabular-nums">{fmtMin(dayCap.bufferMin)}</span></span>
              </div>
            </div>
            {/* 진행 막대 */}
            <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F0F0EA' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(capPct * 100)}%`, backgroundColor: dayCap.overMin > 0 ? '#FF696C' : '#9DFE3B' }} />
            </div>
            {dayCap.overMin > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: '#FFF1F1' }}>
                <span className="text-[12px] font-semibold" style={{ color: '#C0392B' }}>오늘 {fmtMin(dayCap.overMin)} 초과예요</span>
                <button onClick={() => setReplanOpen(true)} className="text-[12px] font-bold rounded-full px-3 py-1 transition-transform hover:-translate-y-0.5 flex-shrink-0" style={{ backgroundColor: '#16211E', color: '#fff' }}>재배치 제안 보기</button>
              </div>
            )}
          </div>
        )}

        {/* 완료 카운트 + 전체보기 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {totalTasks > 0 ? (
              <span className="text-[14px] font-semibold" style={{ color: '#16211E' }}>{doneTasks}/{totalTasks} 완료</span>
            ) : (
              <span className="text-[14px]" style={{ color: '#9AA39D' }}>오늘 예정된 업무가 없어요</span>
            )}
            {isOffToday && (
              <span className="text-[12px] font-semibold rounded-full px-2.5 py-0.5" style={{ color: '#96852F', backgroundColor: '#F6EFC2' }}>☕ 오프데이</span>
            )}
          </div>
          <button onClick={() => setUrgentOpen(o => !o)} className="flex items-center gap-1 text-[12px] font-bold rounded-full px-3 py-1.5 transition-colors" style={{ backgroundColor: urgentOpen ? '#FFE1E1' : '#F0F0EA', color: urgentOpen ? '#C0392B' : '#5B6560' }} title="프로젝트에 속하지 않는 갑작스러운 업무를 빠르게 추가">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>긴급 업무
          </button>
        </div>

        {/* 긴급/ad-hoc 업무 빠른 추가 (§11) */}
        {urgentOpen && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border p-2.5" style={{ borderColor: '#F3C7C7', backgroundColor: '#FFF7F7' }}>
            <input autoFocus value={urgentName} onChange={e => setUrgentName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && urgentName.trim()) { store.addUrgentTask(urgentName.trim(), { date: dateStr, deadline: dateStr, durationMin: Number(urgentDur) > 0 ? Number(urgentDur) : undefined, priority: 5 }); setUrgentName(''); setUrgentDur(''); } }} placeholder="긴급 업무 이름" className="flex-1 min-w-0 text-[13px] bg-white border rounded-lg px-3 py-2 outline-none focus:border-red-300" style={{ borderColor: 'var(--spira-border)' }} />
            <input type="number" min={0} step={15} value={urgentDur} onChange={e => setUrgentDur(e.target.value)} placeholder="분" className="w-16 text-[13px] tabular-nums bg-white border rounded-lg px-2 py-2 outline-none focus:border-red-300" style={{ borderColor: 'var(--spira-border)' }} title="예상 소요 시간(분)" />
            <button onClick={() => { if (!urgentName.trim()) return; store.addUrgentTask(urgentName.trim(), { date: dateStr, deadline: dateStr, durationMin: Number(urgentDur) > 0 ? Number(urgentDur) : undefined, priority: 5 }); setUrgentName(''); setUrgentDur(''); }} disabled={!urgentName.trim()} className="px-3.5 py-2 rounded-lg text-[13px] font-bold disabled:opacity-40 flex-shrink-0" style={{ backgroundColor: '#FF696C', color: '#fff' }}>추가</button>
          </div>
        )}

        {/* 어제 못한 업무 — 복구해서 보기 */}
        {yesterdayUndoneCount > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowYesterday(s => !s)}
              className="w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-colors hover:brightness-[0.98]"
              style={{ backgroundColor: '#FCF3E6' }}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#96631A' }}>
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.5V8l2.3 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                어제 못한 업무 {yesterdayUndoneCount}개
              </span>
              <svg className={`w-4 h-4 transition-transform ${showYesterday ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" style={{ color: '#C9A662' }}><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {showYesterday && (
              <ul className="mt-2 space-y-2">
                {yGoalUndone.map(t => (
                  <li key={t.key} className="flex items-center gap-2.5 bg-white border rounded-2xl px-4 py-2.5" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-[14px] truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{t.name}</span>
                    <span className="text-[11px] flex-shrink-0" style={{ color: '#9AA39D' }}>{t.programName}</span>
                    <button onClick={() => carryGoalToToday(t)} className="text-[12px] font-semibold rounded-full px-3 py-1 flex-shrink-0 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>오늘로</button>
                  </li>
                ))}
                {yQuickUndone.map(t => (
                  <li key={t.id} className="flex items-center gap-2.5 bg-white border rounded-2xl px-4 py-2.5" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#C4CCC4' }} />
                    <span className="text-[14px] truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{t.name}</span>
                    <span className="text-[11px] flex-shrink-0" style={{ color: '#9AA39D' }}>추가 업무</span>
                    <button onClick={() => store.moveQuickTask(t.id, dateStr)} className="text-[12px] font-semibold rounded-full px-3 py-1 flex-shrink-0 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>오늘로</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 태스크 목록 · 빈/완료 상태 */}
        {totalTasks === 0 ? (
          <EmptyState
            title="오늘 할 일을 생성하면 할 일이 나타나요"
            description="Process에서 목표·업무를 이 날짜에 배치하면 여기에 나타나요."
            action={<button onClick={() => router.push('/programs')} className="px-4 py-2 rounded-full text-[13px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>Process에서 생성하기</button>}
          />
        ) : (
          <>
            {doneTasks === totalTasks && (
              <div className="mb-4"><SuccessState compact title="오늘 할 일을 모두 끝냈어요 🎉" description="깔끔하게 마무리했어요. 내일도 이 흐름을 이어가요." /></div>
            )}
            <div className="space-y-5">
              {todayGroups.map(g => {
                // 이번 주 가장 집중해야 할 업무 영역이면 눈에 띄게 박스 처리
                const isFocus = !!focusArea && g.key === focusArea.key && g.key !== QUICK_GROUP;
                return (
                  <div
                    key={g.key}
                    className={isFocus ? 'rounded-[24px] px-4 pt-4 pb-4 -mx-1' : ''}
                    style={isFocus ? { backgroundColor: '#F4FBEA', border: '1.5px solid #BCE89A' } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                      {/* 색상 닷 제거 — 업무 영역은 특정 비즈니스 소속이 아니라 모든 비즈니스 통합 (비즈니스 구분은 각 업무 옆 닷으로 표시) */}
                      <span className="text-[13px] font-bold" style={{ color: isFocus ? '#16211E' : '#5B6560' }}>{g.name}</span>
                      {isFocus && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>
                          🎯 이번 주 집중
                        </span>
                      )}
                      {isFocus && (
                        <span className="text-[11px] font-medium" style={{ color: '#7A9463' }}>{areaReason(focusArea)}</span>
                      )}
                    </div>
                    <ul className="space-y-3">
                      {g.items.map(item =>
                        item.kind === 'goal'
                          ? renderGoalTask(item.goal!)
                          : item.kind === 'subtask'
                            ? renderSubtaskTask(item.subtask!)
                            : renderQuickTask(item.quick!)
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── 오른쪽: 대시보드 (모바일에서는 숨김) ── */}
      <aside className="hidden lg:block space-y-4 lg:sticky lg:top-8">
        {/* 업무시간 설정 + 타이머 — 직사각형 타일 2개 가로 나열 */}
        <div className="grid grid-cols-2 gap-4 items-stretch">
          <WorkHoursPanel tile />
          <MusicTimer tile />
        </div>

        {/* 예상 vs 실제 (학습) */}
        {accuracy.length > 0 && (
          <div className="bg-white border rounded-2xl p-4" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}>
            <span className="text-[13px] font-black" style={{ color: '#16211E' }}>예상 vs 실제</span>
            <p className="text-[11px] mt-0.5 mb-3 leading-relaxed" style={{ color: '#9AA39D' }}>완료한 업무의 실제 시간을 모아 예상과 비교해요. 새 업무의 예상시간 보정에 쓰여요.</p>
            <div className="space-y-2.5">
              {accuracy.slice(0, 5).map(a => {
                const diff = Math.round((a.factor - 1) * 100);
                return (
                  <div key={a.area}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[12px] font-bold truncate min-w-0" style={{ color: '#16211E' }}>{a.area}</span>
                      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: diff > 10 ? '#C0392B' : diff < -10 ? '#2B62C4' : '#3E7A2E' }}>{diff > 0 ? `+${diff}%` : `${diff}%`}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: '#9AA39D' }}>
                      <span>예상 {fmtMin(a.avgEstimate)}</span>
                      <span>→</span>
                      <span style={{ color: '#5B6560' }}>실제 {fmtMin(a.avgActual)}</span>
                      <span className="ml-auto">{a.count}건</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Goals 캘린더 — 일정 배치·드래그 편집 (Goals 페이지와 동일). 날짜 클릭 시 그 날짜 업무 목록 표시 */}
        <GoalsCalendar
          programs={calPrograms}
          businessColor={calBusinessColor}
          resolveProject={calResolveProject}
          cardClassName="h-[640px]"
          selectedDate={selectedCalDate}
          onSelectDate={ds => setSelectedCalDate(prev => (prev === ds ? null : ds))}
        />

        {/* 선택한 날짜의 업무 목록 (캘린더에서 다른 날짜를 클릭하면 표시) */}
        {selectedCalDate && (() => {
          const list = getSubtaskTasksForDate(store.allWorkspacesEntries, selectedCalDate, { onlyFromPlan: true, carryUnits: true });
          const d = new Date(selectedCalDate + 'T00:00:00');
          const label = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
          return (
            <div className="bg-white border rounded-[24px] p-5" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-black" style={{ color: '#16211E' }}>{label}</span>
                  {selectedCalDate === dateStr && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>오늘</span>}
                  <span className="text-[12px] tabular-nums" style={{ color: '#9AA39D' }}>{list.filter(t => !t.done).length}개</span>
                </div>
                <button onClick={() => setSelectedCalDate(null)} className="text-neutral-300 hover:text-neutral-600 text-sm transition-colors" title="닫기">×</button>
              </div>
              {list.length === 0 ? (
                <p className="text-[12px] text-center py-6" style={{ color: '#9AA39D' }}>이 날짜에 배치된 업무가 없어요.</p>
              ) : (
                <ul className="space-y-2">
                  {list.map(t => {
                    const dday = t.deadline && !t.done ? calcDday(t.deadline) : null;
                    return (
                      <li key={t.key} className="flex items-center gap-2.5 border rounded-2xl px-3.5 py-2.5" style={{ borderColor: '#E7EFDD', backgroundColor: t.done ? '#F8FBF3' : '#fff' }}>
                        <button
                          onClick={() => toggleSubtaskDone(t)}
                          style={{ borderColor: t.done ? '#9DFE3B' : '#C7CEC7', backgroundColor: t.done ? '#9DFE3B' : 'transparent' }}
                          className="w-[16px] h-[16px] rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center"
                        >
                          {t.done && <svg className="w-2 h-2" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#16211E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-[13px] font-semibold flex-1 min-w-0 truncate" style={{ color: t.done ? '#9AA39D' : '#16211E', textDecoration: t.done ? 'line-through' : 'none' }}>{t.name}</span>
                        {t.durationMin ? <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: '#7C3AED' }}>{fmtDur(t.durationMin)}</span> : null}
                        {dday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={dday.urgent ? { color: '#fff', backgroundColor: '#FF696C' } : dday.overdue ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>{dday.label}</span>}
                        {!t.done && selectedCalDate !== dateStr && (
                          <button onClick={() => moveSubtaskToToday(t)} className="text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }} title="이 업무를 오늘로 가져오기">오늘 하기</button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })()}
      </aside>

      {editTodoTarget && (
        <TodoEditModal
          initial={{
            id: editTodoTarget.todoId,
            name: editTodoTarget.name,
            done: editTodoTarget.done,
            date: editTodoTarget.date,
            days: editTodoTarget.days,
            deadline: editTodoTarget.deadline,
          } as ProgramTodo}
          onSave={patch => store.updateProgramTodo(editTodoTarget.wsId, editTodoTarget.programId, editTodoTarget.deadlineId, editTodoTarget.todoId, patch)}
          onClose={() => setEditTodoTarget(null)}
        />
      )}

      {actualTarget && (
        <ActualTimeModal
          taskName={actualTarget.name}
          estimatedMin={actualTarget.durationMin}
          recordedMin={(() => { const sec = getDisplaySeconds(dateStr, actualTarget.key); return sec > 0 ? Math.max(1, Math.round(sec / 60)) : undefined; })()}
          onSave={min => saveActual(actualTarget, min)}
          onSkip={() => setActualTarget(null)}
        />
      )}

      {replanOpen && shownReplan && (
        <ReplanProposalModal
          proposal={shownReplan}
          onApply={applyReplan}
          onClose={() => { setReplanOpen(false); setAiReplan(null); }}
          onRequestAI={requestAiReplan}
          aiBusy={aiReplanBusy}
          aiReply={aiReplan?.reply}
          aiActive={!!aiReplan}
          aiEnabled
        />
      )}
    </div>
  );
}
