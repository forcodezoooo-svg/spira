'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { DashboardSkeleton } from '../components/Skeleton';
import { EmptyState, SuccessState } from '../components/EmptyState';
import TaskTimerButton from '../components/TaskTimerButton';
import TodoEditModal from '../components/TodoEditModal';
import MusicTimer from '../components/MusicTimer';
import MemoPanel from '../components/MemoPanel';
import { useTimer } from '../lib/TimerContext';
import { ProgramTodo } from '../lib/types';
import { getGoalTasksForDate, getGoalDeadlines, GoalTask } from '../lib/goalTasks';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 캘린더 셀의 작업시간 pill용 — 시간 단위 (예: 1시간 20분 / 45분)
function hoursLabel(s: number): string {
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}

function calcDday(deadline: string): { label: string; urgent: boolean; overdue: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(deadline); end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (diff > 0) return { label: `D-${diff}`, urgent: diff <= 3, overdue: false };
  if (diff === 0) return { label: 'D-Day', urgent: true, overdue: false };
  return { label: `D+${Math.abs(diff)}`, urgent: false, overdue: true };
}

function MonthPicker({
  selected, onSelect, onClose,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const [viewMonth, setViewMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const selNorm = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={ref} className="absolute top-11 right-0 z-30 bg-white border border-neutral-200 rounded-2xl shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="w-7 h-7 rounded-full hover:bg-neutral-100 text-neutral-600 flex items-center justify-center transition-colors">‹</button>
        <span className="text-sm font-semibold text-neutral-900">{viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월</span>
        <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="w-7 h-7 rounded-full hover:bg-neutral-100 text-neutral-600 flex items-center justify-center transition-colors">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d) => (
          <div key={d} className="text-center text-[10px] py-1 font-medium text-neutral-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const norm = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          const isToday = norm.getTime() === today.getTime();
          const isSel = norm.getTime() === selNorm.getTime();
          return (
            <button
              key={i}
              onClick={() => { onSelect(date); onClose(); }}
              className="h-8 w-full rounded-full text-xs flex items-center justify-center transition-colors"
              style={isSel ? { backgroundColor: '#16211E', color: '#fff', fontWeight: 700 } : isToday ? { backgroundColor: '#DDF4C4', color: '#3E7A2E', fontWeight: 600 } : { color: '#5B6560' }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TaskPage() {
  const store = useStore();
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState('');
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [editTodoTarget, setEditTodoTarget] = useState<GoalTask | null>(null);
  const { getDayTotalSeconds, getTaskSeconds, stopTaskTimer } = useTimer();

  const todayBase = new Date(); todayBase.setHours(0, 0, 0, 0);
  const [startDate, setStartDate] = useState(() => getSunday(todayBase));
  const [selectedDate, setSelectedDate] = useState(() => new Date(todayBase));
  const [showPicker, setShowPicker] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);


  if (!store.ready) return <DashboardSkeleton />;

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
              onKeyDown={e => { if (e.key === 'Enter' && workspaceName.trim()) { store.setWorkspace({ id: 'ws', name: workspaceName.trim() }); router.push('/plan'); } }}
            />
            <button
              disabled={!workspaceName.trim()}
              onClick={() => { store.setWorkspace({ id: 'ws', name: workspaceName.trim() }); router.push('/plan'); }}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-neutral-900 transition-colors"
            >
              시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  const week1 = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  const week2 = Array.from({ length: 7 }, (_, i) => addDays(startDate, i + 7));

  const handleSelectDate = (date: Date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
    const sun = getSunday(d);
    const endOfView = addDays(startDate, 13);
    if (d < startDate || d > endOfView) setStartDate(sun);
  };

  const selDow = selectedDate.getDay();
  const selDateStr = toDateStr(selectedDate);
  const isSelectedToday = selectedDate.getTime() === todayBase.getTime();
  const todayStrLocal = toDateStr(todayBase);
  const isPast = selDateStr < todayStrLocal;

  const quickTasksAll = store.getQuickTasksForDate(selDateStr);
  const quickTasks = isPast ? quickTasksAll.filter(t => t.completed) : quickTasksAll;
  // Task/캘린더는 그 날짜에 배치된 모든 업무를 표시 (우선순위·분기 제한 없음)
  const goalTasksAll = getGoalTasksForDate(store.allWorkspacesEntries, selDateStr, selDow);
  const goalTasks = isPast
    ? goalTasksAll.filter(t => t.done || getTaskSeconds(selDateStr, t.key) > 0)
    : goalTasksAll;

  // ── 업무 영역별 그룹핑 ──────────────────────────────────────────────────────
  const areasForWs = (wsId: string) =>
    store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.plan.workAreas ?? [];
  const taskArea = (t: GoalTask) =>
    t.workAreaId ? (areasForWs(t.wsId).find(a => a.id === t.workAreaId) ?? null) : null;
  const NONE_AREA = '__none__';
  type GoalAreaGroup = { key: string; name: string; color: string; items: GoalTask[] };
  const goalAreaGroups: GoalAreaGroup[] = (() => {
    const groups = new Map<string, GoalAreaGroup>();
    for (const t of goalTasks) {
      const area = taskArea(t);
      const key = area?.name ?? NONE_AREA;
      if (!groups.has(key)) groups.set(key, { key, name: area?.name ?? '목표 업무', color: area?.color ?? '#a3a3a3', items: [] });
      groups.get(key)!.items.push(t);
    }
    return [...groups.values()].sort((a, b) => (a.key === NONE_AREA ? 1 : b.key === NONE_AREA ? -1 : 0));
  })();

  const moveOptions = [
    { label: '내일', date: toDateStr(addDays(selectedDate, 1)) },
    { label: '모레', date: toDateStr(addDays(selectedDate, 2)) },
    { label: '다음주', date: toDateStr(addDays(selectedDate, 7)) },
  ];
  const handleMoveQuickTask = (id: string, newDate: string) => { store.moveQuickTask(id, newDate); setMoveTarget(null); };
  const goalMoveOptions = [
    { label: '오늘', date: todayStrLocal },
    { label: '내일', date: toDateStr(addDays(todayBase, 1)) },
    { label: '모레', date: toDateStr(addDays(todayBase, 2)) },
  ];
  const handleMoveGoalTodo = (t: GoalTask, newDate: string) => {
    const patch: Partial<ProgramTodo> = { date: newDate };
    if (!t.deadline || t.deadline < newDate) patch.deadline = newDate;
    store.updateProgramTodo(t.wsId, t.programId, t.deadlineId, t.todoId, patch);
    setMoveTarget(null);
  };

  const totalTasks = quickTasks.length + goalTasks.length;
  const doneTasks = quickTasks.filter(t => t.completed).length + goalTasks.filter(t => t.done).length;

  const handleAddQuickTask = () => {
    const v = quickInput.trim();
    if (!v) return;
    store.addQuickTask(v, selDateStr);
    setQuickInput('');
    quickInputRef.current?.focus();
  };

  // Goals(프로그램) 페이지에서 해당 요소로 이동 — ws·프로그램·분기를 넘겨 스크롤/하이라이트
  const goToGoals = (wsId: string, programId: string, dateHint?: string) => {
    const qs = new URLSearchParams({ ws: wsId, prog: programId });
    const d = dateHint ? new Date(dateHint) : null;
    if (d && !isNaN(d.getTime())) { qs.set('y', String(d.getFullYear())); qs.set('q', String(Math.floor(d.getMonth() / 3) + 1)); }
    router.push(`/programs?${qs.toString()}`);
  };

  // ── 소형 컴포넌트 ────────────────────────────────────────────────────────────
  const DragHandle = () => (
    <span aria-hidden className="flex-shrink-0 cursor-grab" style={{ color: '#C7CEC7' }}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
        <circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" />
        <circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" />
      </svg>
    </span>
  );
  const StarButton = ({ starred, onClick }: { starred: boolean; onClick: () => void }) => (
    <button onClick={onClick} title="중요 표시" className="flex-shrink-0 transition-colors">
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill={starred ? '#E0B93A' : 'none'} stroke={starred ? '#E0B93A' : '#C7CEC7'} strokeWidth="1.4">
        <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L2.2 7.7l5.4-.8L10 2z" strokeLinejoin="round" />
      </svg>
    </button>
  );

  // 목표 업무 pill
  const renderGoalPill = (t: GoalTask) => {
    const dday = t.deadline && !t.done ? calcDday(t.deadline) : null;
    const isToday = isSelectedToday && !!t.deadline && t.deadline === selDateStr && !t.done;
    const hiddenFromHome = store.homeHiddenToday.includes(t.key);
    const isMoving = moveTarget === t.key;
    return (
      <li key={t.key} className="group">
        <div className="flex items-center gap-3 border-[1.5px] rounded-full px-5 py-3 transition-colors" style={{ borderColor: '#BCE89A', backgroundColor: t.done ? '#F8FBF3' : '#FFFFFF' }}>
          <DragHandle />
          <StarButton starred={t.starred} onClick={() => store.toggleProgramTodoStar(t.wsId, t.programId, t.deadlineId, t.todoId)} />
          <button
            onClick={() => {
              if (!t.done) stopTaskTimer(t.key);
              if (t.recurring) store.toggleProgramTodoDate(t.wsId, t.programId, t.deadlineId, t.todoId, selDateStr);
              else store.toggleProgramTodo(t.wsId, t.programId, t.deadlineId, t.todoId, selDateStr);
            }}
            style={{ borderColor: t.done ? '#9DFE3B' : '#C7CEC7', backgroundColor: t.done ? '#9DFE3B' : 'transparent' }}
            className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center"
          >
            {t.done && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#16211E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          {isToday && <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>오늘</span>}
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
          <button
            onClick={() => goToGoals(t.wsId, t.programId, t.deadline || t.date)}
            className="text-[15px] font-bold flex-shrink-0 text-left transition-colors hover:underline decoration-dotted underline-offset-2"
            style={{ color: t.done ? '#9AA39D' : '#16211E', textDecoration: t.done ? 'line-through' : undefined }}
            title="Goals에서 이 업무 보기"
          >{t.name}</button>
          <span className="text-[13px] truncate min-w-0" style={{ color: '#9AA39D' }}>{t.programName}</span>
          <span className="flex-1" />
          {(t.days?.length ?? 0) > 0 && <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ color: '#96852F', backgroundColor: '#F6EFC2' }}>매주</span>}
          {dday && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={dday.urgent ? { color: '#fff', backgroundColor: '#FF696C' } : dday.overdue ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>{dday.label}</span>}
          <TaskTimerButton taskId={t.key} dateStr={selDateStr} done={t.done} />
          <button onClick={() => setMoveTarget(isMoving ? null : t.key)} className="text-[11px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" style={{ color: '#9AA39D' }} title="다른 날짜로 이동">이동</button>
          <button onClick={() => setEditTodoTarget(t)} className="text-[11px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" style={{ color: '#9AA39D' }} title="업무 편집">편집</button>
          {hiddenFromHome && (
            <button onClick={() => store.unhideTodoFromHome(t.key)} className="text-[11px] font-medium rounded-full px-2 py-0.5 flex-shrink-0 transition-colors" style={{ color: '#96852F', backgroundColor: '#F6EFC2' }} title="홈에서 숨김 — 클릭하면 홈에 복구">홈 복구</button>
          )}
        </div>
        {isMoving && (
          <div className="mt-2 ml-10 flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px]" style={{ color: '#9AA39D' }}>이동:</span>
            {goalMoveOptions.map(opt => (
              <button key={opt.date} onClick={() => handleMoveGoalTodo(t, opt.date)} className="text-[11px] bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 px-2.5 py-1 rounded-full transition-colors">{opt.label}</button>
            ))}
            <input type="date" className="text-[11px] border border-neutral-300 rounded-full px-2 py-1 text-neutral-700 outline-none focus:border-violet-400" onChange={e => e.target.value && handleMoveGoalTodo(t, e.target.value)} />
          </div>
        )}
      </li>
    );
  };

  // 추가 업무 pill
  const renderQuickPill = (task: typeof quickTasks[number]) => {
    const qid = `quick:${task.id}`;
    const isMoving = moveTarget === qid;
    return (
      <li key={task.id} className="group">
        <div className="flex items-center gap-3 border-[1.5px] rounded-full px-5 py-3 transition-colors" style={{ borderColor: '#BCE89A', backgroundColor: task.completed ? '#F8FBF3' : '#FFFFFF' }}>
          <DragHandle />
          <StarButton starred={!!task.starred} onClick={() => store.toggleQuickTaskStar(task.id)} />
          <button
            onClick={() => { if (!task.completed) stopTaskTimer(qid); store.toggleQuickTask(task.id); }}
            style={{ borderColor: task.completed ? '#9DFE3B' : '#C7CEC7', backgroundColor: task.completed ? '#9DFE3B' : 'transparent' }}
            className="w-[18px] h-[18px] rounded-full flex-shrink-0 border-2 transition-colors flex items-center justify-center"
          >
            {task.completed && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#16211E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
          <span className="text-[15px] font-bold flex-1 min-w-0 truncate" style={{ color: task.completed ? '#9AA39D' : '#16211E', textDecoration: task.completed ? 'line-through' : 'none' }}>{task.name}</span>
          <TaskTimerButton taskId={qid} dateStr={selDateStr} done={task.completed} />
          <button onClick={() => setMoveTarget(isMoving ? null : qid)} className="text-[11px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all" style={{ color: '#9AA39D' }}>이동</button>
          <button onClick={() => store.deleteQuickTask(task.id)} className="text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all hover:text-red-500" style={{ color: '#C7CEC7' }}>×</button>
        </div>
        {isMoving && (
          <div className="mt-2 ml-10 flex flex-wrap gap-1.5 items-center">
            {moveOptions.map(opt => (
              <button key={opt.date} onClick={() => handleMoveQuickTask(task.id, opt.date)} className="text-[11px] bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 px-2.5 py-1 rounded-full transition-colors">{opt.label}</button>
            ))}
            <input type="date" className="text-[11px] border border-neutral-300 rounded-full px-2 py-1 text-neutral-700 outline-none focus:border-violet-400" onChange={e => e.target.value && handleMoveQuickTask(task.id, e.target.value)} />
          </div>
        )}
      </li>
    );
  };

  // ── 캘린더 셀 ────────────────────────────────────────────────────────────────
  const DayCell = ({ date }: { date: Date }) => {
    const isToday = date.getTime() === todayBase.getTime();
    const isSel = date.getTime() === selectedDate.getTime();
    const dateStr = toDateStr(date);
    const off = store.isOffDay(dateStr);
    // 지나간 날: 그날 총 업무 시간만 / 오늘·다가오는 날: 데드라인(시작·기한). 컬러=소속 비즈니스.
    const isPast = date.getTime() < todayBase.getTime();
    const secs = isPast ? getDayTotalSeconds(dateStr) : 0;
    const allDl = isPast ? [] : getGoalDeadlines(store.allWorkspacesEntries);
    const endsHere = allDl.filter(d => d.date === dateStr);
    const startsHere = allDl.filter(d => d.startDate && d.startDate === dateStr && d.startDate !== d.date);
    const dlChip = (d: { key: string; name: string; color: string; wsName: string; wsId: string; programId: string; date: string }, edge: '시작' | '기한') => (
      <button
        key={`${edge}-${d.key}`}
        onClick={e => { e.stopPropagation(); goToGoals(d.wsId, d.programId, d.date); }}
        className="w-full flex items-center gap-1 text-[11px] leading-tight rounded-md px-1.5 py-1 text-left transition-[filter] hover:brightness-95"
        style={{ backgroundColor: `${d.color}1a` }}
        title={`${d.name} ${edge} · ${d.wsName} · 클릭하면 Goals에서 보기`}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
        <span className="truncate flex-1" style={{ color: '#5B6560' }}>{d.name}</span>
        <span className="text-[9px] font-bold flex-shrink-0" style={{ color: d.color }}>{edge}</span>
      </button>
    );
    return (
      <div onClick={() => handleSelectDate(date)} className="cursor-pointer px-1.5 pt-2.5 pb-4 min-h-[96px] transition-colors hover:bg-black/[0.015]">
        <div className="flex justify-center mb-2">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-semibold"
            style={isToday ? { backgroundColor: '#9DFE3B', color: '#16211E' } : isSel ? { backgroundColor: '#16211E', color: '#fff' } : { color: off ? '#96852F' : '#5B6560' }}
          >
            {date.getDate()}
          </span>
        </div>
        <div className="space-y-1">
          {isPast
            ? (secs > 0 && (
                <div className="flex justify-center">
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>{hoursLabel(secs)}</span>
                </div>
              ))
            : (
                <>
                  {startsHere.map(d => dlChip(d, '시작'))}
                  {endsHere.map(d => dlChip(d, '기한'))}
                </>
              )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
      {/* ── 왼쪽: 메인 ── */}
      <div className="min-w-0">
        {/* 헤더 */}
        <div className="mb-6">
          <div className="relative flex items-center justify-between gap-3">
            <h1 className="text-[28px] font-black tracking-[-0.02em]" style={{ color: '#16211E' }}>Task</h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isSelectedToday && (
                <button onClick={() => { setSelectedDate(new Date(todayBase)); setStartDate(getSunday(todayBase)); }} className="text-[12px] transition-colors hover:opacity-70" style={{ color: '#9AA39D' }}>오늘로</button>
              )}
              <button
                onClick={() => setShowPicker(s => !s)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ backgroundColor: showPicker ? '#E7E7E1' : '#F0F0EA', color: '#5B6560' }}
                title="날짜 선택"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="2.5" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
              {showPicker && (
                <MonthPicker selected={selectedDate} onSelect={d => { handleSelectDate(d); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
              )}
            </div>
          </div>
          <p className="text-[15px] font-semibold mt-1.5" style={{ color: '#5B6560' }}>
            {`${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 ${DOW[selDow]}요일`}
          </p>
        </div>

        {/* 캘린더 */}
        <section className="mb-6">
          <div className="grid grid-cols-7 mb-1.5">
            {week1.map((d, i) => (
              <div key={i} className="text-center text-[12px] font-medium" style={{ color: '#9AA39D' }}>{DOW[d.getDay()]}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-y" style={{ borderColor: 'var(--spira-border)' }}>
            {week1.map((date, i) => <DayCell key={i} date={date} />)}
          </div>
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--spira-border)' }}>
            {week2.map((date, i) => <DayCell key={i} date={date} />)}
          </div>
        </section>

        {/* 업무 추가 */}
        <input
          ref={quickInputRef}
          className="w-full bg-white border rounded-full px-6 py-3.5 text-[15px] outline-none transition-colors placeholder-neutral-400"
          style={{ borderColor: 'var(--spira-border-strong)', color: '#16211E' }}
          placeholder="+ 업무 추가"
          value={quickInput}
          onChange={e => setQuickInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAddQuickTask()}
        />

        {/* 완료 카운트 */}
        <div className="flex justify-end mt-3 mb-5">
          {totalTasks > 0
            ? <span className="text-[14px] font-semibold" style={{ color: '#16211E' }}>{doneTasks}/{totalTasks} 완료</span>
            : <span className="text-[13px]" style={{ color: '#9AA39D' }}>이 날은 등록된 업무가 없어요</span>}
        </div>

        {/* 목표 업무 — 업무 영역별 그룹 카드 */}
        <div className="space-y-4">
          {goalAreaGroups.map(g => (
            <div key={g.key} className="rounded-3xl p-4" style={{ backgroundColor: '#F1F1EB' }}>
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-[15px] font-bold" style={{ color: '#16211E' }}>{g.name}</span>
                <span className="text-[12px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: '#E1E1DA', color: '#5B6560' }}>{g.items.length}</span>
              </div>
              <ul className="space-y-2">{g.items.map(renderGoalPill)}</ul>
            </div>
          ))}

          {/* 추가 업무 카드 */}
          {quickTasks.length > 0 && (
            <div className="rounded-3xl p-4" style={{ backgroundColor: '#F1F1EB' }}>
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-[15px] font-bold" style={{ color: '#16211E' }}>추가 업무</span>
                <span className="text-[12px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: '#E1E1DA', color: '#5B6560' }}>{quickTasks.length}</span>
              </div>
              <ul className="space-y-2">{quickTasks.map(renderQuickPill)}</ul>
            </div>
          )}

          {/* 빈/완료 상태 */}
          {totalTasks === 0 && (
            <EmptyState title="이 날은 등록된 업무가 없어요" description="위 입력창에 추가하거나, Goals에서 이 날짜로 업무를 배치해보세요." />
          )}
          {totalTasks > 0 && doneTasks === totalTasks && (
            <SuccessState compact title="이 날의 업무를 모두 끝냈어요 🎉" description="수고했어요. 완료한 업무는 여정 지도에 별로 쌓여요." />
          )}
        </div>
      </div>

      {/* ── 오른쪽: 대시보드 ── */}
      <aside className="space-y-4 lg:sticky lg:top-8">
        {/* 타이머 pill */}
        <MusicTimer compact />

        {/* 메모 (접이식) — 공통 컴포넌트 */}
        <MemoPanel />
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
