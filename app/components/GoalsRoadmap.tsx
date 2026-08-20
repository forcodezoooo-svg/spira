'use client';
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useStore } from '../lib/useStore';
import type { Program } from '../lib/types';

// Goals 일정을 '이번 분기(3개월)' 가로 타임라인의 간트차트 로드맵으로 보여준다.
// 각 항목이 한 행이고, 시작~완료 기간을 가로 막대로 표시. 막대 드래그로 이동·기간조절,
// 리스트→로드맵 드롭으로 배치. 프로젝트/데드라인/업무 3단계 탭. (Goals 전용)

type CalLevel = 'program' | 'deadline' | 'todo';
type CalProgram = Program & { wsId: string; wsName?: string };
type Deadline = NonNullable<Program['deadlines']>[number];
type Payload = { level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string };
type CalRange = { key: string; level: CalLevel; start: string; end: string; color: string; name: string; wsId: string; programId: string; deadlineId?: string; todoId?: string; readOnly?: boolean };

export interface GoalsRoadmapHandle {
  focus: (level: CalLevel, key: string, start?: string, end?: string, name?: string) => void;
  startListDrag: (payload: Payload, e: React.DragEvent) => void;
}

interface Props {
  programs: CalProgram[];
  businessColor: (wsId: string) => string;
  resolveProject: (wsId: string, id?: string) => { name: string } | null;
  cardClassName?: string;
}

const LABEL_W = 132;

