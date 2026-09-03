'use client';
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useStore } from '../lib/useStore';
import type { Program } from '../lib/types';

// Goals(프로그램→데드라인→할일) 일정을 월 캘린더 간트 막대로 보여주고,
// 막대 드래그로 이동·기간조절, 리스트→캘린더 드롭 배치까지 하는 인터랙티브 캘린더.
// Goals 페이지와 Home 페이지에서 공유한다. (Home은 리스트 브릿지 없이 캘린더 내부 상호작용만 사용)

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
type CalLevel = 'program' | 'deadline' | 'todo' | 'subtask';
type CalProgram = Program & { wsId: string; wsName?: string };
type Deadline = NonNullable<Program['deadlines']>[number];
type Payload = { level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string };
type CalRange = { key: string; level: CalLevel; start: string; end: string; color: string; name: string; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; ghost?: boolean; readOnly?: boolean; done?: boolean };

export interface GoalsCalendarHandle {
  focus: (level: CalLevel, key: string, start?: string, end?: string, name?: string) => void;
  startListDrag: (payload: Payload, e: React.DragEvent) => void;
}

interface Props {
  programs: CalProgram[];                                   // 캘린더에 표시할 프로그램(사업 정보 부착)
  businessColor: (wsId: string) => string;                  // 사업(워크스페이스) 색
  resolveProject: (wsId: string, id?: string) => { name: string } | null; // 프로젝트 id → 프로젝트
  cardClassName?: string;                                    // 카드 높이/flex 제어 (기본 flex-1 min-h-0)
  selectedDate?: string | null;                             // 선택된 날짜(그 날짜 업무 목록 표시용) — 하이라이트
  onSelectDate?: (ds: string) => void;                      // 날짜 클릭 콜백
}

