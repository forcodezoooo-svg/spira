'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from './lib/useStore';
import { DashboardSkeleton } from './components/Skeleton';
import { EmptyState, SuccessState } from './components/EmptyState';
import { useUI } from './lib/UIContext';
import { getGoalTasksForDate, GoalTask, workspaceColor } from './lib/goalTasks';
import TaskTimerButton from './components/TaskTimerButton';
import TodoEditModal from './components/TodoEditModal';
import MusicTimer from './components/MusicTimer';
import MemoPanel from './components/MemoPanel';
import { useTimer } from './lib/TimerContext';
import { ProgramTodo } from './lib/types';

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
  const { stopTaskTimer } = useTimer();
  const [workspaceName, setWorkspaceName] = useState('');
  const [editTodoTarget, setEditTodoTarget] = useState<GoalTask | null>(null);
  const [progressWsId, setProgressWsId] = useState<string | null>(null);
  const [progressMenuOpen, setProgressMenuOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const [homeOrder, setHomeOrder] = useState<string[]>([]);
  const [showYesterday, setShowYesterday] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // 마운트 시 localStorage에서 초기값 로드 (SSR 하이드레이션 불일치 방지 위해 effect에서 세팅 — 의도된 패턴)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try { setHomeOrder(JSON.parse(localStorage.getItem('spira_home_task_order') ?? '[]')); }
    catch { setHomeOrder([]); }
    const savedWs = localStorage.getItem('spira_home_progress_ws');
    if (savedWs) setProgressWsId(savedWs);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Home을 떠날 때 열려 있던 채팅 오버레이는 닫기
  useEffect(() => {
    return () => { closeChat(); };
  }, [closeChat]);

  // 프로젝트 진행상황 비즈니스 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!progressMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (progressRef.current && !progressRef.current.contains(e.target as Node)) setProgressMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [progressMenuOpen]);

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
  const fmt = (n: number) => n.toLocaleString('ko-KR');


  // ── 오늘의 업무 (현재 분기 프로그램만) ────────────────────────────────────────
  const isOffToday = store.isOffDay(dateStr);
  const quickTasks = store.getQuickTasksForDate(dateStr);
  // Goals(프로그램→데드라인→할일)에서 오늘 표시할 할일 (Home에서 숨긴 항목 제외)
  const goalTasks = getGoalTasksForDate(store.allWorkspacesEntries, dateStr, dow)
    .filter(t => !store.homeHiddenToday.includes(t.key));
  const totalTasks = quickTasks.length + goalTasks.length;
  const doneTasks = quickTasks.filter(t => t.completed).length + goalTasks.filter(t => t.done).length;

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

  // 오늘의 업무 통합 목록 (목표 + 추가 업무) — 수동 순서 적용
  type TodayItem = { key: string; kind: 'goal' | 'quick'; goal?: GoalTask; quick?: typeof quickTasks[number] };
  const todayItems: TodayItem[] = [
    ...goalTasks.map(t => ({ key: t.key, kind: 'goal' as const, goal: t })),
    ...quickTasks.map(t => ({ key: `quick:${t.id}`, kind: 'quick' as const, quick: t })),
  ];
  const orderIndex = (k: string) => { const i = homeOrder.indexOf(k); return i === -1 ? 9999 : i; };
  const itemDone = (item: TodayItem) => item.kind === 'goal' ? item.goal!.done : item.quick!.completed;
  // 완료한 업무는 자동으로 하단으로, 그 외에는 수동 순서 유지
  const orderedItems = [...todayItems].sort((a, b) => {
    const da = itemDone(a) ? 1 : 0, db = itemDone(b) ? 1 : 0;
    if (da !== db) return da - db;
    return orderIndex(a.key) - orderIndex(b.key);
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

  // ── 수익/지출 (전체 비즈니스 통합, 이번 달) ────────────────────────────────────
  // 홈의 수익/지출 박스는 활성 워크스페이스와 무관하게 모든 비즈니스를 합산해 보여준다.
  const ym = dateStr.slice(0, 7);
  const allResources = store.allWorkspacesEntries.flatMap(e => e.resources);
  const monthIncome = allResources.filter(r => r.type === 'income' && r.date.startsWith(ym)).reduce((s, r) => s + r.amount, 0);
  const monthExpense = allResources.filter(r => r.type === 'expense' && r.date.startsWith(ym)).reduce((s, r) => s + r.amount, 0);
  // 구독은 시작 월(startMonth)부터 반영 — 이번 달 기준으로 합산
  const subTotal = store.allWorkspacesEntries.flatMap(e => e.subscriptions ?? []).filter(s => !s.startMonth || s.startMonth <= ym).reduce((s, r) => s + r.amount, 0);
  const netProfit = monthIncome - monthExpense - subTotal;

  // ── 업커밍 데드라인 (전체 워크스페이스) ──────────────────────────────────────
  type Upcoming = { key: string; name: string; date: string; color: string; kind: '데드라인'; wsName: string };
  const upcoming: Upcoming[] = [];
  for (const entry of store.allWorkspacesEntries) {
    // 전체 비즈니스의 '데드라인' 항목을 표시(제목 = 데드라인 이름). 별(마커) 색 = 비즈니스 색.
    for (const p of entry.programs) {
      if (!p.workAreaId) continue; // '미분류' 제외 (Goals와 정합)
      for (const dl of p.deadlines ?? []) {
        if (dl.enabled === false || !dl.date || dl.date < dateStr) continue;
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
  const journey = journeyGroups.slice(0, 5); // 다가오는 목표 5개 고정


  // ── 프로젝트 진행상황 (업무 영역 안의 '데드라인' 단위 — 각 데드라인의 할일 진행률) ──
  const projectProgress = store.allWorkspacesEntries
    .flatMap(e => e.programs
      .filter(p => p.workAreaId) // 미분류 제외
      .flatMap(p => (p.deadlines ?? [])
        .filter(dl => dl.date && dl.enabled !== false && !dl.done) // 날짜 있고 진행 중인 데드라인
        .map(dl => {
          const todos = dl.todos ?? [];
          let pct: number | null = null;
          if (todos.length > 0) pct = Math.round((todos.filter(t => t.done).length / todos.length) * 100);
          const dday = dl.date ? calcDday(dl.date) : null;
          return {
            id: dl.id,
            name: dl.name,
            color: workspaceColor(store.allWorkspacesEntries, e.workspace.id),
            pct,
            dday,
            deadline: dl.date,
            wsName: e.workspace.name,
            wsId: e.workspace.id,
          };
        })))
    // 디데이 임박 순
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

  const goToGoals = (wsId: string) => {
    store.switchWorkspace(wsId);
    router.push('/programs');
  };

  // 프로젝트 진행상황: 선택한 비즈니스(토글)의 프로젝트만 표시.
  // 저장된 선택값이 있으면 그것을 유지(새로고침 무관), 없거나 삭제된 비즈니스면 활성 워크스페이스로 폴백.
  const effProgressWs = (progressWsId && store.allWorkspaces.some(w => w.id === progressWsId))
    ? progressWsId
    : (store.data.workspace?.id ?? null);
  const progressList = projectProgress.filter(p => p.wsId === effProgressWs);
  const effProgressName = store.allWorkspaces.find(w => w.id === effProgressWs)?.name ?? '—';


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
        className={`group flex items-center gap-3 border-[1.5px] rounded-full px-5 py-3 transition-colors ${dp.className}`}>
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
        <span className="text-[15px] font-bold flex-shrink-0 transition-colors" style={{ color: t.done ? '#9AA39D' : '#16211E', textDecoration: t.done ? 'line-through' : 'none' }}>
          {t.name}
        </span>
        <span className="text-[13px] truncate min-w-0" style={{ color: '#9AA39D' }}>{t.programName}</span>
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
            className="text-[10px] text-neutral-400 hover:text-violet-800 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
            title="내일 이어서 하기"
          >
            내일 ↪
          </button>
        )}
        <button
          onClick={() => setEditTodoTarget(t)}
          className="text-[10px] text-neutral-400 hover:text-neutral-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
          title="업무 편집 (이름·날짜·기한)"
        >
          편집
        </button>
        <button
          onClick={() => store.hideTodoFromHome(t.key)}
          title={t.recurring ? '오늘 홈에서 숨기기' : '홈에서 숨기기 (Task에서 복구 가능)'}
          className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
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
          className="text-[10px] text-neutral-400 hover:text-violet-800 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
          title="내일 이어서 하기"
        >
          내일 ↪
        </button>
      )}
      <button
        onClick={() => store.deleteQuickTask(t.id)}
        title="추가 업무 삭제"
        className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
      >
        ×
      </button>
    </li>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
      {/* ── 왼쪽: 메인 ── */}
      <div className="min-w-0">
        {/* D-day 타임라인 */}
        {journey.length > 0 && (
          <div className="bg-white rounded-[22px] border mb-8" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)', padding: '24px 24px' }}>
            <div className="relative">
              {/* 다이아몬드 중앙(마커 행 높이 24px의 절반)을 지나는 연결선 */}
              <div className="absolute left-0 right-0 top-3 h-px -translate-y-1/2" style={{ backgroundColor: 'var(--spira-border)' }} />
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${journey.length}, minmax(0, 1fr))` }}>
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
                      <div className="text-[14px] font-semibold truncate mt-2.5" style={{ color: '#16211E' }}>{first.name}</div>
                      <div className="text-[12px] mt-1 truncate" style={{ color: '#9AA39D' }}>
                        {first.wsName} · {first.kind}{group.items.length > 1 ? ` 외 ${group.items.length - 1}` : ''}
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
          {/* Task 페이지 숨김 — '전체보기' 진입점 제거 (라우트/기능 유지, 배포 전 완전 삭제 여부 확인 예정)
          <button onClick={() => router.push('/task')} className="text-[13px] transition-colors hover:opacity-70" style={{ color: '#9AA39D' }}>전체보기</button> */}
        </div>

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
            title="오늘은 예정된 업무가 없어요"
            description="Goals에서 목표·업무를 이 날짜에 배치하면 여기에 나타나요."
            action={<button onClick={() => router.push('/programs')} className="px-4 py-2 rounded-full text-[13px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>Goals에서 배치하기</button>}
          />
        ) : (
          <>
            {doneTasks === totalTasks && (
              <div className="mb-4"><SuccessState compact title="오늘 할 일을 모두 끝냈어요 🎉" description="깔끔하게 마무리했어요. 내일도 이 흐름을 이어가요." /></div>
            )}
            <ul className="space-y-3">
              {orderedItems.map(item =>
                item.kind === 'goal'
                  ? renderGoalTask(item.goal!)
                  : renderQuickTask(item.quick!)
              )}
            </ul>
          </>
        )}
      </div>

      {/* ── 오른쪽: 대시보드 ── */}
      <aside className="space-y-4 lg:sticky lg:top-8">
        {/* 타이머 pill */}
        <MusicTimer compact />

        {/* 메모 (접이식) — 공통 컴포넌트, 플레이바 바로 아래 */}
        <MemoPanel />

        {/* 비즈니스 칩 */}
        {store.allWorkspaces.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            {store.allWorkspaces.map(ws => {
              const color = workspaceColor(store.allWorkspacesEntries, ws.id);
              return (
                <button
                  key={ws.id}
                  onClick={() => { store.switchWorkspace(ws.id); router.push('/plan'); }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium bg-white transition-colors hover:border-neutral-300"
                  style={{ border: '1px solid rgba(0,41,41,0.12)', color: '#16211E' }}
                  title={`${ws.name} 기획서(Plan) 열기`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {ws.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 이번 달 수익/지출 */}
        <div className="bg-white rounded-[24px] border p-6" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="w-[26px] h-[26px] rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF7E4', color: '#44543C' }}>
                <svg viewBox="0 0 19 10" className="w-[15px] h-auto" fill="currentColor"><path d="M16.8229 0H2.17708C0.976675 0 0 1.09021 0 2.44091V7.55909C0 8.90497 0.972372 10 2.17708 10H16.8229C18.0233 10 19 8.90979 19 7.55909V2.44091C19 1.09503 18.0276 0 16.8229 0ZM6.55275 4.99759C6.55275 3.50699 7.43047 2.24795 8.63949 1.83309V8.15726C7.43047 7.7424 6.55275 6.48336 6.55275 4.99277V4.99759ZM10.3605 8.16208V1.83792C11.5695 2.25277 12.4472 3.51182 12.4472 5.00241C12.4472 6.49301 11.5695 7.75205 10.3605 8.16691V8.16208Z" /></svg>
              </span>
              <span className="text-[16px] font-bold" style={{ color: '#16211E' }}>이번 달 수익/지출</span>
            </div>
            <button onClick={() => router.push('/resources')} className="text-[13px] transition-colors hover:opacity-70" style={{ color: '#9AA39D' }}>자세히</button>
          </div>
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[14px]" style={{ color: '#5B6560' }}>수익</span>
            <span className="font-mono text-[20px] font-semibold tabular-nums" style={{ color: '#16211E' }}>+{fmt(monthIncome)}</span>
          </div>
          <div className="flex items-center justify-between mb-5">
            <span className="text-[14px]" style={{ color: '#5B6560' }}>비용</span>
            <span className="font-mono text-[20px] font-semibold tabular-nums" style={{ color: '#16211E' }}>-{fmt(monthExpense + subTotal)}</span>
          </div>
          <div className="h-px mb-4" style={{ backgroundColor: 'var(--spira-border)' }} />
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold" style={{ color: '#16211E' }}>순이익</span>
            <span className="font-mono text-[32px] font-bold tabular-nums tracking-[-0.01em]" style={{ color: netProfit >= 0 ? '#16211E' : '#FF696C' }}>
              {netProfit >= 0 ? '+' : ''}{fmt(netProfit)}
            </span>
          </div>
        </div>

        {/* 프로젝트 진행상황 */}
        <div className="bg-white rounded-[24px] border p-6" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: '#EEF7E4', color: '#44543C' }}>
                <svg viewBox="0 0 16 20" className="w-[13px] h-auto" fill="currentColor"><path d="M3.03027 0H0.704717C0.315512 0 0 0.315512 0 0.704717V19.1824C0 19.5716 0.315512 19.8871 0.704717 19.8871H3.03027C3.41948 19.8871 3.73499 19.5716 3.73499 19.1824V0.704717C3.73499 0.315512 3.41948 0 3.03027 0Z" /><path d="M15.0435 7.968L3.73047 1.43762V16.434L15.0435 9.90362C15.7858 9.47609 15.7858 8.40022 15.0435 7.968ZM6.87351 11.7547C6.15469 10.7117 5.25265 9.80496 4.20497 9.08615C5.24795 8.36734 6.15469 7.4653 6.87351 6.41762C7.59232 7.4606 8.49435 8.36734 9.54203 9.08615C8.49905 9.80496 7.59232 10.707 6.87351 11.7547Z" /></svg>
              </span>
              <span className="text-[16px] font-bold" style={{ color: '#16211E' }}>프로젝트 진행상황</span>
            </div>
            {store.allWorkspaces.length > 0 && (
              <div className="relative" ref={progressRef}>
                <button
                  onClick={() => setProgressMenuOpen(o => !o)}
                  className="inline-flex items-center gap-1.5 text-[13px] transition-colors hover:opacity-70"
                  style={{ color: '#5B6560' }}
                  title="비즈니스 선택"
                >
                  {effProgressName}<span className={`transition-transform ${progressMenuOpen ? 'rotate-180' : ''}`} style={{ color: '#9AA39D' }}>▾</span>
                </button>
                {progressMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden z-20">
                    {store.allWorkspaces.map(ws => (
                      <button
                        key={ws.id}
                        onClick={() => { setProgressWsId(ws.id); localStorage.setItem('spira_home_progress_ws', ws.id); setProgressMenuOpen(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-neutral-100 transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: workspaceColor(store.allWorkspacesEntries, ws.id) }} />
                        <span style={{ color: ws.id === effProgressWs ? '#16211E' : '#5B6560', fontWeight: ws.id === effProgressWs ? 600 : 400 }}>{ws.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {progressList.length === 0 ? (
            <p className="text-[13px]" style={{ color: '#9AA39D' }}>이번 분기 프로젝트가 없어요</p>
          ) : (
            <div className="space-y-5">
              {progressList.map(p => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-2.5">
                    <button onClick={() => goToGoals(p.wsId)} className="text-[14px] truncate text-left transition-colors hover:opacity-70" style={{ color: '#16211E' }}>{p.name}</button>
                    {p.dday ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2" style={p.dday.urgent ? { color: '#fff', backgroundColor: '#FF696C' } : p.dday.overdue ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>{p.dday.label}</span>
                    ) : p.pct !== null ? (
                      <span className="font-mono text-[12px] tabular-nums flex-shrink-0 ml-2" style={{ color: '#9AA39D' }}>{p.pct}%</span>
                    ) : null}
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#E7E7E7' }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.pct ?? 0}%`, background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
    </div>
  );
}