const GoalsRoadmap = forwardRef<GoalsRoadmapHandle, Props>(function GoalsRoadmap(
  { programs, businessColor, resolveProject, cardClassName = 'flex-1 min-h-0' }, ref,
) {
  const store = useStore();
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dstr = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const todayStr = dstr(now.getFullYear(), now.getMonth(), now.getDate());

  const [year, setYear] = useState(now.getFullYear());
  const [q, setQ] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [calLevel, setCalLevel] = useState<CalLevel>('todo');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [notPlaced, setNotPlaced] = useState<string | null>(null);
  const [offOpen, setOffOpen] = useState(false);
  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');

  type DragTarget = { key: string; level: CalLevel; wsId: string; programId: string; deadlineId?: string; todoId?: string; start: string; end: string };
  const [calDrag, setCalDrag] = useState<(DragTarget & { mode: 'move' | 'resize-start' | 'resize-end'; grabDate: string; origStart: string; origEnd: string }) | null>(null);
  const calDragRef = useRef(calDrag); calDragRef.current = calDrag;

  const [htmlDragging, setHtmlDragging] = useState(false);
  const [listDragCtx, setListDragCtx] = useState<{ level: CalLevel; wsId: string; programId: string; deadlineId?: string } | null>(null);
  const dragPayloadRef = useRef<Payload | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const inNavRef = useRef<-1 | 1 | null>(null);

  // ── 날짜 유틸 ──
  const addDaysStr = (ds: string, n: number) => { const d = new Date(ds); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

  // ── 분기 범위 ──
  const qStartMonth = (q - 1) * 3;
  const qStartStr = dstr(year, qStartMonth, 1);
  const qEndDate = new Date(year, qStartMonth + 3, 0);
  const qEndStr = dstr(qEndDate.getFullYear(), qEndDate.getMonth(), qEndDate.getDate());
  const totalDays = daysBetween(qStartStr, qEndStr) + 1;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const xStartPct = (d: string) => (clamp(daysBetween(qStartStr, d), 0, totalDays) / totalDays) * 100;
  const xEndPct = (d: string) => (clamp(daysBetween(qStartStr, d) + 1, 0, totalDays) / totalDays) * 100;

  const navQuarter = (dir: -1 | 1) => {
    const qi = year * 4 + (q - 1) + dir;
    setYear(Math.floor(qi / 4)); setQ((qi % 4) + 1);
  };
  const navByPoint = (dir: -1 | 1 | null) => {
    if (dir && inNavRef.current !== dir) { inNavRef.current = dir; navQuarter(dir); }
    else if (!dir) inNavRef.current = null;
  };
  const navDirFromX = (x: number): -1 | 1 | null => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return null;
    if (x < rect.left - 24) return -1;
    if (x > rect.right + 24) return 1;
    return null;
  };
  const dateFromClientX = (x: number): string | null => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const di = Math.floor(((x - rect.left) / rect.width) * totalDays);
    return addDaysStr(qStartStr, clamp(di, 0, totalDays - 1));
  };

  // ── 배치 범위 제한 ──
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
        store.updateProgramInWs(d.wsId, { ...prog, startDate: d.start, deadline: d.end, deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: shift(dl.date) ?? dl.date, startDate: shift(dl.startDate), todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline) })) })) });
      } else if (d.mode === 'resize-end') { store.updateProgramInWs(d.wsId, { ...prog, deadline: d.end }); }
      else { store.updateProgramInWs(d.wsId, { ...prog, startDate: d.start }); }
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
  const startCalDrag = (r: CalRange, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const grab = dateFromClientX(e.clientX) || r.start;
    setCalDrag({ key: r.key, level: r.level, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, start: r.start, end: r.end, mode, grabDate: grab, origStart: r.start, origEnd: r.end });
  };

  const dropOnDate = (payload: Payload, date: string) => {
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === payload.wsId);
    const prog = entry?.programs.find(p => p.id === payload.programId);
    if (!prog) return;
    setCalLevel(payload.level);
    if (payload.level === 'program') { store.updateProgramInWs(payload.wsId, { ...prog, startDate: date, deadline: prog.deadline || date }); return; }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== payload.deadlineId) return dl;
      if (payload.level === 'deadline') {
        const { min, max } = programBounds(payload.wsId, payload.programId);
        let day = date; if (min && day < min) day = min; if (max && day > max) day = max;
        return { ...dl, startDate: day, date: day };
      }
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
    store.shiftAllSchedulesAfter(offStart, days);
    setOffOpen(false); setOffStart(''); setOffEnd('');
  };

  // ── imperative (Goals 리스트 브릿지) ──
  const startListDrag = (payload: Payload, e: React.DragEvent) => {
    dragPayloadRef.current = payload;
    setListDragCtx({ level: payload.level, wsId: payload.wsId, programId: payload.programId, deadlineId: payload.deadlineId });
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setHtmlDragging(true);
  };
  const focus = (level: CalLevel, key: string, start?: string, end?: string, name = '') => {
    setCalLevel(level);
    if (start || end) {
      setHighlightKey(key); setNotPlaced(null);
      const f = end || start!;
      const d = new Date(f);
      if (!isNaN(d.getTime())) { setYear(d.getFullYear()); setQ(Math.floor(d.getMonth() / 3) + 1); }
    } else { setHighlightKey(null); setNotPlaced(name); }
  };
  useImperativeHandle(ref, () => ({ focus, startListDrag }));

  useEffect(() => {
    const end = () => { setHtmlDragging(false); setListDragCtx(null); dragPayloadRef.current = null; };
    window.addEventListener('dragend', end); window.addEventListener('drop', end);
    return () => { window.removeEventListener('dragend', end); window.removeEventListener('drop', end); };
  }, []);

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
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calDrag?.key, calDrag?.mode]);

  useEffect(() => {
    if (!highlightKey) return;
    const t = setTimeout(() => {
      const el = rowsRef.current?.querySelector(`[data-rm-row="${highlightKey}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 60);
    const clr = setTimeout(() => setHighlightKey(null), 2600);
    return () => { clearTimeout(t); clearTimeout(clr); };
  }, [highlightKey, year, q, calLevel]);

  useEffect(() => { if (!notPlaced) return; const t = setTimeout(() => setNotPlaced(null), 2800); return () => clearTimeout(t); }, [notPlaced]);

  // ── 막대 데이터 ──
  const dlPeriod = (p: CalProgram, dl: Deadline) => {
    if (!dl.date) return null;
    const tstarts = dl.todos.map(t => t.date).filter((x): x is string => !!x);
    let start = dl.startDate || (tstarts.length ? tstarts.sort()[0] : (p.startDate || dl.date));
    if (start > dl.date) start = dl.date;
    return { start, end: dl.date };
  };
  const buildRanges = (): CalRange[] => {
    const out: CalRange[] = [];
    if (calLevel === 'program') {
      const map = new Map<string, { wsId: string; name: string; programId: string; start: string; end: string }>();
      for (const p of programs) {
        for (const dl of (p.deadlines ?? []).filter(dl => dl.enabled !== false)) {
          if (!dl.projectId || !dl.date) continue;
          const proj = resolveProject(p.wsId, dl.projectId); if (!proj) continue;
          const dp = dlPeriod(p, dl); if (!dp) continue;
          const key = `proj-${p.wsId}-${dl.projectId}`;
          const cur = map.get(key);
          if (!cur) map.set(key, { wsId: p.wsId, name: proj.name, programId: p.id, start: dp.start, end: dp.end });
          else { if (dp.start < cur.start) cur.start = dp.start; if (dp.end > cur.end) cur.end = dp.end; }
        }
      }
      map.forEach((v, key) => out.push({ key, level: 'program', start: v.start, end: v.end, name: v.name, wsId: v.wsId, programId: v.programId, color: businessColor(v.wsId), readOnly: true }));
      return out;
    }
    for (const p of programs) {
      const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
      const pColor = businessColor(p.wsId);
      if (calLevel === 'deadline') {
        for (const dl of dls) { const dp = dlPeriod(p, dl); if (dp) out.push({ key: `d-${dl.id}`, level: 'deadline', ...dp, name: `${p.name} · ${dl.name}`, wsId: p.wsId, programId: p.id, deadlineId: dl.id, color: pColor }); }
      } else {
        for (const dl of dls) for (const t of dl.todos) {
          if (t.done) continue; if (!t.date && !t.deadline) continue;
          let start = t.date || t.deadline!; const end = t.deadline || t.date!; if (start > end) start = end;
          out.push({ key: `t-${t.id}`, level: 'todo', start, end, name: t.name, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, color: pColor });
        }
      }
    }
    return out;
  };
  const ranges = buildRanges()
    .map(r => (calDrag && calDrag.key === r.key ? { ...r, start: calDrag.start, end: calDrag.end } : r))
    .filter(r => r.end >= qStartStr && r.start <= qEndStr)          // 이번 분기에 걸치는 것만
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.name.localeCompare(b.name)));

  const clearTodoDates = (todos: Deadline['todos']) => todos.map(t => ({ ...t, date: undefined, deadline: undefined }));
  const clearOneSchedule = (r: CalRange) => {
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === r.wsId);
    const prog = entry?.programs.find(p => p.id === r.programId);
    if (!prog) return;
    if (r.level === 'program') {
      if (!window.confirm(`'${r.name}' 업무 영역의 일정을 로드맵에서 삭제할까요?\n하위 데드라인·업무 일정도 함께 사라집니다. (내용은 유지)`)) return;
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

  // 월/오늘/드롭 허용범위 마커
  const months = [0, 1, 2].map(i => {
    const m = qStartMonth + i;
    const first = dstr(year, m, 1);
    const last = new Date(year, m + 1, 0);
    const lastStr = dstr(last.getFullYear(), last.getMonth(), last.getDate());
    return { label: `${m % 12 + 1}월`, leftPct: xStartPct(first), rightPct: xEndPct(lastStr) };
  });
  const monthLines = months.slice(1).map(mm => mm.leftPct);
  const todayInQ = todayStr >= qStartStr && todayStr <= qEndStr;
  const todayPct = todayInQ ? xStartPct(todayStr) : null;

  const dragCtx = calDrag && (calDrag.level === 'deadline' || calDrag.level === 'todo') ? calDrag
    : htmlDragging && listDragCtx && (listDragCtx.level === 'deadline' || listDragCtx.level === 'todo') ? listDragCtx : null;
  const allowed = dragCtx ? boundsForTarget(dragCtx) : null;
  const showAllowed = !!(allowed && (allowed.min || allowed.max));
  const bandLeft = allowed?.min ? xStartPct(allowed.min < qStartStr ? qStartStr : allowed.min) : 0;
  const bandRight = allowed?.max ? xEndPct(allowed.max > qEndStr ? qEndStr : allowed.max) : 100;

  const onTrackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    let payload = dragPayloadRef.current;
    if (!payload) { try { const raw = e.dataTransfer.getData('text/plain'); if (raw) payload = JSON.parse(raw); } catch { /* empty */ } }
    const date = dateFromClientX(e.clientX);
    if (payload && date) dropOnDate(payload, date);
    dragPayloadRef.current = null;
  };

  // 배경 그리드 + 오늘선 + 허용밴드 (행 트랙마다 동일 지오메트리로 렌더 → 세로선이 이어져 보임)
  const TrackGrid = () => (
    <>
      {showAllowed && <div className="absolute top-0 bottom-0 bg-emerald-100/60 pointer-events-none" style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }} />}
      {monthLines.map((x, i) => <div key={i} className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${x}%`, backgroundColor: '#E7E7E1' }} />)}
      {todayPct !== null && <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${todayPct}%`, backgroundColor: '#9DFE3B' }} />}
    </>
  );

  return (
    <div className={`bg-white border rounded-[24px] p-6 flex flex-col ${cardClassName}`} style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }} onDragEnter={() => setHtmlDragging(true)}>
      {/* 분기 네비 */}
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={() => navQuarter(-1)} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="이전 분기">
          <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-[18px] font-bold" style={{ color: '#16211E' }}>{year}년 {q}분기 <span className="text-[13px] font-semibold" style={{ color: '#9AA39D' }}>· 로드맵</span></span>
        <button onClick={() => navQuarter(1)} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="다음 분기">
          <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 mb-4">
        <button onClick={() => setOffOpen(o => !o)} className="text-[12px] font-semibold rounded-full px-2.5 py-1 transition-colors" style={offOpen ? { backgroundColor: '#FBE7C6', color: '#96631A' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }} title="오프 기간(휴가 등) 설정 — 이후 모든 일정이 그만큼 밀립니다">off 설정</button>
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

      {/* 3단계 탭 */}
      <div className="flex gap-1 mb-4 rounded-full p-1" style={{ backgroundColor: '#F1F1EB' }}>
        {([['program', '프로젝트'], ['deadline', '데드라인'], ['todo', '업무']] as [CalLevel, string][]).map(([lv, label]) => (
          <button key={lv} onClick={() => setCalLevel(lv)} className="flex-1 py-2 rounded-full text-[13px] font-semibold transition-colors" style={calLevel === lv ? { backgroundColor: '#fff', color: '#16211E', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } : { color: '#8D9A8D' }}>{label}</button>
        ))}
      </div>

      {notPlaced && (
        <div className="mb-3 rounded-xl px-3 py-2 text-[12px] text-center leading-relaxed" style={{ backgroundColor: '#FCF3E6', color: '#96631A' }}>
          ‘{notPlaced}’은(는) 아직 로드맵에 배치되지 않았어요. 왼쪽 항목을 드래그해 타임라인에 놓아보세요.
        </div>
      )}

      {/* 월 헤더 (타임라인 x좌표 기준 = timelineRef) */}
      <div className="flex mb-1.5">
        <div className="shrink-0" style={{ width: LABEL_W }} />
        <div ref={timelineRef} className="relative flex-1 h-5">
          {months.map((mm, i) => (
            <div key={i} className="absolute top-0 text-[11px] font-semibold text-center" style={{ left: `${mm.leftPct}%`, width: `${mm.rightPct - mm.leftPct}%`, color: '#8D9A8D' }}>{mm.label}</div>
          ))}
        </div>
      </div>

      {/* 로드맵 행 */}
      <div
        ref={rowsRef}
        className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-1"
        onDragOver={e => { if (dragPayloadRef.current) e.preventDefault(); }}
        onDrop={onTrackDrop}
      >
        {ranges.length === 0 ? (
          <p className="text-[12px] text-center py-8 leading-relaxed" style={{ color: '#9AA39D' }}>이번 분기에 표시할 일정이 없어요.<br />왼쪽 항목을 이 타임라인으로 드래그해 배치할 수 있어요.</p>
        ) : (
          <div className="space-y-1">
            {ranges.map(r => {
              const left = xStartPct(r.start < qStartStr ? qStartStr : r.start);
              const right = xEndPct(r.end > qEndStr ? qEndStr : r.end);
              const width = Math.max(right - left, 1.2);
              const startsHere = r.start >= qStartStr;
              const endsHere = r.end <= qEndStr;
              const dragging = calDrag?.key === r.key;
              const hot = r.key === highlightKey;
              return (
                <div key={r.key} data-rm-row={r.key} className="flex items-center h-8">
                  <button
                    onClick={() => focus(r.level, r.key, r.start, r.end, r.name)}
                    className="shrink-0 pr-2 text-left text-[11px] leading-tight truncate"
                    style={{ width: LABEL_W, color: hot ? '#16211E' : '#5B6560', fontWeight: hot ? 700 : 500 }}
                    title={r.name}
                  >{r.name}</button>
                  <div className={`relative flex-1 h-full ${calDrag || htmlDragging ? '' : ''}`}>
                    <TrackGrid />
                    <div
                      data-rm-bar={r.key}
                      onMouseDown={r.readOnly ? undefined : e => startCalDrag(r, 'move', e)}
                      className={`group/bar absolute top-1/2 -translate-y-1/2 rounded-full flex items-center ${r.readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${dragging ? 'opacity-90' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%`, height: r.readOnly ? 4 : 10, backgroundColor: r.color, opacity: dragging || hot ? 1 : r.readOnly ? 0.55 : 0.9, boxShadow: hot ? `0 0 0 2px #fff, 0 0 0 4px ${r.color}` : undefined }}
                      title={r.readOnly ? `${r.name} (프로젝트 기간 개요)` : `${r.name} — 드래그로 이동, 양끝을 잡아 기간 조절`}
                    >
                      {!r.readOnly && startsHere && (
                        <div onMouseDown={e => startCalDrag(r, 'resize-start', e)} className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-4 flex items-center justify-center cursor-ew-resize z-20" title="시작일 조절">
                          <span className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: r.color, boxShadow: '0 0 0 2px #fff' }} />
                        </div>
                      )}
                      {!r.readOnly && endsHere && (
                        <div onMouseDown={e => startCalDrag(r, 'resize-end', e)} className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-4 flex items-center justify-center cursor-ew-resize z-20" title="완료일 조절 (기간 연장)">
                          <span className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: r.color, boxShadow: '0 0 0 2px #fff' }} />
                        </div>
                      )}
                      {!r.readOnly && endsHere && (
                        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); clearOneSchedule(r); }} className="absolute -right-1.5 -top-3 z-30 w-4 h-4 rounded-full bg-neutral-400 hover:bg-neutral-600 text-white flex items-center justify-center text-[10px] leading-none opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-pointer" title="이 일정을 로드맵에서 삭제 (내용 유지)">×</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default GoalsRoadmap;