const GoalsCalendar = forwardRef<GoalsCalendarHandle, Props>(function GoalsCalendar(
  { programs, businessColor, resolveProject, cardClassName = 'flex-1 min-h-0', selectedDate, onSelectDate }, ref,
) {
  const store = useStore();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [calMonth, setCalMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [calLevel, setCalLevel] = useState<CalLevel>('subtask');
  const [previewTask, setPreviewTask] = useState<{ start?: string; end?: string; name: string } | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [notPlaced, setNotPlaced] = useState<string | null>(null);

  type CalDragTarget = { key: string; level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; start: string; end: string };
  const [calDrag, setCalDrag] = useState<
    (CalDragTarget & { mode: 'move' | 'resize-start' | 'resize-end'; grabDate: string; origStart: string; origEnd: string }) | null
  >(null);
  const calDragRef = useRef(calDrag);
  calDragRef.current = calDrag;

  // 리스트→캘린더 HTML5 드래그 상태
  const [htmlDragging, setHtmlDragging] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [listDragCtx, setListDragCtx] = useState<{ level: CalLevel; wsId: string; programId: string; deadlineId?: string } | null>(null);
  const dragOverDateRef = useRef<string | null>(null);
  const dragPayloadRef = useRef<Payload | null>(null);

  const weeksRef = useRef<HTMLDivElement>(null);
  const inNavRef = useRef<-1 | 1 | null>(null);
  const navMonth = (dir: -1 | 1) => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + dir, 1));
  const navByPoint = (dir: -1 | 1 | null) => {
    if (dir && inNavRef.current !== dir) { inNavRef.current = dir; navMonth(dir); }
    else if (!dir) inNavRef.current = null;
  };
  const navDirFromPoint = (x: number, y: number): -1 | 1 | null => {
    const rect = weeksRef.current?.getBoundingClientRect();
    if (!rect || x < rect.left - 20 || x > rect.right + 20) return null;
    if (y < rect.top) return -1;
    if (y > rect.bottom) return 1;
    return null;
  };

  // ── 날짜 유틸 ──
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dstr = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const addDaysStr = (ds: string, n: number) => { const d = new Date(ds); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  const dateFromPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest('[data-cal-date]') as HTMLElement | null;
    return cell?.getAttribute('data-cal-date') || null;
  };

  type Bounds = { min?: string; max?: string };
  const programBounds = (wsId: string, programId: string): Bounds => {
    const p = store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId);
    return { min: p?.startDate || undefined, max: p?.deadline || undefined };
  };
  const deadlineBounds = (wsId: string, programId: string, deadlineId?: string): Bounds => {
    const p = store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId);
    const dl = p?.deadlines?.find(d => d.id === deadlineId);
    return { min: dl?.startDate || undefined, max: dl?.date || undefined };
  };
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
      if (max && e > max) e = max;
      return { start: s, end: e };
    }
    if (mode === 'resize-end') { let e = end; if (max && e > max) e = max; if (min && e < min) e = min; return { start, end: e }; }
    let s = start; if (min && s < min) s = min; if (max && s > max) s = max; return { start: s, end };
  };

  const commitCalDrag = () => {
    const d = calDragRef.current;
    setCalDrag(null);
    if (!d) return;
    if (d.start === d.origStart && d.end === d.origEnd) return;
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === d.wsId);
    const prog = entry?.programs.find(p => p.id === d.programId);
    if (!prog) return;
    const delta = daysBetween(d.origEnd, d.end);
    const shift = (x?: string) => (x ? addDaysStr(x, delta) : x);
    if (d.level === 'program') {
      if (d.mode === 'move') {
        store.updateProgramInWs(d.wsId, {
          ...prog, startDate: d.start, deadline: d.end,
          deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: shift(dl.date) ?? dl.date, startDate: shift(dl.startDate), todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })) })),
        });
      } else if (d.mode === 'resize-end') {
        store.updateProgramInWs(d.wsId, { ...prog, deadline: d.end });
      } else {
        store.updateProgramInWs(d.wsId, { ...prog, startDate: d.start });
      }
      return;
    }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== d.deadlineId) return dl;
      if (d.level === 'deadline') {
        if (d.mode === 'move') return { ...dl, date: d.end, startDate: d.start, todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })) };
        if (d.mode === 'resize-end') return { ...dl, date: d.end };
        return { ...dl, startDate: d.start };
      }
      return {
        ...dl,
        todos: dl.todos.map(t => {
          if (t.id !== d.todoId) return t;
          if (d.level === 'todo') {
            if (d.mode === 'move') return { ...t, date: d.start, deadline: d.end };
            if (d.mode === 'resize-end') return { ...t, deadline: d.end };
            return { ...t, date: d.start };
          }
          // subtask (task)
          return { ...t, subtasks: (t.subtasks ?? []).map(s => {
            if (s.id !== d.subtaskId) return s;
            if (d.mode === 'move') return { ...s, date: d.start, deadline: d.end };
            if (d.mode === 'resize-end') return { ...s, deadline: d.end };
            return { ...s, date: d.start };
          }) };
        }),
      };
    });
    store.updateProgramInWs(d.wsId, { ...prog, deadlines });
  };
  const startCalDrag = (r: CalRange, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const grab = dateFromPoint(e.clientX, e.clientY) || r.start;
    setCalDrag({ key: r.key, level: r.level, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, subtaskId: r.subtaskId, start: r.start, end: r.end, mode, grabDate: grab, origStart: r.start, origEnd: r.end });
  };

  const dropOnDate = (payload: Payload, date: string) => {
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === payload.wsId);
    const prog = entry?.programs.find(p => p.id === payload.programId);
    if (!prog) return;
    setCalLevel(payload.level);
    if (payload.level === 'program') {
      store.updateProgramInWs(payload.wsId, { ...prog, startDate: date, deadline: prog.deadline || date });
      return;
    }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== payload.deadlineId) return dl;
      if (payload.level === 'deadline') {
        const { min, max } = programBounds(payload.wsId, payload.programId);
        let day = date;
        if (min && day < min) day = min;
        if (max && day > max) day = max;
        return { ...dl, startDate: day, date: day };
      }
      const newDlDate = dl.date && dl.date > date ? dl.date : date;
      const newStartDate = dl.startDate && date < dl.startDate ? date : dl.startDate;
      return { ...dl, date: newDlDate, startDate: newStartDate, todos: dl.todos.map(t => (t.id === payload.todoId ? { ...t, date, deadline: date } : t)) };
    });
    store.updateProgramInWs(payload.wsId, { ...prog, deadlines });
  };

  // 리스트 드래그 시작(부모 리스트가 imperative로 호출)
  const startListDrag = (payload: Payload, e: React.DragEvent) => {
    dragPayloadRef.current = payload;
    dragOverDateRef.current = null;
    setListDragCtx({ level: payload.level, wsId: payload.wsId, programId: payload.programId, deadlineId: payload.deadlineId });
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setHtmlDragging(true);
  };
  // 리스트 항목 클릭 → 해당 탭 전환 + 그 달로 이동 + 막대 강조 (미배치면 안내)
  const focus = (level: CalLevel, key: string, start?: string, end?: string, name = '') => {
    setCalLevel(level);
    setPreviewTask({ start, end, name });
    if (start || end) {
      setHighlightKey(key); setNotPlaced(null);
      const f = end || start!;
      const d = new Date(f);
      if (!isNaN(d.getTime())) setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    } else { setHighlightKey(null); setNotPlaced(name); }
  };
  useImperativeHandle(ref, () => ({ focus, startListDrag }));

  // 전역 dragend/drop 시 리스트 드래그 상태 정리
  useEffect(() => {
    const end = () => { setHtmlDragging(false); setDragOverDate(null); setListDragCtx(null); dragPayloadRef.current = null; dragOverDateRef.current = null; };
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => { window.removeEventListener('dragend', end); window.removeEventListener('drop', end); };
  }, []);

  // 캘린더 막대 드래그 중 전역 mousemove/up
  useEffect(() => {
    if (!calDrag) return;
    const onMove = (e: MouseEvent) => {
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

  // 리스트 클릭 강조 → 막대로 스크롤 후 잠시 강조
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
    }, 60);
    const clear = setTimeout(() => setHighlightKey(null), 2600);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [highlightKey, calMonth, calLevel]);

  useEffect(() => {
    if (!notPlaced) return;
    const t = setTimeout(() => setNotPlaced(null), 2800);
    return () => clearTimeout(t);
  }, [notPlaced]);

  // previewTask는 강조/안내에만 쓰이므로 lint 무해화 (막대 강조는 highlightKey로 처리)
  void previewTask;

  // ── 캘린더 막대 데이터 ──
  const progPeriod = (p: CalProgram) => {
    const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
    const dlDates = dls.map(dl => dl.date).filter(Boolean) as string[];
    const end = p.deadline || (dlDates.length ? dlDates.sort().slice(-1)[0] : undefined);
    if (!end) return null;
    const starts = [p.startDate, ...dls.map(dl => dl.startDate), ...dls.flatMap(dl => dl.todos.map(t => t.date))].filter((x): x is string => !!x);
    let start = p.startDate || (starts.length ? starts.sort()[0] : end);
    if (start > end) start = end;
    return { start, end };
  };
  void progPeriod;
  const dlPeriod = (p: CalProgram, dl: Deadline) => {
    if (!dl.date) return null;
    const tstarts = dl.todos.map(t => t.date).filter((x): x is string => !!x);
    let start = dl.startDate || (tstarts.length ? tstarts.sort()[0] : (p.startDate || dl.date));
    if (start > dl.date) start = dl.date;
    return { start, end: dl.date };
  };
  // Home 캘린더: 카테고리 없이 '생성된 task(세부 산출물 하위 task)'만 날짜대로 배치
  const buildCalRanges = (): CalRange[] => {
    const real: CalRange[] = [];
    void dlPeriod; void resolveProject; void calLevel;
    for (const p of programs) {
      const pColor = businessColor(p.wsId);
      for (const dl of (p.deadlines ?? []).filter(dl => dl.enabled !== false && !dl.done)) {
        for (const t of dl.todos) {
          for (const s of (t.subtasks ?? [])) {
            if (!s.date && !s.deadline) continue;
            const recurring = (s.days?.length ?? 0) > 0;
            // 완료한 일회성 업무는 회색 톤 + 드래그 불가(readOnly)로 표시(숨기지 않음). 반복 업무는 요일별 관리라 완료로 치지 않음.
            const isDone = s.done && !recurring;
            let start = s.date || s.deadline!;
            const end = s.deadline || s.date!;
            if (start > end) start = end;
            real.push({ key: `s-${s.id}`, level: 'subtask', start, end, name: s.name, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, subtaskId: s.id, color: isDone ? '#C7CEC7' : pColor, done: isDone, readOnly: isDone || undefined });
          }
        }
      }
    }
    return real;
  };
  const calRanges: CalRange[] = buildCalRanges().map(r => (calDrag && calDrag.key === r.key ? { ...r, start: calDrag.start, end: calDrag.end } : r));
  const realRanges = calRanges.filter(r => !r.ghost);

  const clearTodoDates = (todos: Deadline['todos']) => todos.map(t => ({ ...t, date: undefined, deadline: undefined }));
  const clearOneSchedule = (r: CalRange) => {
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === r.wsId);
    const prog = entry?.programs.find(p => p.id === r.programId);
    if (!prog) return;
    if (r.level === 'program') {
      if (!window.confirm(`'${r.name}' 업무 영역의 일정을 캘린더에서 삭제할까요?\n하위 데드라인·업무 일정도 함께 사라집니다. (내용은 유지)`)) return;
      store.updateProgramInWs(r.wsId, { ...prog, startDate: undefined, deadline: undefined, deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: '', startDate: undefined, todos: clearTodoDates(dl.todos) })) });
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
  const calSlots: (string | null)[] = [
    ...Array(new Date(calY, calMo, 1).getDay()).fill(null),
    ...Array.from({ length: new Date(calY, calMo + 1, 0).getDate() }, (_, i) => dstr(calY, calMo, i + 1)),
  ];
  while (calSlots.length % 7 !== 0) calSlots.push(null);
  const calWeeks: (string | null)[][] = [];
  for (let i = 0; i < calSlots.length; i += 7) calWeeks.push(calSlots.slice(i, i + 7));

  const dragBoundsCtx =
    (calDrag && (calDrag.level === 'deadline' || calDrag.level === 'todo')) ? { level: calDrag.level, wsId: calDrag.wsId, programId: calDrag.programId, deadlineId: calDrag.deadlineId }
    : (htmlDragging && listDragCtx && (listDragCtx.level === 'deadline' || listDragCtx.level === 'todo')) ? listDragCtx
    : null;
  const allowedBounds = dragBoundsCtx ? boundsForTarget(dragBoundsCtx) : null;
  const showAllowed = !!(allowedBounds && (allowedBounds.min || allowedBounds.max));
  const inAllowed = (ds: string) => !allowedBounds || ((!allowedBounds.min || ds >= allowedBounds.min) && (!allowedBounds.max || ds <= allowedBounds.max));

  return (
    <div className={`bg-white border rounded-[24px] p-6 flex flex-col ${cardClassName}`} style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }} onDragEnter={() => setHtmlDragging(true)}>
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

      {notPlaced && (
        <div className="mb-3 rounded-xl px-3 py-2 text-[12px] text-center leading-relaxed" style={{ backgroundColor: '#FCF3E6', color: '#96631A' }}>
          ‘{notPlaced}’은(는) 아직 캘린더에 배치되지 않았어요. 왼쪽 항목을 드래그해 날짜에 놓아보세요.
        </div>
      )}

      <div className="grid grid-cols-7 mb-2">
        {DOW.map(d => (<div key={d} className="text-center text-[12px] py-1 font-medium" style={{ color: '#9AA39D' }}>{d}</div>))}
      </div>

      {/* 간트 막대 */}
      <div
        className="relative flex-1 min-h-0 flex flex-col"
        onDragOver={e => { if (dragPayloadRef.current) e.preventDefault(); }}
        onDrop={e => {
          e.preventDefault();
          let payload = dragPayloadRef.current;
          if (!payload) { try { const raw = e.dataTransfer.getData('text/plain'); if (raw) payload = JSON.parse(raw); } catch { /* empty */ } }
          const date = dragOverDateRef.current || dateFromPoint(e.clientX, e.clientY);
          if (payload && date) dropOnDate(payload, date);
          setDragOverDate(null);
          dragPayloadRef.current = null;
          dragOverDateRef.current = null;
        }}
      >
        {calDrag && (<div className="absolute bottom-full left-0 right-0 mb-1 h-6 z-20 flex items-center justify-center text-[11px] font-semibold text-violet-700 bg-violet-100/95 rounded-lg border border-violet-200 pointer-events-none">▲ 위로 끌면 이전 달 ({calMo === 0 ? 12 : calMo}월)</div>)}
        {calDrag && (<div className="absolute top-full left-0 right-0 mt-1 h-6 z-20 flex items-center justify-center text-[11px] font-semibold text-violet-700 bg-violet-100/95 rounded-lg border border-violet-200 pointer-events-none">▼ 아래로 끌면 다음 달 ({(calMo + 2) > 12 ? (calMo + 2 - 12) : calMo + 2}월)</div>)}
        <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1" ref={weeksRef}>
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
            const barsInWeek = calRanges.filter(r => r.end >= wStart && r.start <= wEnd).map(toBar).filter(b => b.sc !== -1 && b.ec !== -1).sort((a, b) => a.sc - b.sc || a.ec - b.ec);
            const assignLanes = (bars: typeof barsInWeek) => {
              const lanes: (typeof barsInWeek)[] = [];
              for (const b of bars) {
                let lane = lanes.find(L => L.every(x => b.sc > x.ec || b.ec < x.sc));
                if (!lane) { lane = []; lanes.push(lane); }
                lane.push(b);
              }
              return lanes;
            };
            const ghostLanes = assignLanes(barsInWeek.filter(b => b.r.ghost));
            const realLanes = assignLanes(barsInWeek.filter(b => !b.r.ghost));
            const ghostH = 6, laneH = 30, numberH = 34;
            const ghostTrackH = ghostLanes.length * ghostH;
            const cellMinH = numberH + ghostTrackH + realLanes.length * laneH + 4;
            return (
              <div key={wi} className="relative">
                <div className="grid grid-cols-7">
                  {week.map((ds, di) => {
                    const isOver = !!ds && ds === dragOverDate;
                    const allowedOn = showAllowed && !!ds && inAllowed(ds);
                    const isSelected = !!ds && ds === selectedDate;
                    const isOff = !!ds && store.capacity.dateOverrides?.[ds] === 0; // 오프(휴무)일
                    return (
                      <div
                        key={di}
                        data-cal-date={ds ?? undefined}
                        onClick={ds && onSelectDate ? () => onSelectDate(ds) : undefined}
                        onDragOver={ds ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragOverDateRef.current = ds; if (dragOverDate !== ds) setDragOverDate(ds); }) : undefined}
                        className={`flex flex-col items-center rounded-lg transition-colors ${ds && onSelectDate ? 'cursor-pointer' : ''} ${isOver ? 'bg-violet-100 ring-2 ring-violet-400' : allowedOn ? 'bg-emerald-100 ring-1 ring-emerald-300' : isSelected ? 'bg-[#F3F0FF] ring-1 ring-violet-300' : isOff ? 'bg-[#FCF3E4]' : ''}`}
                        style={{ minHeight: cellMinH }}
                      >
                        {ds && (
                          <div className="w-8 h-8 flex items-center justify-center text-sm rounded-full font-semibold" style={isOver ? { backgroundColor: '#5FD93A', color: '#fff' } : ds === todayKey ? { backgroundColor: '#9DFE3B', color: '#16211E' } : isSelected ? { backgroundColor: '#7C3AED', color: '#fff' } : { color: isOff ? '#96631A' : '#5B6560' }}>
                            {Number(ds.slice(8))}
                          </div>
                        )}
                        {isOff && <span className="text-[8px] font-bold leading-none px-1 rounded-full -mt-0.5" style={{ backgroundColor: '#FBE7C6', color: '#96631A' }}>off</span>}
                      </div>
                    );
                  })}
                </div>

                {ghostTrackH > 0 && (
                  <div className="absolute left-0 right-0 grid grid-cols-7 gap-x-0.5 pointer-events-none" style={{ top: numberH, gridAutoRows: `${ghostH}px` }}>
                    {ghostLanes.flatMap((lane, li) => lane.map((b, bi) => (
                      <div key={`g-${li}-${bi}`} style={{ gridColumn: `${b.sc + 1} / ${b.ec + 2}`, gridRow: li + 1, backgroundColor: b.r.color }} className="h-[3px] self-center rounded-full opacity-70" title={b.r.name} />
                    )))}
                  </div>
                )}

                <div className={`absolute left-0 right-0 grid grid-cols-7 gap-x-0.5 ${calDrag || htmlDragging ? 'pointer-events-none' : ''}`} style={{ top: numberH + ghostTrackH, gridAutoRows: `${laneH}px` }}>
                  {realLanes.flatMap((lane, li) => lane.map((b, bi) => {
                    const dragging = calDrag?.key === b.r.key;
                    const hot = b.r.key === highlightKey;
                    return (
                      <div
                        key={`${li}-${bi}`}
                        data-cal-bar={b.r.key}
                        style={{ gridColumn: `${b.sc + 1} / ${b.ec + 2}`, gridRow: li + 1 }}
                        className={`group/bar relative flex flex-col justify-start min-w-0 select-none ${b.r.readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${dragging ? 'opacity-90' : ''}`}
                        onMouseDown={b.r.readOnly ? undefined : e => startCalDrag(b.r, 'move', e)}
                        title={b.r.readOnly ? `${b.r.name} (프로젝트 기간 개요)` : `${b.r.name} — 드래그로 이동, 양끝을 잡아 기간 조절`}
                      >
                        {hot && <span className="absolute -inset-x-1.5 -top-1 -bottom-1 rounded-lg animate-pulse pointer-events-none z-0" style={{ backgroundColor: b.r.color, opacity: 0.2, boxShadow: `0 0 0 2px ${b.r.color}` }} />}
                        <div className="relative h-[3px] mt-2.5 rounded-full" style={{ backgroundColor: b.r.color, opacity: dragging || hot ? 1 : 0.9 }}>
                          {!b.r.readOnly && b.startsHere && (
                            <div onMouseDown={e => startCalDrag(b.r, 'resize-start', e)} className="absolute -left-2 -top-2 w-4 h-[17px] flex items-center justify-center cursor-ew-resize z-20" title="시작일 조절">
                              <span className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: b.r.color, boxShadow: '0 0 0 2px #fff' }} />
                            </div>
                          )}
                          {!b.r.readOnly && b.endsHere && (
                            <div onMouseDown={e => startCalDrag(b.r, 'resize-end', e)} className="absolute -right-2 -top-2 w-4 h-[17px] flex items-center justify-center cursor-ew-resize z-20" title="완료일 조절 (기간 연장)">
                              <span className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: b.r.color, boxShadow: '0 0 0 2px #fff' }} />
                            </div>
                          )}
                        </div>
                        <span className={`relative z-10 mt-1.5 text-center text-[10px] leading-none truncate px-1 ${hot ? 'font-bold' : ''}`} style={{ color: b.r.done ? '#B4BCB4' : hot ? '#16211E' : '#7A857E', textDecoration: b.r.done ? 'line-through' : 'none' }}>{b.r.name}</span>
                        {!b.r.readOnly && b.endsHere && (
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); clearOneSchedule(b.r); }} className="absolute left-1/2 -translate-x-1/2 -top-2 z-30 w-4 h-4 rounded-full bg-neutral-400 hover:bg-neutral-600 text-white flex items-center justify-center text-[10px] leading-none opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-pointer" title="이 일정을 캘린더에서 삭제 (내용 유지)">×</button>
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
  );
});

export default GoalsCalendar;
