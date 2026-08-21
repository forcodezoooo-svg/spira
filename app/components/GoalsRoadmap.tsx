'use client';
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useStore } from '../lib/useStore';
import { uid } from '../lib/store';
import type { Program } from '../lib/types';

// Goals 간트 로드맵 — 좌측 트리(사업목표 › 프로젝트 › 영역별 산출물 › task)와 우측 타임라인을 1:1 정렬.
// 가로 시간축은 연/월/주/일/시로 확대·축소하며 '연속 스크롤'(윈도우 제한 없음).
// 큰 '추가' 버튼은 현재 스케일에 맞는 depth로 항목을 추가(부모=선택 항목 계보). (Goals 전용)

type Scale = 'year' | 'month' | 'week';
type Lvl = 'program' | 'deadline' | 'todo' | 'subtask' | 'unit';
type CalProgram = Program & { wsId: string; wsName?: string };
type Deadline = NonNullable<Program['deadlines']>[number];
type Payload = { level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string };
type Row = { key: string; level: 0 | 1 | 2 | 3 | 4; kind: Lvl; name: string; start?: string; end?: string; color: string; hasChildren: boolean; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string; pgKey: string; isAdd?: boolean; addKind?: Lvl };

export interface GoalsRoadmapHandle { focus: (level: Lvl, key: string, start?: string, end?: string, name?: string) => void; startListDrag: (payload: Payload, e: React.DragEvent) => void; }
interface Props { programs: CalProgram[]; businessColor: (wsId: string) => string; resolveProject: (wsId: string, id?: string) => { name: string } | null; cardClassName?: string; }

