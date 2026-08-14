'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { DashboardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Program } from '../lib/types';
import { uid } from '../lib/store';
import { useChatContext, QuarterPlan, AreaAssignment } from '../lib/ChatContext';
import MusicTimer from '../components/MusicTimer';
import MemoPanel from '../components/MemoPanel';
import FlagAward from '../components/FlagAward';

type ProgramWithWs = Program & { wsId: string; wsName: string };

const COLORS = ['#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899'];
const QUARTERS = [1, 2, 3, 4];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const QUARTER_LABEL: Record<number, string> = { 1: '1분기', 2: '2분기', 3: '3분기', 4: '4분기' };
const QUARTER_MONTHS: Record<number, string> = { 1: '1–3월', 2: '4–6월', 3: '7–9월', 4: '10–12월' };

function getQuarterEndDate(y: number, q: number): string {
  const d = new Date(y, q * 3, 0); // q*3월의 마지막 날
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcDday(deadline: string): { label: string; cls: string } | null {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(deadline); end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (diff > 0) return { label: `D-${diff}`, cls: diff <= 7 ? 'bg-red-100 text-red-600' : 'bg-violet-100 text-violet-700' };
  if (diff === 0) return { label: 'D-Day', cls: 'bg-red-500 text-white' };
  return { label: `D+${Math.abs(diff)}`, cls: 'bg-neutral-100 text-neutral-500' };
}

export default function ProgramsPage() {
  const store = useStore();
  const router = useRouter();
  const chat = useChatContext();

  // AI 분기 계획 핸들러는 항상 최신 클로저를 가리키도록 ref 사용
  const applyQuarterPlanRef = useRef<(plans: QuarterPlan[]) => void>(() => {});
  useEffect(() => {
    if (!chat) return;
    chat.registerQuarterPlanHandler(plans => applyQuarterPlanRef.current(plans));
    return () => chat.unregisterQuarterPlanHandler();
  }, [chat]);

  // AI 자동 영역 배정 핸들러 (미분류 목표 → 업무 영역)
  const applyAreaAssignRef = useRef<(assigns: AreaAssignment[]) => void>(() => {});
  useEffect(() => {
    if (!chat) return;
    chat.registerAreaAssignHandler(assigns => applyAreaAssignRef.current(assigns));
    return () => chat.unregisterAreaAssignHandler();
  }, [chat]);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);


  // 프로그램 추가/편집
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramWsId, setNewProgramWsId] = useState('');
  const [newProgramAreaId, setNewProgramAreaId] = useState('');
  const [newProgramSource, setNewProgramSource] = useState('');
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGoal, setEditGoal] = useState('');
  const [editYear, setEditYear] = useState(now.getFullYear());
  const [editQuarters, setEditQuarters] = useState<string[]>([]);
  const [editDeadline, setEditDeadline] = useState('');
  const [editAreaId, setEditAreaId] = useState('');
  const [editSource, setEditSource] = useState('');

  // 업무 영역별 그룹 보기 (기본: 영역별 접이식 박스). 펼친 영역만 내용 표시
  const [groupByArea] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  // 우측 캘린더: 3단계(목표/데드라인/업무) 중 하나로 기간 표시
  type CalLevel = 'program' | 'deadline' | 'todo';
  const [calMonth, setCalMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [calLevel, setCalLevel] = useState<CalLevel>('todo');
  // 보기 모드: 영역별(기본) / 우선순위
  const [goalsView, setGoalsView] = useState<'area' | 'priority'>('area');
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]); // 같은 날짜 내 수동 우선순위(데드라인 id 순서)
  const [selectedDls, setSelectedDls] = useState<Set<string>>(new Set()); // 디데이 쪼개기 선택
  const [prioDrag, setPrioDrag] = useState<string | null>(null);
  const [prioOver, setPrioOver] = useState<string | null>(null);
  const [expandedPrio, setExpandedPrio] = useState<Set<string>>(new Set()); // 우선순위 모드에서 업무 펼친 데드라인
  const togglePrioExpand = (id: string) => setExpandedPrio(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [pushMenuDl, setPushMenuDl] = useState<string | null>(null); // '일정 미루기' 드롭다운이 열린 데드라인 id
  useEffect(() => {
    const v = localStorage.getItem('spira_goals_view'); if (v === 'priority' || v === 'area') setGoalsView(v);
    try { setPriorityOrder(JSON.parse(localStorage.getItem('spira_goals_prio') || '[]')); } catch { /* empty */ }
  }, []);
  useEffect(() => { localStorage.setItem('spira_goals_view', goalsView); }, [goalsView]);
  const savePriorityOrder = (arr: string[]) => { setPriorityOrder(arr); localStorage.setItem('spira_goals_prio', JSON.stringify(arr)); };
  // 오프 기간 설정 (전면 스탑 → 이후 모든 일정 밀기)
  const [offOpen, setOffOpen] = useState(false);
  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const applyOffPeriod = () => {
    if (!offStart || !offEnd || offEnd < offStart) return;
    const days = Math.round((new Date(offEnd).getTime() - new Date(offStart).getTime()) / 86400000) + 1;
    if (!window.confirm(`${offStart} ~ ${offEnd} (${days}일)을 오프 기간으로 설정할까요?\n\n이 기간 시작일 이후의 모든 프로젝트 일정(디데이·시작일)이 ${days}일씩 뒤로 밀립니다.`)) return;
    store.shiftAllSchedulesAfter(offStart, days);
    setOffOpen(false); setOffStart(''); setOffEnd('');
  };
  const [previewTask, setPreviewTask] = useState<{ start?: string; end?: string; name: string } | null>(null);
  // 캘린더에서 드래그로 기간 조정 중인 항목 (미리보기)
  type CalDragTarget = { key: string; level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string; start: string; end: string };
  const [calDrag, setCalDrag] = useState<
    (CalDragTarget & { mode: 'move' | 'resize-start' | 'resize-end'; grabDate: string; origStart: string; origEnd: string }) | null
  >(null);
  const calDragRef = useRef(calDrag);
  calDragRef.current = calDrag;
  // 리스트→캘린더 HTML5 드래그 (막대 통과 + 조준 날짜/항목을 ref로 확실히 전달)
  const [htmlDragging, setHtmlDragging] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null); // 조준 날짜(하이라이트용)
  const [listDragCtx, setListDragCtx] = useState<{ level: CalLevel; wsId: string; programId: string; deadlineId?: string } | null>(null); // 리스트 드래그 중인 항목(범위 표시용)
  const dragOverDateRef = useRef<string | null>(null);
  const dragPayloadRef = useRef<{ level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string } | null>(null);
  const startListDrag = (payload: { level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string }, e: React.DragEvent) => {
    dragPayloadRef.current = payload;
    dragOverDateRef.current = null;
    setListDragCtx({ level: payload.level, wsId: payload.wsId, programId: payload.programId, deadlineId: payload.deadlineId });
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setHtmlDragging(true);
  };
  useEffect(() => {
    const end = () => { setHtmlDragging(false); setDragOverDate(null); setListDragCtx(null); dragPayloadRef.current = null; dragOverDateRef.current = null; };
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => { window.removeEventListener('dragend', end); window.removeEventListener('drop', end); };
  }, []);
  // 드래그 중 격자 위/아래로 벗어나면 '한 달씩'만 넘김 (엣지 트리거)
  const weeksRef = useRef<HTMLDivElement>(null);
  const inNavRef = useRef<-1 | 1 | null>(null);
  const navMonth = (dir: -1 | 1) => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + dir, 1));
  const navByPoint = (dir: -1 | 1 | null) => {
    if (dir && inNavRef.current !== dir) { inNavRef.current = dir; navMonth(dir); }
    else if (!dir) inNavRef.current = null;
  };
  // 포인터가 캘린더 격자 위(이전 달)/아래(다음 달)로 벗어났는지
  const navDirFromPoint = (x: number, y: number): -1 | 1 | null => {
    const rect = weeksRef.current?.getBoundingClientRect();
    if (!rect || x < rect.left - 20 || x > rect.right + 20) return null; // 좌우로 너무 벗어나면 무시
    if (y < rect.top) return -1;
    if (y > rect.bottom) return 1;
    return null;
  };

  // ── 캘린더 드래그 유틸 ────────────────────────────────────────────────────────
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const addDaysStr = (ds: string, n: number) => {
    const d = new Date(ds); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const daysBetween = (a: string, b: string) =>
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  const dateFromPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest('[data-cal-date]') as HTMLElement | null;
    return cell?.getAttribute('data-cal-date') || null;
  };
  type Bounds = { min?: string; max?: string };
  // 목표의 설정된 기간 범위 (데드라인 배치 제한용)
  const programBounds = (wsId: string, programId: string): Bounds => {
    const p = store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId);
    return { min: p?.startDate || undefined, max: p?.deadline || undefined };
  };
  // 데드라인의 기간 범위 (업무 배치 제한용): 시작일 ~ 완수기한
  const deadlineBounds = (wsId: string, programId: string, deadlineId?: string): Bounds => {
    const p = store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId);
    const dl = p?.deadlines?.find(d => d.id === deadlineId);
    return { min: dl?.startDate || undefined, max: dl?.date || undefined };
  };
  // 드래그 대상 레벨에 맞는 배치 허용 범위
  const boundsForTarget = (t: { level: CalLevel; wsId: string; programId: string; deadlineId?: string }): Bounds | null => {
    if (t.level === 'deadline') return programBounds(t.wsId, t.programId);
    if (t.level === 'todo') return deadlineBounds(t.wsId, t.programId, t.deadlineId);
    return null;
  };
  const clampRange = (mode: 'move' | 'resize-start' | 'resize-end', start: string, end: string, bounds: Bounds | null) => {
    if (!bounds || (!bounds.min && !bounds.max)) return { start, end };
    const { min, max } = bounds;
    if (mode === 'move') {
      let s = start, e = end;
      if (max && e > max) { const sh = daysBetween(e, max); s = addDaysStr(s, sh); e = addDaysStr(e, sh); }
      if (min && s < min) { const sh = daysBetween(s, min); s = addDaysStr(s, sh); e = addDaysStr(e, sh); }
      if (max && e > max) e = max; // 기간이 상위보다 길면 끝을 맞춤
      return { start: s, end: e };
    }
    if (mode === 'resize-end') { let e = end; if (max && e > max) e = max; if (min && e < min) e = min; return { start, end: e }; }
    let s = start; if (min && s < min) s = min; if (max && s > max) s = max; return { start: s, end };
  };
  // 드래그 결과를 실제 데이터에 반영 (단계별)
  const commitCalDrag = () => {
    const d = calDragRef.current;
    setCalDrag(null);
    if (!d) return;
    if (d.start === d.origStart && d.end === d.origEnd) return; // 변경 없음
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === d.wsId);
    const prog = entry?.programs.find(p => p.id === d.programId);
    if (!prog) return;
    const delta = daysBetween(d.origEnd, d.end); // 전체 이동량(move)
    const shift = (x?: string) => (x ? addDaysStr(x, delta) : x);

    if (d.level === 'program') {
      if (d.mode === 'move') {
        // 목표 전체를 이동 → 하위 데드라인·할일 날짜도 함께 이동
        store.updateProgramInWs(d.wsId, {
          ...prog,
          startDate: d.start,
          deadline: d.end,
          deadlines: (prog.deadlines ?? []).map(dl => ({
            ...dl,
            date: shift(dl.date) ?? dl.date,
            startDate: shift(dl.startDate),
            todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })),
          })),
        });
      } else if (d.mode === 'resize-end') {
        store.updateProgramInWs(d.wsId, { ...prog, deadline: d.end });
      } else {
        store.updateProgramInWs(d.wsId, { ...prog, startDate: d.start });
      }
      return;
    }

    // deadline / todo 는 deadlines 배열 내에서 처리
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== d.deadlineId) return dl;
      if (d.level === 'deadline') {
        if (d.mode === 'move') {
          return { ...dl, date: d.end, startDate: d.start, todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })) };
        }
        if (d.mode === 'resize-end') return { ...dl, date: d.end };
        return { ...dl, startDate: d.start };
      }
      // todo
      return {
        ...dl,
        todos: dl.todos.map(t => {
          if (t.id !== d.todoId) return t;
          if (d.mode === 'move') return { ...t, date: d.start, deadline: d.end };
          if (d.mode === 'resize-end') return { ...t, deadline: d.end };
          return { ...t, date: d.start };
        }),
      };
    });
    store.updateProgramInWs(d.wsId, { ...prog, deadlines });
  };
  const startCalDrag = (r: CalDragTarget, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const grab = dateFromPoint(e.clientX, e.clientY) || r.start;
    setCalDrag({ ...r, mode, grabDate: grab, origStart: r.start, origEnd: r.end });
  };

  // 리스트에서 캘린더로 드롭해 날짜를 배치 (HTML5 DnD)
  const dropOnDate = (payload: { level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string }, date: string) => {
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === payload.wsId);
    const prog = entry?.programs.find(p => p.id === payload.programId);
    if (!prog) return;
    setCalLevel(payload.level); // 방금 배치한 항목이 보이도록 해당 단계 탭으로 전환
    if (payload.level === 'program') {
      store.updateProgramInWs(payload.wsId, { ...prog, startDate: date, deadline: prog.deadline || date });
      return;
    }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== payload.deadlineId) return dl;
      if (payload.level === 'deadline') {
        // 조준한 날짜에 시작일·완수기한을 모두 맞춤 (소속 목표 기간 안으로 제한). 이후 리사이즈로 늘릴 수 있음.
        const { min, max } = programBounds(payload.wsId, payload.programId);
        let day = date;
        if (min && day < min) day = min;
        if (max && day > max) day = max;
        return { ...dl, startDate: day, date: day };
      }
      // 업무: 조준한 날짜에 '그대로' 배치. 데드라인 기간 밖이면 데드라인을 늘려서 포함한다.
      const newDlDate = dl.date && dl.date > date ? dl.date : date;            // 완수기한이 드롭보다 이르면 드롭 날짜까지 연장
      const newStartDate = dl.startDate && date < dl.startDate ? date : dl.startDate; // 시작일보다 이르면 시작일을 당김
      return {
        ...dl,
        date: newDlDate,
        startDate: newStartDate,
        todos: dl.todos.map(t => (t.id === payload.todoId ? { ...t, date, deadline: date } : t)),
      };
    });
    store.updateProgramInWs(payload.wsId, { ...prog, deadlines });
  };

  // 드래그 중 문서 전역 mousemove/up 처리 (드래그 시작 시 1회 부착)
  useEffect(() => {
    if (!calDrag) return;
    const onMove = (e: MouseEvent) => {
      // 위/아래 가장자리 존에 '새로 들어올 때'만 한 달씩 넘김
      const navDir = navDirFromPoint(e.clientX, e.clientY);
      navByPoint(navDir);
      if (navDir) return;
      const ds = dateFromPoint(e.clientX, e.clientY);
      if (!ds) return;
      setCalDrag(prev => {
        if (!prev) return prev;
        let next: { start: string; end: string };
        if (prev.mode === 'resize-start') next = { start: ds <= prev.origEnd ? ds : prev.origEnd, end: prev.origEnd };
        else if (prev.mode === 'resize-end') next = { start: prev.origStart, end: ds >= prev.origStart ? ds : prev.origStart };
        else { const delta = daysBetween(prev.grabDate, ds); next = { start: addDaysStr(prev.origStart, delta), end: addDaysStr(prev.origEnd, delta) }; }
        // 데드라인은 목표 기간, 업무는 데드라인 기간 안으로 제한
        next = clampRange(prev.mode, next.start, next.end, boundsForTarget(prev));
        return { ...prev, ...next };
      });
    };
    const onUp = () => commitCalDrag();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calDrag?.key, calDrag?.mode]);

  // 사업 필터 (null = 모든 사업)
  const [filterWsId, setFilterWsId] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projMenuFor, setProjMenuFor] = useState<string | null>(null); // 프로젝트 배정 메뉴가 열린 영역 섹션 key
  const [flagAward, setFlagAward] = useState<{ flagSrc: string; heading: string; sub: string; foot?: string } | null>(null); // 깃발 증정 오버레이
  // 수익원 필터 (Resources에서 카테고리 클릭 시 진입)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // 1순위만 보기 (일괄 디데이 설정 화면)
  const [onlyPriority1, setOnlyPriority1] = useState(false);
  const [highlightProg, setHighlightProg] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null); // 좌측 항목 클릭 시 캘린더에서 강조할 막대 key
  const [notPlaced, setNotPlaced] = useState<string | null>(null);       // 캘린더에 배치 안 된 항목 안내

  // 딥링크: Resources의 ?source=&ws= / Task의 ?ws=&prog=&y=&q= 로 넘어온 경우 처리 (URL은 정리)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const ws = params.get('ws');
    const prog = params.get('prog');
    const y = params.get('y');
    const q = params.get('q');
    if (source) {
      setSourceFilter(source);
      if (ws) { setFilterWsId(ws); store.switchWorkspace(ws); }
    }
    if (prog) {
      if (ws) store.switchWorkspace(ws);
      if (y) setYear(Number(y));
      if (q) setQuarter(Number(q));
      setHighlightProg(prog); // 아래 별도 이펙트에서 영역 펼침 + 스크롤 처리
    }
    if (source || prog) {
      const url = new URL(window.location.href);
      ['source', 'ws', 'prog', 'y', 'q'].forEach(k => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 딥링크 하이라이트: 대상 프로그램이 속한 영역 섹션을 펼친 뒤(접혀 있으면 카드가 렌더되지 않음)
  // 스크롤하고 잠시 하이라이트한다. year/quarter 반영 후 areaSections가 갱신된 뒤 실행됨.
  useEffect(() => {
    if (!highlightProg) return;
    const targetSec = areaSections.find(s => s.items.some(({ p }) => p.id === highlightProg));
    if (!targetSec) return; // 데이터가 아직 안 실렸으면 다음 렌더(deps 변화)에서 재시도
    setExpandedAreas(prev => (prev.has(targetSec.key) ? prev : new Set([...prev, targetSec.key])));
    // 영역 펼침 → 카드 렌더 후 스크롤 + 잠시 강조
    const t1 = setTimeout(() => {
      document.getElementById(`prog-${highlightProg}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 320);
    const t2 = setTimeout(() => setHighlightProg(null), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // 데이터 로드(ready·엔트리 수) 시 재실행되도록 deps에 포함
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightProg, store.ready, store.allWorkspacesEntries.length]);

  // 데드라인 / 할일 입력
  const [addDeadlineFor, setAddDeadlineFor] = useState<string | null>(null);
  const [dlName, setDlName] = useState('');
  const [dlDate, setDlDate] = useState('');
  const [todoInputs, setTodoInputs] = useState<Record<string, string>>({});

  // 데드라인 편집
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [dlEditName, setDlEditName] = useState('');
  const [dlEditDate, setDlEditDate] = useState('');

  // 할일 편집
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [tdName, setTdName] = useState('');
  const [tdMode, setTdMode] = useState<'date' | 'weekly'>('date');
  const [tdDate, setTdDate] = useState('');
  const [tdDays, setTdDays] = useState<number[]>([]);
  const [tdDeadline, setTdDeadline] = useState('');

  // 캘린더에 반영할 활성 기간: 편집 중이면 입력 값, 아니면 선택한 업무의 기간
  const activeStart = editingTodoId ? (tdMode === 'date' ? tdDate : '') : (previewTask?.start ?? '');
  const activeEnd = editingTodoId ? tdDeadline : (previewTask?.end ?? '');
  // 활성 기간이 바뀌면 그 달로 캘린더 이동
  useEffect(() => {
    const focus = activeEnd || activeStart;
    if (!focus) return;
    const d = new Date(focus);
    if (!isNaN(d.getTime())) setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [activeStart, activeEnd]);

  // 좌측 항목 클릭 → 캘린더에서 그 막대를 화면 중앙으로 스크롤하고 잠시 강조
  useEffect(() => {
    if (!highlightKey) return;
    const t = setTimeout(() => {
      const container = weeksRef.current;
      const el = container?.querySelector(`[data-cal-bar="${highlightKey}"]`) as HTMLElement | null;
      if (container && el) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        container.scrollTop += (eRect.top - cRect.top) - (container.clientHeight / 2 - eRect.height / 2);
      }
    }, 60); // 달 변경 후 DOM 반영 대기
    const clear = setTimeout(() => setHighlightKey(null), 2600);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [highlightKey, calMonth, calLevel]);

  // '배치 안 됨' 안내 자동 사라짐
  useEffect(() => {
    if (!notPlaced) return;
    const t = setTimeout(() => setNotPlaced(null), 2800);
    return () => clearTimeout(t);
  }, [notPlaced]);

  // 좌측 항목(목표/데드라인/업무) 클릭 → 해당 탭으로 전환 + 그 달로 이동 + 막대 강조. 미배치면 안내.
  const focusCal = (level: CalLevel, key: string, start?: string, end?: string, name = '') => {
    setCalLevel(level);
    setPreviewTask({ start, end, name });
    if (start || end) { setHighlightKey(key); setNotPlaced(null); }
    else { setHighlightKey(null); setNotPlaced(name); }
  };

  if (!store.ready) return <DashboardSkeleton />;

  const wsId = store.data.workspace?.id;
  if (!wsId) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold mb-2">Goals</h1>
        <p className="text-sm text-neutral-500">먼저 워크스페이스를 만들어주세요.</p>
      </div>
    );
  }

  const businesses = store.allWorkspaces;
  // 프로젝트가 적용되는 '포커스된 사업' (한 사업이 선택됐거나 사업이 하나뿐일 때만 프로젝트 탭 노출)
  const projectWsId = filterWsId ?? (businesses.length === 1 ? businesses[0].id : null);
  const projectsForWs = projectWsId
    ? [...(store.allWorkspacesEntries.find(e => e.workspace.id === projectWsId)?.plan.projects ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  // 사업별 프로젝트 해석 (프로젝트 박스/데드라인 칩용) — 포커스와 무관하게 해당 사업 기준
  const projectsOf = (wsId: string) => [...(store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.plan.projects ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const resolveProject = (wsId: string, id?: string) => id ? (projectsOf(wsId).find(p => p.id === id) ?? null) : null;
  // 사업별 컬러: Plan에서 설정한 고유 컬러 우선, 없으면 순서 기반 팔레트
  const businessColor = (id: string) => {
    const ws = businesses.find(b => b.id === id);
    if (ws?.color) return ws.color;
    const idx = businesses.findIndex(b => b.id === id);
    return COLORS[(idx < 0 ? 0 : idx) % COLORS.length];
  };

  // 업무 영역: Plan에서 사업별로 정의한 workAreas
  const areasForWs = (wsId: string) =>
    store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.plan.workAreas ?? [];
  const programArea = (p: { wsId: string; workAreaId?: string }) =>
    p.workAreaId ? (areasForWs(p.wsId).find(a => a.id === p.workAreaId) ?? null) : null;
  // 현재 화면에 영역 지정이 가능한 사업이 하나라도 있는지
  const anyAreasDefined = store.allWorkspacesEntries.some(e => (e.plan.workAreas ?? []).length > 0);

  // 수익원(수익 수단): Resources에서 사업별로 정의한 revenueSources
  const revenueSourcesForWs = (wsId: string) =>
    store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.revenueSources ?? [];


  // 사업 성장 단계 목표 (Plan에서 설정, 달성 시 다음 단계로 자동 진행)
  const goalWsId = filterWsId ?? wsId;
  const goalWsEntry = store.allWorkspacesEntries.find(e => e.workspace.id === goalWsId);
  const growthStages = goalWsEntry?.plan.growthStages ?? [];
  const growthIdx = goalWsEntry?.growthStageIndex ?? 0;
  const currentStage = growthStages[growthIdx] ?? null;

  // (연도, 분기) 키 / 인덱스
  const qKey = (y: number, q: number) => `${y}-${q}`;
  const qIndex = (y: number, q: number) => y * 4 + (q - 1);
  const keyIndex = (key: string) => { const [y, q] = key.split('-').map(Number); return qIndex(y, q); };

  // 프로그램이 속한 분기 목록. quarters가 있으면 그대로, 없으면 시작분기~목표기한 분기로 폴백.
  const getProgramQuarters = (p: Program): string[] => {
    if (p.quarters?.length) return p.quarters;
    const sy = p.year ?? now.getFullYear();
    const sq = p.quarter ?? 1;
    const startIdx = qIndex(sy, sq);
    let endIdx = startIdx;
    if (p.deadline) {
      const d = new Date(p.deadline);
      endIdx = Math.max(startIdx, qIndex(d.getFullYear(), Math.floor(d.getMonth() / 3) + 1));
    }
    const list: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) list.push(`${Math.floor(i / 4)}-${(i % 4) + 1}`);
    return list;
  };

  // 데드라인이 완료됐는지 (할일이 있고 모두 완료)
  const isDeadlineComplete = (dl: NonNullable<Program['deadlines']>[number]) =>
    dl.todos.length > 0 && dl.todos.every(t => t.done);

  // 프로그램의 디데이 긴급도(가장 가까운 미완료 기한). 없으면 맨 뒤로.
  const programUrgency = (p: Program): string => {
    const dates: string[] = [];
    if (p.deadline) dates.push(p.deadline);
    for (const dl of p.deadlines ?? []) {
      if (dl.date && !isDeadlineComplete(dl)) dates.push(dl.date);
    }
    return dates.length ? dates.sort()[0] : '9999-12-31';
  };

  // 전체 사업의 프로그램을 (연도, 분기) 기준으로 모으고 사업 정보 부착.
  // 여러 분기에 속하면 각 분기에 모두 표시. 가장 이른 분기가 아니면 '이어서' 표시.
  // 정렬은 디데이가 급한(가까운) 순서, 동일하면 수동 순서(order).
  const programsFor = (y: number, q: number): (ProgramWithWs & { isContinued: boolean })[] =>
    store.allWorkspacesEntries
      .flatMap(e => e.programs.map(p => ({ ...p, wsId: e.workspace.id, wsName: e.workspace.name })))
      .filter(p => getProgramQuarters(p).includes(qKey(y, q)))
      .map(p => {
        const qs = getProgramQuarters(p);
        const earliest = qs.reduce((min, k) => keyIndex(k) < keyIndex(min) ? k : min, qs[0]);
        return { ...p, isContinued: earliest !== qKey(y, q) };
      })
      .sort((a, b) => {
        const ua = programUrgency(a), ub = programUrgency(b);
        if (ua !== ub) return ua.localeCompare(ub);
        return (a.order ?? 0) - (b.order ?? 0);
      });

  // 사업·수익원 필터 (null = 전체)
  const applyWsFilter = <T extends { wsId: string; revenueSource?: string }>(list: T[]) =>
    list
      .filter(p => !filterWsId || p.wsId === filterWsId)
      .filter(p => !sourceFilter || p.revenueSource === sourceFilter);
  // 업무 영역 컨테이너 전체(분기 무관). 데드라인은 카드 안에서 분기별로 필터한다.
  const allContainers = () =>
    store.allWorkspacesEntries.flatMap(e =>
      e.programs.map(p => ({ ...p, wsId: e.workspace.id, wsName: e.workspace.name, isContinued: false })));
  // (연도,분기)에 속한 데드라인만 — 데드라인 날짜 기준
  const dlInQuarter = (p: { deadlines?: Program['deadlines'] }, y: number, q: number) =>
    (p.deadlines ?? []).filter(dl => {
      if (!dl.date) return false;
      const d = new Date(dl.date);
      return d.getFullYear() === y && Math.floor(d.getMonth() / 3) + 1 === q;
    });
  const quarterPrograms = applyWsFilter(allContainers());
  const countByQuarter = (q: number) =>
    applyWsFilter(allContainers()).reduce((s, p) => s + dlInQuarter(p, year, q).length, 0);

  const nextOrder = () =>
    store.allWorkspacesEntries.flatMap(e => e.programs).reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1;

  const stripWs = (p: ProgramWithWs & { isContinued?: boolean }): Program => {
    const { wsId: _w, wsName: _n, isContinued: _c, ...prog } = p;
    void _w; void _n; void _c;
    return prog;
  };

  // ── 분기 내 순서 조정 ────────────────────────────────────────────────────────
  const moveProgram = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= quarterPrograms.length) return;
    const arr = [...quarterPrograms];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    arr.forEach((p, i) => store.updateProgramInWs(p.wsId, { ...stripWs(p), order: i }));
  };

  // ── AI 분기 계획 적용 (여러 분기 동시 지원) ──────────────────────────────────
  applyQuarterPlanRef.current = (plans: QuarterPlan[]) => {
    let firstYear: number | null = null;
    let firstQuarter: number | null = null;
    let order = nextOrder();
    const touchedAreas = new Set<string>(); // 생성된 영역만 펼치기 위한 키(영역명 또는 미분류)
    // (사업 × 업무영역)별로 데드라인을 모은다 — 한 영역 안에서 사업당 컨테이너(데드라인 박스)는 하나만 유지
    type Bucket = { targetWs: string; py: number; pq: number; areaId?: string; areaName?: string; deadlines: ReturnType<typeof buildDeadlines> };
    // 과거/누락 날짜는 절대 저장하지 않는다 — 오늘 이후만 통과
    const clampFuture = (d?: string) => (d && d >= todayKey ? d : undefined);
    const nowY = new Date().getFullYear();
    const nowQ = Math.floor(new Date().getMonth() / 3) + 1;
    const buildDeadlines = (prog: NonNullable<QuarterPlan['programs']>[number], py: number, pq: number) =>
      (prog.deadlines ?? []).map(d => {
        const dlDate = clampFuture(d.date) ?? getQuarterEndDate(py, pq); // 과거면 분기말(미래)로
        return {
          id: uid(),
          name: d.name,
          date: dlDate,
          // 할일 날짜도 오늘 이후만 저장 — 과거/누락이면 자체 마감→데드라인 날짜로 보정
          todos: (d.todos ?? []).map(t => {
            if (typeof t === 'string') return { id: uid(), name: t, done: false };
            const td = clampFuture(t.date) ?? clampFuture(t.deadline) ?? dlDate;
            return { id: uid(), name: t.name, done: false, days: t.days, light: t.light, date: td, deadline: clampFuture(t.deadline) ?? td };
          }),
        };
      });
    const buckets = new Map<string, Bucket>();
    for (const plan of plans) {
      const targetWs = (plan.wsId && businesses.some(b => b.id === plan.wsId)) ? plan.wsId : wsId;
      let py = plan.year ?? year;
      let pq = plan.quarter ?? quarter;
      // 과거 분기로 생성됐으면 현재 분기로 보정 (2023 등 방지)
      if (py < nowY || (py === nowY && pq < nowQ)) { py = nowY; pq = nowQ; }
      if (firstYear === null) { firstYear = py; firstQuarter = pq; }
      for (const prog of plan.programs ?? []) {
        if (!prog?.name) continue;
        const area = prog.workAreaId ? areasForWs(targetWs).find(a => a.id === prog.workAreaId) : undefined;
        touchedAreas.add(area?.name ?? NONE);
        const key = `${targetWs}::${area?.id ?? '__none__'}`;
        const dls = buildDeadlines(prog, py, pq);
        const b = buckets.get(key);
        if (b) b.deadlines.push(...dls);
        else buckets.set(key, { targetWs, py, pq, areaId: area?.id, areaName: area?.name, deadlines: dls });
      }
    }
    // 각 (사업 × 영역) 컨테이너에 반영 — 기존 컨테이너가 있으면 데드라인만 추가, 없으면 하나만 생성
    for (const b of buckets.values()) {
      const entry = store.allWorkspacesEntries.find(e => e.workspace.id === b.targetWs);
      const existing = entry?.programs.find(p => (p.workAreaId ?? '__none__') === (b.areaId ?? '__none__'));
      if (existing) {
        store.updateProgramInWs(b.targetWs, { ...existing, deadlines: [...(existing.deadlines ?? []), ...b.deadlines] });
      } else {
        store.addProgramToWs(b.targetWs, {
          name: b.areaName ?? '목표',
          goal: '',
          color: businessColor(b.targetWs),
          workAreaId: b.areaId,
          year: b.py,
          quarter: b.pq,
          quarters: [qKey(b.py, b.pq)],
          order: order++,
          deadlines: b.deadlines,
        });
      }
    }
    // 적용된 첫 분기로 화면 이동 + 생성된 영역만 펼치기
    if (firstYear !== null) { setYear(firstYear); setQuarter(firstQuarter!); }
    if (touchedAreas.size) setExpandedAreas(prev => new Set([...prev, ...touchedAreas]));
  };

  // AI가 배정한 영역을 각 목표에 적용 (유효한 영역 id만, 같은 사업 내에서만)
  applyAreaAssignRef.current = (assigns: AreaAssignment[]) => {
    const expanded: string[] = [];
    for (const a of assigns) {
      const entry = store.allWorkspacesEntries.find(e => e.workspace.id === a.wsId);
      if (!entry) continue;
      const prog = entry.programs.find(p => p.id === a.programId);
      const areaObj = (entry.plan.workAreas ?? []).find(w => w.id === a.workAreaId);
      if (!prog || !areaObj) continue;
      store.updateProgramInWs(a.wsId, { ...prog, workAreaId: a.workAreaId });
      expanded.push(areaObj.name);
    }
    // 배정된 영역은 자동으로 펼쳐 결과를 바로 보여줌
    if (expanded.length) setExpandedAreas(prev => new Set([...prev, ...expanded]));
  };

  // ── 핸들러 ─────────────────────────────────────────────────────────────────

  const openAddProgram = () => {
    setShowAddProgram(s => !s);
    setNewProgramWsId(wsId);
    setNewProgramAreaId('');
    setNewProgramSource(sourceFilter ?? '');
  };

  const addProgram = () => {
    const name = newProgramName.trim();
    const targetWs = newProgramWsId || wsId;
    if (!name || !targetWs) return;
    store.addProgramToWs(targetWs, {
      name,
      goal: '',
      color: businessColor(targetWs),
      year,
      quarter,
      quarters: [qKey(year, quarter)],
      order: nextOrder(),
      workAreaId: newProgramAreaId || undefined,
      revenueSource: newProgramSource || undefined,
      deadlines: [],
    });
    setNewProgramName('');
    setNewProgramAreaId('');
    setNewProgramSource('');
    setShowAddProgram(false);
  };

  // 프로젝트 생성 (포커스된 사업에)
  const addProjectHandler = () => {
    const name = newProjectName.trim();
    if (!name || !projectWsId) return;
    store.addProject(projectWsId, { name, order: projectsForWs.length });
    setNewProjectName('');
    setAddingProject(false);
  };
  // 데드라인을 특정 프로젝트에 배정/해제 (미지정 = null)
  const assignDeadlineProject = (p: ProgramWithWs, deadlineId: string, projectId: string | null) => {
    store.setDeadlineProject(p.wsId, p.id, deadlineId, projectId ?? undefined);
    setProjMenuFor(null);
  };

  const startEditProgram = (p: ProgramWithWs) => {
    setEditingProgramId(p.id);
    setEditName(p.name);
    setEditGoal(p.goal);
    setEditYear(p.year ?? year);
    setEditQuarters(getProgramQuarters(p));
    setEditDeadline(p.deadline ?? '');
    setEditAreaId(p.workAreaId ?? '');
    setEditSource(p.revenueSource ?? '');
  };

  const toggleEditQuarter = (key: string) =>
    setEditQuarters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const saveEditProgram = (p: ProgramWithWs) => {
    if (!editName.trim() || editQuarters.length === 0) return;
    const sorted = [...editQuarters].sort((a, b) => keyIndex(a) - keyIndex(b));
    const [ey, eq] = sorted[0].split('-').map(Number);
    store.updateProgramInWs(p.wsId, {
      ...stripWs(p),
      name: editName.trim(),
      goal: editGoal.trim(),
      color: businessColor(p.wsId),
      year: ey,
      quarter: eq,
      quarters: sorted,
      deadline: editDeadline || undefined,
      workAreaId: editAreaId || undefined,
      revenueSource: editSource || undefined,
    });
    setEditingProgramId(null);
  };

  const updateProg = (p: ProgramWithWs, deadlines: NonNullable<Program['deadlines']>) => {
    store.updateProgramInWs(p.wsId, { ...stripWs(p), deadlines });
  };

  // 목표 on/off · 우선순위
  const toggleProgramEnabled = (p: ProgramWithWs) =>
    store.updateProgramInWs(p.wsId, { ...stripWs(p), enabled: p.enabled === false });
  const setProgramPriority = (p: ProgramWithWs, priority: number) =>
    store.updateProgramInWs(p.wsId, { ...stripWs(p), priority: Math.max(1, priority) });
  // 데드라인 개별 on/off
  const toggleDeadlineEnabled = (p: ProgramWithWs, dlId: string) =>
    updateProg(p, (p.deadlines ?? []).map(d => d.id === dlId ? { ...d, enabled: d.enabled === false } : d));

  // 데드라인 일괄 미루기 — 그 데드라인 안의 모든 업무(시작·완수기한)와 데드라인 날짜를 n일 뒤로.
  const pushDeadlineSchedule = (p: ProgramWithWs, dlId: string, days: number) => {
    updateProg(p, (p.deadlines ?? []).map(d => d.id !== dlId ? d : {
      ...d,
      date: d.date ? addDaysStr(d.date, days) : d.date,
      todos: (d.todos ?? []).map(t => ({
        ...t,
        date: t.date ? addDaysStr(t.date, days) : t.date,       // 시작 날짜
        deadline: t.deadline ? addDaysStr(t.deadline, days) : t.deadline, // 완수 기한
      })),
    }));
  };

  // 소요시간 포맷 (초 → N시간 M분)
  const fmtDur = (s: number) => {
    if (!s) return '0분';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? (m > 0 ? `${h}시간 ${m}분` : `${h}시간`) : (m > 0 ? `${m}분` : `${s}초`);
  };
  // 데드라인 끝내기 — 완료 시 여정 깃발 증정 오버레이 표시
  const finishDeadline = (p: ProgramWithWs, dl: NonNullable<Program['deadlines']>[number]) => {
    const wasDone = dl.done;
    store.toggleDeadlineDone(p.wsId, p.id, dl.id);
    if (!wasDone) {
      const seconds = (dl.todos ?? []).reduce((s, t) => s + (t.record?.seconds ?? 0), 0);
      setFlagAward({
        flagSrc: '/flag-deadline-hero.svg',
        heading: '데드라인 완료! 🎉\n데드라인 깃발을 획득했어요',
        sub: `‘${dl.name}’을(를) 끝냈어요.`,
        foot: `총 소요시간 ${fmtDur(seconds)}`,
      });
    }
  };

  const addDeadline = (p: ProgramWithWs) => {
    if (!dlName.trim() || !dlDate) return;
    updateProg(p, [...(p.deadlines ?? []), { id: uid(), name: dlName.trim(), date: dlDate, todos: [] }]);
    setDlName(''); setDlDate(''); setAddDeadlineFor(null);
  };

  const deleteDeadline = (p: ProgramWithWs, dlId: string) =>
    updateProg(p, (p.deadlines ?? []).filter(d => d.id !== dlId));

  const startEditDeadline = (dl: { id: string; name: string; date: string }) => {
    setEditingDeadlineId(dl.id);
    setDlEditName(dl.name);
    setDlEditDate(dl.date);
  };

  const saveDeadline = (p: ProgramWithWs, dlId: string) => {
    if (!dlEditName.trim() || !dlEditDate) return;
    updateProg(p, (p.deadlines ?? []).map(d =>
      d.id === dlId ? { ...d, name: dlEditName.trim(), date: dlEditDate } : d
    ));
    setEditingDeadlineId(null);
  };

  const addTodo = (p: ProgramWithWs, dlId: string) => {
    const text = (todoInputs[dlId] ?? '').trim();
    if (!text) return;
    updateProg(p, (p.deadlines ?? []).map(d =>
      d.id === dlId ? { ...d, todos: [...d.todos, { id: uid(), name: text, done: false }] } : d
    ));
    setTodoInputs(prev => ({ ...prev, [dlId]: '' }));
  };

  const toggleTodo = (p: ProgramWithWs, dlId: string, todoId: string) =>
    updateProg(p, (p.deadlines ?? []).map(d =>
      d.id === dlId ? { ...d, todos: d.todos.map(t => t.id === todoId ? { ...t, done: !t.done } : t) } : d
    ));

  const deleteTodo = (p: ProgramWithWs, dlId: string, todoId: string) =>
    updateProg(p, (p.deadlines ?? []).map(d =>
      d.id === dlId ? { ...d, todos: d.todos.filter(t => t.id !== todoId) } : d
    ));

  const startEditTodo = (t: { id: string; name: string; date?: string; days?: number[]; deadline?: string }) => {
    setEditingTodoId(t.id);
    setTdName(t.name);
    setTdMode((t.days?.length ?? 0) > 0 ? 'weekly' : 'date');
    setTdDate(t.date ?? '');
    setTdDays(t.days ?? []);
    setTdDeadline(t.deadline ?? '');
  };

  const saveTodo = (p: ProgramWithWs, dlId: string, todoId: string) => {
    if (!tdName.trim()) return;
    const weekly = tdMode === 'weekly';
    updateProg(p, (p.deadlines ?? []).map(d =>
      d.id === dlId ? {
        ...d,
        todos: d.todos.map(t => t.id === todoId ? {
          ...t,
          name: tdName.trim(),
          date: weekly ? undefined : (tdDate || undefined),
          days: weekly ? tdDays : undefined,
          deadline: tdDeadline || undefined,
        } : t),
      } : d
    ));
    setEditingTodoId(null);
  };

  const toggleTdDay = (d: number) =>
    setTdDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  // ── 업무 영역별 섹션: 영역 이름 기준으로 프로그램을 묶음 (미지정은 '미분류', 항상 마지막) ──
  type ProgRow = { p: (typeof quarterPrograms)[number]; idx: number };
  type AreaSection = { key: string; name: string; color: string; items: ProgRow[] };
  const NONE = '__none__';
  const buildAreaSections = (): AreaSection[] => {
    const groups = new Map<string, AreaSection>();
    quarterPrograms.forEach((p, idx) => {
      const area = programArea(p);
      const key = area?.name ?? NONE;
      if (!groups.has(key)) {
        groups.set(key, { key, name: area?.name ?? '미분류', color: area?.color ?? '#a3a3a3', items: [] });
      }
      groups.get(key)!.items.push({ p, idx });
    });
    // 저장된 사용자 순서(store.areaOrder) 우선, 미분류는 항상 마지막
    const order = store.areaOrder;
    const rank = (name: string) => {
      const i = order.indexOf(name);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    // 각 영역의 '가장 가까운(미완료·오늘 이후) 데드라인' — 이게 빠른 영역이 위로 올라옴
    const nearest = (sec: AreaSection) => {
      const ds = sec.items.flatMap(({ p }) => (p.deadlines ?? [])
        .filter(dl => !dl.done && dl.date && dl.date >= todayKey)
        .map(dl => dl.date as string));
      return ds.length ? ds.sort()[0] : '9999-12-31'; // 임박 데드라인 없으면 맨 아래
    };
    return [...groups.values()]
      .filter(s => s.key !== NONE) // '미분류' 섹션은 표시하지 않음
      .sort((a, b) => {
        const na = nearest(a), nb = nearest(b);
        if (na !== nb) return na.localeCompare(nb);      // 데드라인 가까운 영역 우선(위로)
        const ra = rank(a.name), rb = rank(b.name);      // 동률이면 저장된 순서 → 이름
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
  };
  const areaSections = buildAreaSections();

  // ── 우선순위 모드: 이번 분기 데드라인을 날짜순 + 같은 날짜 내 수동 우선순위로 평면 정렬 ──
  const priorityItems = quarterPrograms
    .filter(p => programArea(p)) // 미분류(영역 없음) 컨테이너 제외 — 영역별 보기와 동일하게(유령 항목 방지)
    .flatMap(p => dlInQuarter(p, year, quarter).filter(dl => dl.enabled !== false && !dl.done).map(dl => ({ dl, p })))
    .sort((a, b) => {
      const da = a.dl.date || '9999-12-31', db = b.dl.date || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      const ra = priorityOrder.indexOf(a.dl.id), rb = priorityOrder.indexOf(b.dl.id);
      return (ra === -1 ? 99999 : ra) - (rb === -1 ? 99999 : rb);
    });

  const handlePrioDrop = (targetId: string) => {
    if (!prioDrag || prioDrag === targetId) { setPrioDrag(null); setPrioOver(null); return; }
    const ids = priorityItems.map(i => i.dl.id);
    const from = ids.indexOf(prioDrag), to = ids.indexOf(targetId);
    if (from === -1 || to === -1) { setPrioDrag(null); setPrioOver(null); return; }
    const next = [...ids]; next.splice(from, 1); next.splice(to, 0, prioDrag);
    savePriorityOrder(next);
    setPrioDrag(null); setPrioOver(null);
  };

  const toggleSelectDl = (id: string) => setSelectedDls(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // 디데이 쪼개기 — 선택한 데드라인들을 (현재 우선순위 순서로) 오늘~분기말 사이에 균등 분배해 각각 다른 날짜 부여
  const splitDday = () => {
    const selected = priorityItems.filter(i => selectedDls.has(i.dl.id));
    if (selected.length < 2) return;
    const start = new Date(todayKey + 'T00:00:00').getTime();
    const end = new Date(getQuarterEndDate(year, quarter) + 'T00:00:00').getTime();
    const span = Math.max(86400000, end - start);
    const n = selected.length;
    const newDates = new Map<string, string>();
    selected.forEach((item, i) => {
      const d = new Date(start + Math.round((span * (i + 1)) / n));
      newDates.set(item.dl.id, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    });
    const byProg = new Map<string, (typeof selected)[number]['p']>();
    selected.forEach(item => byProg.set(item.p.id, item.p));
    for (const p of byProg.values()) {
      store.updateProgramInWs(p.wsId, { ...stripWs(p), deadlines: (p.deadlines ?? []).map(dl => newDates.has(dl.id) ? { ...dl, date: newDates.get(dl.id)! } : dl) });
    }
    setSelectedDls(new Set());
  };
  const toggleAreaCollapsed = (key: string) =>
    setExpandedAreas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // ── 우측 캘린더 데이터 ────────────────────────────────────────────────────────
  const dstr = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // 선택한 단계(목표/데드라인/업무)에 따라 기간 막대 생성. ghost = 상위 카테고리 일정(50%)
  type CalRange = { key: string; level: CalLevel; start: string; end: string; color: string; name: string; wsId: string; programId: string; deadlineId?: string; todoId?: string; ghost?: boolean };
  // 목표/데드라인 기간 계산 헬퍼
  const progPeriod = (p: (typeof quarterPrograms)[number]) => {
    const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
    const dlDates = dls.map(dl => dl.date).filter(Boolean) as string[];
    const end = p.deadline || (dlDates.length ? dlDates.sort().slice(-1)[0] : undefined);
    if (!end) return null;
    const starts = [p.startDate, ...dls.map(dl => dl.startDate), ...dls.flatMap(dl => dl.todos.map(t => t.date))].filter((x): x is string => !!x);
    let start = p.startDate || (starts.length ? starts.sort()[0] : end);
    if (start > end) start = end;
    return { start, end };
  };
  const dlPeriod = (p: (typeof quarterPrograms)[number], dl: NonNullable<Program['deadlines']>[number]) => {
    if (!dl.date) return null;
    const tstarts = dl.todos.map(t => t.date).filter((x): x is string => !!x);
    let start = dl.startDate || (tstarts.length ? tstarts.sort()[0] : (p.startDate || dl.date));
    if (start > dl.date) start = dl.date;
    return { start, end: dl.date };
  };
  const buildCalRanges = (): CalRange[] => {
    const real: CalRange[] = [];
    const ghosts: CalRange[] = [];
    for (const p of quarterPrograms) {
      const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
      // 캘린더 색은 오직 비즈니스(워크스페이스) 색으로만 구분
      const pColor = businessColor(p.wsId);
      if (calLevel === 'program') {
        const pp = progPeriod(p);
        // 업무 영역 레벨: 막대 라벨은 업무 영역 이름(디자인/개발/기획…)으로
        const areaName = programArea(p)?.name ?? p.name ?? '미분류';
        if (pp) real.push({ key: `p-${p.id}`, level: 'program', ...pp, name: areaName, wsId: p.wsId, programId: p.id, color: pColor });
      } else if (calLevel === 'deadline') {
        // 데드라인 보기: 상위 라인 없이 소속 목표 색으로만 구분
        for (const dl of dls) {
          const dp = dlPeriod(p, dl);
          if (dp) real.push({ key: `d-${dl.id}`, level: 'deadline', ...dp, name: `${p.name} · ${dl.name}`, wsId: p.wsId, programId: p.id, deadlineId: dl.id, color: pColor });
        }
      } else {
        // 업무 보기: 상위 라인 없이, 명시적으로 배치된(시작일/기한이 있는) 업무만 표시
        for (const dl of dls) {
          const dColor = pColor; // 업무도 비즈니스 색으로 통일
          for (const t of dl.todos) {
            if (t.done) continue; // 완료한 업무는 캘린더에서 자동으로 사라짐
            if (!t.date && !t.deadline) continue; // 부모 데드라인 날짜 상속으로 인한 기본 배치 제거
            let start = t.date || t.deadline!;
            let end = t.deadline || t.date!;
            if (start > end) start = end;
            real.push({ key: `t-${t.id}`, level: 'todo', start, end, name: t.name, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, color: dColor });
          }
        }
      }
    }
    // 고스트(상위)를 먼저 → 상단 얇은 라인 트랙에 배치
    return [...ghosts, ...real];
  };
  // 드래그 중이면 해당 항목의 기간을 미리보기 값으로 대체
  const calRanges: CalRange[] = buildCalRanges().map(r =>
    calDrag && calDrag.key === r.key ? { ...r, start: calDrag.start, end: calDrag.end } : r
  );
  const realRanges = calRanges.filter(r => !r.ghost); // 고스트 제외(현재 단계 실제 항목)

  // ── 일정 초기화 (내용은 유지, 날짜만 제거. 상위 초기화 시 하위도 제거) ──
  const clearTodoDates = (todos: NonNullable<Program['deadlines']>[number]['todos']) =>
    todos.map(t => ({ ...t, date: undefined, deadline: undefined }));

  // 캘린더에서 개별 항목의 일정만 삭제 (내용 유지)
  const clearOneSchedule = (r: CalRange) => {
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === r.wsId);
    const prog = entry?.programs.find(p => p.id === r.programId);
    if (!prog) return;
    if (r.level === 'program') {
      if (!window.confirm(`'${r.name}' 업무 영역의 일정을 캘린더에서 삭제할까요?\n하위 데드라인·업무 일정도 함께 사라집니다. (내용은 유지)`)) return;
      store.updateProgramInWs(r.wsId, {
        ...prog, startDate: undefined, deadline: undefined,
        deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: '', startDate: undefined, todos: clearTodoDates(dl.todos) })),
      });
      return;
    }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== r.deadlineId) return dl;
      if (r.level === 'deadline') return { ...dl, date: '', startDate: undefined };
      return { ...dl, todos: dl.todos.map(t => t.id === r.todoId ? { ...t, date: undefined, deadline: undefined } : t) };
    });
    store.updateProgramInWs(r.wsId, { ...prog, deadlines });
  };
  const calY = calMonth.getFullYear();
  const calMo = calMonth.getMonth();

  // 주 단위 날짜 슬롯 (1순위 간트 차트용)
  const calSlots: (string | null)[] = [
    ...Array(new Date(calY, calMo, 1).getDay()).fill(null),
    ...Array.from({ length: new Date(calY, calMo + 1, 0).getDate() }, (_, i) => dstr(calY, calMo, i + 1)),
  ];
  while (calSlots.length % 7 !== 0) calSlots.push(null);
  const calWeeks: (string | null)[][] = [];
  for (let i = 0; i < calSlots.length; i += 7) calWeeks.push(calSlots.slice(i, i + 7));

  // 드래그 중인 데드라인/업무가 배치 가능한 상위 기간을 계산해 캘린더에 표시
  const dragBoundsCtx =
    (calDrag && (calDrag.level === 'deadline' || calDrag.level === 'todo')) ? { level: calDrag.level, wsId: calDrag.wsId, programId: calDrag.programId, deadlineId: calDrag.deadlineId }
    : (htmlDragging && listDragCtx && (listDragCtx.level === 'deadline' || listDragCtx.level === 'todo')) ? listDragCtx
    : null;
  const allowedBounds = dragBoundsCtx ? boundsForTarget(dragBoundsCtx) : null;
  const showAllowed = !!(allowedBounds && (allowedBounds.min || allowedBounds.max));
  const inAllowed = (ds: string) =>
    !allowedBounds || ((!allowedBounds.min || ds >= allowedBounds.min) && (!allowedBounds.max || ds <= allowedBounds.max));

  const CalendarPanel = (
    <aside data-teach="calendar" className="hidden xl:flex flex-col flex-1 min-w-[360px] sticky top-8 gap-4 max-h-[calc(100vh-3rem)]">
      {/* 플레이바 + 공용 메모 (Home·Task와 동일) */}
      <div className="flex-shrink-0"><MusicTimer compact /></div>
      <div className="flex-shrink-0"><MemoPanel /></div>

      <div className="bg-white border rounded-[24px] p-6 flex-1 min-h-0 flex flex-col" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }} onDragEnter={() => setHtmlDragging(true)}>
        {/* 월 네비 */}
        <div className="flex items-center justify-between mb-2.5">
          <button onClick={() => setCalMonth(new Date(calY, calMo - 1, 1))} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="이전 달">
            <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="text-[18px] font-bold" style={{ color: '#16211E' }}>{calY}년 {calMo + 1}월</span>
          <button onClick={() => setCalMonth(new Date(calY, calMo + 1, 1))} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="다음 달">
            <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* 분기 · off 설정 뱃지 */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <span className="text-[12px] font-bold rounded-full px-2.5 py-1" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>{Math.floor(calMo / 3) + 1}분기</span>
          <button
            onClick={() => setOffOpen(o => !o)}
            className="text-[12px] font-semibold rounded-full px-2.5 py-1 transition-colors"
            style={offOpen ? { backgroundColor: '#FBE7C6', color: '#96631A' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
            title="오프 기간(휴가 등) 설정 — 이후 모든 일정이 그만큼 밀립니다"
          >
            off 설정
          </button>
        </div>
        {offOpen && (
          <div className="rounded-2xl p-3 mb-4" style={{ backgroundColor: '#FCF6EC', border: '1px solid #F2E2C4' }}>
            <p className="text-[11px] mb-2 leading-relaxed" style={{ color: '#96631A' }}>전면 스탑(휴가 등) 기간을 정하면, 그 시작일 이후 모든 프로젝트 일정이 기간 일수만큼 뒤로 밀려요.</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <input type="date" value={offStart} onChange={e => setOffStart(e.target.value)} className="bg-white border rounded-lg px-2 py-1 text-xs outline-none" style={{ borderColor: '#F2E2C4' }} />
              <span className="text-xs" style={{ color: '#C9A662' }}>~</span>
              <input type="date" value={offEnd} min={offStart || undefined} onChange={e => setOffEnd(e.target.value)} className="bg-white border rounded-lg px-2 py-1 text-xs outline-none" style={{ borderColor: '#F2E2C4' }} />
              <button onClick={applyOffPeriod} disabled={!offStart || !offEnd || offEnd < offStart} className="px-2.5 py-1 disabled:opacity-30 text-white text-xs rounded-lg transition-colors" style={{ backgroundColor: '#E0A73C' }}>적용</button>
            </div>
          </div>
        )}

        {/* 3단계 보기 탭 */}
        <div className="flex gap-1 mb-5 rounded-full p-1" style={{ backgroundColor: '#F1F1EB' }}>
          {([['program', '업무 영역'], ['deadline', '데드라인'], ['todo', '업무']] as [CalLevel, string][]).map(([lv, label]) => (
            <button
              key={lv}
              onClick={() => setCalLevel(lv)}
              className="flex-1 py-2 rounded-full text-[13px] font-semibold transition-colors"
              style={calLevel === lv ? { backgroundColor: '#fff', color: '#16211E', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } : { color: '#8D9A8D' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 캘린더에 배치 안 된 항목 클릭 시 안내 */}
        {notPlaced && (
          <div className="mb-3 rounded-xl px-3 py-2 text-[12px] text-center leading-relaxed" style={{ backgroundColor: '#FCF3E6', color: '#96631A' }}>
            ‘{notPlaced}’은(는) 아직 캘린더에 배치되지 않았어요. 왼쪽 항목을 드래그해 날짜에 놓아보세요.
          </div>
        )}

        <div className="grid grid-cols-7 mb-2">
          {DOW.map(d => (
            <div key={d} className="text-center text-[12px] py-1 font-medium" style={{ color: '#9AA39D' }}>{d}</div>
          ))}
        </div>

        {/* 단계별 기간을 드래그로 이동/조절 가능한 간트 막대로 표시 (주 단위) */}
        <div
          className="relative flex-1 min-h-0 flex flex-col"
          onDragOver={e => { if (dragPayloadRef.current) e.preventDefault(); }}
          onDrop={e => {
            e.preventDefault();
            // ref가 전역 drop 핸들러에 의해 먼저 비워질 수 있으므로 dataTransfer를 폴백으로 사용
            let payload = dragPayloadRef.current;
            if (!payload) {
              try { const raw = e.dataTransfer.getData('text/plain'); if (raw) payload = JSON.parse(raw); } catch { /* empty */ }
            }
            // 스크롤 컨테이너에서 셀 dragover가 누락돼도 드롭 좌표로 날짜를 다시 찾음(폴백)
            const date = dragOverDateRef.current || dateFromPoint(e.clientX, e.clientY);
            if (payload && date) dropOnDate(payload, date);
            setDragOverDate(null);
            dragPayloadRef.current = null;
            dragOverDateRef.current = null;
          }}
        >
        {/* 드래그 중, 격자 위/아래로 끌면 달 이동 (시각 힌트만, 포인터 통과) */}
        {calDrag && (
          <div className="absolute bottom-full left-0 right-0 mb-1 h-6 z-20 flex items-center justify-center text-[11px] font-semibold text-violet-700 bg-violet-100/95 rounded-lg border border-violet-200 pointer-events-none">▲ 위로 끌면 이전 달 ({calMo === 0 ? 12 : calMo}월)</div>
        )}
        {calDrag && (
          <div className="absolute top-full left-0 right-0 mt-1 h-6 z-20 flex items-center justify-center text-[11px] font-semibold text-violet-700 bg-violet-100/95 rounded-lg border border-violet-200 pointer-events-none">▼ 아래로 끌면 다음 달 ({(calMo + 2) > 12 ? (calMo + 2 - 12) : calMo + 2}월)</div>
        )}
        <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-1" ref={weeksRef}>
          {calWeeks.map((week, wi) => {
            const days = week.filter((d): d is string => !!d);
            if (!days.length) return <div key={wi} />;
            const wStart = days[0], wEnd = days[days.length - 1];
            const colOf = (ds: string) => week.findIndex(d => d === ds);
            const toBar = (r: CalRange) => {
              const s = r.start < wStart ? wStart : r.start;
              const e = r.end > wEnd ? wEnd : r.end;
              return { r, sc: colOf(s), ec: colOf(e), startsHere: r.start >= wStart, endsHere: r.end <= wEnd };
            };
            const barsInWeek = calRanges
              .filter(r => r.end >= wStart && r.start <= wEnd)
              .map(toBar)
              .filter(b => b.sc !== -1 && b.ec !== -1)
              .sort((a, b) => a.sc - b.sc || a.ec - b.ec);
            const assignLanes = (bars: typeof barsInWeek) => {
              const lanes: (typeof barsInWeek)[] = [];
              for (const b of bars) {
                let lane = lanes.find(L => L.every(x => b.sc > x.ec || b.ec < x.sc));
                if (!lane) { lane = []; lanes.push(lane); }
                lane.push(b);
              }
              return lanes;
            };
            const ghostLanes = assignLanes(barsInWeek.filter(b => b.r.ghost));   // 상위 = 얇은 라인
            const realLanes = assignLanes(barsInWeek.filter(b => !b.r.ghost));   // 현재 단계 = 막대
            const ghostH = 6, laneH = 30, numberH = 34;
            const ghostTrackH = ghostLanes.length * ghostH;
            const cellMinH = numberH + ghostTrackH + realLanes.length * laneH + 4;
            return (
              <div key={wi} className="relative">
                {/* 날짜 숫자 = 드롭 대상(hit-test + 리스트→캘린더 드롭). 주 전체 높이를 덮음 */}
                <div className="grid grid-cols-7">
                  {week.map((ds, di) => {
                    const isOver = !!ds && ds === dragOverDate;
                    const allowedOn = showAllowed && !!ds && inAllowed(ds);   // 배치 가능 범위(강조)
                    return (
                    <div
                      key={di}
                      data-cal-date={ds ?? undefined}
                      onDragOver={ds ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragOverDateRef.current = ds; if (dragOverDate !== ds) setDragOverDate(ds); }) : undefined}
                      className={`flex flex-col items-center rounded-lg transition-colors ${
                        isOver ? 'bg-violet-100 ring-2 ring-violet-400'
                        : allowedOn ? 'bg-emerald-100 ring-1 ring-emerald-300'
                        : ''
                      }`}
                      style={{ minHeight: cellMinH }}
                    >
                      {ds && (
                        <div
                          className="w-8 h-8 flex items-center justify-center text-sm rounded-full font-semibold"
                          style={
                            isOver ? { backgroundColor: '#5FD93A', color: '#fff' }
                            : ds === todayKey ? { backgroundColor: '#9DFE3B', color: '#16211E' }
                            : { color: '#5B6560' }
                          }
                        >
                          {Number(ds.slice(8))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                {/* 상위 카테고리: 얇은 라인 트랙 (인지용, 공간 최소) */}
                {ghostTrackH > 0 && (
                  <div className="absolute left-0 right-0 grid grid-cols-7 gap-x-0.5 pointer-events-none" style={{ top: numberH, gridAutoRows: `${ghostH}px` }}>
                    {ghostLanes.flatMap((lane, li) => lane.map((b, bi) => (
                      <div
                        key={`g-${li}-${bi}`}
                        style={{ gridColumn: `${b.sc + 1} / ${b.ec + 2}`, gridRow: li + 1, backgroundColor: b.r.color }}
                        className="h-[3px] self-center rounded-full opacity-70"
                        title={b.r.name}
                      />
                    )))}
                  </div>
                )}

                {/* 현재 단계 기간 막대 (절대 배치, 드래그 중엔 hit-test 위해 pointer-events 해제) */}
                <div
                  className={`absolute left-0 right-0 grid grid-cols-7 gap-x-0.5 ${calDrag || htmlDragging ? 'pointer-events-none' : ''}`}
                  style={{ top: numberH + ghostTrackH, gridAutoRows: `${laneH}px` }}
                >
                  {realLanes.flatMap((lane, li) => lane.map((b, bi) => {
                    const dragging = calDrag?.key === b.r.key;
                    const hot = b.r.key === highlightKey; // 좌측에서 클릭한 항목
                    return (
                      <div
                        key={`${li}-${bi}`}
                        data-cal-bar={b.r.key}
                        style={{ gridColumn: `${b.sc + 1} / ${b.ec + 2}`, gridRow: li + 1 }}
                        className={`group/bar relative flex flex-col justify-start min-w-0 cursor-grab active:cursor-grabbing select-none ${dragging ? 'opacity-90' : ''}`}
                        onMouseDown={e => startCalDrag(b.r, 'move', e)}
                        title={`${b.r.name} — 드래그로 이동, 양끝을 잡아 기간 조절`}
                      >
                        {/* 클릭한 업무 강조 하이라이트 */}
                        {hot && <span className="absolute -inset-x-1.5 -top-1 -bottom-1 rounded-lg animate-pulse pointer-events-none z-0" style={{ backgroundColor: b.r.color, opacity: 0.2, boxShadow: `0 0 0 2px ${b.r.color}` }} />}
                        {/* 얇은 기간 라인 */}
                        <div className="relative h-[3px] mt-2.5 rounded-full" style={{ backgroundColor: b.r.color, opacity: dragging || hot ? 1 : 0.9 }}>
                          {/* 시작 그립 (드래그로 시작일 조절) */}
                          {b.startsHere && (
                            <div
                              onMouseDown={e => startCalDrag(b.r, 'resize-start', e)}
                              className="absolute -left-2 -top-2 w-4 h-[17px] flex items-center justify-center cursor-ew-resize z-20"
                              title="시작일 조절"
                            >
                              <span className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: b.r.color, boxShadow: '0 0 0 2px #fff' }} />
                            </div>
                          )}
                          {/* 끝 그립 (드래그로 기간 연장/단축) */}
                          {b.endsHere && (
                            <div
                              onMouseDown={e => startCalDrag(b.r, 'resize-end', e)}
                              className="absolute -right-2 -top-2 w-4 h-[17px] flex items-center justify-center cursor-ew-resize z-20"
                              title="완료일 조절 (기간 연장)"
                            >
                              <span className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: b.r.color, boxShadow: '0 0 0 2px #fff' }} />
                            </div>
                          )}
                        </div>
                        {/* 라벨 (라인 아래, 중앙) */}
                        <span className={`relative z-10 mt-1.5 text-center text-[10px] leading-none truncate px-1 ${hot ? 'font-bold' : ''}`} style={{ color: hot ? '#16211E' : '#7A857E' }}>{b.r.name}</span>
                        {/* X 삭제 — 호버 시 가운데 위에 표시 (양끝 그립과 겹치지 않게) */}
                        {b.endsHere && (
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); clearOneSchedule(b.r); }}
                            className="absolute left-1/2 -translate-x-1/2 -top-2 z-30 w-4 h-4 rounded-full bg-neutral-400 hover:bg-neutral-600 text-white flex items-center justify-center text-[10px] leading-none opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-pointer"
                            title="이 일정을 캘린더에서 삭제 (내용 유지)"
                          >×</button>
                        )}
                      </div>
                    );
                  }))}
                </div>
              </div>
            );
          })}
          {realRanges.length === 0 && (
            <p className="text-[12px] text-center py-4 leading-relaxed" style={{ color: '#9AA39D' }}>이 단계에 표시할 일정이 없어요.<br />왼쪽 항목을 이 캘린더로 드래그해 배치할 수 있어요.</p>
          )}
        </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex gap-8 items-start">
    <div className="max-w-2xl flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-[28px] font-black tracking-[-0.02em]" style={{ color: '#16211E' }}>Goals</h1>
      </div>

      {/* ── 사업 성장 단계 목표 (Plan 연동) — '전체'일 땐 안내 문구, 특정 사업이면 그 사업 목표 ─── */}
      <section className="bg-white border rounded-[24px] px-6 py-5 mb-6" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
        {!filterWsId ? (
          <p className="text-[14px]" style={{ color: '#9AA39D' }}>특정 <span className="font-medium" style={{ color: '#5B6560' }}>비즈니스</span>를 선택하면 그 사업의 <span className="font-medium" style={{ color: '#5B6560' }}>성장 목표</span>가 여기에 표시돼요.</p>
        ) : growthStages.length === 0 ? (
          <p className="text-[14px]" style={{ color: '#9AA39D' }}>Plan 페이지에서 <span className="font-medium" style={{ color: '#5B6560' }}>사업 성장 단계</span>를 먼저 설정하세요.</p>
        ) : currentStage ? (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-snug" style={{ color: '#16211E' }}>
                {growthStages.length > 0 && <span style={{ color: '#8D9A8D' }}>{Math.min(growthIdx + 1, growthStages.length)}단계 · </span>}
                {currentStage.title}
              </p>
              <div className="mt-2 space-y-1">
                {currentStage.metric && <p className="text-[13px]" style={{ color: '#5B6560' }}>📈 {currentStage.metric}</p>}
                {currentStage.direction && <p className="text-[13px]" style={{ color: '#5B6560' }}>🧭 {currentStage.direction}</p>}
                {(currentStage.projects?.length ?? 0) > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {currentStage.projects!.map((pj, i) => (
                      <li key={i} className="text-[13px] flex items-start gap-1.5" style={{ color: '#5B6560' }}><span style={{ color: '#C4CCC4' }} className="mt-0.5">•</span>{pj}</li>
                    ))}
                  </ul>
                )}
                {growthIdx > 0 && (
                  <button onClick={() => store.setGrowthStageIndex(goalWsId, growthIdx - 1)} className="text-[12px] transition-colors hover:opacity-70 mt-1" style={{ color: '#9AA39D' }}>← 이전 단계</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => { store.switchWorkspace(goalWsId); router.push('/plan#growth-stages'); }}
                className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: '#F0F0EA' }}
                title="Plan에서 성장 단계 관리 · 달성 처리하기"
              >
                <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>Plan에서 보기</span>
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" style={{ color: '#5B6560' }}><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-[16px] font-bold" style={{ color: '#3E6B1F' }}>🎉 모든 성장 단계를 달성했어요!</p>
            <button onClick={() => store.setGrowthStageIndex(goalWsId, growthStages.length - 1)} className="text-[12px] transition-colors hover:opacity-70 flex-shrink-0" style={{ color: '#9AA39D' }}>← 마지막 단계로</button>
          </div>
        )}
      </section>

      {/* ── 연도 선택 ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 mb-5">
        <button onClick={() => setYear(y => y - 1)} className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
          <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-[24px] font-black tabular-nums tracking-[-0.02em]" style={{ color: '#16211E' }}>{year}년</span>
        <button onClick={() => setYear(y => y + 1)} className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
          <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {year !== now.getFullYear() && (
          <button onClick={() => setYear(now.getFullYear())} className="text-[12px] transition-colors hover:opacity-70" style={{ color: '#9AA39D' }}>올해</button>
        )}
      </div>

      {/* ── 사업 필터 ───────────────────────────────────────────────────── */}
      {businesses.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button
            onClick={() => setFilterWsId(null)}
            className="px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
            style={!filterWsId ? { backgroundColor: '#16211E', color: '#fff' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
          >
            전체
          </button>
          {businesses.map(b => {
            const sel = filterWsId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setFilterWsId(sel ? null : b.id)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                style={sel ? { backgroundColor: '#DFF9C4', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(b.id) }} />
                {b.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 프로젝트 생성 (포커스된 사업일 때) — 목록의 프로젝트 박스는 아래에서 렌더 ── */}
      {projectWsId && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {addingProject ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addProjectHandler(); if (e.key === 'Escape') { setAddingProject(false); setNewProjectName(''); } }}
                placeholder="프로젝트 이름"
                className="bg-white border rounded-full px-3 py-1.5 text-[13px] outline-none focus:border-violet-400"
                style={{ borderColor: 'var(--spira-border-strong)' }}
              />
              <button onClick={addProjectHandler} disabled={!newProjectName.trim()} className="text-[13px] font-semibold px-2 py-1 text-neutral-700 disabled:opacity-30">추가</button>
              <button onClick={() => { setAddingProject(false); setNewProjectName(''); }} className="text-[13px] text-neutral-400 px-1">취소</button>
            </span>
          ) : (
            <button onClick={() => setAddingProject(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors" style={{ color: '#5B5BD6', backgroundColor: '#EEF1FF' }}>📁 새 프로젝트</button>
          )}
        </div>
      )}

      {/* ── 분기 탭 ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2.5 mb-5">
        {QUARTERS.map(q => {
          const active = q === quarter;
          const cnt = countByQuarter(q);
          return (
            <button
              key={q}
              onClick={() => setQuarter(q)}
              className="flex flex-col items-center gap-0.5 py-3 rounded-2xl border transition-colors"
              style={active
                ? { backgroundColor: '#9DFE3B', borderColor: '#9DFE3B', color: '#16211E' }
                : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#5B6560' }}
            >
              <span className="text-[15px] font-bold">{QUARTER_LABEL[q]}</span>
              <span className="text-[11px]" style={{ color: active ? '#4E7A2E' : '#9AA39D' }}>
                {QUARTER_MONTHS[q]}{cnt > 0 ? ` · ${cnt}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 수익원 필터 배너 (Resources에서 진입) ─────────────────────────── */}
      {sourceFilter && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 mb-4">
          <span className="text-sm">💰</span>
          <p className="text-xs text-emerald-800 flex-1">
            수익원 <span className="font-semibold">{sourceFilter}</span> 관련 프로젝트만 보고 있어요
          </p>
          <button
            onClick={() => { setSourceFilter(null); setFilterWsId(null); }}
            className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium transition-colors"
          >
            필터 해제
          </button>
        </div>
      )}

      {/* ── 분기 프로그램 ───────────────────────────────────────────────── */}
      <section>

        {showAddProgram && (
          <div className="bg-white border border-neutral-200 rounded-xl p-3 mb-3 space-y-2">
            {/* 사업 선택 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-neutral-500">사업</span>
              {businesses.map(b => {
                const sel = (newProgramWsId || wsId) === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setNewProgramWsId(b.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      sel ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(b.id) }} />
                    {b.name}
                  </button>
                );
              })}
            </div>
            {/* 업무 영역 선택 (선택한 사업의 Plan workAreas) */}
            {(() => {
              const areas = areasForWs(newProgramWsId || wsId);
              if (areas.length === 0) return (
                <p className="text-[11px] text-neutral-400">업무 영역은 Plan 페이지에서 먼저 정의할 수 있어요 (선택)</p>
              );
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-neutral-500">영역</span>
                  <button
                    onClick={() => setNewProgramAreaId('')}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      !newProgramAreaId ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                    }`}
                  >
                    미분류
                  </button>
                  {areas.map(a => {
                    const sel = newProgramAreaId === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setNewProgramAreaId(a.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          sel ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {/* 연관 수익원 선택 (선택한 사업의 Resources revenueSources) */}
            {revenueSourcesForWs(newProgramWsId || wsId).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-neutral-500">수익원</span>
                <button
                  onClick={() => setNewProgramSource('')}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    !newProgramSource ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                  }`}
                >
                  없음
                </button>
                {revenueSourcesForWs(newProgramWsId || wsId).map(s => (
                  <button
                    key={s}
                    onClick={() => setNewProgramSource(s)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      newProgramSource === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                    }`}
                  >
                    💰 {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                autoFocus
                className="flex-1 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 transition-colors placeholder-neutral-400"
                placeholder="프로그램(목표) 이름"
                value={newProgramName}
                onChange={e => setNewProgramName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addProgram(); if (e.key === 'Escape') setShowAddProgram(false); }}
              />
              <button onClick={addProgram} disabled={!newProgramName.trim()} className="px-4 py-2 bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 rounded-lg text-sm text-white transition-colors flex-shrink-0">추가</button>
            </div>
          </div>
        )}

        {/* 보기 모드 토글 (영역별 / 우선순위) */}
        {quarterPrograms.length > 0 && (
          <div className="flex items-center gap-1 mb-4 rounded-full p-1 w-fit" style={{ backgroundColor: '#F1F1EB' }}>
            {(['area', 'priority'] as const).map(v => (
              <button key={v} onClick={() => setGoalsView(v)} className="px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors" style={goalsView === v ? { backgroundColor: '#16211E', color: '#fff' } : { color: '#5B6560' }}>
                {v === 'area' ? '영역별' : '우선순위'}
              </button>
            ))}
          </div>
        )}

        {quarterPrograms.length === 0 ? (
          <div className="bg-white border rounded-2xl" style={{ borderColor: 'var(--spira-border-subtle)' }}>
            <EmptyState title="아직 업무 영역이 없어요" description="Plan 페이지에서 업무 영역을 추가하면, 각 영역에 데드라인과 업무를 등록할 수 있어요." />
          </div>
        ) : goalsView === 'priority' ? (
          <div className="space-y-3">
            {/* 디데이 쪼개기 툴바 */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[13px]" style={{ color: '#9AA39D' }}>
                {selectedDls.size > 0 ? `${selectedDls.size}개 선택됨 — 우선순위 순서대로 날짜를 나눠요` : '디데이 날짜순 정렬 · 같은 날짜는 드래그로 순서 조정'}
              </p>
              <div className="flex items-center gap-1.5">
                {selectedDls.size > 0 && (
                  <button onClick={() => setSelectedDls(new Set())} className="text-[13px] font-semibold px-3 py-1.5 transition-colors hover:opacity-70" style={{ color: '#9AA39D' }}>선택 해제</button>
                )}
                <button onClick={splitDday} disabled={selectedDls.size < 2} className="text-[13px] font-bold px-4 py-1.5 rounded-full transition-transform hover:-translate-y-0.5 disabled:opacity-30 disabled:translate-y-0" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>디데이 쪼개기</button>
              </div>
            </div>

            {priorityItems.length === 0 ? (
              <div className="bg-white border rounded-2xl" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                <EmptyState title="이번 분기 데드라인이 없어요" description="‘영역별’ 보기에서 데드라인을 추가해보세요." />
              </div>
            ) : (
              <ul className="space-y-2">
                {priorityItems.map(({ dl, p }) => {
                  const dd = dl.date ? calcDday(dl.date) : null;
                  const sel = selectedDls.has(dl.id);
                  const todos = (dl.todos ?? []);
                  const expanded = expandedPrio.has(dl.id);
                  return (
                    <li key={dl.id}
                      className="bg-white border rounded-2xl overflow-hidden"
                      style={{ borderColor: prioOver === dl.id ? '#C4B5FD' : 'var(--spira-border-subtle)' }}
                    >
                      <div
                        draggable
                        onDragStart={() => setPrioDrag(dl.id)}
                        onDragOver={e => { e.preventDefault(); setPrioOver(dl.id); }}
                        onDrop={() => handlePrioDrop(dl.id)}
                        onDragEnd={() => { setPrioDrag(null); setPrioOver(null); }}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span className="flex-shrink-0 text-neutral-300 cursor-grab active:cursor-grabbing" title="드래그로 순서 조정">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" /><circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" /><circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" /></svg>
                        </span>
                        <button onClick={() => toggleSelectDl(dl.id)} className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors" style={sel ? { backgroundColor: '#16211E', borderColor: '#16211E' } : { borderColor: '#C7CEC7' }}>
                          {sel && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(p.wsId) }} />
                        <button
                          onClick={() => togglePrioExpand(dl.id)}
                          className="min-w-0 flex-1 text-left"
                          title={todos.length ? (expanded ? '업무 접기' : '업무 펼치기') : undefined}
                        >
                          <div className="text-[14px] font-semibold truncate" style={{ color: '#16211E' }}>{dl.name}</div>
                          <div className="text-[12px] truncate" style={{ color: '#9AA39D' }}>{store.allWorkspaces.find(w => w.id === p.wsId)?.name}{programArea(p)?.name ? ` · ${programArea(p)!.name}` : ''}{todos.length ? ` · 업무 ${todos.length}` : ''}</div>
                        </button>
                        {dl.date ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${dd?.cls ?? ''}`}>{dd?.label} · {dl.date.slice(5).replace('-', '.')}</span>
                        ) : (
                          <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 flex-shrink-0">📅 미배치</span>
                        )}
                        {todos.length > 0 && (
                          <button onClick={() => togglePrioExpand(dl.id)} className="flex-shrink-0 text-neutral-400 hover:text-neutral-700 transition-colors" title={expanded ? '접기' : '펼치기'}>
                            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        )}
                      </div>
                      {expanded && todos.length > 0 && (
                        <ul className="px-4 pb-3 pl-11 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                          {todos.map(t => {
                            const effDeadline = t.deadline || dl.date;
                            const recurring = (t.days?.length ?? 0) > 0;
                            const tDday = effDeadline ? calcDday(effDeadline) : null;
                            const shownDone = t.done || (recurring && !!effDeadline && effDeadline < todayKey);
                            return (
                              <li key={t.id} className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleTodo(p, dl.id, t.id)}
                                  title="완료 표시 / 해제"
                                  className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${shownDone ? 'bg-neutral-900 border-neutral-900' : 'border-neutral-300 hover:border-neutral-600'}`}
                                >
                                  {shownDone && <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </button>
                                <span className={`text-[13px] min-w-0 truncate ${shownDone ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>{t.name}</span>
                                {recurring && (
                                  <span className="text-[10px] text-violet-800 bg-violet-100 rounded-full px-1.5 py-0.5 flex-shrink-0">매주 {t.days!.map(d => DOW[d]).join('·')}</span>
                                )}
                                {t.date && (
                                  <span className="text-[10px] text-neutral-500 bg-neutral-100 rounded-full px-1.5 py-0.5 flex-shrink-0 tabular-nums">시작 {t.date.slice(5).replace('-', '.')}</span>
                                )}
                                {tDday && !recurring && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tDday.cls}`}>{tDday.label}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (() => {
          // filter: undefined=전체, '__none__'=프로젝트 미지정만, 그 외=해당 projectId만
          const renderProgramCard = (p: (typeof quarterPrograms)[number], idx: number, filter?: string) => {
              // 이 분기 데드라인 + '미배치(날짜 없음)' 데드라인 — 캘린더에서 일정만 지워도 항목은 목록에 남게.
              // (미배치는 현재 실제 분기 뷰에서만 노출해 탭마다 중복되지 않게)
              const curQ = Math.floor(now.getMonth() / 3) + 1;
              const showUnscheduled = year === now.getFullYear() && quarter === curQ;
              let deadlines = [
                ...dlInQuarter(p, year, quarter).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
                ...(showUnscheduled ? (p.deadlines ?? []).filter(dl => !dl.date) : []),
              ];
              if (filter === '__none__') deadlines = deadlines.filter(dl => !dl.projectId);
              else if (filter) deadlines = deadlines.filter(dl => dl.projectId === filter);
              // 프로젝트 박스 안에서 이 영역에 해당 데드라인이 없으면 카드 자체를 렌더하지 않음
              const inProjectBox = !!filter && filter !== '__none__';
              if (deadlines.length === 0 && inProjectBox) return null;
              const isEditing = editingProgramId === p.id;
              const goalDday = p.deadline ? calcDday(p.deadline) : null;
              const area = programArea(p);
              const isOff = p.enabled === false;
              const priority = p.priority ?? 1;
              return (
                <div key={p.id} id={`prog-${p.id}`} data-teach={idx === 0 ? 'goal-card' : undefined} className={`bg-white border rounded-2xl overflow-hidden transition-all ${isOff ? 'border-neutral-200 opacity-60' : 'border-neutral-200'} ${highlightProg === p.id ? 'ring-2 ring-violet-500 ring-offset-2' : ''}`}>
                  <div className="h-1" style={{ backgroundColor: isOff ? '#d4d4d4' : businessColor(p.wsId) }} />
                  {/* 프로젝트 박스 안에서는 이 데드라인들이 어느 업무 영역인지 라벨 표시 */}
                  {inProjectBox && area && (
                    <div className="flex items-center gap-1.5 px-4 pt-2.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: area.color }} />
                      <span className="text-[11px] font-bold" style={{ color: '#5B6560' }}>{area.name}</span>
                    </div>
                  )}

                  {/* (목표 헤더 제거 — 업무영역이 상위 컨테이너이므로 영역 섹션 헤더가 제목 역할) */}
                  <div className="hidden">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="프로그램 이름"
                        />
                        <textarea
                          rows={2}
                          className="w-full resize-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                          value={editGoal}
                          onChange={e => setEditGoal(e.target.value)}
                          placeholder="목표 / 설명 (선택)"
                        />
                        {/* 분기 선택 (여러 분기 선택 가능) */}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-[11px] text-neutral-500">분기 선택</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditYear(y => y - 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400">‹</button>
                              <span className="text-xs tabular-nums w-10 text-center">{editYear}년</span>
                              <button onClick={() => setEditYear(y => y + 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400">›</button>
                            </div>
                            {QUARTERS.map(q => {
                              const key = qKey(editYear, q);
                              const on = editQuarters.includes(key);
                              return (
                                <button key={q} onClick={() => toggleEditQuarter(key)}
                                  className={`px-2 py-1 rounded-md text-xs border transition-colors ${on ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}>
                                  {QUARTER_LABEL[q]}
                                </button>
                              );
                            })}
                          </div>
                          {editQuarters.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-neutral-400">선택됨:</span>
                              {[...editQuarters].sort((a, b) => keyIndex(a) - keyIndex(b)).map(k => {
                                const [ky, kq] = k.split('-');
                                return (
                                  <span key={k} className="text-[10px] bg-neutral-100 text-neutral-600 rounded-full px-1.5 py-0.5 flex items-center gap-1">
                                    {ky}년 {QUARTER_LABEL[Number(kq)]}
                                    <button onClick={() => toggleEditQuarter(k)} className="text-neutral-400 hover:text-red-500">×</button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {/* 목표 기한 (이어서 진행) */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-neutral-500">목표 기한</span>
                          <input
                            type="date"
                            className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-violet-400"
                            value={editDeadline}
                            onChange={e => setEditDeadline(e.target.value)}
                          />
                          {editDeadline && <button onClick={() => setEditDeadline('')} className="text-neutral-400 hover:text-red-400 text-xs">×</button>}
                          <span className="text-[10px] text-neutral-300">기한이 다음 분기면 그 분기에도 이어서 표시</span>
                        </div>
                        {/* 업무 영역 선택 */}
                        {areasForWs(p.wsId).length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-neutral-500">영역</span>
                            <button
                              onClick={() => setEditAreaId('')}
                              className={`px-2 py-1 rounded-full text-xs border transition-colors ${!editAreaId ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                            >
                              미분류
                            </button>
                            {areasForWs(p.wsId).map(a => {
                              const sel = editAreaId === a.id;
                              return (
                                <button
                                  key={a.id}
                                  onClick={() => setEditAreaId(a.id)}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors ${sel ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                                >
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                                  {a.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {/* 연관 수익원 선택 */}
                        {revenueSourcesForWs(p.wsId).length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-neutral-500">수익원</span>
                            <button
                              onClick={() => setEditSource('')}
                              className={`px-2 py-1 rounded-full text-xs border transition-colors ${!editSource ? 'border-neutral-400 bg-neutral-50 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                            >
                              없음
                            </button>
                            {revenueSourcesForWs(p.wsId).map(s => (
                              <button
                                key={s}
                                onClick={() => setEditSource(s)}
                                className={`px-2 py-1 rounded-full text-xs border transition-colors ${editSource === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                              >
                                💰 {s}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(p.wsId) }} />
                          <span className="text-[11px] text-neutral-500">{p.wsName}</span>
                          <span className="text-[10px] text-neutral-300">· 사업 컬러</span>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingProgramId(null)} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors">취소</button>
                          <button onClick={() => saveEditProgram(p)} disabled={!editName.trim() || editQuarters.length === 0} className="px-3 py-1.5 text-xs bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 text-white rounded-lg transition-colors">저장</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        {/* 순서 조정 */}
                        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                          <button onClick={() => moveProgram(idx, -1)} disabled={idx === 0}
                            className="w-5 h-4 flex items-center justify-center text-neutral-300 hover:text-neutral-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          <button onClick={() => moveProgram(idx, 1)} disabled={idx === quarterPrograms.length - 1}
                            className="w-5 h-4 flex items-center justify-center text-neutral-300 hover:text-neutral-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        </div>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: businessColor(p.wsId) }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              draggable
                              onDragStart={e => startListDrag({ level: 'program', wsId: p.wsId, programId: p.id }, e)}
                              onClick={() => { const pp = progPeriod(p); focusCal('program', `p-${p.id}`, pp?.start, pp?.end, p.name); }}
                              className="text-base font-semibold text-neutral-900 text-left hover:text-violet-700 hover:underline decoration-dotted underline-offset-4 transition-colors cursor-grab active:cursor-grabbing"
                              title="클릭: 캘린더에 기간 표시 · 드래그: 캘린더 날짜에 배치"
                            >
                              {p.name}
                            </button>
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${businessColor(p.wsId)}1a`, color: businessColor(p.wsId) }}
                            >
                              {p.wsName}
                            </span>
                            {area && (
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                                style={{ backgroundColor: `${area.color}1a`, color: area.color }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: area.color }} />
                                {area.name}
                              </span>
                            )}
                            {p.isContinued && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">이어서 진행</span>
                            )}
                            {goalDday && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${goalDday.cls}`}>목표 {goalDday.label}</span>
                            )}
                            {p.startDate && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 tabular-nums" title="시작 예정일">
                                시작 {p.startDate.slice(5).replace('-', '.')}
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${priority === 1 ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                              title={priority === 1 ? '1순위 — 오늘의 업무/Task에 반영' : `${priority}순위 — 오늘의 업무엔 미반영`}
                            >
                              {priority}순위
                            </span>
                            {isOff && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-500">OFF</span>
                            )}
                            {p.revenueSource && (
                              <button
                                onClick={() => { setSourceFilter(p.revenueSource!); setFilterWsId(p.wsId); }}
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                title="이 수익원의 프로젝트만 보기"
                              >
                                💰 {p.revenueSource}
                              </button>
                            )}
                          </div>
                          {p.goal && <p className="text-xs text-neutral-500 mt-0.5 whitespace-pre-wrap">{p.goal}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* 우선순위 스테퍼 */}
                          <div className="flex items-center border border-neutral-200 rounded-full overflow-hidden" title="우선순위 (1순위만 오늘의 업무에 반영, 중복 가능)">
                            <button onClick={() => setProgramPriority(p, priority - 1)} disabled={priority <= 1} className="px-1.5 py-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 text-xs">−</button>
                            <span className="text-[11px] tabular-nums text-neutral-600 w-4 text-center">{priority}</span>
                            <button onClick={() => setProgramPriority(p, priority + 1)} className="px-1.5 py-0.5 text-neutral-400 hover:text-neutral-700 text-xs">+</button>
                          </div>
                          {/* on/off 토글 */}
                          <button
                            onClick={() => toggleProgramEnabled(p)}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${isOff ? 'bg-neutral-200 text-neutral-500 hover:bg-neutral-300' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                            title={isOff ? '꺼짐 — 클릭해서 켜기' : '켜짐 — 클릭해서 끄기(오늘의 업무 미반영)'}
                          >
                            {isOff ? 'OFF' : 'ON'}
                          </button>
                          <button onClick={() => startEditProgram(p)} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors">편집</button>
                          <button onClick={() => store.deleteProgramInWs(p.wsId, p.id)} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">삭제</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 데드라인 목록 (depth 2) */}
                  <div className="border-t border-neutral-100 px-5 py-3 space-y-3">
                    {deadlines.length === 0 && addDeadlineFor !== p.id && (
                      <p className="text-xs text-neutral-400">데드라인이 없어요</p>
                    )}

                    {deadlines.map(dl => {
                      const dday = dl.date ? calcDday(dl.date) : null;
                      const doneCount = dl.todos.filter(t => t.done).length;
                      const dlOff = dl.enabled === false;
                      return (
                        <div key={dl.id} className={`border rounded-xl px-4 py-3 transition-opacity ${dlOff ? 'bg-neutral-50 border-neutral-100 opacity-55' : 'bg-neutral-50 border-neutral-100'}`}>
                          {editingDeadlineId === dl.id ? (
                            <div className="flex gap-2 items-center mb-2">
                              <input
                                autoFocus
                                className="flex-1 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-violet-400 transition-colors placeholder-neutral-400"
                                placeholder="데드라인 이름"
                                value={dlEditName}
                                onChange={e => setDlEditName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveDeadline(p, dl.id); if (e.key === 'Escape') setEditingDeadlineId(null); }}
                              />
                              <input
                                type="date"
                                className="bg-white border border-neutral-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-violet-400 transition-colors"
                                value={dlEditDate}
                                onChange={e => setDlEditDate(e.target.value)}
                              />
                              <button onClick={() => saveDeadline(p, dl.id)} disabled={!dlEditName.trim() || !dlEditDate} className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 rounded-lg text-xs text-white transition-colors flex-shrink-0">저장</button>
                              <button onClick={() => setEditingDeadlineId(null)} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors flex-shrink-0">취소</button>
                            </div>
                          ) : (
                          <div className="group/dl flex items-center gap-2 mb-2">
                            <svg className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" viewBox="0 0 16 16" fill="none">
                              <rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                              <path d="M1.5 6.5h13M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            <span
                              draggable
                              onDragStart={e => startListDrag({ level: 'deadline', wsId: p.wsId, programId: p.id, deadlineId: dl.id }, e)}
                              onClick={() => { const dp = dlPeriod(p, dl); focusCal('deadline', `d-${dl.id}`, dp?.start, dp?.end, dl.name); }}
                              className={`text-sm font-semibold flex-1 min-w-0 truncate cursor-grab active:cursor-grabbing hover:underline decoration-dotted underline-offset-2 ${dl.done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
                              title="클릭: 캘린더 '데드라인'에서 위치 표시 · 드래그: 캘린더 날짜에 배치"
                            >{dl.name}</span>
                            {dl.todos.length > 0 && (
                              <span className="text-[10px] text-neutral-400 flex-shrink-0">{doneCount}/{dl.todos.length}</span>
                            )}
                            {dl.done && (dl.totalSeconds ?? 0) > 0 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#EAF7DD', color: '#3E6B1F' }} title="완료까지 총 소요시간">⏱ {fmtDur(dl.totalSeconds!)}</span>
                            )}
                            {!dl.done && dday && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${dday.cls}`}>{dday.label}</span>}
                            {dl.date
                              ? <span className="text-[10px] text-neutral-400 tabular-nums flex-shrink-0">{dl.date.slice(5).replace('-', '.')}</span>
                              : <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 flex-shrink-0" title="아직 캘린더에 배치되지 않은 데드라인이에요. 이름을 캘린더로 드래그해 날짜를 지정하세요.">📅 미배치</span>}
                            <button
                              onClick={() => finishDeadline(p, dl)}
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors ${dl.done ? 'text-[#3E6B1F]' : 'text-white hover:opacity-90'}`}
                              style={dl.done ? { backgroundColor: '#DFF9C4' } : { backgroundColor: '#16211E' }}
                              title={dl.done ? '완료됨 — 클릭해 취소' : '이 데드라인을 끝내고 여정 깃발 받기'}
                            >
                              {dl.done ? '완료' : '끝내기'}
                            </button>
                            <button
                              onClick={() => toggleDeadlineEnabled(p, dl.id)}
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors ${dlOff ? 'bg-neutral-200 text-neutral-500 hover:bg-neutral-300' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                              title={dlOff ? '꺼짐 — 클릭해서 켜기' : '켜짐 — 클릭해서 끄기(오늘의 업무 미반영)'}
                            >
                              {dlOff ? 'OFF' : 'ON'}
                            </button>
                            {/* 프로젝트 배정 — 데드라인 단위 */}
                            {(() => {
                              const wsProjects = projectsOf(p.wsId);
                              const curProj = resolveProject(p.wsId, dl.projectId);
                              const menuKey = `proj-${dl.id}`;
                              return (
                                <div className="relative flex-shrink-0">
                                  <button
                                    onClick={() => setProjMenuFor(projMenuFor === menuKey ? null : menuKey)}
                                    className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full transition-colors"
                                    style={curProj ? { backgroundColor: '#EEF1FF', color: '#5B5BD6' } : { backgroundColor: '#F0F0EA', color: '#9AA39D' }}
                                    title="이 데드라인을 프로젝트에 배정"
                                  >
                                    {curProj ? `📁 ${curProj.name}` : '＋ 프로젝트'}
                                  </button>
                                  {projMenuFor === menuKey && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setProjMenuFor(null)} />
                                      <div className="absolute right-0 top-full mt-1 w-40 bg-white border rounded-xl py-1 z-20" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: 'var(--spira-shadow-lg)' }}>
                                        <button onClick={() => assignDeadlineProject(p, dl.id, null)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors" style={{ color: !dl.projectId ? '#16211E' : '#5B6560', fontWeight: !dl.projectId ? 700 : 400 }}>미지정</button>
                                        {wsProjects.length === 0 && <p className="px-3 py-1.5 text-[11px] text-neutral-400">Plan에서 프로젝트를 먼저 만들어보세요</p>}
                                        {wsProjects.map(pr => (
                                          <button key={pr.id} onClick={() => assignDeadlineProject(p, dl.id, pr.id)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-neutral-100 transition-colors" style={{ color: dl.projectId === pr.id ? '#16211E' : '#5B6560', fontWeight: dl.projectId === pr.id ? 700 : 400 }}>{pr.name}</button>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                            {/* 일정 일괄 미루기 */}
                            {dl.todos.length > 0 && (
                              <div className="relative flex-shrink-0">
                                <button
                                  onClick={() => setPushMenuDl(pushMenuDl === dl.id ? null : dl.id)}
                                  className="opacity-100 lg:opacity-0 lg:group-hover/dl:opacity-100 text-neutral-300 hover:text-neutral-700 text-[10px] transition-all"
                                  title="이 데드라인의 업무 일정을 한꺼번에 뒤로 미루기"
                                >미루기</button>
                                {pushMenuDl === dl.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setPushMenuDl(null)} />
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-white border rounded-xl py-1 z-20" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: 'var(--spira-shadow-lg)' }}>
                                      <p className="px-3 py-1 text-[10px] font-semibold text-neutral-400">일정 미루기</p>
                                      {[{ l: '1일', d: 1 }, { l: '3일', d: 3 }, { l: '1주', d: 7 }, { l: '2주', d: 14 }, { l: '4주', d: 28 }].map(o => (
                                        <button
                                          key={o.d}
                                          onClick={() => { pushDeadlineSchedule(p, dl.id, o.d); setPushMenuDl(null); }}
                                          className="block w-full text-left px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 transition-colors"
                                        >+{o.l} 뒤로</button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            <button onClick={() => startEditDeadline(dl)} className="opacity-0 group-hover/dl:opacity-100 text-neutral-300 hover:text-neutral-700 text-[10px] transition-all flex-shrink-0">편집</button>
                            <button onClick={() => deleteDeadline(p, dl.id)} className="text-neutral-300 hover:text-red-500 text-xs transition-colors flex-shrink-0">×</button>
                          </div>
                          )}

                          {/* 할일 (depth 3) */}
                          <ul className="space-y-1 pl-1">
                            {dl.todos.map(t => {
                              const isEditingTodo = editingTodoId === t.id;
                              if (isEditingTodo) {
                                return (
                                  <li key={t.id} className="bg-white border border-violet-200 rounded-lg p-2.5 space-y-2">
                                    <input
                                      autoFocus
                                      className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-violet-400"
                                      value={tdName}
                                      onChange={e => setTdName(e.target.value)}
                                      placeholder="할일 이름"
                                    />
                                    {/* 일정 방식 토글 */}
                                    <div className="flex gap-1">
                                      <button onClick={() => setTdMode('date')}
                                        className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${tdMode === 'date' ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-200 text-neutral-500'}`}>시작 날짜</button>
                                      <button onClick={() => setTdMode('weekly')}
                                        className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${tdMode === 'weekly' ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-200 text-neutral-500'}`}>매주 반복</button>
                                    </div>
                                    {tdMode === 'date' ? (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-neutral-500 w-14">시작 날짜</span>
                                        <input type="date" className="bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1 text-sm outline-none focus:border-violet-400"
                                          value={tdDate} onChange={e => setTdDate(e.target.value)} />
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-[11px] text-neutral-500 w-14">반복 요일</span>
                                        {DOW.map((d, i) => (
                                          <button key={i} onClick={() => toggleTdDay(i)}
                                            className={`w-6 h-6 rounded-full text-[11px] transition-colors ${tdDays.includes(i) ? 'bg-violet-600 text-neutral-900' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                                            {d}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-neutral-500 w-14">완수 기한</span>
                                      <input type="date" className="bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1 text-sm outline-none focus:border-violet-400"
                                        value={tdDeadline} onChange={e => setTdDeadline(e.target.value)} />
                                      <button onClick={() => tdDate && setTdDeadline(tdDate)} disabled={!tdDate}
                                        className="px-2 py-1 text-[11px] rounded-md border border-neutral-200 text-neutral-600 hover:border-violet-400 disabled:opacity-30 transition-colors"
                                        title="시작 날짜 당일까지 완수">당일</button>
                                      {tdDeadline && <button onClick={() => setTdDeadline('')} className="text-neutral-400 hover:text-red-400 text-xs">×</button>}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <button onClick={() => setEditingTodoId(null)} className="text-xs text-neutral-400 hover:text-neutral-700">취소</button>
                                      <button onClick={() => saveTodo(p, dl.id, t.id)} className="px-3 py-1 text-xs bg-neutral-900 hover:bg-neutral-700 text-white rounded-md">저장</button>
                                    </div>
                                  </li>
                                );
                              }
                              // 자체 완수기한이 없으면 상위 데드라인 날짜를 기준으로
                              const effDeadline = t.deadline || dl.date;
                              const inheritedDeadline = !t.deadline && !!dl.date;
                              const tDday = effDeadline ? calcDday(effDeadline) : null;
                              const recurring = (t.days?.length ?? 0) > 0;
                              // Goals에서는 날짜와 무관하게 체크하면 완료 처리. 매주 반복은 기한이 지나도 완수로 표시.
                              const shownDone = t.done || (recurring && !!effDeadline && effDeadline < todayKey);
                              return (
                                <li key={t.id} className="group flex items-center gap-2">
                                  <button
                                    onClick={() => toggleTodo(p, dl.id, t.id)}
                                    title="완료 표시 / 해제"
                                    className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                      shownDone ? 'bg-neutral-900 border-neutral-900' : 'border-neutral-300 hover:border-neutral-600'
                                    }`}
                                  >
                                    {shownDone && (
                                      <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                                        <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                  </button>
                                  <span
                                    data-teach="todo-item"
                                    draggable
                                    onDragStart={e => startListDrag({ level: 'todo', wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id }, e)}
                                    onClick={() => focusCal('todo', `t-${t.id}`, t.date || t.deadline, t.deadline || t.date, t.name)}
                                    title="클릭: 캘린더 '업무'에서 위치 표시 · 드래그: 캘린더 날짜에 배치"
                                    className={`text-sm transition-colors cursor-grab active:cursor-grabbing hover:underline decoration-dotted underline-offset-2 ${shownDone ? 'line-through text-neutral-400' : previewTask?.name === t.name && !editingTodoId ? 'text-violet-700 font-medium' : 'text-neutral-700'}`}
                                  >{t.name}</span>
                                  {!recurring && !t.date && !t.deadline && (
                                    <span
                                      className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 flex-shrink-0 inline-flex items-center gap-0.5"
                                      title="아직 캘린더에 배치되지 않은 업무예요. 이름을 캘린더로 끌어 날짜를 지정하세요."
                                    >📅 미배치</span>
                                  )}
                                  {(t.days?.length ?? 0) > 0 && (
                                    <span className="text-[10px] text-violet-800 bg-violet-100 rounded-full px-1.5 py-0.5 flex-shrink-0">매주 {t.days!.map(d => DOW[d]).join('·')}</span>
                                  )}
                                  {t.date && (
                                    <span className="text-[10px] text-neutral-500 bg-neutral-100 rounded-full px-1.5 py-0.5 flex-shrink-0 tabular-nums">시작 {t.date.slice(5).replace('-', '.')}</span>
                                  )}
                                  {tDday && (
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${tDday.cls} ${inheritedDeadline ? 'opacity-60' : ''}`}
                                      title={inheritedDeadline ? '데드라인 기한 기준' : '완수 기한'}
                                    >
                                      {tDday.label}
                                    </span>
                                  )}
                                  <span className="flex-1" />
                                  <button onClick={() => startEditTodo(t)} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-neutral-300 hover:text-neutral-700 text-[10px] transition-all flex-shrink-0">편집</button>
                                  <button onClick={() => deleteTodo(p, dl.id, t.id)} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-neutral-300 hover:text-red-500 text-xs transition-all flex-shrink-0">×</button>
                                </li>
                              );
                            })}
                          </ul>

                          {/* 할일 추가 */}
                          <input
                            className="mt-2 w-full bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-violet-400 transition-colors"
                            placeholder="+ 할일 추가"
                            value={todoInputs[dl.id] ?? ''}
                            onChange={e => setTodoInputs(prev => ({ ...prev, [dl.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && addTodo(p, dl.id)}
                          />
                        </div>
                      );
                    })}

                    {/* 데드라인 추가 (프로젝트 박스 안에서는 숨김 — 영역 박스에서 추가) */}
                    {inProjectBox ? null : addDeadlineFor === p.id ? (
                      <div className="flex gap-2 items-center">
                        <input
                          autoFocus
                          className="flex-1 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400 transition-colors placeholder-neutral-400"
                          placeholder="데드라인 이름"
                          value={dlName}
                          onChange={e => setDlName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addDeadline(p); if (e.key === 'Escape') setAddDeadlineFor(null); }}
                        />
                        <input
                          type="date"
                          className="bg-white border border-neutral-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-violet-400 transition-colors"
                          value={dlDate}
                          onChange={e => setDlDate(e.target.value)}
                        />
                        <button onClick={() => addDeadline(p)} disabled={!dlName.trim() || !dlDate} className="px-3 py-2 bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 rounded-lg text-sm text-white transition-colors flex-shrink-0">추가</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddDeadlineFor(p.id); setDlName(''); setDlDate(getQuarterEndDate(year, quarter)); }}
                        className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
                      >
                        + 데드라인 추가
                      </button>
                    )}
                  </div>
                </div>
              );
          };

          // 업무 영역 접이식 박스 하나를 렌더 (업무영역 > 데드라인 > 업무)
          const renderAreaSection = (sec: (typeof areaSections)[number]) => {
                const expanded = expandedAreas.has(sec.key);
                // 이 영역의 '이번 분기' 데드라인 중 '프로젝트 미지정'만 (프로젝트에 배정된 건 프로젝트 박스에서 표시)
                const secDeadlines = sec.items
                  .flatMap(({ p }) => dlInQuarter(p, year, quarter).map(dl => ({ dl, p })))
                  .filter(({ dl }) => !dl.projectId);
                return (
                  <div key={sec.key} className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#F1F1EB' }}>
                    <div className="w-full flex items-center gap-3 px-5 py-4">
                      <div onClick={() => toggleAreaCollapsed(sec.key)} className="flex flex-col gap-1 flex-1 min-w-0 cursor-pointer">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-[15px] font-bold truncate" style={{ color: '#16211E' }}>{sec.name}</h3>
                          <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#E1E1DA', color: '#5B6560' }}>{secDeadlines.length}</span>
                        </div>
                      </div>
                      {sec.key !== NONE && !filterWsId && (
                        <div className="flex items-center flex-shrink-0">
                          <button onClick={() => store.moveArea(sec.name, -1)} className="w-6 h-6 flex items-center justify-center text-neutral-300 hover:text-neutral-700 transition-colors" title="영역 위로">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          <button onClick={() => store.moveArea(sec.name, 1)} className="w-6 h-6 flex items-center justify-center text-neutral-300 hover:text-neutral-700 transition-colors" title="영역 아래로">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        </div>
                      )}
                      <button onClick={() => toggleAreaCollapsed(sec.key)} className="flex-shrink-0">
                        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                    {/* 접힌 상태에서도 이번 분기 데드라인을 텍스트로 미리보기 */}
                    {!expanded && secDeadlines.length > 0 && (
                      <div onClick={() => toggleAreaCollapsed(sec.key)} className="px-3 pb-3 cursor-pointer">
                        <div className="rounded-2xl px-4 py-3 flex flex-wrap gap-x-4 gap-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
                          {secDeadlines.map(({ dl, p }) => {
                            const done = (dl.todos ?? []).filter(t => t.done).length;
                            const off = dl.enabled === false;
                            return (
                              <span key={dl.id} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: off ? '#9AA39D' : '#44514B' }}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(p.wsId) }} />
                                <span className={`truncate max-w-[220px] ${off ? 'line-through' : ''}`}>{dl.name}</span>
                                {dl.date && <span className="text-[12px] tabular-nums" style={{ color: '#9AA39D' }}>{dl.date.slice(5).replace('-', '.')}</span>}
                                {(dl.todos?.length ?? 0) > 0 && <span className="text-[12px] tabular-nums" style={{ color: '#9AA39D' }}>{done}/{dl.todos.length}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {expanded && (
                      <div className="px-3 pb-3 space-y-3">
                        {sec.items.map(({ p, idx }) => renderProgramCard(p, idx, '__none__'))}
                      </div>
                    )}
                  </div>
                );
          };

          // ── 프로젝트 박스: (사업 × 프로젝트)별로, 그 프로젝트에 배정된 데드라인을 가진 프로그램들을 묶는다 ──
          const projBoxes = (() => {
            const inQ = (p: (typeof quarterPrograms)[number]) => {
              const curQ = Math.floor(now.getMonth() / 3) + 1;
              const showUnscheduled = year === now.getFullYear() && quarter === curQ;
              return [...dlInQuarter(p, year, quarter), ...(showUnscheduled ? (p.deadlines ?? []).filter(dl => !dl.date) : [])];
            };
            const map = new Map<string, { key: string; project: (typeof projectsForWs)[number]; wsId: string; items: { p: (typeof quarterPrograms)[number]; idx: number }[]; count: number }>();
            quarterPrograms.forEach((p, idx) => {
              const byPid = new Map<string, number>();
              inQ(p).forEach(dl => { if (dl.projectId) byPid.set(dl.projectId, (byPid.get(dl.projectId) ?? 0) + 1); });
              byPid.forEach((cnt, pid) => {
                const proj = resolveProject(p.wsId, pid);
                if (!proj) return;
                const key = `${p.wsId}::${pid}`;
                if (!map.has(key)) map.set(key, { key, project: proj, wsId: p.wsId, items: [], count: 0 });
                const g = map.get(key)!;
                g.items.push({ p, idx });
                g.count += cnt;
              });
            });
            return [...map.values()].sort((a, b) => (a.project.order ?? 0) - (b.project.order ?? 0));
          })();

          return (
            <div className="space-y-3">
              {/* 프로젝트 박스 (업무 영역 박스와 같은 묶음 역할) */}
              {projBoxes.map(box => {
                const expanded = expandedAreas.has(box.key);
                return (
                  <div key={box.key} className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#EAF0FB' }}>
                    <div className="w-full flex items-center gap-3 px-5 py-4">
                      <div onClick={() => toggleAreaCollapsed(box.key)} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <span className="text-[12px]" style={{ color: '#5B5BD6' }}>📁</span>
                        <h3 className="text-[15px] font-bold truncate" style={{ color: '#16211E' }}>{box.project.name}</h3>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={box.project.type === 'build' ? { backgroundColor: '#DEE4FF', color: '#5B5BD6' } : { backgroundColor: '#DDF4C4', color: '#3E7A2E' }}>{box.project.type === 'build' ? '기획·개발' : '루틴'}</span>
                        <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#DCE3F5', color: '#5B6560' }}>{box.count}</span>
                        {businesses.length > 1 && <span className="text-[11px] truncate" style={{ color: '#9AA39D' }}>· {store.allWorkspaces.find(w => w.id === box.wsId)?.name}</span>}
                      </div>
                      <button onClick={() => toggleAreaCollapsed(box.key)} className="flex-shrink-0">
                        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                    {expanded && (
                      <div className="px-3 pb-3 space-y-3">
                        {box.items.map(({ p, idx }) => renderProgramCard(p, idx, box.project.id))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 업무 영역 박스 (프로젝트 미지정 데드라인) */}
              {areaSections.map(renderAreaSection)}
            </div>
          );
        })()}
      </section>
    </div>
    {CalendarPanel}
    {flagAward && <FlagAward flagSrc={flagAward.flagSrc} heading={flagAward.heading} sub={flagAward.sub} foot={flagAward.foot} onClose={() => setFlagAward(null)} />}
    </div>
  );
}
