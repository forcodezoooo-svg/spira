'use client';
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useStore } from '../lib/useStore';
import type { Program } from '../lib/types';

// Goals 간트 로드맵 — 좌측 트리(사업목표 › 프로젝트 › 영역별 산출물, 접기/펼치기)와
// 우측 타임라인을 한 행씩 1:1로 정렬. 상위-하위 종속을 들여쓰기·요약막대·그룹밴드로 시각화.
// 가로 시간축은 연/월/주/일/시로 확대·축소하며 가로 스크롤. (Goals 전용)

type Scale = 'year' | 'month' | 'week' | 'day' | 'hour';
type Lvl = 'program' | 'deadline' | 'todo';
type CalProgram = Program & { wsId: string; wsName?: string };
type Deadline = NonNullable<Program['deadlines']>[number];
type Payload = { level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string };
type Row = { key: string; level: 0 | 1 | 2; kind: Lvl; name: string; start?: string; end?: string; color: string; hasChildren: boolean; wsId: string; programId: string; deadlineId?: string; todoId?: string; pgKey: string };

export interface GoalsRoadmapHandle {
  focus: (level: Lvl, key: string, start?: string, end?: string, name?: string) => void;
  startListDrag: (payload: Payload, e: React.DragEvent) => void;
}
interface Props {
  programs: CalProgram[];
  businessColor: (wsId: string) => string;
  resolveProject: (wsId: string, id?: string) => { name: string } | null;
  cardClassName?: string;
}

const LABEL_W = 230;
const ROW_H = 34;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const SCALES: [Scale, string][] = [['year', '연'], ['month', '월'], ['week', '주'], ['day', '일'], ['hour', '시']];