const LABEL_W = 240;
const ROW_H = 34;
const HEAD_H = 30;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const SCALES: [Scale, string][] = [['year', '연'], ['month', '월'], ['week', '주']];
const DEPTH_NAME: Record<Scale, string> = { year: '사업목표', month: '프로젝트', week: '영역별 산출물' };
const CHILD_NAME: Partial<Record<Lvl, string>> = { deadline: '프로젝트', todo: '영역별 산출물', subtask: 'task', unit: '세부 작업' };
// minSpan = 데이터가 적어도 최소 이만큼 날짜 범위를 확보(넓게 스크롤). 상한은 안전용 CAP.
const CFG: Record<Scale, { pxPerDay: number; buffer: number; minSpan: number }> = {
  year: { pxPerDay: 4, buffer: 400, minSpan: 3660 },   // ±5년
  month: { pxPerDay: 20, buffer: 180, minSpan: 2190 }, // ±3년
  week: { pxPerDay: 70, buffer: 90, minSpan: 1100 },   // ±1.5년
};
const SPAN_CAP = 9000;

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
  const [kanban, setKanban] = useState(false); // 칸반 탭 여부
  // 펼침 오버라이드: 없으면 스케일 기본(depth<maxDepth 펼침), 있으면 사용자가 화살표로 지정한 값
  const [openMap, setOpenMap] = useState<Map<string, boolean>>(new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null); // enterLevel 시 스크롤 목표 날짜
  const [visLabel, setVisLabel] = useState('');
  const [notPlaced, setNotPlaced] = useState<string | null>(null);
  const [offOpen, setOffOpen] = useState(false);
  const [offStart, setOffStart] = useState('');
  const [offEnd, setOffEnd] = useState('');
  const [kbDrag, setKbDrag] = useState<string | null>(null); // 칸반 드래그 중인 task key
  const [kbAiBusy, setKbAiBusy] = useState<string | null>(null); // AI task 생성 중인 산출물(todoId)
  const [kbForm, setKbForm] = useState<null | { mode: 'task' | 'subtask'; col: KbCol; s?: Sub }>(null); // task/세부작업 추가 팝업
  const [formName, setFormName] = useState('');
  const [formDue, setFormDue] = useState('');
  const [formDur, setFormDur] = useState(''); // 세부작업 소요 시간(분)
  const boardRef = useRef<HTMLDivElement>(null);
  const maxDepth = scale === 'year' ? 0 : scale === 'month' ? 1 : 2; // 연0/월1/주2 (task 이하는 칸반)
  const isOpen = (key: string, level: number) => (openMap.has(key) ? openMap.get(key)! : level < maxDepth); // 화살표로 오버라이드 가능
  const toggleOpen = (key: string, level: number) => setOpenMap(prev => { const n = new Map(prev); n.set(key, !(prev.has(key) ? prev.get(key)! : level < maxDepth)); return n; });

  type DragTarget = { key: string; level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string; start: string; end: string };
  const [calDrag, setCalDrag] = useState<(DragTarget & { mode: 'move' | 'resize-start' | 'resize-end'; grabDate: string; origStart: string; origEnd: string }) | null>(null);
  const calDragRef = useRef(calDrag); calDragRef.current = calDrag;
  const movedRef = useRef(false); // 막대 드래그가 실제로 이동했는지(클릭과 구분)
  const dragPayloadRef = useRef<Payload | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cfg = CFG[scale];
  const LEVEL_SCALE: Scale[] = ['year', 'month', 'week']; // 0=목표→연,1=프로젝트→월,2=산출물→주 (task 이하는 칸반)

  // ── 표시 범위(연속) ──
  const allDates: string[] = [];
  for (const p of programs) for (const dl of (p.deadlines ?? [])) {
    if (dl.startDate) allDates.push(dl.startDate); if (dl.date) allDates.push(dl.date);
    for (const t of dl.todos) { if (t.date) allDates.push(t.date); if (t.deadline) allDates.push(t.deadline); for (const s of (t.subtasks ?? [])) { if (s.date) allDates.push(s.date); if (s.deadline) allDates.push(s.deadline); for (const u of (s.units ?? [])) { if (u.date) allDates.push(u.date); if (u.deadline) allDates.push(u.deadline); } } }
  }
  let lo = todayStr, hi = todayStr;
  if (allDates.length) { const sorted = [...allDates, todayStr].sort(); lo = sorted[0]; hi = sorted[sorted.length - 1]; }
  lo = addDaysStr(lo, -cfg.buffer); hi = addDaysStr(hi, cfg.buffer);
  let span = daysBetween(lo, hi) + 1;
  // 데이터가 적어도 넓게 스크롤되도록 minSpan 확보(오늘 중심으로 확장)
  if (span < cfg.minSpan) { const extra = cfg.minSpan - span; lo = addDaysStr(lo, -Math.ceil(extra / 2)); hi = addDaysStr(hi, Math.floor(extra / 2)); span = cfg.minSpan; }
  if (span > SPAN_CAP) { lo = addDaysStr(todayStr, -Math.floor(SPAN_CAP / 2)); hi = addDaysStr(lo, SPAN_CAP - 1); span = SPAN_CAP; }
  const rangeStart = lo;
  const contentWidth = span * cfg.pxPerDay;
  const xOf = (d: string) => daysBetween(rangeStart, d) * cfg.pxPerDay;
  const wOf = (s: string, e: string) => (daysBetween(s, e) + 1) * cfg.pxPerDay;
  const dateFromClientX = (x: number): string | null => { const r = timelineRef.current?.getBoundingClientRect(); if (!r) return null; const di = Math.floor((x - r.left) / cfg.pxPerDay); return addDaysStr(rangeStart, clampN(di, 0, span - 1)); };

  // ── 배치 범위 제한 ──
  type Bounds = { min?: string; max?: string };
  const findProg = (wsId: string, programId: string) => store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId);
  const boundsForTarget = (t: { level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string }): Bounds | null => {
    const p = findProg(t.wsId, t.programId);
    if (t.level === 'deadline') return { min: p?.startDate || undefined, max: p?.deadline || undefined };
    if (t.level === 'todo') { const dl = p?.deadlines?.find(d => d.id === t.deadlineId); return { min: dl?.startDate || undefined, max: dl?.date || undefined }; }
    if (t.level === 'subtask') { const td = p?.deadlines?.find(d => d.id === t.deadlineId)?.todos.find(x => x.id === t.todoId); return { min: td?.date || undefined, max: td?.deadline || undefined }; }
    if (t.level === 'unit') { const st = p?.deadlines?.find(d => d.id === t.deadlineId)?.todos.find(x => x.id === t.todoId)?.subtasks?.find(x => x.id === t.subtaskId); return { min: st?.date || undefined, max: st?.deadline || undefined }; }
    return null;
  };
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
    const prog = findProg(d.wsId, d.programId); if (!prog) return;
    const delta = daysBetween(d.origEnd, d.end);
    const shift = (x?: string) => (x ? addDaysStr(x, delta) : x);
    const shSub = (s: NonNullable<Deadline['todos'][number]['subtasks']>[number]) => ({ ...s, date: shift(s.date), deadline: shift(s.deadline), units: (s.units ?? []).map(u => ({ ...u, date: shift(u.date), deadline: shift(u.deadline) })) });
    if (d.level === 'program') { store.updateProgramInWs(d.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: shift(dl.date) ?? dl.date, startDate: shift(dl.startDate), todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline), subtasks: (t.subtasks ?? []).map(shSub) })) })) }); return; }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== d.deadlineId) return dl;
      if (d.level === 'deadline') { if (d.mode === 'move') return { ...dl, date: d.end, startDate: d.start, todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline), subtasks: (t.subtasks ?? []).map(shSub) })) }; if (d.mode === 'resize-end') return { ...dl, date: d.end }; return { ...dl, startDate: d.start }; }
      return { ...dl, todos: dl.todos.map(t => {
        if (t.id !== d.todoId) return t;
        if (d.level === 'todo') { if (d.mode === 'move') return { ...t, date: d.start, deadline: d.end, subtasks: (t.subtasks ?? []).map(shSub) }; if (d.mode === 'resize-end') return { ...t, deadline: d.end }; return { ...t, date: d.start }; }
        return { ...t, subtasks: (t.subtasks ?? []).map(s => {
          if (s.id !== d.subtaskId) return s;
          if (d.level === 'subtask') { if (d.mode === 'move') return { ...s, date: d.start, deadline: d.end, units: (s.units ?? []).map(u => ({ ...u, date: shift(u.date), deadline: shift(u.deadline) })) }; if (d.mode === 'resize-end') return { ...s, deadline: d.end }; return { ...s, date: d.start }; }
          return { ...s, units: (s.units ?? []).map(u => { if (u.id !== d.unitId) return u; if (d.mode === 'move') return { ...u, date: d.start, deadline: d.end }; if (d.mode === 'resize-end') return { ...u, deadline: d.end }; return { ...u, date: d.start }; }) };
        }) };
      }) };
    });
    store.updateProgramInWs(d.wsId, { ...prog, deadlines });
  };
  const startCalDrag = (r: Row, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    if (!r.start || !r.end) return;
    e.preventDefault(); e.stopPropagation();
    movedRef.current = false;
    const grab = dateFromClientX(e.clientX) || r.start;
    setCalDrag({ key: r.key, level: r.kind, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, subtaskId: r.subtaskId, unitId: r.unitId, start: r.start, end: r.end, mode, grabDate: grab, origStart: r.start, origEnd: r.end });
  };

  const dropOnDate = (payload: Payload, date: string) => {
    const prog = findProg(payload.wsId, payload.programId); if (!prog) return;
    if (payload.level === 'program') { store.updateProgramInWs(payload.wsId, { ...prog, startDate: date, deadline: prog.deadline || date }); return; }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== payload.deadlineId) return dl;
      if (payload.level === 'deadline') return { ...dl, startDate: date, date };
      return { ...dl, date: dl.date && dl.date > date ? dl.date : date, startDate: dl.startDate && date < dl.startDate ? date : dl.startDate, todos: dl.todos.map(t => {
        if (t.id !== payload.todoId) return t;
        if (payload.level === 'todo') return { ...t, date, deadline: date };
        return { ...t, date: t.date && t.date > date ? t.date : date, deadline: t.deadline && t.deadline > date ? t.deadline : date, subtasks: (t.subtasks ?? []).map(s => {
          if (s.id !== payload.subtaskId) return s;
          if (payload.level === 'subtask') return { ...s, date, deadline: date };
          return { ...s, date: s.date && s.date > date ? s.date : date, deadline: s.deadline && s.deadline > date ? s.deadline : date, units: (s.units ?? []).map(u => u.id === payload.unitId ? { ...u, date, deadline: date } : u) };
        }) };
      }) };
    });
    store.updateProgramInWs(payload.wsId, { ...prog, deadlines });
  };

  const applyOffPeriod = () => {
    if (!offStart || !offEnd || offEnd < offStart) return;
    const days = Math.round((new Date(offEnd).getTime() - new Date(offStart).getTime()) / 86400000) + 1;
    if (!window.confirm(`${offStart} ~ ${offEnd} (${days}일)을 오프 기간으로 설정할까요?\n\n이 기간 시작일 이후의 모든 프로젝트 일정이 ${days}일씩 뒤로 밀립니다.`)) return;
    store.shiftAllSchedulesAfter(offStart, days); setOffOpen(false); setOffStart(''); setOffEnd('');
  };

  const startListDrag = (payload: Payload, e: React.DragEvent) => { dragPayloadRef.current = payload; e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'move'; };
  const focus = () => {};
  useImperativeHandle(ref, () => ({ focus, startListDrag }));

  useEffect(() => { const end = () => { dragPayloadRef.current = null; }; window.addEventListener('dragend', end); window.addEventListener('drop', end); return () => { window.removeEventListener('dragend', end); window.removeEventListener('drop', end); }; }, []);
  useEffect(() => {
    if (!calDrag) return;
    const onMove = (e: MouseEvent) => {
      const ds = dateFromClientX(e.clientX); if (!ds) return;
      if (calDragRef.current && ds !== calDragRef.current.grabDate) movedRef.current = true;
      setCalDrag(prev => { if (!prev) return prev; let next: { start: string; end: string };
        if (prev.mode === 'resize-start') next = { start: ds <= prev.origEnd ? ds : prev.origEnd, end: prev.origEnd };
        else if (prev.mode === 'resize-end') next = { start: prev.origStart, end: ds >= prev.origStart ? ds : prev.origStart };
        else { const delta = daysBetween(prev.grabDate, ds); next = { start: addDaysStr(prev.origStart, delta), end: addDaysStr(prev.origEnd, delta) }; }
        next = clampRange(prev.mode, next.start, next.end, boundsForTarget(prev)); return { ...prev, ...next }; });
    };
    const onUp = () => commitCalDrag();
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.body.style.userSelect = 'none';
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calDrag?.key, calDrag?.mode]);
  useEffect(() => { if (!notPlaced) return; const t = setTimeout(() => setNotPlaced(null), 2800); return () => clearTimeout(t); }, [notPlaced]);
  // 카테고리 보드 진입 시 가로 스크롤을 맨 왼쪽으로
  useEffect(() => { if (kanban && boardRef.current) boardRef.current.scrollLeft = 0; }, [kanban]);

  // 초기/스케일 변경 시: enterLevel 목표가 있으면 그곳으로, 없으면 오늘로 스크롤
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const t = scrollTarget || todayStr;
    el.scrollTo({ left: Math.max(0, xOf(t) - el.clientWidth / 2), behavior: scrollTarget ? 'smooth' : 'auto' });
    updateVisLabel(el);
    if (scrollTarget) setScrollTarget(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, scrollTarget]);
  const fmtVis = (d: string) => { const dd = new Date(d); return scale === 'year' ? `${dd.getFullYear()}년` : scale === 'week' ? `${dd.getFullYear()}년 ${dd.getMonth() + 1}월 ${dd.getDate()}일` : `${dd.getFullYear()}년 ${dd.getMonth() + 1}월`; };
  const updateVisLabel = (el: HTMLDivElement) => { const centerX = el.scrollLeft + el.clientWidth / 2 - LABEL_W; const di = clampN(Math.floor(centerX / cfg.pxPerDay), 0, span - 1); setVisLabel(fmtVis(addDaysStr(rangeStart, di))); };
  const scrollByScreen = (dir: -1 | 1) => { const el = scrollRef.current; if (!el) return; el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' }); };
  const scrollToToday = () => { const el = scrollRef.current; if (!el) return; el.scrollTo({ left: Math.max(0, xOf(todayStr) - el.clientWidth / 2), behavior: 'smooth' }); };
  // 라벨 텍스트 클릭 → 그 단계의 카테고리(스케일)로 전환 + 그 항목으로 스크롤 (하위는 스케일이 자동으로 가림)
  const enterLevel = (r: Row) => { setSelectedKey(r.key); setOpenMap(new Map()); setScale(LEVEL_SCALE[Math.min(r.level, 2)]); setScrollTarget(r.start ?? r.end ?? null); };

  // ── 트리 → 행 ──
  const progPeriod = (p: CalProgram) => { const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false); const ds = dls.flatMap(dl => [dl.startDate, dl.date, ...dl.todos.flatMap(t => [t.date, t.deadline, ...(t.subtasks ?? []).flatMap(s => [s.date, s.deadline, ...(s.units ?? []).flatMap(u => [u.date, u.deadline])])])]).filter((x): x is string => !!x); if (!ds.length) return {}; const s = [...ds].sort(); return { start: s[0], end: s[s.length - 1] }; };
  const dlPeriod = (p: CalProgram, dl: Deadline) => { if (!dl.date) { const ts = dl.todos.flatMap(t => [t.date, t.deadline]).filter((x): x is string => !!x); return ts.length ? { start: ts.sort()[0], end: ts.sort().slice(-1)[0] } : {}; } const ts = dl.todos.map(t => t.date).filter((x): x is string => !!x); let start = dl.startDate || (ts.length ? ts.sort()[0] : (p.startDate || dl.date)); if (start > dl.date) start = dl.date; return { start, end: dl.date }; };
  const rows: Row[] = [];
  for (const p of programs) {
    const pColor = businessColor(p.wsId); const pgKey = `p-${p.id}`;
    const dls = (p.deadlines ?? []).filter(dl => dl.enabled !== false);
    const pp = progPeriod(p);
    rows.push({ key: pgKey, level: 0, kind: 'program', name: p.name, start: pp.start, end: pp.end, color: pColor, hasChildren: true, wsId: p.wsId, programId: p.id, pgKey });
    if (!isOpen(pgKey, 0)) continue;
    if (dls.length === 0) rows.push({ key: `add-${pgKey}`, level: 1, kind: 'deadline', name: '', color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, pgKey, isAdd: true, addKind: 'deadline' });
    for (const dl of dls) {
      const dKey = `d-${dl.id}`; const dp = dlPeriod(p, dl); const todos = dl.todos.filter(t => !t.done);
      rows.push({ key: dKey, level: 1, kind: 'deadline', name: dl.name, start: dp.start, end: dp.end, color: pColor, hasChildren: true, wsId: p.wsId, programId: p.id, deadlineId: dl.id, pgKey });
      if (!isOpen(dKey, 1)) continue;
      if (todos.length === 0) rows.push({ key: `add-${dKey}`, level: 2, kind: 'todo', name: '', color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, pgKey, isAdd: true, addKind: 'todo' });
      for (const t of todos) {
        // 산출물(2단계)이 로드맵의 최하위 — 하위 task들은 칸반 탭에서 관리
        const tKey = `t-${t.id}`;
        const ts = t.date || t.deadline, te = t.deadline || t.date;
        rows.push({ key: tKey, level: 2, kind: 'todo', name: t.name, start: ts && te ? (ts > te ? te : ts) : undefined, end: te || ts, color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, pgKey });
      }
    }
  }
  const rowsDraw = rows.map(r => (calDrag && calDrag.key === r.key ? { ...r, start: calDrag.start, end: calDrag.end } : r));
  void resolveProject;

  // ── 항목 추가 (스케일별 depth, 부모=선택 계보) ──
  const resolveChain = (key: string | null) => {
    if (!key) return {} as { program?: CalProgram; deadlineId?: string; todoId?: string; subtaskId?: string };
    for (const p of programs) { if (key === `p-${p.id}`) return { program: p };
      for (const dl of (p.deadlines ?? [])) { if (key === `d-${dl.id}`) return { program: p, deadlineId: dl.id };
        for (const t of dl.todos) { if (key === `t-${t.id}`) return { program: p, deadlineId: dl.id, todoId: t.id };
          for (const s of (t.subtasks ?? [])) { if (key === `s-${s.id}`) return { program: p, deadlineId: dl.id, todoId: t.id, subtaskId: s.id };
            for (const u of (s.units ?? [])) if (key === `u-${u.id}`) return { program: p, deadlineId: dl.id, todoId: t.id, subtaskId: s.id }; } } } }
    return {};
  };
  const addAtScale = () => {
    const L = scale === 'year' ? 0 : scale === 'month' ? 1 : 2;
    const chain = resolveChain(selectedKey);
    if (L === 0) { const name = window.prompt('사업목표 이름')?.trim(); if (!name) return; const wsId = store.data.workspace?.id; if (!wsId) return; store.addProgramToWs(wsId, { name, goal: name, color: businessColor(wsId), fromPlan: true, deadlines: [] }); return; }
    const prog = chain.program ?? programs[0];
    if (!prog) { window.alert('먼저 사업목표를 추가하세요.'); return; }
    if (L === 1) { const name = window.prompt('프로젝트 이름')?.trim(); if (!name) return; store.updateProgramInWs(prog.wsId, { ...prog, deadlines: [...(prog.deadlines ?? []), { id: uid(), name, date: '', todos: [], enabled: true }] }); return; }
    const dlId = chain.deadlineId ?? prog.deadlines?.[0]?.id;
    if (!dlId) { window.alert('먼저 프로젝트를 추가하세요.'); return; }
    const name = window.prompt('영역별 산출물 이름')?.trim(); if (!name) return;
    store.updateProgramInWs(prog.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id === dlId ? { ...dl, todos: [...dl.todos, { id: uid(), name, done: false }] } : dl) });
  };
  // 빈 상위 노드의 인라인 '추가' (그 자리에 하위 항목 생성)
  const addSpecific = (r: Row) => {
    const prog = findProg(r.wsId, r.programId); if (!prog) return;
    const name = window.prompt(`${CHILD_NAME[r.addKind!] ?? '항목'} 이름`)?.trim(); if (!name) return;
    if (r.addKind === 'deadline') { store.updateProgramInWs(r.wsId, { ...prog, deadlines: [...(prog.deadlines ?? []), { id: uid(), name, date: '', todos: [], enabled: true }] }); return; }
    store.updateProgramInWs(r.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => {
      if (dl.id !== r.deadlineId) return dl;
      if (r.addKind === 'todo') return { ...dl, todos: [...dl.todos, { id: uid(), name, done: false }] };
      return { ...dl, todos: dl.todos.map(t => {
        if (t.id !== r.todoId) return t;
        if (r.addKind === 'subtask') return { ...t, subtasks: [...(t.subtasks ?? []), { id: uid(), name, done: false }] };
        return { ...t, subtasks: (t.subtasks ?? []).map(s => s.id === r.subtaskId ? { ...s, units: [...(s.units ?? []), { id: uid(), name, done: false }] } : s) };
      }) };
    }) });
  };
  const delRow = (r: Row) => {
    const prog = findProg(r.wsId, r.programId); if (!prog) return;
    if (r.kind === 'program') { if (!window.confirm(`'${r.name}'을(를) 삭제할까요?`)) return; store.deleteProgramInWs(r.wsId, prog.id); return; }
    if (!window.confirm(`'${r.name}'을(를) 삭제할까요?`)) return;
    store.updateProgramInWs(r.wsId, { ...prog, deadlines: (prog.deadlines ?? []).flatMap(dl => {
      if (dl.id !== r.deadlineId) return [dl];
      if (r.kind === 'deadline') return [];
      return [{ ...dl, todos: dl.todos.flatMap(t => {
        if (t.id !== r.todoId) return [t];
        if (r.kind === 'todo') return [];
        return [{ ...t, subtasks: (t.subtasks ?? []).flatMap(s => {
          if (s.id !== r.subtaskId) return [s];
          if (r.kind === 'subtask') return [];
          return [{ ...s, units: (s.units ?? []).filter(u => u.id !== r.unitId) }];
        }) }];
      }) }];
    }) });
  };
  const clearSchedule = (r: Row) => {
    const prog = findProg(r.wsId, r.programId); if (!prog) return;
    store.updateProgramInWs(r.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => {
      if (dl.id !== r.deadlineId) return dl;
      if (r.kind === 'deadline') return { ...dl, date: '', startDate: undefined };
      return { ...dl, todos: dl.todos.map(t => {
        if (t.id !== r.todoId) return t;
        if (r.kind === 'todo') return { ...t, date: undefined, deadline: undefined };
        return { ...t, subtasks: (t.subtasks ?? []).map(s => {
          if (s.id !== r.subtaskId) return s;
          if (r.kind === 'subtask') return { ...s, date: undefined, deadline: undefined };
          return { ...s, units: (s.units ?? []).map(u => u.id === r.unitId ? { ...u, date: undefined, deadline: undefined } : u) };
        }) };
      }) };
    }) });
  };

  // ── 칸반: 업무 영역별 산출물(todo)을 '칸'으로, 그 하위 task를 카드로 관리 ──
  type Sub = NonNullable<Deadline['todos'][number]['subtasks']>[number];
  type KbCol = { p: CalProgram; dlId: string; dlName: string; todoId: string; name: string; due: string; subtasks: Sub[] };
  const kbScope = resolveChain(selectedKey);
  const kbCols: KbCol[] = [];
  for (const p of programs) {
    if (kbScope.program && kbScope.program.id !== p.id) continue;
    for (const dl of (p.deadlines ?? [])) {
      if (kbScope.deadlineId && kbScope.deadlineId !== dl.id) continue;
      for (const t of dl.todos) {
        if (kbScope.todoId && kbScope.todoId !== t.id) continue;
        kbCols.push({ p, dlId: dl.id, dlName: dl.name, todoId: t.id, name: t.name, due: t.deadline || t.date || '', subtasks: (t.subtasks ?? []) });
      }
    }
  }
  // D-day 계산 + 배지 스타일
  const ddayOf = (d?: string) => { if (!d) return null; const diff = daysBetween(todayStr, d); if (diff > 0) return { label: `D-${diff}`, s: diff <= 3 ? 'urgent' : 'future' }; if (diff === 0) return { label: 'D-Day', s: 'urgent' }; return { label: `D+${-diff}`, s: 'over' }; };
  const DdayBadge = ({ d }: { d?: string }) => { const dd = ddayOf(d); if (!dd) return null; const st = dd.s === 'urgent' ? { color: '#fff', backgroundColor: '#FF696C' } : dd.s === 'over' ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }; return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={st}>{dd.label}</span>; };
  const kbScopeName = kbScope.todoId ? (kbCols[0]?.name || '선택 산출물') : kbScope.deadlineId ? (kbCols[0]?.dlName || '선택 프로젝트') : kbScope.program ? kbScope.program.name : '전체';
  const updateSub = (col: KbCol, sId: string, patch: Partial<Sub>) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: (t.subtasks ?? []).map(s => s.id !== sId ? s : { ...s, ...patch }) }) }) });
  };
  // task/세부작업 추가는 팝업 폼으로 (이름 + 기한)
  const kbCreateTask = (col: KbCol, name: string, due: string) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: [...(t.subtasks ?? []), { id: uid(), name, done: false, deadline: due || undefined }] }) }) });
  };
  const kbCreateUnit = (col: KbCol, s: Sub, name: string, durMin?: number) => updateSub(col, s.id, { units: [...(s.units ?? []), { id: uid(), name, done: false, durationMin: durMin }] });
  const kbDelUnit = (col: KbCol, s: Sub, uId: string) => updateSub(col, s.id, { units: (s.units ?? []).filter(u => u.id !== uId) });
  const kbSetTaskDue = (col: KbCol, s: Sub, due: string) => updateSub(col, s.id, { deadline: due || undefined });
  const kbSetTodoDue = (col: KbCol, due: string) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, deadline: due || undefined, date: t.date || due || undefined }) }) });
  };
  const kbAddTask = (col: KbCol) => { setKbForm({ mode: 'task', col }); setFormName(''); setFormDue(''); setFormDur(''); };
  const kbSubmitForm = () => { const n = formName.trim(); if (!n || !kbForm) return; if (kbForm.mode === 'task') kbCreateTask(kbForm.col, n, formDue); else if (kbForm.s) { const d = Number(formDur); kbCreateUnit(kbForm.col, kbForm.s, n, Number.isFinite(d) && d > 0 ? d : undefined); } setKbForm(null); };
  const fmtDur = (min?: number) => { if (!min) return ''; return min >= 60 ? (min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min / 60}시간`) : `${min}분`; };
  // AI로 이 산출물의 task들을 생성해 추가
  const kbAiTasks = async (col: KbCol) => {
    if (kbAiBusy) return;
    setKbAiBusy(col.todoId);
    try {
      const context = `사업: ${col.p.wsName ?? ''} / 사업목표: ${col.p.name}${col.p.goal ? ` (${col.p.goal})` : ''} / 프로젝트: ${col.dlName}`;
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'todo-tasks', context, goalName: `${col.p.name} · ${col.dlName}`, deliverableName: col.name }) });
      const data = await res.json().catch(() => ({}));
      const tasks = (Array.isArray(data.tasks) ? data.tasks : []) as string[];
      if (!tasks.length) return;
      const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
      store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: [...(t.subtasks ?? []), ...tasks.map(name => ({ id: uid(), name, done: false }))] }) }) });
    } catch { /* ignore */ }
    finally { setKbAiBusy(null); }
  };
  const kbDel = (col: KbCol, sId: string) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: (t.subtasks ?? []).filter(s => s.id !== sId) }) }) });
  };
  const kbToggleDone = (col: KbCol, s: Sub) => updateSub(col, s.id, { done: !s.done, status: !s.done ? 'done' : 'todo' });
  const kbAddUnit = (col: KbCol, s: Sub) => { setKbForm({ mode: 'subtask', col, s }); setFormName(''); setFormDue(''); setFormDur(''); };
  const kbToggleUnit = (col: KbCol, s: Sub, uId: string) => updateSub(col, s.id, { units: (s.units ?? []).map(u => u.id === uId ? { ...u, done: !u.done } : u) });
  // 다른 산출물 칸으로 task 이동 (드래그)
  const kbMoveTask = (sId: string, from: KbCol, to: KbCol) => {
    if (from.todoId === to.todoId) return;
    const prog = findProg(from.p.wsId, from.p.id); if (!prog) return;
    const moving = from.subtasks.find(s => s.id === sId); if (!moving) return;
    store.updateProgramInWs(from.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => {
      const isFrom = dl.id === from.dlId, isTo = dl.id === to.dlId;
      if (!isFrom && !isTo) return dl;
      return { ...dl, todos: dl.todos.map(t => {
        if (isFrom && t.id === from.todoId) return { ...t, subtasks: (t.subtasks ?? []).filter(s => s.id !== sId) };
        if (isTo && t.id === to.todoId) return { ...t, subtasks: [...(t.subtasks ?? []), moving] };
        return t;
      }) };
    }) });
  };

  // ── 그리드/눈금/오늘 (px, 범위 전체) ──
  const dayLines: number[] = []; const strongLines: number[] = []; const labels: { x: number; text: string }[] = [];
  for (let i = 0; i < span; i++) {
    const d = addDaysStr(rangeStart, i); const dd = new Date(d); const x = i * cfg.pxPerDay; const dow = dd.getDay(); const dom = dd.getDate();
    if (scale === 'year') { if (dom === 1) { strongLines.push(x); labels.push({ x, text: dd.getMonth() === 0 ? `${dd.getFullYear()}년` : `${dd.getMonth() + 1}월` }); } }
    else if (scale === 'month') { if (dom === 1) { strongLines.push(x); labels.push({ x, text: `${dd.getFullYear()}.${dd.getMonth() + 1}` }); } else if (dow === 1) { dayLines.push(x); labels.push({ x, text: `${dom}` }); } }
    else { if (dow === 1 || dom === 1) { strongLines.push(x); labels.push({ x, text: `${dd.getMonth() + 1}/${dom}` }); } else dayLines.push(x); }
  }
  const todayX = xOf(todayStr) + cfg.pxPerDay / 2;
  void schedule; void DOW;

  const onTrackDrop = (e: React.DragEvent) => { e.preventDefault(); let payload = dragPayloadRef.current; if (!payload) { try { const raw = e.dataTransfer.getData('text/plain'); if (raw) payload = JSON.parse(raw); } catch { /* empty */ } } const date = dateFromClientX(e.clientX); if (payload && date) dropOnDate(payload, date); dragPayloadRef.current = null; };

  const barH = (lvl: number) => lvl === 0 ? 24 : lvl === 1 ? 24 : lvl === 2 ? 20 : lvl === 3 ? 17 : 15;
  const pgOrder = new Map<string, number>(); programs.forEach((p, i) => pgOrder.set(`p-${p.id}`, i));

  return (
    <div className={`bg-white border rounded-[24px] p-5 flex flex-col ${cardClassName}`} style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
      {/* 최상위 페이지 전환: 로드맵 / 칸반 */}
      <div className="flex gap-1 rounded-full p-1 mb-3" style={{ backgroundColor: '#EDEDE7' }}>
        {([[false, '로드맵'], [true, '카테고리 보드']] as [boolean, string][]).map(([kb, label]) => (
          <button key={label} onClick={() => setKanban(kb)} className="flex-1 py-2 rounded-full text-[13px] font-bold transition-colors" style={kanban === kb ? { backgroundColor: '#16211E', color: '#fff' } : { color: '#8D9A8D' }}>{label}</button>
        ))}
      </div>

      {!kanban ? (
        <>
          {/* 로드맵: 이동/현재위치 + 스케일(연/월/주) + 추가 */}
          <div className="flex items-center justify-between mb-2.5 gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <button onClick={() => scrollByScreen(-1)} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100 flex-shrink-0" style={{ color: '#9AA39D' }} title="이전"><svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <button onClick={scrollToToday} className="text-[12px] font-semibold rounded-full px-2.5 py-1 transition-colors flex-shrink-0" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>오늘</button>
              <button onClick={() => scrollByScreen(1)} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100 flex-shrink-0" style={{ color: '#9AA39D' }} title="다음"><svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <span className="text-[15px] font-bold ml-1 truncate" style={{ color: '#16211E' }}>{visLabel}</span>
            </div>
            <button onClick={addAtScale} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-transform hover:-translate-y-0.5 flex-shrink-0" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }} title={`${DEPTH_NAME[scale]} 추가${selectedKey ? ' (선택 항목 계보에)' : ''}`}>
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>{DEPTH_NAME[scale]} 추가
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1 rounded-full p-1 flex-1" style={{ backgroundColor: '#F1F1EB' }}>
              {SCALES.map(([s, label]) => (<button key={s} onClick={() => setScale(s)} className="flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-colors" style={scale === s ? { backgroundColor: '#fff', color: '#16211E', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } : { color: '#8D9A8D' }}>{label}</button>))}
            </div>
            <button onClick={() => setOffOpen(o => !o)} className="text-[12px] font-semibold rounded-full px-2.5 py-1.5 transition-colors flex-shrink-0" style={offOpen ? { backgroundColor: '#FBE7C6', color: '#96631A' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }} title="오프 기간(휴가 등) 설정">off</button>
          </div>
          {offOpen && (
            <div className="rounded-2xl p-3 mb-3" style={{ backgroundColor: '#FCF6EC', border: '1px solid #F2E2C4' }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input type="date" value={offStart} onChange={e => setOffStart(e.target.value)} className="bg-white border rounded-lg px-2 py-1 text-xs outline-none" style={{ borderColor: '#F2E2C4' }} />
                <span className="text-xs" style={{ color: '#C9A662' }}>~</span>
                <input type="date" value={offEnd} min={offStart || undefined} onChange={e => setOffEnd(e.target.value)} className="bg-white border rounded-lg px-2 py-1 text-xs outline-none" style={{ borderColor: '#F2E2C4' }} />
                <button onClick={applyOffPeriod} disabled={!offStart || !offEnd || offEnd < offStart} className="px-2.5 py-1 disabled:opacity-30 text-white text-xs rounded-lg transition-colors" style={{ backgroundColor: '#E0A73C' }}>적용</button>
                <span className="text-[11px]" style={{ color: '#96631A' }}>이 기간 이후 모든 일정이 그만큼 밀려요</span>
              </div>
            </div>
          )}
          {notPlaced && <div className="mb-2 rounded-xl px-3 py-2 text-[12px] text-center" style={{ backgroundColor: '#FCF3E6', color: '#96631A' }}>‘{notPlaced}’은(는) 아직 배치되지 않았어요. 라벨을 타임라인으로 드래그해 배치하세요.</div>}
        </>
      ) : (
        <div className="flex items-center gap-1.5 mb-3 min-w-0">
          <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>업무 영역별 task</span>
          <span className="text-[12px] truncate" style={{ color: '#9AA39D' }}>· {kbScopeName}</span>
        </div>
      )}

      {kanban ? (
        /* 칸반: 영역별 산출물(칸) 안에 task 카드 — 산출물끼리 드래그로 이동 */
        kbCols.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center"><p className="text-[13px] text-center" style={{ color: '#9AA39D' }}>표시할 산출물이 없어요.<br />로드맵에서 프로젝트/산출물을 선택하거나 먼저 만들어보세요.</p></div>
        ) : (
        <div ref={boardRef} className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-1">
          {kbCols.map(col => {
            const m = col.name.match(/^(.*?)\s*[:：]\s*(.*)$/); // 반각/전각 콜론 모두 분리
            const areaTitle = (m ? m[1] : col.name).trim();
            const goalSub = m ? m[2].trim() : '';
            return (
            <div key={col.todoId} className="flex flex-col min-h-0 w-[240px] flex-shrink-0 rounded-xl border" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#FBFBF9' }}
              onDragOver={e => { if (kbDrag) e.preventDefault(); }}
              onDrop={() => { if (kbDrag) { const from = kbCols.find(c => c.subtasks.some(s => s.id === kbDrag)); if (from) kbMoveTask(kbDrag, from, col); } setKbDrag(null); }}>
              <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(col.p.wsId) }} />
                  <span className="text-[14px] font-black truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{areaTitle}</span>
                  <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#9AA39D' }}>{col.subtasks.length}</span>
                </div>
                {goalSub && <p className="text-[11px] mt-0.5 ml-3.5 leading-snug" style={{ color: '#9AA39D' }}>{goalSub}</p>}
                <div className="flex items-center gap-1.5 mt-1 ml-3.5">
                  <input type="date" value={col.due} onChange={e => kbSetTodoDue(col, e.target.value)} title="산출물 기한" className="text-[10px] tabular-nums bg-white border rounded px-1 py-0.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }} />
                  <DdayBadge d={col.due} />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {col.subtasks.length === 0 && <p className="text-[11px] text-center py-4" style={{ color: '#C4CCC4' }}>task가 없어요</p>}
                {col.subtasks.map(s => {
                  const units = s.units ?? [];
                  return (
                    <div key={s.id} draggable onDragStart={() => setKbDrag(s.id)} onDragEnd={() => setKbDrag(null)}
                      className="group bg-white border rounded-lg p-2.5 cursor-grab active:cursor-grabbing" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', opacity: kbDrag === s.id ? 0.5 : 1 }}>
                      <div className="flex items-start gap-1.5">
                        <button onClick={() => kbToggleDone(col, s)} className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5" style={{ borderColor: s.done ? '#5EA63A' : '#C7CEC7', backgroundColor: s.done ? '#5EA63A' : 'transparent' }}>{s.done && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>
                        <span className="text-[13px] font-semibold flex-1 min-w-0 break-words" style={{ color: s.done ? '#9AA39D' : '#16211E', textDecoration: s.done ? 'line-through' : 'none' }}>{s.name}</span>
                        {!s.done && <DdayBadge d={s.deadline} />}
                        <button onClick={() => kbDel(col, s.id)} className="text-neutral-300 hover:text-red-500 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="삭제">×</button>
                      </div>
                      <div className="mt-1 ml-6">
                        <input type="date" value={s.deadline ?? ''} onChange={e => kbSetTaskDue(col, s, e.target.value)} title="task 기한" className="text-[10px] tabular-nums bg-white border rounded px-1 py-0.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }} />
                      </div>
                      {units.length > 0 && (
                        <div className="mt-1.5 ml-5 space-y-0.5">
                          {units.map(u => (
                            <div key={u.id} className="group/u flex items-center gap-1.5">
                              <button onClick={() => kbToggleUnit(col, s, u.id)} className="flex items-center gap-1.5 text-left flex-1 min-w-0">
                                <span className="w-3 h-3 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: u.done ? '#5EA63A' : '#C7CEC7', backgroundColor: u.done ? '#5EA63A' : 'transparent' }}>{u.done && <svg className="w-2 h-2" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                                <span className="text-[11px] truncate" style={{ color: u.done ? '#9AA39D' : '#5B6560', textDecoration: u.done ? 'line-through' : 'none' }}>{u.name}</span>
                              </button>
                              {u.durationMin ? <span className="text-[10px] flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtDur(u.durationMin)}</span> : null}
                              <button onClick={() => kbDelUnit(col, s, u.id)} className="text-neutral-300 hover:text-red-500 text-[11px] flex-shrink-0 opacity-0 group-hover/u:opacity-100 transition-opacity" title="삭제">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => kbAddUnit(col, s)} className="mt-1 ml-5 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#9AA39D' }}>+ 세부 작업</button>
                    </div>
                  );
                })}
                <div className="flex gap-1.5">
                  <button onClick={() => kbAddTask(col)} className="flex-1 py-1.5 rounded-lg border-2 border-dashed text-[12px] font-semibold transition-colors hover:bg-white" style={{ borderColor: 'var(--spira-border)', color: '#9AA39D' }}>+ task</button>
                  <button onClick={() => kbAiTasks(col)} disabled={!!kbAiBusy} title="AI로 이 산출물의 task 생성" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-colors flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>
                    {kbAiBusy === col.todoId
                      ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>}
                    AI
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        )
      ) : (
      /* 간트: 좌측 트리(고정) + 우측 타임라인(연속 가로/세로 스크롤) */
      <div ref={scrollRef} onScroll={e => updateVisLabel(e.currentTarget)} className="flex-1 min-h-0 overflow-auto overscroll-contain border rounded-xl" style={{ borderColor: 'var(--spira-border-subtle)' }} onDragOver={e => { if (dragPayloadRef.current) e.preventDefault(); }} onDrop={onTrackDrop}>
        <div className="relative" style={{ width: LABEL_W + contentWidth }}>
          {/* 헤더 */}
          <div className="flex sticky top-0 z-20" style={{ height: HEAD_H }}>
            <div className="sticky left-0 z-30 bg-white flex items-center px-3 border-r border-b" style={{ width: LABEL_W, borderColor: '#F0F0EA' }}><span className="text-[11px] font-bold" style={{ color: '#9AA39D' }}>목표 · 프로젝트 · 산출물 · task</span></div>
            <div ref={timelineRef} className="relative bg-white border-b" style={{ width: contentWidth, borderColor: '#F0F0EA' }}>
              {labels.map((t, i) => <div key={i} className="absolute top-2 text-[10px] font-medium whitespace-nowrap" style={{ left: t.x, color: '#9AA39D', transform: 'translateX(3px)' }}>{t.text}</div>)}
            </div>
          </div>
          {/* 본문 */}
          <div className="relative">
            {/* 배경: 그리드/오늘 (타임라인 영역) */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: LABEL_W, width: contentWidth }}>
              {dayLines.map((x, i) => <div key={`d${i}`} className="absolute top-0 bottom-0 w-px" style={{ left: x, backgroundColor: '#EEEEE8' }} />)}
              {strongLines.map((x, i) => <div key={`s${i}`} className="absolute top-0 bottom-0 w-px" style={{ left: x, backgroundColor: '#E2E2DA' }} />)}
              {todayStr >= rangeStart && daysBetween(rangeStart, todayStr) < span && <div className="absolute top-0 bottom-0 w-px" style={{ left: todayX, backgroundColor: '#9DFE3B' }} />}
            </div>
            {rowsDraw.length === 0 ? (
              <div className="flex"><div className="sticky left-0 bg-white" style={{ width: LABEL_W }} /><p className="text-[12px] py-8 px-4" style={{ color: '#9AA39D' }}>항목이 없어요. 오른쪽 위 ‘추가’로 만들어보세요.</p></div>
            ) : rowsDraw.map(r => {
              const pgIdx0 = pgOrder.get(r.pgKey) ?? 0;
              if (r.isAdd) return (
                <div key={r.key} className="flex" style={{ height: ROW_H - 6, backgroundColor: pgIdx0 % 2 === 1 ? '#FBFBF9' : 'transparent' }}>
                  <div className="sticky left-0 z-20 flex items-center border-b" style={{ width: LABEL_W, paddingLeft: 8 + r.level * 15 + 20, borderColor: '#F4F4F0', backgroundColor: pgIdx0 % 2 === 1 ? '#FBFBF9' : '#fff' }}>
                    <button onClick={() => addSpecific(r)} className="flex items-center gap-1 text-[11px] font-semibold rounded-md px-1.5 py-0.5 transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title={`${CHILD_NAME[r.addKind!]} 추가`}>
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>{CHILD_NAME[r.addKind!]} 추가
                    </button>
                  </div>
                  <div className="relative" style={{ width: contentWidth }} />
                </div>
              );
              const placed = !!(r.start && r.end);
              const isCollapsed = !isOpen(r.key, r.level);
              const sel = r.key === selectedKey;
              const pgIdx = pgIdx0;
              const left = placed ? xOf(r.start!) : 0;
              const width = placed ? wOf(r.start!, r.end!) : 0;
              const dragging = calDrag?.key === r.key;
              return (
                <div key={r.key} data-rm-row={r.key} className="flex" style={{ height: ROW_H, backgroundColor: pgIdx % 2 === 1 ? '#FBFBF9' : 'transparent' }}>
                  <div
                    onClick={() => enterLevel(r)}
                    className="group sticky left-0 z-20 flex items-center gap-1 pr-2 border-b cursor-pointer"
                    style={{ width: LABEL_W, paddingLeft: 8 + r.level * 15, borderColor: '#F4F4F0', backgroundColor: sel ? '#EAF7DA' : pgIdx % 2 === 1 ? '#FBFBF9' : '#fff' }}
                    draggable={r.level > 0 && !placed}
                    onDragStart={r.level > 0 && !placed ? e => { e.stopPropagation(); startListDrag({ level: r.kind, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, subtaskId: r.subtaskId, unitId: r.unitId }, e); } : undefined}
                    title={!placed && r.level > 0 ? '드래그해서 타임라인에 배치' : r.name}
                  >
                    {r.hasChildren ? (
                      <button onClick={e => { e.stopPropagation(); toggleOpen(r.key, r.level); }} className="w-4 h-4 flex items-center justify-center flex-shrink-0" title={isCollapsed ? '하위 펼치기' : '하위 접기'}><svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}><path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                    ) : <span className="w-4 flex-shrink-0" />}
                    <span className="rounded-full flex-shrink-0" style={{ width: r.level === 0 ? 8 : 6, height: r.level === 0 ? 8 : 6, backgroundColor: r.color, opacity: r.level >= 2 ? 0.6 : 1 }} />
                    <span className="truncate flex-1 min-w-0" style={{ fontSize: r.level === 0 ? 13 : 12, fontWeight: r.level === 0 ? 800 : r.level === 1 ? 600 : 400, color: r.level >= 2 ? '#5B6560' : '#16211E' }}>{r.name}</span>
                    {!placed && r.level > 0 && <span className="text-[9px] flex-shrink-0" style={{ color: '#C4A24A' }}>미배치</span>}
                    <button onClick={e => { e.stopPropagation(); delRow(r); }} className="text-neutral-300 hover:text-red-500 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="삭제">×</button>
                  </div>
                  <div className="relative" style={{ width: contentWidth }}>
                    {placed && (
                      <div data-rm-bar={r.key} onMouseDown={e => startCalDrag(r, 'move', e)} onClick={() => { if (movedRef.current) { movedRef.current = false; return; } enterLevel(r); }}
                        className="group/bar absolute top-1/2 -translate-y-1/2 rounded-lg border flex items-center cursor-pointer overflow-hidden"
                        style={{ left, width: Math.max(width, 6), height: barH(r.level), backgroundColor: `${r.color}${r.level === 0 ? '3A' : r.level === 1 ? '2A' : r.level === 2 ? '1C' : r.level === 3 ? '16' : '12'}`, borderColor: r.color, opacity: dragging ? 0.95 : 1, boxShadow: sel ? `0 0 0 2px #fff, 0 0 0 3px ${r.color}` : '0 1px 2px rgba(0,0,0,0.04)', zIndex: sel ? 5 : 1 }}
                        title={`${r.name} — 클릭: 하위 단계로 · 드래그: 이동${r.level > 0 ? ' · 양끝: 기간 조절' : ''}`}>
                        <span className="truncate px-2 pointer-events-none" style={{ fontSize: r.level <= 1 ? 11 : 10, fontWeight: r.level === 0 ? 800 : r.level === 1 ? 700 : 500, color: '#16211E' }}>{r.name}</span>
                        {r.level > 0 && <>
                          <div onMouseDown={e => startCalDrag(r, 'resize-start', e)} onClick={e => e.stopPropagation()} className="absolute left-0 top-0 bottom-0 w-2 flex items-center justify-center cursor-ew-resize z-20" title="시작일 조절"><span className="w-1 h-3 rounded-full" style={{ backgroundColor: r.color }} /></div>
                          <div onMouseDown={e => startCalDrag(r, 'resize-end', e)} onClick={e => e.stopPropagation()} className="absolute right-0 top-0 bottom-0 w-2 flex items-center justify-center cursor-ew-resize z-20" title="완료일 조절"><span className="w-1 h-3 rounded-full" style={{ backgroundColor: r.color }} /></div>
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); clearSchedule(r); }} className="absolute right-0.5 top-0.5 z-30 w-3.5 h-3.5 rounded-full bg-neutral-400 hover:bg-neutral-600 text-white flex items-center justify-center text-[9px] leading-none opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-pointer" title="일정만 삭제(내용 유지)">×</button>
                        </>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* task / 세부작업 추가 팝업 */}
      {kbForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setKbForm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[360px] p-5" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-black" style={{ color: '#16211E' }}>{kbForm.mode === 'task' ? 'task 추가' : '세부 작업 추가'}</h3>
              <button onClick={() => setKbForm(null)} className="text-neutral-300 hover:text-neutral-700 text-lg leading-none">×</button>
            </div>
            <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>이름</label>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) kbSubmitForm(); }}
              placeholder={kbForm.mode === 'task' ? '예: 메인 화면 시안 디자인' : '예: 아이콘 세트 정리'}
              className="w-full mt-1 mb-3 bg-neutral-50 border rounded-xl px-3 py-2 text-[14px] outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
            {kbForm.mode === 'task' ? (
              <>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>기한 (선택)</label>
                <input type="date" value={formDue} onChange={e => setFormDue(e.target.value)} className="w-full mt-1 mb-4 bg-neutral-50 border rounded-xl px-3 py-2 text-[14px] tabular-nums outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              </>
            ) : (
              <>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>소요 시간 (분, 선택)</label>
                <input type="number" min={0} value={formDur} onChange={e => setFormDur(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') kbSubmitForm(); }} placeholder="예: 30" className="w-full mt-1 mb-4 bg-neutral-50 border rounded-xl px-3 py-2 text-[14px] tabular-nums outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => setKbForm(null)} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>취소</button>
              <button onClick={kbSubmitForm} disabled={!formName.trim()} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default GoalsRoadmap;