const GoalsRoadmap = forwardRef<GoalsRoadmapHandle, Props>(function GoalsRoadmap(
  { programs, businessColor, resolveProject, cardClassName = 'flex-1 min-h-0' }, ref,
) {
  const store = useStore();
  const schedule = store.workSchedule;
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dstr = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const todayStr = dstr(now.getFullYear(), now.getMonth(), now.getDate());
  const addDaysStr = (ds: string, n: number) => { const d = new Date(ds); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const [scale, setScale] = useState<Scale>('month');
  const [anchor, setAnchor] = useState(() => dstr(now.getFullYear(), now.getMonth(), now.getDate()));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // 접힌 노드 (기본 전부 펼침)
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [notPlaced, setNotPlaced] = useState<string | null>(null);
  const [offOpen, setOffOpen] = useState(false);
  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const toggleCollapse = (key: string) => setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  type DragTarget = { key: string; level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; start: string; end: string };
  const [calDrag, setCalDrag] = useState<(DragTarget & { mode: 'move' | 'resize-start' | 'resize-end'; grabDate: string; origStart: string; origEnd: string }) | null>(null);
  const calDragRef = useRef(calDrag); calDragRef.current = calDrag;
  const [htmlDragging, setHtmlDragging] = useState(false);
  const [listDragCtx, setListDragCtx] = useState<{ level: Lvl; wsId: string; programId: string; deadlineId?: string } | null>(null);
  const dragPayloadRef = useRef<Payload | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inNavRef = useRef<-1 | 1 | null>(null);

  // ── 표시 창(window) ──
  const aDate = new Date(anchor);
  const aY = aDate.getFullYear(), aM = aDate.getMonth();
  const isDayScale = scale === 'day' || scale === 'hour';
  let winStartStr: string, winEndStr: string;
  if (scale === 'year') { winStartStr = dstr(aY, 0, 1); winEndStr = dstr(aY, 11, 31); }
  else if (scale === 'month') { winStartStr = dstr(aY, aM, 1); const le = new Date(aY, aM + 1, 0); winEndStr = dstr(le.getFullYear(), le.getMonth(), le.getDate()); }
  else if (scale === 'week') { const sun = addDaysStr(anchor, -aDate.getDay()); winStartStr = sun; winEndStr = addDaysStr(sun, 6); }
  else { winStartStr = anchor; winEndStr = anchor; }
  const totalDays = daysBetween(winStartStr, winEndStr) + 1;
  const xStartPct = (d: string) => (clampN(daysBetween(winStartStr, d), 0, totalDays) / totalDays) * 100;
  const xEndPct = (d: string) => (clampN(daysBetween(winStartStr, d) + 1, 0, totalDays) / totalDays) * 100;
  const hourPct = (h: number) => (h / 24) * 100;

  const nav = (dir: -1 | 1) => {
    if (scale === 'year') setAnchor(dstr(aY + dir, aM, aDate.getDate()));
    else if (scale === 'month') { const d = new Date(aY, aM + dir, 1); setAnchor(dstr(d.getFullYear(), d.getMonth(), 1)); }
    else if (scale === 'week') setAnchor(addDaysStr(anchor, 7 * dir));
    else setAnchor(addDaysStr(anchor, dir));
  };
  const navByPoint = (dir: -1 | 1 | null) => { if (dir && inNavRef.current !== dir) { inNavRef.current = dir; nav(dir); } else if (!dir) inNavRef.current = null; };
  const navDirFromX = (x: number): -1 | 1 | null => { const r = timelineRef.current?.getBoundingClientRect(); if (!r) return null; if (x < r.left - 24) return -1; if (x > r.right + 24) return 1; return null; };
  const dateFromClientX = (x: number): string | null => { const r = timelineRef.current?.getBoundingClientRect(); if (!r || r.width === 0) return null; const di = Math.floor(((x - r.left) / r.width) * totalDays); return addDaysStr(winStartStr, clampN(di, 0, totalDays - 1)); };

  // ── 배치 범위 제한 ──
  type Bounds = { min?: string; max?: string };
  const programBounds = (wsId: string, programId: string): Bounds => { const p = store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId); return { min: p?.startDate || undefined, max: p?.deadline || undefined }; };
  const deadlineBounds = (wsId: string, programId: string, deadlineId?: string): Bounds => { const p = store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId); const dl = p?.deadlines?.find(d => d.id === deadlineId); return { min: dl?.startDate || undefined, max: dl?.date || undefined }; };
  const boundsForTarget = (t: { level: Lvl; wsId: string; programId: string; deadlineId?: string }): Bounds | null => { if (t.level === 'deadline') return programBounds(t.wsId, t.programId); if (t.level === 'todo') return deadlineBounds(t.wsId, t.programId, t.deadlineId); return null; };
  const clampRange = (mode: 'move' | 'resize-start' | 'resize-end', start: string, end: string, bounds: Bounds | null) => {
    if (!bounds || (!bounds.min && !bounds.max)) return { start, end };
    const { min, max } = bounds;
    if (mode === 'move') { let s = start, e = end; if (max && e > max) { const sh = daysBetween(e, max); s = addDaysStr(s, sh); e = addDaysStr(e, sh); } if (min && s < min) { const sh = daysBetween(s, min); s = addDaysStr(s, sh); e = addDaysStr(e, sh); } if (max && e > max) e = max; return { start: s, end: e }; }
    if (mode === 'resize-end') { let e = end; if (max && e > max) e = max; if (min && e < min) e = min; return { start, end: e }; }
    let s = start; if (min && s < min) s = min; if (max && s > max) s = max; return { start: s, end };
  };

  const commitCalDrag = () => {
    const d = calDragRef.current; setCalDrag(null);
    if (!d || (d.start === d.origStart && d.end === d.origEnd)) return;
    const prog = store.allWorkspacesEntries.find(e => e.workspace.id === d.wsId)?.programs.find(p => p.id === d.programId);
    if (!prog) return;
    const delta = daysBetween(d.origEnd, d.end);
    const shift = (x?: string) => (x ? addDaysStr(x, delta) : x);
    if (d.level === 'program') {
      store.updateProgramInWs(d.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: shift(dl.date) ?? dl.date, startDate: shift(dl.startDate), todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })) })) });
      return;
    }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== d.deadlineId) return dl;
      if (d.level === 'deadline') {
        if (d.mode === 'move') return { ...dl, date: d.end, startDate: d.start, todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })) };
        if (d.mode === 'resize-end') return { ...dl, date: d.end };
        return { ...dl, startDate: d.start };
      }
      return { ...dl, todos: dl.todos.map(t => { if (t.id !== d.todoId) return t; if (d.mode === 'move') return { ...t, date: d.start, deadline: d.end }; if (d.mode === 'resize-end') return { ...t, deadline: d.end }; return { ...t, date: d.start }; }) };
    });
    store.updateProgramInWs(d.wsId, { ...prog, deadlines });
  };
  const startCalDrag = (r: Row, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    if (!r.start || !r.end) return;
    e.preventDefault(); e.stopPropagation();
    const grab = dateFromClientX(e.clientX) || r.start;
    setCalDrag({ key: r.key, level: r.kind, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, start: r.start, end: r.end, mode, grabDate: grab, origStart: r.start, origEnd: r.end });
  };

  const dropOnDate = (payload: Payload, date: string) => {
    const prog = store.allWorkspacesEntries.find(e => e.workspace.id === payload.wsId)?.programs.find(p => p.id === payload.programId);
    if (!prog) return;
    if (payload.level === 'program') { store.updateProgramInWs(payload.wsId, { ...prog, startDate: date, deadline: prog.deadline || date }); return; }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== payload.deadlineId) return dl;
      if (payload.level === 'deadline') { const { min, max } = programBounds(payload.wsId, payload.programId); let day = date; if (min && day < min) day = min; if (max && day > max) day = max; return { ...dl, startDate: day, date: day }; }
      const newDlDate = dl.date && dl.date > date ? dl.date : date;
      const newStartDate = dl.startDate && date < dl.startDate ? date : dl.startDate;
      return { ...dl, date: newDlDate, startDate: newStartDate, todos: dl.todos.map(t => (t.id === payload.todoId ? { ...t, date, deadline: date } : t)) };
    });
    store.updateProgramInWs(payload.wsId, { ...prog, deadlines });
  };

  const applyOffPeriod = () => {
    if (!offStart || !offEnd || offEnd < offStart) return;
    const days = Math.round((new Date(offEnd).getTime() - new Date(offStart).getTime()) / 86400000) + 1;
    if (!window.confirm(`${offStart} ~ ${offEnd} (${days}일)을 오프 기간으로 설정할까요?\n\n이 기간 시작일 이후의 모든 프로젝트 일정(디데이·시작일)이 ${days}일씩 뒤로 밀립니다.`)) return;
    store.shiftAllSchedulesAfter(offStart, days); setOffOpen(false); setOffStart(''); setOffEnd('');
  };

  const startListDrag = (payload: Payload, e: React.DragEvent) => {
    dragPayloadRef.current = payload;
    setListDragCtx({ level: payload.level, wsId: payload.wsId, programId: payload.programId, deadlineId: payload.deadlineId });
    e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'move'; setHtmlDragging(true);
  };
  const focus = (_level: Lvl, key: string, start?: string, end?: string, name = '') => {
    if (start || end) { setHighlightKey(key); setNotPlaced(null); const f = end || start!; if (!isNaN(new Date(f).getTime())) setAnchor(f.slice(0, 10)); }
    else { setHighlightKey(null); setNotPlaced(name); }
  };
  useImperativeHandle(ref, () => ({ focus, startListDrag }));

  useEffect(() => { const end = () => { setHtmlDragging(false); setListDragCtx(null); dragPayloadRef.current = null; }; window.addEventListener('dragend', end); window.addEventListener('drop', end); return () => { window.removeEventListener('dragend', end); window.removeEventListener('drop', end); }; }, []);
  useEffect(() => {
    if (!calDrag) return;
    const onMove = (e: MouseEvent) => {
      const dir = navDirFromX(e.clientX); navByPoint(dir); if (dir) return;
      const ds = dateFromClientX(e.clientX); if (!ds) return;
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
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.body.style.userSelect = 'none';
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calDrag?.key, calDrag?.mode]);
  useEffect(() => { if (!highlightKey) return; const t = setTimeout(() => { const el = scrollRef.current?.querySelector(`[data-rm-row="${highlightKey}"]`) as HTMLElement | null; el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60); const clr = setTimeout(() => setHighlightKey(null), 2600); return () => { clearTimeout(t); clearTimeout(clr); }; }, [highlightKey, anchor, scale]);
  useEffect(() => { if (!notPlaced) return; const t = setTimeout(() => setNotPlaced(null), 2800); return () => clearTimeout(t); }, [notPlaced]);

  // ── 트리(사업목표>프로젝트>산출물) → 펼침 상태에 따른 표시 행 ──
  const progPeriod = (p: CalProgram) => {
    const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
    const dates = dls.flatMap(dl => [dl.startDate, dl.date, ...dl.todos.flatMap(t => [t.date, t.deadline])]).filter((x): x is string => !!x);
    if (!dates.length) return {};
    return { start: dates.sort()[0], end: dates.sort().slice(-1)[0] };
  };
  const dlPeriod = (p: CalProgram, dl: Deadline) => {
    if (!dl.date) { const ts = dl.todos.flatMap(t => [t.date, t.deadline]).filter((x): x is string => !!x); return ts.length ? { start: ts.sort()[0], end: ts.sort().slice(-1)[0] } : {}; }
    const ts = dl.todos.map(t => t.date).filter((x): x is string => !!x);
    let start = dl.startDate || (ts.length ? ts.sort()[0] : (p.startDate || dl.date));
    if (start > dl.date) start = dl.date;
    return { start, end: dl.date };
  };
  const rows: Row[] = [];
  for (const p of programs) {
    const pColor = businessColor(p.wsId);
    const pgKey = `p-${p.id}`;
    const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
    const pp = progPeriod(p);
    rows.push({ key: pgKey, level: 0, kind: 'program', name: p.name, start: pp.start, end: pp.end, color: pColor, hasChildren: dls.length > 0, wsId: p.wsId, programId: p.id, pgKey });
    if (collapsed.has(pgKey)) continue;
    for (const dl of dls) {
      const dKey = `d-${dl.id}`;
      const dp = dlPeriod(p, dl);
      const todos = dl.todos.filter(t => !t.done);
      rows.push({ key: dKey, level: 1, kind: 'deadline', name: dl.name, start: dp.start, end: dp.end, color: pColor, hasChildren: todos.length > 0, wsId: p.wsId, programId: p.id, deadlineId: dl.id, pgKey });
      if (collapsed.has(dKey)) continue;
      for (const t of todos) {
        const s = t.date || t.deadline, e = t.deadline || t.date;
        rows.push({ key: `t-${t.id}`, level: 2, kind: 'todo', name: t.name, start: s && e ? (s > e ? e : s) : undefined, end: e || s, color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, pgKey });
      }
    }
  }
  const rowsDraw = rows.map(r => (calDrag && calDrag.key === r.key ? { ...r, start: calDrag.start, end: calDrag.end } : r));
  void resolveProject;

  const clearOneSchedule = (r: Row) => {
    const prog = store.allWorkspacesEntries.find(e => e.workspace.id === r.wsId)?.programs.find(p => p.id === r.programId);
    if (!prog) return;
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== r.deadlineId) return dl;
      if (r.kind === 'deadline') return { ...dl, date: '', startDate: undefined };
      return { ...dl, todos: dl.todos.map(t => t.id === r.todoId ? { ...t, date: undefined, deadline: undefined } : t) };
    });
    store.updateProgramInWs(r.wsId, { ...prog, deadlines });
  };

  // ── 눈금/오늘/근무밴드 ──
  type Tick = { left: number; label: string };
  const gridPcts: number[] = []; const headerTicks: Tick[] = [];
  if (scale === 'year') { for (let m = 0; m < 12; m++) { const l = xStartPct(dstr(aY, m, 1)); gridPcts.push(l); headerTicks.push({ left: l, label: `${m + 1}월` }); } }
  else if (scale === 'month') { for (let i = 0; i < totalDays; i++) { const d = addDaysStr(winStartStr, i); const dd = new Date(d); if (dd.getDay() === 0 || i === 0) { const l = xStartPct(d); gridPcts.push(l); headerTicks.push({ left: l, label: `${dd.getMonth() + 1}/${dd.getDate()}` }); } } }
  else if (scale === 'week') { for (let i = 0; i < 7; i++) { const d = addDaysStr(winStartStr, i); const dd = new Date(d); const l = xStartPct(d); gridPcts.push(l); headerTicks.push({ left: l, label: `${dd.getDate()}(${DOW[dd.getDay()]})` }); } }
  else { const step = scale === 'day' ? 3 : 1; for (let h = 0; h <= 24; h += step) { const l = hourPct(h); gridPcts.push(l); if (scale === 'day' || h % 3 === 0) headerTicks.push({ left: l, label: `${h}시` }); } }
  const todayLine = (todayStr >= winStartStr && todayStr <= winEndStr) ? (isDayScale ? (todayStr === winStartStr ? hourPct(now.getHours() + now.getMinutes() / 60) : null) : xStartPct(todayStr)) : null;
  const toH = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return (h || 0) + (m || 0) / 60; };
  const wd = schedule[new Date(winStartStr).getDay()];
  const workBand = isDayScale && wd?.on ? { left: hourPct(toH(wd.start)), right: hourPct(toH(wd.end)) } : null;

  const dragCtx = calDrag && (calDrag.level === 'deadline' || calDrag.level === 'todo') ? calDrag : htmlDragging && listDragCtx && (listDragCtx.level === 'deadline' || listDragCtx.level === 'todo') ? listDragCtx : null;
  const allowed = dragCtx ? boundsForTarget(dragCtx) : null;
  const showAllowed = !isDayScale && !!(allowed && (allowed.min || allowed.max));
  const bandLeft = allowed?.min ? xStartPct(allowed.min < winStartStr ? winStartStr : allowed.min) : 0;
  const bandRight = allowed?.max ? xEndPct(allowed.max > winEndStr ? winEndStr : allowed.max) : 100;

  const onTrackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    let payload = dragPayloadRef.current;
    if (!payload) { try { const raw = e.dataTransfer.getData('text/plain'); if (raw) payload = JSON.parse(raw); } catch { /* empty */ } }
    const date = dateFromClientX(e.clientX);
    if (payload && date) dropOnDate(payload, date);
    dragPayloadRef.current = null;
  };

  const headerLabel = scale === 'year' ? `${aY}년` : scale === 'month' ? `${aY}년 ${aM + 1}월` : scale === 'week' ? `${new Date(winStartStr).getMonth() + 1}/${new Date(winStartStr).getDate()} – ${new Date(winEndStr).getMonth() + 1}/${new Date(winEndStr).getDate()}` : `${aM + 1}월 ${aDate.getDate()}일 (${DOW[aDate.getDay()]})`;
  const contentWidth = scale === 'year' ? Math.max(1500, totalDays * 5) : scale === 'month' ? Math.max(1000, totalDays * 34) : scale === 'week' ? 1050 : scale === 'day' ? 1000 : 1800;

  const TrackGrid = ({ pgIdx }: { pgIdx: number }) => (
    <>
      {/* 사업목표 그룹 밴드(하위 종속 시각화) */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: pgIdx % 2 === 0 ? 'transparent' : '#FAFAF8' }} />
      {workBand && <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${workBand.left}%`, width: `${workBand.right - workBand.left}%`, backgroundColor: '#F1FAE6' }} />}
      {showAllowed && <div className="absolute top-0 bottom-0 bg-emerald-100/60 pointer-events-none" style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }} />}
      {gridPcts.map((x, i) => <div key={i} className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${x}%`, backgroundColor: '#EDEDE7' }} />)}
      {todayLine !== null && <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${todayLine}%`, backgroundColor: '#9DFE3B' }} />}
    </>
  );

  // 사업목표별 인덱스 (그룹 밴드 교차색)
  const pgOrder = new Map<string, number>();
  programs.forEach((p, i) => pgOrder.set(`p-${p.id}`, i));

  return (
    <div className={`bg-white border rounded-[24px] p-5 flex flex-col ${cardClassName}`} style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }} onDragEnter={() => setHtmlDragging(true)}>
      {/* 네비 */}
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={() => nav(-1)} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="이전"><svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <span className="text-[17px] font-bold" style={{ color: '#16211E' }}>{headerLabel}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setAnchor(todayStr)} className="text-[12px] font-semibold rounded-full px-2.5 py-1 transition-colors" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>오늘</button>
          <button onClick={() => nav(1)} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="다음"><svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 rounded-full p-1 flex-1" style={{ backgroundColor: '#F1F1EB' }}>
          {SCALES.map(([s, label]) => (
            <button key={s} onClick={() => setScale(s)} className="flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-colors" style={scale === s ? { backgroundColor: '#fff', color: '#16211E', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } : { color: '#8D9A8D' }}>{label}</button>
          ))}
        </div>
        <button onClick={() => setOffOpen(o => !o)} className="text-[12px] font-semibold rounded-full px-2.5 py-1.5 transition-colors flex-shrink-0" style={offOpen ? { backgroundColor: '#FBE7C6', color: '#96631A' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }} title="오프 기간(휴가 등) 설정">off</button>
      </div>
      {offOpen && (
        <div className="rounded-2xl p-3 mb-3" style={{ backgroundColor: '#FCF6EC', border: '1px solid #F2E2C4' }}>
          <p className="text-[11px] mb-2 leading-relaxed" style={{ color: '#96631A' }}>전면 스탑(휴가 등) 기간을 정하면, 그 시작일 이후 모든 프로젝트 일정이 기간 일수만큼 뒤로 밀려요.</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <input type="date" value={offStart} onChange={e => setOffStart(e.target.value)} className="bg-white border rounded-lg px-2 py-1 text-xs outline-none" style={{ borderColor: '#F2E2C4' }} />
            <span className="text-xs" style={{ color: '#C9A662' }}>~</span>
            <input type="date" value={offEnd} min={offStart || undefined} onChange={e => setOffEnd(e.target.value)} className="bg-white border rounded-lg px-2 py-1 text-xs outline-none" style={{ borderColor: '#F2E2C4' }} />
            <button onClick={applyOffPeriod} disabled={!offStart || !offEnd || offEnd < offStart} className="px-2.5 py-1 disabled:opacity-30 text-white text-xs rounded-lg transition-colors" style={{ backgroundColor: '#E0A73C' }}>적용</button>
          </div>
        </div>
      )}
      {notPlaced && <div className="mb-2 rounded-xl px-3 py-2 text-[12px] text-center" style={{ backgroundColor: '#FCF3E6', color: '#96631A' }}>‘{notPlaced}’은(는) 아직 배치되지 않았어요. 라벨을 타임라인으로 드래그해 배치하세요.</div>}

      {/* 간트: 좌측 트리(고정) + 우측 타임라인(가로/세로 스크롤) */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto overscroll-contain border rounded-xl" style={{ borderColor: 'var(--spira-border-subtle)' }} onDragOver={e => { if (dragPayloadRef.current) e.preventDefault(); }} onDrop={onTrackDrop}>
        <div className="relative" style={{ width: LABEL_W + contentWidth }}>
          {/* 헤더 (상단 고정) */}
          <div className="flex sticky top-0 z-20" style={{ height: 28 }}>
            <div className="sticky left-0 z-30 bg-white flex items-center px-3 border-r border-b" style={{ width: LABEL_W, borderColor: '#F0F0EA' }}><span className="text-[11px] font-bold" style={{ color: '#9AA39D' }}>사업목표 · 프로젝트 · 산출물</span></div>
            <div ref={timelineRef} className="relative bg-white border-b" style={{ width: contentWidth, borderColor: '#F0F0EA' }}>
              {headerTicks.map((t, i) => <div key={i} className="absolute top-1.5 text-[10px] font-medium whitespace-nowrap" style={{ left: `${t.left}%`, color: '#9AA39D', transform: 'translateX(2px)' }}>{t.label}</div>)}
            </div>
          </div>
          {/* 행 */}
          {rowsDraw.length === 0 ? (
            <div className="flex"><div className="sticky left-0 bg-white" style={{ width: LABEL_W }} /><p className="text-[12px] py-8 px-4" style={{ color: '#9AA39D' }}>표시할 항목이 없어요.</p></div>
          ) : rowsDraw.map(r => {
            const placed = !!(r.start && r.end);
            const isCollapsed = collapsed.has(r.key);
            const hot = r.key === highlightKey;
            const pgIdx = pgOrder.get(r.pgKey) ?? 0;
            const left = placed ? xStartPct(r.start! < winStartStr ? winStartStr : r.start!) : 0;
            const right = placed ? xEndPct(r.end! > winEndStr ? winEndStr : r.end!) : 0;
            const width = Math.max(right - left, 0.8);
            const inWin = placed && r.end! >= winStartStr && r.start! <= winEndStr;
            const startsHere = placed && r.start! >= winStartStr;
            const endsHere = placed && r.end! <= winEndStr;
            const dragging = calDrag?.key === r.key;
            return (
              <div key={r.key} data-rm-row={r.key} className="flex" style={{ height: ROW_H }}>
                {/* 좌측 라벨(트리) */}
                <div
                  className="sticky left-0 z-10 bg-white flex items-center gap-1 pr-2 border-b"
                  style={{ width: LABEL_W, paddingLeft: 8 + r.level * 16, borderColor: '#F4F4F0', backgroundColor: hot ? '#F8FBF3' : '#fff' }}
                  draggable={r.level > 0 && !placed}
                  onDragStart={r.level > 0 && !placed ? e => startListDrag({ level: r.kind, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId }, e) : undefined}
                  title={!placed && r.level > 0 ? '드래그해서 타임라인에 배치' : r.name}
                >
                  {r.hasChildren ? (
                    <button onClick={() => toggleCollapse(r.key)} className="w-4 h-4 flex items-center justify-center flex-shrink-0" title={isCollapsed ? '펼치기' : '접기'}>
                      <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}><path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  ) : <span className="w-4 flex-shrink-0" />}
                  <span className="rounded-full flex-shrink-0" style={{ width: r.level === 0 ? 8 : 6, height: r.level === 0 ? 8 : 6, backgroundColor: r.color, opacity: r.level === 2 ? 0.6 : 1 }} />
                  <span className="truncate" style={{ fontSize: r.level === 0 ? 13 : 12, fontWeight: r.level === 0 ? 800 : r.level === 1 ? 600 : 400, color: r.level === 2 ? '#5B6560' : '#16211E' }}>{r.name}</span>
                  {!placed && r.level > 0 && <span className="ml-auto text-[9px] flex-shrink-0" style={{ color: '#C4A24A' }}>미배치</span>}
                </div>
                {/* 우측 타임라인 */}
                <div className="relative" style={{ width: contentWidth }}>
                  <TrackGrid pgIdx={pgIdx} />
                  {inWin && (r.level === 0 ? (
                    /* 사업목표 = 요약 브래킷 (하위를 아우르는 상위 막대) */
                    <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${left}%`, width: `${width}%` }}>
                      <div className="h-[3px] rounded-full" style={{ backgroundColor: r.color }} />
                      {startsHere && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-2.5 rounded" style={{ backgroundColor: r.color }} />}
                      {endsHere && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-2.5 rounded" style={{ backgroundColor: r.color }} />}
                    </div>
                  ) : (
                    /* 프로젝트/산출물 = 사각형 막대 + 내용 */
                    <div
                      data-rm-bar={r.key}
                      onMouseDown={e => startCalDrag(r, 'move', e)}
                      className="group/bar absolute top-1/2 -translate-y-1/2 rounded-lg border flex items-center cursor-grab active:cursor-grabbing overflow-visible"
                      style={{ left: `${left}%`, width: `${width}%`, height: r.level === 1 ? 24 : 20, backgroundColor: `${r.color}${r.level === 1 ? '2E' : '1A'}`, borderColor: r.color, opacity: dragging ? 0.95 : 1, boxShadow: hot ? `0 0 0 2px #fff, 0 0 0 3px ${r.color}` : '0 1px 2px rgba(0,0,0,0.04)', zIndex: hot ? 10 : undefined }}
                      title={`${r.name} — 드래그로 이동, 양끝을 잡아 기간 조절`}
                    >
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none" style={{ fontSize: r.level === 1 ? 11 : 10, fontWeight: r.level === 1 ? 700 : 500, color: '#16211E' }}>{r.name}</span>
                      {startsHere && <div onMouseDown={e => startCalDrag(r, 'resize-start', e)} className="absolute -left-1 top-0 bottom-0 w-2.5 flex items-center justify-center cursor-ew-resize z-20" title="시작일 조절"><span className="w-1 h-3 rounded-full" style={{ backgroundColor: r.color }} /></div>}
                      {endsHere && <div onMouseDown={e => startCalDrag(r, 'resize-end', e)} className="absolute -right-1 top-0 bottom-0 w-2.5 flex items-center justify-center cursor-ew-resize z-20" title="완료일 조절"><span className="w-1 h-3 rounded-full" style={{ backgroundColor: r.color }} /></div>}
                      <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); clearOneSchedule(r); }} className="absolute -right-1.5 -top-2 z-30 w-4 h-4 rounded-full bg-neutral-400 hover:bg-neutral-600 text-white flex items-center justify-center text-[10px] leading-none opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-pointer" title="이 일정을 로드맵에서 삭제 (내용 유지)">×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default GoalsRoadmap;
