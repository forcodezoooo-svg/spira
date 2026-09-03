'use client';
import { useState, useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { useToast } from '../lib/ToastContext';
import { uid } from '../lib/store';
import type { Program, ProjectStatus } from '../lib/types';
import ActualTimeModal from './ActualTimeModal';
import { areaFactor, scheduleTasksByCapacity, scheduleParallel, ParallelGroup, ParallelTask } from '../lib/capacity';

// Goals 간트 로드맵 — 좌측 트리(사업목표 › 프로젝트 › 영역별 산출물 › task)와 우측 타임라인을 1:1 정렬.
// 가로 시간축은 연/월/주/일/시로 확대·축소하며 '연속 스크롤'(윈도우 제한 없음).
// 큰 '추가' 버튼은 현재 스케일에 맞는 depth로 항목을 추가(부모=선택 항목 계보). (Goals 전용)

type Scale = 'year' | 'month' | 'week';
type Lvl = 'program' | 'deadline' | 'todo' | 'subtask' | 'unit';
type CalProgram = Program & { wsId: string; wsName?: string };
type Deadline = NonNullable<Program['deadlines']>[number];
type Payload = { level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string };
type Row = { key: string; level: 0 | 1 | 2 | 3 | 4; kind: Lvl; name: string; subName?: string; start?: string; end?: string; color: string; hasChildren: boolean; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string; pgKey: string; isAdd?: boolean; addKind?: Lvl };
type SelItem = { key: string; kind: Lvl; name: string; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string; deadline?: string; durationMin?: number };
type BulkPatch = { name?: string; deadline?: string; durationMin?: number };

export interface GoalsRoadmapHandle { focus: (level: Lvl, key: string, start?: string, end?: string, name?: string) => void; startListDrag: (payload: Payload, e: React.DragEvent) => void; }
interface Props { programs: CalProgram[]; businessColor: (wsId: string) => string; resolveProject: (wsId: string, id?: string) => { name: string; status?: string } | null; cardClassName?: string; }

const LABEL_W = 240;
const ROW_H = 34;
// 프로젝트 상태 표시(예정/진행중/완료/보류)
const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  planned: { label: '예정', bg: '#EEF1F4', color: '#5B6560' },
  active: { label: '진행중', bg: '#E7F0FF', color: '#2B62C4' },
  done: { label: '완료', bg: '#E4F5E0', color: '#3E6B1F' },
  onhold: { label: '보류', bg: '#FBF3E0', color: '#96631A' },
};
const HEAD_H = 30;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
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
  const { toast } = useToast();
  const router = useRouter();
  const schedule = store.workSchedule;
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dstr = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const todayStr = dstr(now.getFullYear(), now.getMonth(), now.getDate());
  const addDaysStr = (ds: string, n: number) => { const d = new Date(ds); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  // html{zoom} 보정: fixed 팝업은 zoom 안에서 다시 배율되어 clientX/Y보다 밀리므로 좌표를 zoom으로 나눈다.
  const htmlZoom = () => { if (typeof window === 'undefined') return 1; const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1'); return z && !isNaN(z) && z > 0.5 && z < 3 ? z : 1; };
  const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const [pxPerDay, setPxPerDay] = useState(20); // 날짜 간격(줌). 연/월/주 구분 대신 연속 줌
  const ZMIN = 3, ZMAX = 110;
  const gran: Scale = pxPerDay < 8 ? 'year' : pxPerDay < 40 ? 'month' : 'week'; // 줌 정도에 따라 눈금/라벨 밀도만 결정
  const [kanban, setKanban] = useState(false); // 칸반 탭 여부
  const [sortMode, setSortMode] = useState<'dday' | 'business'>('business'); // 로드맵 정렬: 디데이순 / 비즈니스별
  const [ctxMenu, setCtxMenu] = useState<{ r: Row; x: number; y: number; days: number; start: string } | null>(null); // 우클릭 시작일·소요일 입력
  const [linkFrom, setLinkFrom] = useState<string | null>(null); // 막대 연결: 선행 산출물(todo) id 선택 중
  const [editingKey, setEditingKey] = useState<string | null>(null); // 리스트 이름 인라인 편집 중인 행
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
  const [kbDragOver, setKbDragOver] = useState<{ todoId: string; index: number } | null>(null); // 삽입 위치 표시(카테고리 todoId + 인덱스)
  const [kbAiBusy, setKbAiBusy] = useState<string | null>(null); // AI task 생성 중인 산출물(todoId)
  const [kbUnitAiBusy, setKbUnitAiBusy] = useState<string | null>(null); // AI 세부작업 생성 중인 task(subtaskId)
  const [selMode, setSelMode] = useState(false); // 다중 선택 모드
  const [sel, setSel] = useState<Map<string, SelItem>>(new Map());
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggleSel = (it: SelItem) => setSel(prev => { const n = new Map(prev); n.has(it.key) ? n.delete(it.key) : n.set(it.key, it); return n; });
  const [kbForm, setKbForm] = useState<null | { mode: 'task' | 'subtask'; col: KbCol; s?: Sub; editUnitId?: string; editTaskId?: string }>(null); // task/세부작업 추가·수정 팝업
  const [formName, setFormName] = useState('');
  const [formDur, setFormDur] = useState(''); // 세부작업 소요 시간(분)
  const [formType, setFormType] = useState<'fixed' | 'due' | 'flexible'>('flexible'); // task 일정 성격
  const [formPriority, setFormPriority] = useState(2); // task 우선순위 (1낮음~4긴급)
  const [formDeps, setFormDeps] = useState<string[]>([]); // 선행 task id 목록
  const [formDays, setFormDays] = useState<number[]>([]); // 매주 반복 요일 (비어있으면 단발)
  const [actualTarget, setActualTarget] = useState<{ col: KbCol; s: Sub } | null>(null); // 완료 시 실제시간 입력
  const [catPanel, setCatPanel] = useState(false); // 새 카테고리 추가/템플릿 패널
  const [kbBiz, setKbBiz] = useState<string | null>(null); // Task 보드 비즈니스 필터 (null=전체)
  const [kbFlat, setKbFlat] = useState(false); // Task 보드 뷰: false=업무영역별, true=날짜순 목록
  const [areaPanel, setAreaPanel] = useState(false); // 업무 영역 관리 모달
  const [areaPanelWs, setAreaPanelWs] = useState<string | null>(null); // 관리 중인 비즈니스(null=첫번째)
  const [newAreaName, setNewAreaName] = useState('');
  const [groupSaveOpen, setGroupSaveOpen] = useState(false); // 그룹 저장: 카테고리 선택 모달
  const [groupSelIds, setGroupSelIds] = useState<Set<string>>(new Set()); // 선택된 카테고리 todoId
  const [groupSaveName, setGroupSaveName] = useState('');
  const [catName, setCatName] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);
  const maxDepth = 2; // 줌과 무관하게 전체 트리(목표>프로젝트>산출물)를 기본 펼침, 화살표로 접기
  const isOpen = (key: string, level: number) => (openMap.has(key) ? openMap.get(key)! : level < maxDepth); // 화살표로 오버라이드 가능
  const toggleOpen = (key: string, level: number) => setOpenMap(prev => { const n = new Map(prev); n.set(key, !(prev.has(key) ? prev.get(key)! : level < maxDepth)); return n; });

  type DragTarget = { key: string; level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string; start: string; end: string };
  const [calDrag, setCalDrag] = useState<(DragTarget & { mode: 'move' | 'resize-start' | 'resize-end'; grabDate: string; origStart: string; origEnd: string }) | null>(null);
  const calDragRef = useRef(calDrag); calDragRef.current = calDrag;
  const movedRef = useRef(false); // 막대 드래그가 실제로 이동했는지(클릭과 구분)
  const dragPayloadRef = useRef<Payload | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null); // 로드맵 본문(막대 영역) — 연결선 좌표 측정용
  const [connLines, setConnLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  const cfg = CFG[gran]; // buffer/minSpan만 gran에서, pxPerDay는 연속 줌 값 사용

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
  const contentWidth = span * pxPerDay;
  const xOf = (d: string) => daysBetween(rangeStart, d) * pxPerDay;
  const wOf = (s: string, e: string) => (daysBetween(s, e) + 1) * pxPerDay;
  const dateFromClientX = (x: number): string | null => { const r = timelineRef.current?.getBoundingClientRect(); if (!r) return null; const di = Math.floor((x - r.left) / pxPerDay); return addDaysStr(rangeStart, clampN(di, 0, span - 1)); };

  // ── 배치 범위 제한 ──
  type Bounds = { min?: string; max?: string };
  const findProg = (wsId: string, programId: string) => store.allWorkspacesEntries.find(e => e.workspace.id === wsId)?.programs.find(x => x.id === programId);
  const boundsForTarget = (t: { level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string }): Bounds | null => {
    const p = findProg(t.wsId, t.programId);
    if (t.level === 'deadline') return { min: p?.startDate || undefined, max: p?.deadline || undefined };
    if (t.level === 'todo') return null; // 산출물은 자유롭게 이동/조절 — 상위 프로젝트 기간이 산출물에 맞춰 자동 확장됨
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

  // 막대 기간 적용(공용): 프로젝트(deadline)는 원래 범위→새 범위로 하위 산출물/task를 비례 스케일(이동·축소·확대 함께),
  // 산출물(todo)은 자기 기간만 바꾸고 상위 프로젝트를 전체 범위로 자동 확장. (드래그·우클릭 소요일 입력 공용)
  const applyBarRange = (
    t: { level: Lvl; wsId: string; programId: string; deadlineId?: string; todoId?: string; subtaskId?: string; unitId?: string },
    newStart: string, newEnd: string, origStart: string, origEnd: string,
  ) => {
    const prog = findProg(t.wsId, t.programId); if (!prog) return;
    const oSpan = daysBetween(origStart, origEnd);
    const nSpan = daysBetween(newStart, newEnd);
    const mapDate = (x?: string) => {
      if (!x) return x;
      if (oSpan <= 0) return addDaysStr(x, daysBetween(origStart, newStart)); // 폭 0이면 단순 이동
      const off = daysBetween(origStart, x);
      return addDaysStr(newStart, Math.round((off * nSpan) / oSpan));
    };
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== t.deadlineId) return dl;
      if (t.level === 'deadline') {
        return { ...dl, startDate: newStart, date: newEnd, todos: dl.todos.map(td => ({ ...td, date: mapDate(td.date), deadline: mapDate(td.deadline), subtasks: (td.subtasks ?? []).map(s => ({ ...s, date: mapDate(s.date), deadline: mapDate(s.deadline), units: (s.units ?? []).map(u => ({ ...u, date: mapDate(u.date), deadline: mapDate(u.deadline) })) })) })) };
      }
      const newTodos = dl.todos.map(td => {
        if (td.id !== t.todoId) return td;
        if (t.level === 'todo') return { ...td, date: newStart, deadline: newEnd };
        return { ...td, subtasks: (td.subtasks ?? []).map(s => {
          if (s.id !== t.subtaskId) return s;
          if (t.level === 'subtask') return { ...s, date: newStart, deadline: newEnd };
          return { ...s, units: (s.units ?? []).map(u => u.id === t.unitId ? { ...u, date: newStart, deadline: newEnd } : u) };
        }) };
      });
      if (t.level === 'todo') {
        const tds = newTodos.flatMap(x => [x.date, x.deadline]).filter((x): x is string => !!x);
        if (tds.length) { const minT = tds.reduce((a, b) => (a < b ? a : b)); const maxT = tds.reduce((a, b) => (a > b ? a : b)); return { ...dl, startDate: minT, date: maxT, todos: newTodos }; }
      }
      return { ...dl, todos: newTodos };
    });
    store.updateProgramInWs(t.wsId, { ...prog, deadlines });
  };

  // 우클릭 → 시작 날짜 + 소요 일수 함께 적용: 새 시작일부터 N일. 프로젝트면 하위도 함께 스케일/이동.
  const setBarRange = (r: Row, start: string, days: number) => {
    if (!start) return;
    const newEnd = addDaysStr(start, Math.max(0, Math.round(days) - 1));
    applyBarRange({ level: r.kind, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, subtaskId: r.subtaskId, unitId: r.unitId }, start, newEnd, r.start ?? start, r.end ?? start);
  };

  // 리스트에서 프로젝트(데드라인)·산출물(todo) 이름 변경
  const renameRow = (r: Row, name: string) => {
    const nm = name.trim(); if (!nm) return;
    const prog = findProg(r.wsId, r.programId); if (!prog) return;
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== r.deadlineId) return dl;
      if (r.kind === 'deadline') return { ...dl, name: nm };
      return { ...dl, todos: dl.todos.map(td => td.id === r.todoId ? { ...td, name: nm } : td) };
    });
    store.updateProgramInWs(r.wsId, { ...prog, deadlines });
  };

  const commitCalDrag = () => {
    const d = calDragRef.current; setCalDrag(null);
    if (!d || (d.start === d.origStart && d.end === d.origEnd)) return;
    const prog = findProg(d.wsId, d.programId); if (!prog) return;
    // 프로젝트·산출물 막대: 공용 적용(프로젝트는 하위 비례 스케일로 함께 이동/축소)
    if (d.level === 'deadline' || d.level === 'todo') { applyBarRange(d, d.start, d.end, d.origStart, d.origEnd); return; }
    const delta = daysBetween(d.origEnd, d.end);
    const shift = (x?: string) => (x ? addDaysStr(x, delta) : x);
    const shSub = (s: NonNullable<Deadline['todos'][number]['subtasks']>[number]) => ({ ...s, date: shift(s.date), deadline: shift(s.deadline), units: (s.units ?? []).map(u => ({ ...u, date: shift(u.date), deadline: shift(u.deadline) })) });
    if (d.level === 'program') { store.updateProgramInWs(d.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => ({ ...dl, date: shift(dl.date) ?? dl.date, startDate: shift(dl.startDate), todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline), subtasks: (t.subtasks ?? []).map(shSub) })) })) }); return; }
    const deadlines = (prog.deadlines ?? []).map(dl => {
      if (dl.id !== d.deadlineId) return dl;
      if (d.level === 'deadline') { if (d.mode === 'move') return { ...dl, date: d.end, startDate: d.start, todos: dl.todos.map(t => ({ ...t, date: shift(t.date), deadline: shift(t.deadline), subtasks: (t.subtasks ?? []).map(shSub) })) }; if (d.mode === 'resize-end') return { ...dl, date: d.end }; return { ...dl, startDate: d.start }; }
      const newTodos = dl.todos.map(t => {
        if (t.id !== d.todoId) return t;
        if (d.level === 'todo') { if (d.mode === 'move') return { ...t, date: d.start, deadline: d.end, subtasks: (t.subtasks ?? []).map(shSub) }; if (d.mode === 'resize-end') return { ...t, deadline: d.end }; return { ...t, date: d.start }; }
        return { ...t, subtasks: (t.subtasks ?? []).map(s => {
          if (s.id !== d.subtaskId) return s;
          if (d.level === 'subtask') { if (d.mode === 'move') return { ...s, date: d.start, deadline: d.end, units: (s.units ?? []).map(u => ({ ...u, date: shift(u.date), deadline: shift(u.deadline) })) }; if (d.mode === 'resize-end') return { ...s, deadline: d.end }; return { ...s, date: d.start }; }
          return { ...s, units: (s.units ?? []).map(u => { if (u.id !== d.unitId) return u; if (d.mode === 'move') return { ...u, date: d.start, deadline: d.end }; if (d.mode === 'resize-end') return { ...u, deadline: d.end }; return { ...u, date: d.start }; }) };
        }) };
      });
      // 산출물(todo) 기간이 바뀌면 상위 프로젝트(데드라인) 기간을 산출물 전체 범위로 자동 조정
      if (d.level === 'todo') {
        const tds = newTodos.flatMap(t => [t.date, t.deadline]).filter((x): x is string => !!x);
        if (tds.length) {
          const minT = tds.reduce((a, b) => (a < b ? a : b));
          const maxT = tds.reduce((a, b) => (a > b ? a : b));
          return { ...dl, startDate: minT, date: maxT, todos: newTodos };
        }
      }
      return { ...dl, todos: newTodos };
    });
    store.updateProgramInWs(d.wsId, { ...prog, deadlines });
  };
  const startCalDrag = (r: Row, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    if (e.button !== 0) return; // 우클릭(소요일 입력) 등은 드래그 시작 안 함
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
    if (!window.confirm(`${offStart} ~ ${offEnd} (${days}일)을 오프 기간으로 설정할까요?\n\n이 기간 시작일 이후의 모든 프로젝트 일정이 ${days}일씩 뒤로 밀리고,\n캘린더·로드맵에 오프(휴무)로 표시됩니다.`)) return;
    store.shiftAllSchedulesAfter(offStart, days);
    store.setOffPeriod(offStart, offEnd, true); // 오프 날짜를 휴무(가용 0)로 기록 → 캘린더·로드맵 표시 + 스케줄 회피
    setOffOpen(false); setOffStart(''); setOffEnd('');
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
  // 카테고리 보드 진입 시 가로 스크롤을 맨 왼쪽으로 + 뷰 전환 시 선택 초기화
  // (selectedKey를 비워 특정 항목으로 스코프가 좁혀져 다른 카테고리가 안 보이는 문제 방지 — 보드는 항상 전체 카테고리 표시)
  useEffect(() => { if (kanban) { if (boardRef.current) boardRef.current.scrollLeft = 0; setSelectedKey(null); } setSel(new Map()); setSelMode(false); }, [kanban]);

  // Goals 티칭 투어: 카테고리 보드 뷰 전환 / 우클릭 팝업 닫기 요청
  useEffect(() => {
    const onKbView = () => { setKanban(true); setCtxMenu(null); };
    const onCloseCtx = () => setCtxMenu(null);
    window.addEventListener('spira-teach:kb-view', onKbView);
    window.addEventListener('spira-teach:close-ctx', onCloseCtx);
    return () => { window.removeEventListener('spira-teach:kb-view', onKbView); window.removeEventListener('spira-teach:close-ctx', onCloseCtx); };
  }, []);

  // 선택 항목들에 일괄 패치 적용 (레벨별로 올바른 필드에)
  const applyBulkPatches = (upList: { key: string; patch: BulkPatch }[]) => {
    const groups = new Map<string, { wsId: string; programId: string; ups: Map<string, BulkPatch> }>();
    for (const { key, patch } of upList) { const it = sel.get(key); if (!it) continue; const gk = `${it.wsId}|${it.programId}`; let g = groups.get(gk); if (!g) { g = { wsId: it.wsId, programId: it.programId, ups: new Map() }; groups.set(gk, g); } g.ups.set(key, patch); }
    for (const g of groups.values()) {
      const prog = findProg(g.wsId, g.programId); if (!prog) continue;
      const ups = g.ups;
      let np = prog;
      const pp = ups.get(`p-${prog.id}`);
      if (pp) np = { ...np, ...(pp.name !== undefined ? { name: pp.name } : {}), ...(pp.deadline !== undefined ? { deadline: pp.deadline } : {}) };
      np = { ...np, deadlines: (np.deadlines ?? []).map(dl => {
        let d = dl; const dp = ups.get(`d-${dl.id}`);
        if (dp) d = { ...d, ...(dp.name !== undefined ? { name: dp.name } : {}), ...(dp.deadline !== undefined ? { date: dp.deadline } : {}) };
        return { ...d, todos: d.todos.map(t => {
          let tt = t; const tp = ups.get(`t-${t.id}`);
          if (tp) tt = { ...tt, ...(tp.name !== undefined ? { name: tp.name } : {}), ...(tp.deadline !== undefined ? { deadline: tp.deadline } : {}) };
          return { ...tt, subtasks: (tt.subtasks ?? []).map(s => {
            let ss = s; const sp = ups.get(`s-${s.id}`);
            if (sp) ss = { ...ss, ...(sp.name !== undefined ? { name: sp.name } : {}), ...(sp.deadline !== undefined ? { deadline: sp.deadline } : {}) };
            return { ...ss, units: (ss.units ?? []).map(u => { const up = ups.get(`u-${u.id}`); return up ? { ...u, ...(up.name !== undefined ? { name: up.name } : {}), ...(up.durationMin !== undefined ? { durationMin: up.durationMin } : {}) } : u; }) };
          }) };
        }) };
      }) };
      store.updateProgramInWs(g.wsId, np);
    }
  };

  const centerDateRef = useRef(todayStr); // 현재 화면 중앙 날짜
  const leftDateRef = useRef(todayStr); // 현재 화면 왼쪽 끝 날짜 (줌 시 이 날짜를 왼쪽에 고정)
  // 최초 진입 시: 제일 가까운(임박한) 프로젝트 시작일을 왼쪽에 배치 (없으면 오늘)
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const starts: string[] = [];
    for (const p of programs) for (const dl of (p.deadlines ?? [])) { if (!dlVisible(p.wsId, dl)) continue; const s = dlPeriod(p, dl).start; if (s) starts.push(s); }
    const upcoming = starts.filter(s => s >= todayStr).sort();
    const anchor = upcoming[0] ?? (starts.length ? [...starts].sort().slice(-1)[0] : todayStr);
    el.scrollLeft = Math.max(0, xOf(anchor) - 32);
    centerDateRef.current = anchor;
    updateVisLabel(el);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 리스트 항목 클릭 등으로 scrollTarget이 잡히면 그 위치로 스무스 스크롤 (완료 후 초기화 — 오늘로 되돌아가지 않음)
  useEffect(() => {
    if (!scrollTarget) return;
    const el = scrollRef.current; if (!el) return;
    // 클릭한 항목을 라벨 열 바로 오른쪽(왼쪽 가까이)에 배치 — 중앙 정렬 대신 살짝 여백만
    el.scrollTo({ left: Math.max(0, xOf(scrollTarget) - 32), behavior: 'smooth' });
    updateVisLabel(el);
    setScrollTarget(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget]);
  // 줌 변경 시: 화면 왼쪽 끝 날짜를 그대로 왼쪽에 고정 (오른쪽으로 밀리지 않게)
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    el.scrollLeft = Math.max(0, xOf(leftDateRef.current));
    updateVisLabel(el);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerDay]);
  // 트랙패드 핀치 / Ctrl+휠 → 로드맵 줌인·아웃 (날짜 간격 조절)
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // macOS 트랙패드 핀치는 ctrlKey+wheel로 전달됨
      e.preventDefault();
      const dy = clampN(e.deltaY, -30, 30); // 마우스 휠 한 칸이 과하게 튀지 않게 제한
      setPxPerDay(v => clampN(v * Math.exp(-dy * 0.012), ZMIN, ZMAX));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanban]);
  const fmtVis = (d: string) => { const dd = new Date(d); return gran === 'year' ? `${dd.getFullYear()}년` : gran === 'week' ? `${dd.getFullYear()}년 ${dd.getMonth() + 1}월 ${dd.getDate()}일` : `${dd.getFullYear()}년 ${dd.getMonth() + 1}월`; };
  const updateVisLabel = (el: HTMLDivElement) => { const centerX = el.scrollLeft + el.clientWidth / 2 - LABEL_W; const di = clampN(Math.floor(centerX / pxPerDay), 0, span - 1); const cd = addDaysStr(rangeStart, di); centerDateRef.current = cd; leftDateRef.current = addDaysStr(rangeStart, clampN(Math.round(el.scrollLeft / pxPerDay), 0, span - 1)); setVisLabel(fmtVis(cd)); };
  const scrollByScreen = (dir: -1 | 1) => { const el = scrollRef.current; if (!el) return; el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' }); };
  const scrollToToday = () => { const el = scrollRef.current; if (!el) return; el.scrollTo({ left: Math.max(0, xOf(todayStr) - el.clientWidth / 2), behavior: 'smooth' }); };
  // 라벨/막대 클릭 → 그 항목 선택 + 해당 시점으로 스크롤 (줌은 그대로 유지)
  const enterLevel = (r: Row) => { setSelectedKey(r.key); setScrollTarget(r.start ?? r.end ?? null); };

  // ── 트리 → 행 ──
  // 완료 처리된 프로젝트 숨김: 데드라인 done 또는 Plan 프로젝트 상태가 done
  const dlVisible = (wsId: string, dl: Deadline) => dl.enabled !== false && !dl.done && !(dl.projectId && resolveProject(wsId, dl.projectId)?.status === 'done');
  const progPeriod = (p: CalProgram) => { const dls = (p.deadlines ?? []).filter(dl => dlVisible(p.wsId, dl)); const ds = dls.flatMap(dl => [dl.startDate, dl.date, ...dl.todos.flatMap(t => [t.date, t.deadline, ...(t.subtasks ?? []).flatMap(s => [s.date, s.deadline, ...(s.units ?? []).flatMap(u => [u.date, u.deadline])])])]).filter((x): x is string => !!x); if (!ds.length) return {}; const s = [...ds].sort(); return { start: s[0], end: s[s.length - 1] }; };
  const dlPeriod = (p: CalProgram, dl: Deadline) => { const todos = dl.todos ?? []; if (!dl.date) { const ts = todos.flatMap(t => [t.date, t.deadline]).filter((x): x is string => !!x); return ts.length ? { start: ts.sort()[0], end: ts.sort().slice(-1)[0] } : {}; } const ts = todos.map(t => t.date).filter((x): x is string => !!x); let start = dl.startDate || (ts.length ? ts.sort()[0] : (p.startDate || dl.date)); if (start > dl.date) start = dl.date; return { start, end: dl.date }; };
  void progPeriod; // 사업목표 행 숨김으로 미사용
  // 로드맵 정렬: 디데이순(가까운 마감 먼저) / 비즈니스별(같은 사업끼리)
  const progNearestDue = (p: CalProgram) => { const ds = (p.deadlines ?? []).filter(dl => dlVisible(p.wsId, dl) && dl.date).map(dl => dl.date); return ds.length ? [...ds].sort()[0] : '9999-99-99'; };
  const roadmapPrograms = sortMode === 'dday'
    ? [...programs].sort((a, b) => progNearestDue(a).localeCompare(progNearestDue(b)))
    : [...programs].sort((a, b) => (a.wsName ?? a.wsId).localeCompare(b.wsName ?? b.wsId));
  const rows: Row[] = [];
  if (sortMode === 'dday') {
    // 시작일순: 프로젝트 구분 없이 '업무영역별 산출물'을 시작일 빠른 순으로 평면 나열.
    // 산출물이 1차 정보, 프로젝트명은 부가 설명(subName)으로 표시.
    const flat: (Row & { due: string })[] = [];
    for (const p of roadmapPrograms) {
      const pColor = businessColor(p.wsId); const pgKey = `p-${p.id}`;
      for (const dl of (p.deadlines ?? []).filter(d => dlVisible(p.wsId, d))) {
        for (const t of dl.todos.filter(t => !t.done)) {
          const ts = t.date || t.deadline, te = t.deadline || t.date;
          // 시작일 기준 정렬 — 산출물 시작일 우선, 없으면 상위 프로젝트 시작일로 폴백
          const due = t.date || t.deadline || dl.startDate || dl.date || '9999-99-99';
          flat.push({ key: `t-${t.id}`, level: 1, kind: 'todo', name: t.name, subName: dl.name, start: ts && te ? (ts > te ? te : ts) : undefined, end: te || ts, color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, pgKey, due });
        }
      }
    }
    flat.sort((a, b) => a.due.localeCompare(b.due));
    for (const f of flat) { const { due: _due, ...r } = f; void _due; rows.push(r); }
  } else {
  for (const p of roadmapPrograms) {
    const pColor = businessColor(p.wsId); const pgKey = `p-${p.id}`;
    const dls = (p.deadlines ?? []).filter(dl => dlVisible(p.wsId, dl))
      .sort((a, b) => (dlPeriod(p, a).start || a.date || '9999-99-99').localeCompare(dlPeriod(p, b).start || b.date || '9999-99-99')); // 시작일 순
    // 사업목표(program, level 0) 행은 로드맵에 표시하지 않고, 프로젝트(deadline)를 최상위로 보여준다.
    if (dls.length === 0) rows.push({ key: `add-${pgKey}`, level: 1, kind: 'deadline', name: '', color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, pgKey, isAdd: true, addKind: 'deadline' });
    for (const dl of dls) {
      const dKey = `d-${dl.id}`; const dp = dlPeriod(p, dl);
      const todos = dl.todos.filter(t => !t.done).sort((a, b) => ((a.date || a.deadline || '9999-99-99').localeCompare(b.date || b.deadline || '9999-99-99'))); // 산출물도 시작일 순
      rows.push({ key: dKey, level: 1, kind: 'deadline', name: dl.name, start: dp.start, end: dp.end, color: pColor, hasChildren: true, wsId: p.wsId, programId: p.id, deadlineId: dl.id, pgKey });
      if (!isOpen(dKey, 1)) continue;
      if (todos.length === 0) rows.push({ key: `add-${dKey}`, level: 2, kind: 'todo', name: '', color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, pgKey, isAdd: true, addKind: 'todo' });
      for (const t of todos) {
        // 산출물(2단계)이 로드맵의 최하위 — 하위 task들은 칸반 탭에서 관리
        const tKey = `t-${t.id}`;
        const ts = t.date || t.deadline, te = t.deadline || t.date;
        rows.push({ key: tKey, level: 2, kind: 'todo', name: t.name, start: ts && te ? (ts > te ? te : ts) : undefined, end: te || ts, color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, todoId: t.id, pgKey });
      }
      // 산출물이 이미 있어도 '여기서 바로 추가' 행을 항상 노출 (프로젝트 아래에 산출물 직접 추가)
      if (todos.length > 0) rows.push({ key: `add-${dKey}`, level: 2, kind: 'todo', name: '', color: pColor, hasChildren: false, wsId: p.wsId, programId: p.id, deadlineId: dl.id, pgKey, isAdd: true, addKind: 'todo' });
    }
  }
  }
  const rowsDraw = rows.map(r => (calDrag && calDrag.key === r.key ? { ...r, start: calDrag.start, end: calDrag.end } : r));

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
  // 로드맵에서는 내용을 직접 추가/편집하지 않고 Plan의 해당 사업목표로 이동해 수정·추가한다.
  const openInPlan = (wsId?: string, programId?: string) => {
    const prog = programId ? programs.find(p => p.id === programId) : undefined;
    const qs = new URLSearchParams();
    if (wsId) qs.set('ws', wsId);
    if (prog?.planGoalId) qs.set('goal', prog.planGoalId);
    else if (prog?.name) qs.set('goalName', prog.name);
    const s = qs.toString();
    router.push(s ? `/plan?${s}` : '/plan');
  };
  // 로드맵에서 산출물(영역별 산출물)을 프로젝트 아래에 바로 추가
  const addTodoInline = (r: Row) => {
    const prog = findProg(r.wsId, r.programId); if (!prog) return;
    const name = window.prompt('영역별 산출물 이름 (예: 디자인: 최종 UI 시안)')?.trim(); if (!name) return;
    store.updateProgramInWs(r.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== r.deadlineId ? dl : { ...dl, todos: [...dl.todos, { id: uid(), name, done: false }] }) });
  };
  // 로드맵에서 특정 프로그램(목표) 아래에 프로젝트 바로 추가 (add-row용)
  const addDeadlineInline = (r: Row) => {
    const prog = findProg(r.wsId, r.programId); if (!prog) return;
    const name = window.prompt('새 프로젝트 이름')?.trim(); if (!name) return;
    store.updateProgramInWs(r.wsId, { ...prog, deadlines: [...(prog.deadlines ?? []), { id: uid(), name, startDate: todayStr, date: addDaysStr(todayStr, 7), todos: [], enabled: true }] });
  };
  // 프로젝트(데드라인) 바로 추가 — 선택한 목표(계보) 또는 첫 목표 아래에 오늘부터 1주짜리 기본 일정으로
  const addProjectInline = () => {
    const target = resolveChain(selectedKey).program ?? programs[0];
    if (!target) { window.alert('먼저 Plan에서 사업목표를 만들어 Goals로 가져오세요.'); return; }
    const prog = findProg(target.wsId, target.id); if (!prog) return;
    const name = window.prompt('새 프로젝트 이름')?.trim(); if (!name) return;
    store.updateProgramInWs(target.wsId, { ...prog, deadlines: [...(prog.deadlines ?? []), { id: uid(), name, startDate: todayStr, date: addDaysStr(todayStr, 7), todos: [], enabled: true }] });
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
  void clearSchedule; // 막대 X 버튼 제거로 미사용(로직은 유지)

  // ── 카테고리 보드: 업무 영역을 '칸'으로, 그 안에서 산출물별로 구분, 하위 task 카드 ──
  type Sub = NonNullable<Deadline['todos'][number]['subtasks']>[number];
  type KbCol = { p: CalProgram; dlId: string; dlName: string; todoId: string; name: string; area: string; goalSub: string; start: string; dlStart: string; due: string; pinned: boolean; subtasks: Sub[]; projectId?: string; status?: string };
  // 이 카테고리(칼럼) 안의 새 task 시작 기준일: 카테고리 자체 시작일과 프로젝트 시작일 중 '더 늦은' 날.
  // 그 날이 미래면 그 날부터, 이미 지났으면 오늘부터 배치한다.
  const colStartAnchor = (col: { start?: string; dlStart?: string }) => {
    const cands = [col.start, col.dlStart].filter(Boolean) as string[];
    const s = cands.length ? cands.sort()[cands.length - 1] : '';
    return s && s > todayStr ? s : todayStr;
  };
  const parseArea = (name: string) => { const m = name.match(/^(.*?)\s*[:：]\s*(.*)$/); return { area: (m ? m[1] : name).trim(), goalSub: m ? m[2].trim() : '' }; };
  const kbScope = resolveChain(selectedKey);
  const kbCols: KbCol[] = [];
  for (const p of programs) {
    if (kbScope.program && kbScope.program.id !== p.id) continue;
    for (const dl of (p.deadlines ?? [])) {
      if (!dlVisible(p.wsId, dl)) continue; // 완료 처리한 프로젝트(데드라인)는 숨김
      if (kbScope.deadlineId && kbScope.deadlineId !== dl.id) continue;
      for (const t of dl.todos) {
        if (t.done) continue; // 완료된 산출물은 카테고리 보드에서 숨김
        if (kbScope.todoId && kbScope.todoId !== t.id) continue;
        const { area, goalSub } = parseArea(t.name);
        // 완료는 뒤로 → 매주 반복 task 최상단 → 그 다음 디데이(기한) 순 (기한 없는 건 맨 뒤)
        const subs = [...(t.subtasks ?? [])].sort((a, b) =>
          (a.done ? 1 : 0) - (b.done ? 1 : 0)
          || (((b.days?.length ?? 0) > 0 ? 1 : 0) - ((a.days?.length ?? 0) > 0 ? 1 : 0))
          || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
        const startStr = t.date || dl.startDate || '';
        const rawStatus = dl.projectId ? (resolveProject(p.wsId, dl.projectId)?.status ?? 'planned') : undefined;
        // 시작일이 지난(예정) 프로젝트는 표시상 '진행중'으로 (데이터 변경 없이 파생)
        const status = rawStatus === 'planned' && startStr && startStr <= todayStr ? 'active' : rawStatus;
        kbCols.push({ p, dlId: dl.id, dlName: dl.name, todoId: t.id, name: t.name, area, goalSub, start: startStr, dlStart: dl.startDate || '', due: t.deadline || t.date || '', pinned: !!t.pinned, subtasks: subs, projectId: dl.projectId, status });
      }
    }
  }
  // '우선' 먼저, 그 다음 시작일 빠른 순
  kbCols.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.start || '9999-99-99').localeCompare(b.start || '9999-99-99'));
  // 비즈니스 필터 후보 — 보드에 뜬 카테고리들의 비즈니스(중복 제거, 2개 이상일 때만 노출)
  const kbBusinesses = [...new Map(kbCols.map(c => [c.p.wsId, c.p.wsName || '내 비즈니스'])).entries()].map(([id, name]) => ({ id, name }));
  // 유효하지 않은 필터(해당 비즈니스 카테고리가 사라짐)는 무시
  const kbBizActive = kbBiz && kbBusinesses.some(b => b.id === kbBiz) ? kbBiz : null;
  const kbColsView = kbBizActive ? kbCols.filter(c => c.p.wsId === kbBizActive) : kbCols;
  // 최근 완료: 완료된 프로젝트(데드라인)를 완료 후 RETAIN_DAYS일간 되살릴 수 있게 보관, 이후 보드에서 사라짐
  const RETAIN_DAYS = 14;
  const recentDone: { p: CalProgram; dl: Deadline; daysLeft: number }[] = [];
  for (const p of programs) {
    if (kbScope.program && kbScope.program.id !== p.id) continue;
    for (const dl of (p.deadlines ?? [])) {
      if (!dl.done || !dl.doneAt) continue;
      const since = Math.floor((Date.now() - new Date(dl.doneAt).getTime()) / 86400000);
      if (since < 0 || since >= RETAIN_DAYS) continue;
      recentDone.push({ p, dl, daysLeft: RETAIN_DAYS - since });
    }
  }
  recentDone.sort((a, b) => (b.dl.doneAt || '').localeCompare(a.dl.doneAt || '')); // 최근 완료 먼저
  // 전체 task(subtask) 색인 — 선행(dependsOn) 이름/완료 표시용
  const subById = new Map<string, { name: string; done: boolean }>();
  for (const p of programs) for (const dl of p.deadlines ?? []) for (const t of dl.todos ?? []) for (const s of t.subtasks ?? []) subById.set(s.id, { name: s.name, done: s.done });
  // 특정 프로젝트(데드라인) 안의 다른 task들 — 선행 선택 후보
  const depCandidates = (col: KbCol, selfId?: string): { id: string; name: string }[] => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return [];
    const dl = (prog.deadlines ?? []).find(d => d.id === col.dlId); if (!dl) return [];
    const out: { id: string; name: string }[] = [];
    for (const t of dl.todos) for (const s of (t.subtasks ?? [])) if (s.id !== selfId) out.push({ id: s.id, name: s.name });
    return out;
  };
  const isBlocked = (s: Sub) => !s.done && (s.dependsOn ?? []).some(id => { const p = subById.get(id); return p && !p.done; });

  // ── 카테고리(산출물) 추가 대상: 스코프된 프로젝트, 없으면 첫 칼럼의 프로젝트 ──
  const catTarget = kbScope.deadlineId && kbScope.program ? { wsId: kbScope.program.wsId, programId: kbScope.program.id, dlId: kbScope.deadlineId }
    : kbCols[0] ? { wsId: kbCols[0].p.wsId, programId: kbCols[0].p.id, dlId: kbCols[0].dlId } : null;
  // 새 카테고리(산출물) 생성 — 템플릿 tasks가 있으면 함께 채워 넣음(비반복은 가용시간 배치)
  const addCategory = (name: string, tplTasks?: import('../lib/types').BoardTemplateTask[], opts?: { batch?: boolean }) => {
    const n = name.trim(); if (!n || !catTarget) return 0;
    const prog = findProg(catTarget.wsId, catTarget.programId); if (!prog) return 0;
    const dl = (prog.deadlines ?? []).find(d => d.id === catTarget.dlId); if (!dl) return 0;
    const start = dl.startDate || dl.date || todayStr;
    const anchor = start > todayStr ? start : todayStr; // 프로젝트 시작일이 미래면 그 날부터, 아니면 오늘부터 배치
    const tasks = tplTasks ?? [];
    // 실측 반영: 템플릿을 불러올 때, 이 영역(프로그램)의 과거 예상 대비 실제 배율로 예상시간 보정
    const factor = tasks.length ? areaFactor(store.allWorkspacesEntries, prog.name) : 1;
    const adjDur = (min?: number): { durationMin?: number; durationBase?: number } => {
      if (!min || factor === 1) return { durationMin: min };
      const adj = Math.max(5, Math.round((min * factor) / 5) * 5);
      return adj === min ? { durationMin: min } : { durationMin: adj, durationBase: min };
    };
    let adjustedCount = 0;
    const nonRecDur = tasks.filter(t => !(t.days?.length)).map(t => adjDur(t.durationMin).durationMin ?? 0);
    const dates = nonRecDur.length ? scheduleTasksByCapacity(store.allWorkspacesEntries, store.workSchedule, store.capacity, nonRecDur, anchor, dl.date || undefined, { spread: true }) : [];
    let di = 0;
    const subtasks = tasks.map(t => {
      const units = (t.units ?? []).map(u => ({ id: uid(), name: u.name, done: false, durationMin: u.durationMin }));
      const du = adjDur(t.durationMin); if (du.durationBase != null) adjustedCount += 1;
      // 반복 task는 '반복 시작일'이 미래면 오늘부터 시작(오늘 요일부터 바로 뜨도록)
      if (t.days?.length) return { id: uid(), name: t.name, done: false, date: anchor <= todayStr ? anchor : todayStr, ...du, schedulingType: t.schedulingType, priority: t.priority, days: t.days, units };
      const d = dates[di++] ?? anchor;
      return { id: uid(), name: t.name, done: false, date: d, deadline: d, ...du, schedulingType: t.schedulingType, priority: t.priority, units };
    });
    const newTodo = { id: uid(), name: n, done: false, date: start, deadline: dl.date || start, subtasks };
    store.updateProgramInWs(catTarget.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(d => d.id !== catTarget.dlId ? d : { ...d, todos: [...d.todos, newTodo] }) });
    if (opts?.batch) return adjustedCount;
    if (adjustedCount > 0) toast(`실제 기록을 반영해 예상시간 ${adjustedCount}개를 조정했어요 (평균 ${Math.round((factor - 1) * 100) > 0 ? '+' : ''}${Math.round((factor - 1) * 100)}%).`, 'success');
    setCatName(''); setCatPanel(false);
    return adjustedCount;
  };
  // 그룹 템플릿 적용: 여러 카테고리를 한 번에 생성
  const applyGroupTemplate = (cols: import('../lib/types').BoardTemplateColumn[]) => {
    if (!catTarget) return;
    for (const c of cols) addCategory(c.name, c.tasks, { batch: true });
    toast(`템플릿의 카테고리 ${cols.length}개를 추가했어요.`, 'success');
    setCatName(''); setCatPanel(false);
  };
  // 선택한 카테고리들을 하나의 그룹 템플릿으로 저장 (선택 1개면 카테고리 1개짜리 그룹)
  const colToTplColumn = (c: KbCol) => ({
    name: c.name,
    tasks: c.subtasks.map(s => ({ name: s.name, durationMin: s.durationMin, schedulingType: s.schedulingType, priority: s.priority, days: s.days, units: (s.units ?? []).map(u => ({ name: u.name, durationMin: u.durationMin })) })),
  });
  const saveSelectedAsGroup = () => {
    const cols = kbColsView.filter(c => groupSelIds.has(c.todoId)).map(colToTplColumn);
    if (cols.length === 0) return;
    store.addBoardTemplate({ name: groupSaveName.trim() || `카테고리 ${cols.length}개 세트`, tasks: [], columns: cols });
    toast(`카테고리 ${cols.length}개를 그룹 템플릿으로 저장했어요.`, 'success');
    setGroupSaveOpen(false); setGroupSelIds(new Set()); setGroupSaveName('');
  };
  // 병행 배치: 여러 프로젝트의 미완료 task를 라운드로빈 교차 후 오늘부터 가용시간에 채움
  // → 시작일이 같은 프로젝트들이 같은 날의 용량을 나눠 써 동시에 진행됨
  // onlyIds가 주어지면 그 task들만 (기존 배치는 유지한 채) 빈 용량에 배치 → 수동으로 옮긴 날짜 보존
  const parallelReschedule = (onlyIds?: Set<string>) => {
    // 카테고리(산출물=todo) 단위로 그룹 → 여러 카테고리를 라운드로빈 교차해 동시 진행
    const groups: ParallelGroup[] = [];
    for (const p of programs) {
      for (const dl of (p.deadlines ?? [])) {
        if (!dlVisible(p.wsId, dl)) continue;
        for (const t of dl.todos) {
          if (t.done) continue; // 완료 산출물 제외
          // 카테고리 자체 시작일과 프로젝트 시작일 중 더 늦은 날 기준(둘 다 없으면 오늘)
          const earliest = colStartAnchor({ start: t.date || '', dlStart: dl.startDate || '' });
          const cap = t.deadline || dl.date || undefined; // 상한 = 산출물/프로젝트 실제 기한
          const tasks: ParallelTask[] = [];
          for (const s of (t.subtasks ?? [])) {
            if (s.done || s.schedulingType === 'fixed' || (s.days?.length)) continue; // 완료·고정·반복 제외
            if (onlyIds && !onlyIds.has(s.id)) continue; // 신규 task만 배치(기존은 그대로 두어 다른 task의 용량으로 계산됨)
            tasks.push({ subtaskId: s.id, dur: s.durationMin ?? 60, deadline: cap, earliest });
          }
          if (tasks.length) groups.push({ tasks });
        }
      }
    }
    if (groups.length < 1) return;
    const result = scheduleParallel(store.allWorkspacesEntries, store.workSchedule, store.capacity, todayStr, groups);
    for (const p of programs) {
      const prog = findProg(p.wsId, p.id); if (!prog) continue;
      let changed = false;
      const deadlines = (prog.deadlines ?? []).map(dl => ({ ...dl, todos: dl.todos.map(t => ({ ...t, subtasks: (t.subtasks ?? []).map(s => { const nd = result.get(s.id); if (!nd || (s.date === nd && s.deadline === nd)) return s; changed = true; return { ...s, date: nd, deadline: nd }; }) })) }));
      if (changed) store.updateProgramInWs(p.wsId, { ...prog, deadlines });
    }
  };
  // 자동 병행 배치: 로드맵/보드를 볼 때와 task 집합(추가/완료)이 바뀔 때마다,
  // 프로젝트 시작일(캘린더 일정)을 읽어 같은 시기 프로젝트를 동시 진행되도록 다시 배치.
  // (subtask id 목록을 서명으로 사용 — 날짜만 바뀌는 재배치 자신은 서명이 그대로라 무한루프 없음)
  const allSubIdsSig = programs.flatMap(p => (p.deadlines ?? []).flatMap(dl => (dl.todos ?? []).flatMap(t => (t.subtasks ?? []).map(s => s.id)))).sort().join(',');
  const prevSubIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const curIds = new Set(allSubIdsSig ? allSubIdsSig.split(',') : []);
    // 마운트(첫 실행) 때는 기존 배치를 건드리지 않음 — 수동으로 조정한 날짜 보존
    if (prevSubIdsRef.current === null) { prevSubIdsRef.current = curIds; return; }
    const newIds = new Set([...curIds].filter(id => !prevSubIdsRef.current!.has(id)));
    prevSubIdsRef.current = curIds;
    if (newIds.size) parallelReschedule(newIds); // 새로 추가된 task만 빈 용량에 병행 배치
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSubIdsSig]);
  // 딜레이 자동 반영: 시작 안 했는데 시작일 지나면 오늘로 밀고(기간 유지), 안 끝났는데 마감 지나면 마감을 오늘로 연장
  const applyDelays = (): number => {
    let count = 0;
    for (const p of programs) {
      const prog = findProg(p.wsId, p.id); if (!prog) continue;
      let changed = false;
      const deadlines = (prog.deadlines ?? []).map(dl => {
        if (dl.done) return dl;
        let dchanged = false;
        const todos = dl.todos.map(t => {
          if (t.done) return t;
          let nt = t;
          const subs = t.subtasks ?? [];
          const started = subs.some(s => s.done || s.status === 'doing' || s.status === 'done' || (s.actualMin ?? 0) > 0 || (s.doneDates?.length ?? 0) > 0);
          // 시작 지연: 하위 task가 있고 아직 시작 안 했는데 시작일이 지남 → 오늘로 밀고 마감도 같은 기간만큼 이동
          if (subs.length > 0 && !started && nt.date && nt.date < todayStr) {
            const delta = daysBetween(nt.date, todayStr);
            nt = { ...nt, date: todayStr, deadline: nt.deadline ? addDaysStr(nt.deadline, delta) : nt.deadline };
          }
          // 종료 지연: 아직 안 끝났는데 마감일이 지남 → 마감을 오늘로 연장
          if (nt.deadline && nt.deadline < todayStr) nt = { ...nt, deadline: todayStr };
          if (nt !== t) { dchanged = true; count++; }
          return nt;
        });
        if (!dchanged) return dl;
        // 데드라인(프로젝트) 막대가 산출물을 덮도록 마감 확장
        const maxT = todos.flatMap(t => [t.date, t.deadline]).filter((x): x is string => !!x).reduce((a, b) => (a > b ? a : b), dl.date || '');
        changed = true;
        return { ...dl, todos, date: maxT && (!dl.date || maxT > dl.date) ? maxT : dl.date };
      });
      if (changed) store.updateProgramInWs(p.wsId, { ...prog, deadlines });
    }
    return count;
  };
  // autoDelay가 켜진 채 로드맵에 진입하면 자동 적용 (토스트 없이)
  useEffect(() => {
    if (store.autoDelay) applyDelays();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleAutoDelay = () => {
    const on = !store.autoDelay;
    store.setAutoDelay(on);
    if (on) { const n = applyDelays(); toast(n > 0 ? `딜레이 자동 반영 켜짐 — ${n}개 일정을 밀거나 연장했어요` : '딜레이 자동 반영 켜짐 — 지금 밀거나 연장할 항목은 없어요', 'success'); }
    else toast('딜레이 자동 반영 꺼짐', 'info');
  };

  // ── 막대 연결(의존성) ──
  // toId 산출물이 fromId 산출물 뒤에 오도록 연결 (선행이 밀리면 같이 밀림). 자기 참조·순환은 무시.
  const linkTodos = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    for (const e of store.allWorkspacesEntries) for (const p of e.programs) for (const dl of p.deadlines ?? []) {
      if (!dl.todos.some(t => t.id === toId)) continue;
      const prog = findProg(e.workspace.id, p.id); if (!prog) return;
      store.updateProgramInWs(e.workspace.id, { ...prog, deadlines: (prog.deadlines ?? []).map(d => ({ ...d, todos: d.todos.map(t => t.id === toId ? { ...t, dependsOn: fromId } : t) })) });
      return;
    }
  };
  const unlinkTodo = (toId: string) => {
    for (const e of store.allWorkspacesEntries) for (const p of e.programs) for (const dl of p.deadlines ?? []) {
      if (!dl.todos.some(t => t.id === toId && t.dependsOn)) continue;
      const prog = findProg(e.workspace.id, p.id); if (!prog) return;
      store.updateProgramInWs(e.workspace.id, { ...prog, deadlines: (prog.deadlines ?? []).map(d => ({ ...d, todos: d.todos.map(t => t.id === toId ? { ...t, dependsOn: undefined } : t) })) });
      return;
    }
  };
  const onBarLinkClick = (todoId?: string) => {
    if (!todoId) return;
    if (linkFrom === null) setLinkFrom(todoId);
    else if (linkFrom === todoId) setLinkFrom(null);
    else { linkTodos(linkFrom, todoId); setLinkFrom(null); }
  };
  // 연결된 산출물 전파: 선행이 밀리면 후행 시작을 선행 마감 뒤로 밀고(기간 유지) 연쇄 반영
  const propagateLinks = () => {
    type M = { wsId: string; pid: string; date?: string; deadline?: string; dependsOn?: string };
    const map = new Map<string, M>();
    for (const e of store.allWorkspacesEntries) for (const p of e.programs) for (const dl of p.deadlines ?? []) for (const t of dl.todos ?? []) if (!t.done) map.set(t.id, { wsId: e.workspace.id, pid: p.id, date: t.date, deadline: t.deadline, dependsOn: t.dependsOn });
    const updates = new Map<string, { wsId: string; pid: string; date: string; deadline?: string }>();
    let changed = true, guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      for (const [id, t] of map) {
        if (!t.dependsOn) continue;
        const pred = map.get(t.dependsOn); if (!pred) continue;
        const predEnd = pred.deadline || pred.date; const start = t.date || t.deadline;
        if (predEnd && start && start < predEnd) {
          const delta = daysBetween(start, predEnd);
          const nd = { date: predEnd, deadline: t.deadline ? addDaysStr(t.deadline, delta) : predEnd };
          map.set(id, { ...t, ...nd }); updates.set(id, { wsId: t.wsId, pid: t.pid, ...nd }); changed = true;
        }
      }
    }
    if (!updates.size) return;
    const byProg = new Map<string, { wsId: string; pid: string; ids: Map<string, { date: string; deadline?: string }> }>();
    for (const [id, u] of updates) { const k = `${u.wsId}::${u.pid}`; if (!byProg.has(k)) byProg.set(k, { wsId: u.wsId, pid: u.pid, ids: new Map() }); byProg.get(k)!.ids.set(id, { date: u.date, deadline: u.deadline }); }
    for (const { wsId, pid, ids } of byProg.values()) {
      const prog = findProg(wsId, pid); if (!prog) continue;
      const deadlines = (prog.deadlines ?? []).map(dl => {
        let dch = false;
        const todos = dl.todos.map(t => { const u = ids.get(t.id); if (!u) return t; dch = true; return { ...t, date: u.date, deadline: u.deadline }; });
        if (!dch) return dl;
        const maxT = todos.flatMap(t => [t.date, t.deadline]).filter((x): x is string => !!x).reduce((a, b) => (a > b ? a : b), dl.date || '');
        return { ...dl, todos, date: maxT && (!dl.date || maxT > dl.date) ? maxT : dl.date };
      });
      store.updateProgramInWs(wsId, { ...prog, deadlines });
    }
  };
  // 산출물 날짜/연결이 바뀔 때마다 전파 (수렴 — 후행이 이미 뒤면 변화 없음)
  const linkSig = programs.flatMap(p => (p.deadlines ?? []).flatMap(dl => (dl.todos ?? []).map(t => `${t.id}:${t.date ?? ''}:${t.deadline ?? ''}:${t.dependsOn ?? ''}`))).join('|');
  const dependentIds = new Set<string>(); // 선행에 연결된(따라 밀리는) 산출물
  const dependsMap = new Map<string, string>(); // 후행 todoId -> 선행 todoId
  for (const p of programs) for (const dl of p.deadlines ?? []) for (const t of dl.todos ?? []) if (t.dependsOn) { dependentIds.add(t.id); dependsMap.set(t.id, t.dependsOn); }
  // 연결선 좌표 측정 (막대 y는 DOM으로, x는 xOf로) — 접기/정렬/줌/스크롤 후에도 정확
  const rowKeysSig = rowsDraw.map(r => r.key).join(',');
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || dependsMap.size === 0) { setConnLines(prev => (prev.length ? [] : prev)); return; }
    const bRect = body.getBoundingClientRect();
    const yOf = (todoId: string) => { const el = body.querySelector(`[data-rm-bar="t-${todoId}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return r.top - bRect.top + r.height / 2; };
    const rowOf = (todoId: string) => rowsDraw.find(r => r.todoId === todoId);
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const [succId, predId] of dependsMap) {
      const succ = rowOf(succId), pred = rowOf(predId);
      if (!succ?.start || !pred?.start || !pred.end) continue;
      const y1 = yOf(predId), y2 = yOf(succId);
      if (y1 == null || y2 == null) continue;
      lines.push({ x1: xOf(pred.start) + wOf(pred.start, pred.end), y1, x2: xOf(succ.start), y2 });
    }
    setConnLines(lines);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeysSig, linkSig, pxPerDay, gran, sortMode, kanban]);
  useEffect(() => {
    propagateLinks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSig]);
  // D-day 계산 + 배지 스타일
  const ddayOf = (d?: string) => { if (!d) return null; const diff = daysBetween(todayStr, d); if (diff > 0) return { label: `D-${diff}`, s: diff <= 3 ? 'urgent' : 'future' }; if (diff === 0) return { label: 'D-Day', s: 'urgent' }; return { label: `D+${-diff}`, s: 'over' }; };
  const DdayBadge = ({ d }: { d?: string }) => { const dd = ddayOf(d); if (!dd) return null; const st = dd.s === 'urgent' ? { color: '#fff', backgroundColor: '#FF696C' } : dd.s === 'over' ? { color: '#5B6560', backgroundColor: '#F0F0EA' } : { color: '#3E7A2E', backgroundColor: '#DDF4C4' }; return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={st}>{dd.label}</span>; };
  const kbScopeName = kbScope.todoId ? (kbCols[0]?.name || '선택 산출물') : kbScope.deadlineId ? (kbCols[0]?.dlName || '선택 프로젝트') : kbScope.program ? kbScope.program.name : '전체';
  const updateSub = (col: KbCol, sId: string, patch: Partial<Sub>) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: (t.subtasks ?? []).map(s => s.id !== sId ? s : { ...s, ...patch }) }) }) });
  };
  // task/세부작업 추가는 팝업 폼으로 (이름 + 소요 시간). task 날짜는 자동 지정
  const kbCreateTask = (col: KbCol, name: string, durMin?: number, schedulingType?: 'fixed' | 'due' | 'flexible', priority?: number, dependsOn?: string[], days?: number[]) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    const recurring = !!days?.length;
    const d = colStartAnchor(col); // 카테고리 시작일(미래면 그 날, 아니면 오늘)부터 배치
    const sub = recurring
      ? { id: uid(), name, done: false, date: d, durationMin: durMin, schedulingType, priority, days, dependsOn: dependsOn?.length ? dependsOn : undefined }
      : { id: uid(), name, done: false, date: d, deadline: d, durationMin: durMin, schedulingType, priority, dependsOn: dependsOn?.length ? dependsOn : undefined };
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: [...(t.subtasks ?? []), sub] }) }) });
  };
  const kbCreateUnit = (col: KbCol, s: Sub, name: string, durMin?: number) => updateSub(col, s.id, { units: [...(s.units ?? []), { id: uid(), name, done: false, durationMin: durMin }] });
  const kbDelUnit = (col: KbCol, s: Sub, uId: string) => updateSub(col, s.id, { units: (s.units ?? []).filter(u => u.id !== uId) });
  const kbSetTaskDue = (col: KbCol, s: Sub, due: string) => updateSub(col, s.id, { date: due || undefined, deadline: due || undefined });
  const kbSetTodoDue = (col: KbCol, due: string) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, deadline: due || undefined, date: t.date || due || undefined }) }) });
  };
  const kbTogglePin = (col: KbCol) => store.updateProgramTodo(col.p.wsId, col.p.id, col.dlId, col.todoId, { pinned: !col.pinned });
  // 카테고리(산출물=todo) 삭제 — 안의 task도 함께 삭제. 이 삭제로 데드라인/프로그램이 비면 함께 정리.
  const kbDelCategory = (col: KbCol) => {
    if (!window.confirm(`카테고리 ‘${col.area}’를 삭제할까요? 안의 task도 모두 삭제돼요.`)) return;
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    const deadlines = (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.filter(t => t.id !== col.todoId) })
      .filter(dl => (dl.todos?.length ?? 0) > 0 || !!dl.projectId); // 비고 projectId 없는 데드라인은 함께 제거
    if (deadlines.length === 0) store.deleteProgramInWs(col.p.wsId, prog.id); // 프로그램이 완전히 비면 프로그램도 삭제
    else store.updateProgramInWs(col.p.wsId, { ...prog, deadlines });
  };
  // 프로젝트 상태(예정/진행중/완료/보류) 변경 — Plan의 setProjectStatus와 동일하게 데드라인 done도 동기화
  const kbSetStatus = (col: KbCol, status: string) => {
    if (!col.projectId) return;
    store.updateProject(col.p.wsId, col.projectId, { status: status as ProjectStatus });
    const done = status === 'done';
    const ws = store.allWorkspacesEntries.find(e => e.workspace.id === col.p.wsId);
    for (const pg of ws?.programs ?? []) {
      let changed = false;
      const deadlines = (pg.deadlines ?? []).map(dl => {
        if (dl.projectId !== col.projectId || !!dl.done === done) return dl;
        changed = true;
        return { ...dl, done, doneAt: done ? new Date().toISOString() : undefined };
      });
      if (changed) store.updateProgramInWs(col.p.wsId, { ...pg, deadlines });
    }
  };
  // 완료된 프로젝트(데드라인) 되살리기 — done 해제 + 프로젝트 상태 진행중으로
  const kbRestoreDeadline = (p: CalProgram, dlId: string, projectId?: string) => {
    const prog = findProg(p.wsId, p.id); if (!prog) return;
    store.updateProgramInWs(p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(d => d.id === dlId ? { ...d, done: false, doneAt: undefined } : d) });
    if (projectId) store.updateProject(p.wsId, projectId, { status: 'active' });
  };
  const kbAddTask = (col: KbCol) => { setKbForm({ mode: 'task', col }); setFormName(''); setFormDur(''); setFormType('flexible'); setFormPriority(2); setFormDeps([]); setFormDays([]); };
  const kbEditTask = (col: KbCol, s: Sub) => { setKbForm({ mode: 'task', col, editTaskId: s.id }); setFormName(s.name); setFormDur(s.durationMin ? String(s.durationMin) : ''); setFormType(s.schedulingType ?? 'flexible'); setFormPriority(s.priority ?? 2); setFormDeps(s.dependsOn ?? []); setFormDays(s.days ?? []); };
  const kbSubmitForm = () => {
    const n = formName.trim(); if (!n || !kbForm) return;
    const d = Number(formDur); const dur = Number.isFinite(d) && d > 0 ? d : undefined;
    if (kbForm.mode === 'task') {
      const days = formDays.length ? [...formDays].sort((a, b) => a - b) : undefined;
      if (kbForm.editTaskId) {
        const cur = kbForm.col.subtasks.find(x => x.id === kbForm.editTaskId);
        const patch: Partial<Sub> = { name: n, durationMin: dur, schedulingType: formType, priority: formPriority, dependsOn: formDeps.length ? formDeps : undefined, days };
        if (days) { patch.deadline = undefined; patch.date = cur?.date && cur.date <= todayStr ? cur.date : todayStr; } // 반복: 시작일 미래면 오늘부터(오늘 요일 바로 뜨게)·기한 제거
        else { const dd = cur?.date || cur?.deadline || todayStr; patch.date = dd; patch.deadline = dd; } // 단발: 기존 날짜 유지
        updateSub(kbForm.col, kbForm.editTaskId, patch);
      }
      else kbCreateTask(kbForm.col, n, dur, formType, formPriority, formDeps, days);
    }
    else if (kbForm.s) { if (kbForm.editUnitId) kbUpdateUnit(kbForm.col, kbForm.s, kbForm.editUnitId, n, dur); else kbCreateUnit(kbForm.col, kbForm.s, n, dur); }
    setKbForm(null);
  };
  const fmtDur = (min?: number) => { if (!min) return ''; return min >= 60 ? (min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min / 60}시간`) : `${min}분`; };
  // AI로 이 산출물의 task들을 생성해 추가
  const kbAiTasks = async (col: KbCol) => {
    if (kbAiBusy) return;
    setKbAiBusy(col.todoId);
    try {
      const context = `사업: ${col.p.wsName ?? ''} / 사업목표: ${col.p.name}${col.p.goal ? ` (${col.p.goal})` : ''} / 프로젝트: ${col.dlName}`;
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'todo-tasks', context, goalName: `${col.p.name} · ${col.dlName}`, deliverableName: col.name }) });
      const data = await res.json().catch(() => ({}));
      const tasks = (Array.isArray(data.tasks) ? data.tasks : []) as { name: string; durationMin?: number }[];
      if (!tasks.length) return;
      const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
      // 개인화 보정: 이 업무 영역의 과거 예상 대비 실제 배율을 AI 예상시간에 반영 (§15)
      const factor = areaFactor(store.allWorkspacesEntries, col.p.name);
      const adj = (min?: number) => (min && factor !== 1 ? Math.max(15, Math.round((min * factor) / 15) * 15) : min);
      const durMins = tasks.map(tk => adj(tk.durationMin) ?? 0);
      // 카테고리(프로젝트) 시작일이 미래면 그 날부터, 이미 시작했으면 오늘부터 가용시간에 맞춰 '하루 하나씩 펼쳐' 배치
      const startAnchor = colStartAnchor(col);
      const dates = scheduleTasksByCapacity(store.allWorkspacesEntries, store.workSchedule, store.capacity, durMins, startAnchor, col.due || undefined, { spread: true });
      store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: [...(t.subtasks ?? []), ...tasks.map((tk, i) => { const d = dates[i]; return { id: uid(), name: tk.name, done: false, date: d, deadline: d, durationMin: adj(tk.durationMin) }; })] }) }) });
    } catch { /* ignore */ }
    finally { setKbAiBusy(null); }
  };
  // AI로 이 task의 세부 작업(체크리스트)들을 생성해 추가
  const kbAiUnits = async (col: KbCol, s: Sub) => {
    if (kbUnitAiBusy) return;
    setKbUnitAiBusy(s.id);
    try {
      const context = `사업: ${col.p.wsName ?? ''} / 사업목표: ${col.p.name}${col.p.goal ? ` (${col.p.goal})` : ''} / 프로젝트: ${col.dlName}`;
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'task-units', context, deliverableName: col.name, taskName: s.name }) });
      const data = await res.json().catch(() => ({}));
      const units = (Array.isArray(data.units) ? data.units : []) as { name: string; durationMin?: number }[];
      if (!units.length) return;
      updateSub(col, s.id, { units: [...(s.units ?? []), ...units.map(u => ({ id: uid(), name: u.name, done: false, durationMin: u.durationMin }))] });
    } catch { /* ignore */ }
    finally { setKbUnitAiBusy(null); }
  };
  const kbDel = (col: KbCol, sId: string) => {
    const prog = findProg(col.p.wsId, col.p.id); if (!prog) return;
    store.updateProgramInWs(col.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== col.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== col.todoId ? t : { ...t, subtasks: (t.subtasks ?? []).filter(s => s.id !== sId) }) }) });
  };
  const kbToggleDone = (col: KbCol, s: Sub) => {
    if ((s.days?.length ?? 0) > 0) return; // 반복 업무는 카테고리보드에서 완료 체크하지 않음(요일별로 Home에서 관리)
    const nowDone = !s.done;
    updateSub(col, s.id, { done: nowDone, status: nowDone ? 'done' : 'todo' });
    if (nowDone && s.actualMin === undefined && !(s.days?.length)) setActualTarget({ col, s }); // 실제 소요시간 물어보기 (§14, 반복 제외)
  };
  const kbAddUnit = (col: KbCol, s: Sub) => { setKbForm({ mode: 'subtask', col, s }); setFormName(''); setFormDur(''); };
  const kbEditUnit = (col: KbCol, s: Sub, u: NonNullable<Sub['units']>[number]) => { setKbForm({ mode: 'subtask', col, s, editUnitId: u.id }); setFormName(u.name); setFormDur(u.durationMin ? String(u.durationMin) : ''); };
  const kbUpdateUnit = (col: KbCol, s: Sub, uId: string, name: string, durMin?: number) => updateSub(col, s.id, { units: (s.units ?? []).map(u => u.id === uId ? { ...u, name, durationMin: durMin } : u) });
  const kbToggleUnit = (col: KbCol, s: Sub, uId: string) => { if ((s.days?.length ?? 0) > 0) return; updateSub(col, s.id, { units: (s.units ?? []).map(u => u.id === uId ? { ...u, done: !u.done } : u) }); }; // 반복업무 세부작업은 카테고리보드에서 완료 체크하지 않음(요일별 Home 관리)
  // 다른 산출물 칸으로 task 이동 (드래그)
  // 날짜순 뷰에서 task를 다른 날짜 칼럼으로 옮기면 수행날짜(기한)를 그 날짜로 맞춤
  const kbMoveTaskToDate = (sId: string, dateKey: string) => {
    const from = kbColsView.find(c => c.subtasks.some(s => s.id === sId)); if (!from) return;
    const s = from.subtasks.find(x => x.id === sId); if (!s) return;
    const val = dateKey === '__none__' ? undefined : dateKey;
    const recurring = (s.days?.length ?? 0) > 0;
    if ((s.deadline || s.date || '') === (val || '')) return; // 같은 날짜면 변화 없음
    // 반복 task는 요일 기반이라 시작일(date)은 유지하고 기한만 갱신, 일시적 task는 날짜·기한 함께 이동
    updateSub(from, sId, recurring ? { deadline: val } : { date: val, deadline: val });
  };
  // 같은 카테고리(칼럼) 안에서 task를 대상 task 위치로 재배치 — 순서를 옮기고 수행날짜도 대상 위치에 맞춤
  // 표시(정렬)된 index 위치에 task를 삽입 — 카테고리 칼럼 내 정확한 위치로 재배치.
  // 삽입 위치의 '위 카드' 날짜에 맞춰 수행날짜를 정하고, 같은 날짜끼리는 배열 순서로 위/아래를 확정.
  const kbInsertAt = (toCol: KbCol, draggedId: string, index: number) => {
    const from = kbColsView.find(c => c.subtasks.some(s => s.id === draggedId)); if (!from) return;
    const movingOrig = from.subtasks.find(s => s.id === draggedId); if (!movingOrig) return;
    const disp = toCol.subtasks;
    // 자기 자신은 이웃 계산에서 제외
    let ai = index - 1; while (ai >= 0 && disp[ai]?.id === draggedId) ai--;
    let bi = index; while (bi < disp.length && disp[bi]?.id === draggedId) bi++;
    const aboveId = ai >= 0 ? disp[ai]?.id : undefined;
    const belowId = bi < disp.length ? disp[bi]?.id : undefined;
    const sameTodo = from.todoId === toCol.todoId && from.dlId === toCol.dlId && from.p.id === toCol.p.id;
    if (sameTodo && (draggedId === disp[index]?.id || draggedId === disp[index - 1]?.id)) { setKbDragOver(null); return; } // 제자리
    const dateOf = (id?: string) => { const s = id ? disp.find(x => x.id === id) : undefined; return s ? (s.deadline || s.date) : undefined; };
    const recurring = (movingOrig.days?.length ?? 0) > 0;
    const newDate = dateOf(aboveId) || dateOf(belowId) || colStartAnchor(toCol);
    const movedNew = recurring ? { ...movingOrig, deadline: newDate } : { ...movingOrig, date: newDate, deadline: newDate };
    // 대상 todo 배열에서 draggedId 제거 후 aboveId 뒤(없으면 맨 앞)에 삽입
    const insertInto = (subs: Sub[]) => {
      const arr = subs.filter(s => s.id !== draggedId);
      let at = 0;
      if (aboveId) { const idx = arr.findIndex(s => s.id === aboveId); at = idx < 0 ? arr.length : idx + 1; }
      arr.splice(at, 0, movedNew);
      return arr;
    };
    if (sameTodo) {
      const prog = findProg(toCol.p.wsId, toCol.p.id); if (!prog) return;
      store.updateProgramInWs(toCol.p.wsId, { ...prog, deadlines: (prog.deadlines ?? []).map(dl => dl.id !== toCol.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== toCol.todoId ? t : { ...t, subtasks: insertInto(t.subtasks ?? []) }) }) });
    } else {
      // 다른 카테고리에서 옮겨오는 경우: 소스에서 제거 후 대상에 삽입(스토어 동기 갱신)
      const fromProg = findProg(from.p.wsId, from.p.id);
      if (fromProg) store.updateProgramInWs(from.p.wsId, { ...fromProg, deadlines: (fromProg.deadlines ?? []).map(dl => dl.id !== from.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== from.todoId ? t : { ...t, subtasks: (t.subtasks ?? []).filter(s => s.id !== draggedId) }) }) });
      const toProg = findProg(toCol.p.wsId, toCol.p.id);
      if (toProg) store.updateProgramInWs(toCol.p.wsId, { ...toProg, deadlines: (toProg.deadlines ?? []).map(dl => dl.id !== toCol.dlId ? dl : { ...dl, todos: dl.todos.map(t => t.id !== toCol.todoId ? t : { ...t, subtasks: insertInto(t.subtasks ?? []) }) }) });
    }
    setKbDragOver(null);
  };
  // ── 그리드/눈금/오늘 (px, 범위 전체) ──
  const dayLines: number[] = []; const strongLines: number[] = []; const labels: { x: number; text: string }[] = [];
  for (let i = 0; i < span; i++) {
    const d = addDaysStr(rangeStart, i); const dd = new Date(d); const x = i * pxPerDay; const dow = dd.getDay(); const dom = dd.getDate();
    if (gran === 'year') { if (dom === 1) { strongLines.push(x); labels.push({ x, text: dd.getMonth() === 0 ? `${dd.getFullYear()}년` : `${dd.getMonth() + 1}월` }); } }
    else if (gran === 'month') { if (dom === 1) { strongLines.push(x); labels.push({ x, text: `${dd.getFullYear()}.${dd.getMonth() + 1}` }); } else if (dow === 1) { dayLines.push(x); labels.push({ x, text: `${dom}` }); } }
    else {
      // 주 단위(확대): 모든 날짜에 라벨. 월요일·1일은 'M/D'로 강조, 나머지는 일(day) 숫자만.
      const strong = dow === 1 || dom === 1;
      if (strong) { strongLines.push(x); labels.push({ x, text: `${dd.getMonth() + 1}/${dom}` }); }
      else { dayLines.push(x); labels.push({ x, text: `${dom}` }); }
    }
  }
  const todayX = xOf(todayStr) + pxPerDay / 2;
  void schedule; void DOW;
  // 오프(휴무) 날짜 = 가용시간 override가 0인 날 → 로드맵에 밴드로 표시 (연속일은 하나로 병합)
  const offDates = Object.entries(store.capacity.dateOverrides ?? {}).filter(([, h]) => h === 0).map(([d]) => d).filter(d => d >= rangeStart && daysBetween(rangeStart, d) < span).sort();
  const offBands: { start: string; end: string }[] = [];
  for (const d of offDates) { const last = offBands[offBands.length - 1]; if (last && daysBetween(last.end, d) === 1) last.end = d; else offBands.push({ start: d, end: d }); }
  // 막대 span 안의 오프(휴무) 일수 — 프로젝트를 그만큼 '연장'해 보이게(오프 기간엔 아무 것도 없게)
  const allOffSet = new Set(Object.entries(store.capacity.dateOverrides ?? {}).filter(([, h]) => h === 0).map(([d]) => d));
  const offDaysInSpan = (start: string, end: string) => { let n = 0, d = start; for (let i = 0; i < 400 && d <= end; i++) { if (allOffSet.has(d)) n++; d = addDaysStr(d, 1); } return n; };

  const onTrackDrop = (e: React.DragEvent) => { e.preventDefault(); let payload = dragPayloadRef.current; if (!payload) { try { const raw = e.dataTransfer.getData('text/plain'); if (raw) payload = JSON.parse(raw); } catch { /* empty */ } } const date = dateFromClientX(e.clientX); if (payload && date) dropOnDate(payload, date); dragPayloadRef.current = null; };

  const barH = (lvl: number) => lvl === 1 ? 26 : lvl === 2 ? 20 : 16; // 프로젝트=큰 막대, 하위(산출물) 막대 20% 확대
  const pgOrder = new Map<string, number>(); roadmapPrograms.forEach((p, i) => pgOrder.set(`p-${p.id}`, i));
  // 선택 아이템 빌더 + 체크 표시
  const rowSel = (r: Row): SelItem => ({ key: r.key, kind: r.kind, name: r.name, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, deadline: r.end });
  const subSel = (col: KbCol, s: Sub): SelItem => ({ key: `s-${s.id}`, kind: 'subtask', name: s.name, wsId: col.p.wsId, programId: col.p.id, deadlineId: col.dlId, todoId: col.todoId, subtaskId: s.id, deadline: s.deadline });
  const unitSel = (col: KbCol, s: Sub, u: NonNullable<Sub['units']>[number]): SelItem => ({ key: `u-${u.id}`, kind: 'unit', name: u.name, wsId: col.p.wsId, programId: col.p.id, deadlineId: col.dlId, todoId: col.todoId, subtaskId: s.id, unitId: u.id, durationMin: u.durationMin });
  const SelCheck = ({ on }: { on: boolean }) => (<span className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: on ? '#7C3AED' : '#C7CEC7', backgroundColor: on ? '#7C3AED' : '#fff' }}>{on && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>);

  // task 카드 렌더 — 카테고리별 칼럼 뷰와 날짜순 목록 뷰가 공유. showCat=true면 소속 비즈니스·카테고리 라벨을 함께 표시.
  const renderTaskCard = (col: KbCol, s: Sub, showCat?: boolean) => {
    const units = s.units ?? [];
    const recurring = (s.days?.length ?? 0) > 0;   // 반복 업무는 완료 체크를 표시하지 않음(요일별 관리)
    const showDone = s.done && !recurring;
    return (
      <div key={s.id} data-teach="kb-task" draggable onDragStart={() => setKbDrag(s.id)} onDragEnd={() => { setKbDrag(null); setKbDragOver(null); }}
        {...(!showCat ? {
          onDragOver: (e: React.DragEvent) => {
            if (!kbDrag) return;
            e.preventDefault(); e.stopPropagation();
            const idx = col.subtasks.findIndex(x => x.id === s.id);
            const rect = e.currentTarget.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2; // 카드 아래 절반이면 이 카드 다음에 삽입
            const next = { todoId: col.todoId, index: after ? idx + 1 : idx };
            setKbDragOver(prev => (prev && prev.todoId === next.todoId && prev.index === next.index) ? prev : next);
          },
          onDrop: (e: React.DragEvent) => { if (kbDrag) { e.stopPropagation(); const at = (kbDragOver && kbDragOver.todoId === col.todoId) ? kbDragOver.index : col.subtasks.findIndex(x => x.id === s.id); kbInsertAt(col, kbDrag, at); setKbDrag(null); } },
        } : {})}
        data-ask data-ask-label={`${col.p.wsName ? col.p.wsName + ' · ' : ''}task · ${col.area}`} data-ask-content={`[비즈니스: ${col.p.wsName || '내 비즈니스'} / 카테고리: ${col.area}] task: ${s.name}`}
        className="group bg-white border rounded-lg p-2.5 cursor-grab active:cursor-grabbing" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', opacity: kbDrag === s.id ? 0.4 : 1 }}>
        {showCat && (
          <div className="flex items-center gap-1 mb-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(col.p.wsId) }} />
            <span className="text-[10px] font-bold truncate" style={{ color: '#9AA39D' }}>{col.p.wsName ? `${col.p.wsName} · ` : ''}{col.area}</span>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          {selMode && <button onClick={() => toggleSel(subSel(col, s))} className="mt-0.5 flex-shrink-0"><SelCheck on={sel.has(`s-${s.id}`)} /></button>}
          <button onClick={() => kbToggleDone(col, s)} className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5" style={{ borderColor: showDone ? '#5EA63A' : '#C7CEC7', backgroundColor: showDone ? '#5EA63A' : 'transparent' }}>{showDone && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>
          <button onClick={() => kbEditTask(col, s)} title="task 수정 (이름·소요시간·성격·우선순위)" className="font-semibold flex-1 min-w-0 break-words text-left" style={{ fontSize: 13, color: showDone ? '#9AA39D' : '#16211E', textDecoration: showDone ? 'line-through' : 'none' }}>{s.name}</button>
          {(s.days?.length ?? 0) > 0 && <span className="text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }} title="매주 반복 업무">매주</span>}
          {isBlocked(s) && <span className="text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0" style={{ backgroundColor: '#FBF3E0', color: '#96631A' }} title="선행 작업이 아직 안 끝났어요">선행 대기</span>}
          {(s.priority ?? 0) >= 4 && <span className="text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0" style={{ backgroundColor: '#FFE1E1', color: '#C0392B' }}>긴급</span>}
          {s.schedulingType && s.schedulingType !== 'flexible' && <span className="text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0" style={{ backgroundColor: s.schedulingType === 'fixed' ? '#E7F0FF' : '#FBF3E0', color: s.schedulingType === 'fixed' ? '#2B62C4' : '#96631A' }}>{s.schedulingType === 'fixed' ? '고정' : '기한'}</span>}
          {s.durationMin ? <span className="text-[10px] font-semibold flex-shrink-0 inline-flex items-center gap-0.5" style={{ color: '#7C3AED' }}>{s.durationBase != null && s.durationBase !== s.durationMin && <span title={`실측 반영: 원래 예상 ${fmtDur(s.durationBase)}`}>↻</span>}{fmtDur(s.durationMin)}</span> : null}
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
                {selMode && <button onClick={() => toggleSel(unitSel(col, s, u))} className="flex-shrink-0"><SelCheck on={sel.has(`u-${u.id}`)} /></button>}
                {(() => { const uDone = u.done && !recurring; return (<>
                <button onClick={() => kbToggleUnit(col, s, u.id)} className="w-3 h-3 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: uDone ? '#5EA63A' : '#C7CEC7', backgroundColor: uDone ? '#5EA63A' : 'transparent' }}>{uDone && <svg className="w-2 h-2" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>
                <button onClick={() => kbEditUnit(col, s, u)} title="수정" className="truncate flex-1 min-w-0 text-left" style={{ fontSize: 13, color: uDone ? '#9AA39D' : '#5B6560', textDecoration: uDone ? 'line-through' : 'none' }}>{u.name}</button>
                </>); })()}
                {u.durationMin ? <span className="text-[10px] flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtDur(u.durationMin)}</span> : null}
                <button onClick={() => kbDelUnit(col, s, u.id)} className="text-neutral-300 hover:text-red-500 text-[11px] flex-shrink-0 opacity-0 group-hover/u:opacity-100 transition-opacity" title="삭제">×</button>
              </div>
            ))}
          </div>
        )}
        <div data-teach="kb-addunit" className="mt-1 ml-5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => kbAddUnit(col, s)} className="text-[10px] font-semibold" style={{ color: '#9AA39D' }}>+ 세부 작업</button>
          <button onClick={() => kbAiUnits(col, s)} disabled={!!kbUnitAiBusy} title="AI로 세부 작업 생성" className="flex items-center gap-0.5 text-[10px] font-bold disabled:opacity-50" style={{ color: '#7C3AED' }}>
            {kbUnitAiBusy === s.id
              ? <span className="w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>}
            AI 세부작업
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-white border rounded-[24px] p-5 flex flex-col ${cardClassName}`} style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
      {/* 최상위 페이지 전환: 로드맵 / 카테고리 보드 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 rounded-full p-1 flex-1" style={{ backgroundColor: '#EDEDE7' }}>
          {([[false, '로드맵'], [true, 'Task']] as [boolean, string][]).map(([kb, label]) => (
            <button key={label} onClick={() => setKanban(kb)} data-teach={kb ? 'kb-toggle' : undefined} className="flex-1 py-2 rounded-full text-[13px] font-bold transition-colors" style={kanban === kb ? { backgroundColor: '#16211E', color: '#fff' } : { color: '#8D9A8D' }}>{label}</button>
          ))}
        </div>
        {sel.size > 0 && <button onClick={() => setBulkOpen(true)} className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold flex-shrink-0 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>수정 ({sel.size})</button>}
        <button onClick={() => setAreaPanel(true)} className="flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-bold flex-shrink-0 transition-colors" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }} title="업무 영역 추가·수정·삭제"><svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>영역 관리</button>
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
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={addProjectInline} className="flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#EAF3FF', color: '#2B62C4' }} title="선택한 목표(또는 첫 목표) 아래에 새 프로젝트 추가">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>프로젝트 추가
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            {/* 줌 인/아웃 — 날짜 간격 조절 (연/월/주 구분 없이 연속) */}
            <div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: '#F1F1EB' }}>
              <button onClick={() => setPxPerDay(v => clampN(Math.round(v / 1.4), ZMIN, ZMAX))} disabled={pxPerDay <= ZMIN} className="w-8 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white disabled:opacity-30" title="축소 (날짜 간격 좁게)"><svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" style={{ color: '#5B6560' }}><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
              <input type="range" min={ZMIN} max={ZMAX} step={1} value={pxPerDay} onChange={e => setPxPerDay(Number(e.target.value))} className="w-24 accent-violet-500" title="줌" />
              <button onClick={() => setPxPerDay(v => clampN(Math.round(v * 1.4), ZMIN, ZMAX))} disabled={pxPerDay >= ZMAX} className="w-8 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white disabled:opacity-30" title="확대 (날짜 간격 넓게)"><svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" style={{ color: '#5B6560' }}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
            </div>
            <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: '#9AA39D' }}>{gran === 'year' ? '연 단위' : gran === 'month' ? '월 단위' : '주 단위'}</span>
            <span className="flex-1" />
            {/* 정렬: 시작일순 / 비즈니스별 */}
            <div className="flex gap-1 rounded-full p-1 flex-shrink-0" style={{ backgroundColor: '#F1F1EB' }}>
              {([['dday', '시작일순'], ['business', '비즈니스별']] as [typeof sortMode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => setSortMode(m)} className="text-[11px] font-bold rounded-full px-2.5 py-1 transition-colors" style={sortMode === m ? { backgroundColor: '#fff', color: '#16211E', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } : { color: '#8D9A8D' }}>{label}</button>
              ))}
            </div>
            <button onClick={toggleAutoDelay} className="text-[12px] font-semibold rounded-full px-2.5 py-1.5 transition-colors flex-shrink-0" style={store.autoDelay ? { backgroundColor: '#E7F0FF', color: '#2B62C4' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }} title="딜레이 자동 반영 — 시작 안 하면 막대를 오늘로 밀고, 마감 지나면 마감을 오늘로 연장">딜레이</button>
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
          {linkFrom && <div className="mb-2 rounded-xl px-3 py-2 text-[12px] text-center flex items-center justify-center gap-2" style={{ backgroundColor: '#E7F0FF', color: '#2B62C4' }}>선행 막대를 골랐어요. <b>뒤에 올 막대의 🔗 를 클릭</b>해 연결하세요. <button onClick={() => setLinkFrom(null)} className="underline">취소</button></div>}
        </>
      ) : (
        <div className="flex items-center gap-1.5 mb-3 min-w-0">
          <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>업무 영역별 task</span>
          <span className="text-[12px] truncate" style={{ color: '#9AA39D' }}>· {kbScopeName}</span>
        </div>
      )}

      {kanban ? (
        /* 칸반: 타이틀 영역(우측 카테고리 추가) + 영역별 산출물(칸) */
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2 flex-shrink-0 flex-wrap">
            <span className="text-[13px] font-bold" style={{ color: '#5B6560' }}>카테고리{kbColsView.length > 0 ? ` · ${kbColsView.length}` : ''}</span>
            {/* 뷰 전환: 업무영역별 칼럼 ↔ 날짜순 목록 */}
            <div className="flex rounded-full p-0.5" style={{ backgroundColor: '#F0F0EA' }}>
              {([[false, '업무영역별'], [true, '날짜순']] as [boolean, string][]).map(([f, label]) => (
                <button key={label} onClick={() => setKbFlat(f)} className="text-[11px] font-bold rounded-full px-2.5 py-1 transition-colors" style={kbFlat === f ? { backgroundColor: '#fff', color: '#16211E' } : { color: '#9AA39D' }}>{label}</button>
              ))}
            </div>
            {/* 비즈니스 필터: 보드에 2개 이상 비즈니스가 있을 때만 */}
            {kbBusinesses.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button onClick={() => setKbBiz(null)} className="text-[11px] font-bold rounded-full px-2.5 py-1 transition-colors" style={!kbBizActive ? { backgroundColor: '#16211E', color: '#fff' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}>전체</button>
                {kbBusinesses.map(b => (
                  <button key={b.id} onClick={() => setKbBiz(b.id)} className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 transition-colors" style={kbBizActive === b.id ? { backgroundColor: '#16211E', color: '#fff' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }} title={`${b.name}만 보기`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(b.id) }} />{b.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            {kbColsView.length > 0 && (
              <button onClick={() => { setGroupSelIds(new Set(kbColsView.map(c => c.todoId))); setGroupSaveName(''); setGroupSaveOpen(true); }} data-teach="kb-template" className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold flex-shrink-0 transition-colors" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }} title="저장할 카테고리를 골라 템플릿으로 저장">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg>
                그룹 저장
              </button>
            )}
            {catTarget && (
              <button onClick={() => setCatPanel(true)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold flex-shrink-0 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }} title="새 카테고리 추가 / 저장된 템플릿 불러오기">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                카테고리 추가{store.boardTemplates.length > 0 ? ` · 템플릿 ${store.boardTemplates.length}` : ''}
              </button>
            )}
          </div>
          {kbColsView.length === 0 && recentDone.length === 0 ? (
            <div className="flex-1 min-h-0 flex items-center justify-center"><p className="text-[13px] text-center" style={{ color: '#9AA39D' }}>표시할 산출물이 없어요.<br />로드맵에서 프로젝트/산출물을 선택하거나 먼저 만들어보세요.</p></div>
          ) : kbFlat ? (
          /* 날짜순 목록 뷰: 모든 task를 기한 날짜 순으로 나열(날짜별 그룹) */
          (() => {
            const flat = kbColsView.flatMap(col => col.subtasks.map(s => ({ col, s })));
            const keyOf = (x: { s: Sub }) => x.s.deadline || x.s.date || '';
            flat.sort((a, b) => (keyOf(a) || '9999-99-99').localeCompare(keyOf(b) || '9999-99-99'));
            const groups: { key: string; items: { col: KbCol; s: Sub }[] }[] = [];
            for (const it of flat) { const k = keyOf(it) || '__none__'; const last = groups[groups.length - 1]; if (last && last.key === k) last.items.push(it); else groups.push({ key: k, items: [it] }); }
            const fmtHead = (k: string) => k === '__none__' ? '기한 없음' : (() => { const d = new Date(k + 'T00:00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`; })();
            return (
              <div className="flex-1 min-h-0">
                {flat.length === 0 ? (
                  <div className="h-full flex items-center justify-center"><p className="text-[13px] text-center" style={{ color: '#9AA39D' }}>표시할 task가 없어요.</p></div>
                ) : (
                  <div className="h-full flex gap-3 overflow-x-auto pb-1">
                    {groups.map(g => (
                      <div key={g.key} className="flex flex-col min-h-0 w-[300px] flex-shrink-0 rounded-xl border-2" style={{ borderColor: kbDrag ? '#C9B8F5' : 'var(--spira-border-subtle)', backgroundColor: '#FBFBF9' }}
                        onDragOver={e => { if (kbDrag) e.preventDefault(); }} onDrop={() => { if (kbDrag) kbMoveTaskToDate(kbDrag, g.key); setKbDrag(null); }}>
                        <div className="px-3 py-2 border-b flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                          <span className="text-[14px] font-black" style={{ color: g.key === '__none__' ? '#9AA39D' : '#16211E' }}>{fmtHead(g.key)}</span>
                          {g.key !== '__none__' && <DdayBadge d={g.key} />}
                          <span className="text-[11px] tabular-nums ml-auto" style={{ color: '#9AA39D' }}>{g.items.length}</span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                          {g.items.map(({ col, s }) => renderTaskCard(col, s, true))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
          ) : (
          <div ref={boardRef} className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-1">
            {kbColsView.map(col => (
            <div key={col.todoId} data-ask data-ask-label={`${col.p.wsName ? col.p.wsName + ' · ' : ''}카테고리 · ${col.area}`} data-ask-content={`[비즈니스: ${col.p.wsName || '내 비즈니스'}] 카테고리 '${col.area}'${col.goalSub ? `: ${col.goalSub}` : ''}`} className="flex flex-col min-h-0 w-[317px] flex-shrink-0 rounded-xl border-2" style={{ borderColor: col.pinned ? '#F0B429' : 'var(--spira-border-subtle)', backgroundColor: col.pinned ? '#FFFBEF' : '#FBFBF9' }}
              onDragOver={e => { if (kbDrag) { e.preventDefault(); const end = col.subtasks.length; setKbDragOver(prev => (prev && prev.todoId === col.todoId && prev.index === end) ? prev : { todoId: col.todoId, index: end }); } }}
              onDrop={() => { if (kbDrag) { const at = (kbDragOver && kbDragOver.todoId === col.todoId) ? kbDragOver.index : col.subtasks.length; kbInsertAt(col, kbDrag, at); setKbDrag(null); } }}>
              {/* 헤더: 업무영역(큰) + 산출물(작은) + 기한 */}
              <div className="px-3 py-2 border-b" style={{ borderColor: col.pinned ? '#F5DFA0' : 'var(--spira-border-subtle)' }}>
                {/* 어떤 비즈니스의 카테고리인지 */}
                <div className="flex items-center gap-1 mb-1 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(col.p.wsId) }} />
                  <span className="text-[10px] font-bold truncate" style={{ color: businessColor(col.p.wsId) }}>{col.p.wsName || '내 비즈니스'}</span>
                </div>
                <div className="group/col flex items-center gap-1.5 min-w-0">
                  <button onClick={() => kbTogglePin(col)} title={col.pinned ? '우선 해제' : '우선 표시 (맨 앞으로)'} className="flex-shrink-0 transition-transform hover:scale-110">
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill={col.pinned ? '#F0B429' : 'none'} stroke={col.pinned ? '#F0B429' : '#C7CEC7'} strokeWidth="1.5"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L2.2 7.7l5.4-.8L10 2z" strokeLinejoin="round" /></svg>
                  </button>
                  <span className="text-[14px] font-black truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{col.area}</span>
                  <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: '#9AA39D' }}>{col.subtasks.length}</span>
                  <button onClick={() => kbDelCategory(col)} title="카테고리 삭제" className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0 opacity-0 group-hover/col:opacity-100 transition-opacity" style={{ lineHeight: 1 }}>×</button>
                </div>
                {col.goalSub && <p className="text-[12px] font-bold break-words leading-snug mt-0.5 ml-3.5" style={{ color: '#5B6560' }}>{col.goalSub}</p>}
                <div className="flex items-center gap-1.5 mt-1 ml-3.5">
                  <input type="date" value={col.due} onChange={e => kbSetTodoDue(col, e.target.value)} title="산출물 기한" className="text-[10px] tabular-nums bg-white border rounded px-1 py-0.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }} />
                  <DdayBadge d={col.due} />
                  {col.projectId && (() => { const meta = STATUS_META[col.status || 'planned'] ?? STATUS_META.planned; return (
                    <select value={col.status || 'planned'} onChange={e => kbSetStatus(col, e.target.value)} title="프로젝트 상태" className="text-[10px] font-bold rounded-full pl-2 pr-1 py-0.5 border-0 outline-none cursor-pointer appearance-none flex-shrink-0 ml-auto" style={{ backgroundColor: meta.bg, color: meta.color }}>
                      <option value="planned">예정</option><option value="active">진행중</option><option value="done">완료</option><option value="onhold">보류</option>
                    </select>
                  ); })()}
                </div>
              </div>
              {/* 태스크 */}
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                    <div className="space-y-2">
                      {col.subtasks.map((s, i) => (
                        <div key={s.id}>
                          {kbDrag && kbDrag !== s.id && kbDragOver?.todoId === col.todoId && kbDragOver.index === i && <div className="h-[3px] rounded-full mb-2" style={{ backgroundColor: '#7C3AED' }} />}
                          {renderTaskCard(col, s)}
                        </div>
                      ))}
                      {kbDrag && kbDragOver?.todoId === col.todoId && kbDragOver.index >= col.subtasks.length && <div className="h-[3px] rounded-full" style={{ backgroundColor: '#7C3AED' }} />}
                      <div className="flex gap-1.5">
                        <button onClick={() => kbAddTask(col)} className="flex-1 py-1.5 rounded-lg border-2 border-dashed text-[12px] font-semibold transition-colors hover:bg-white" style={{ borderColor: 'var(--spira-border)', color: '#9AA39D' }}>+ task</button>
                        <button onClick={() => kbAiTasks(col)} data-teach="kb-ai" disabled={!!kbAiBusy} title="AI로 이 산출물의 task 생성" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-colors flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>
                          {kbAiBusy === col.todoId
                            ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>}
                          AI
                        </button>
                      </div>
                    </div>
              </div>
            </div>
          ))}
            {/* 최근 완료: 완료 후 2주간 되살리기 가능, 이후 사라짐 */}
            {recentDone.length > 0 && (
              <div className="flex flex-col min-h-0 w-[280px] flex-shrink-0 rounded-xl border-2 border-dashed" style={{ borderColor: '#D8D8D0', backgroundColor: '#FAFAF7' }}>
                <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                  <div className="text-[13px] font-black" style={{ color: '#5B6560' }}>최근 완료 · {recentDone.length}</div>
                  <p className="text-[10px] mt-0.5" style={{ color: '#9AA39D' }}>완료 후 {RETAIN_DAYS}일간 되살릴 수 있어요</p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {recentDone.map(({ p, dl, daysLeft }) => (
                    <div key={dl.id} className="bg-white border rounded-lg p-2.5" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(p.wsId) }} />
                        <span className="text-[12px] font-bold flex-1 min-w-0 line-clamp-2" style={{ color: '#16211E' }}>{dl.name}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] font-semibold" style={{ color: daysLeft <= 3 ? '#C0392B' : '#9AA39D' }}>{daysLeft}일 후 사라짐</span>
                        <button onClick={() => kbRestoreDeadline(p, dl.id, dl.projectId)} className="text-[11px] font-bold rounded-full px-2.5 py-1 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#E4F5E0', color: '#3E6B1F' }}>되살리기</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      ) : (
      /* 간트: 좌측 트리(고정) + 우측 타임라인(연속 가로/세로 스크롤) */
      <div ref={scrollRef} onScroll={e => updateVisLabel(e.currentTarget)} className="flex-1 min-h-0 overflow-auto overscroll-contain border rounded-xl" style={{ borderColor: 'var(--spira-border-subtle)' }} onDragOver={e => { if (dragPayloadRef.current) e.preventDefault(); }} onDrop={onTrackDrop}>
        <div className="relative" style={{ width: LABEL_W + contentWidth }}>
          {/* 헤더 */}
          <div className="flex sticky top-0 z-20" style={{ height: HEAD_H }}>
            <div className="sticky left-0 z-30 bg-white flex items-center px-3 border-r border-b" style={{ width: LABEL_W, borderColor: '#F0F0EA' }}><span className="text-[11px] font-bold" style={{ color: '#9AA39D' }}>프로젝트 · 산출물</span></div>
            <div ref={timelineRef} className="relative bg-white border-b" style={{ width: contentWidth, borderColor: '#F0F0EA' }}>
              {labels.map((t, i) => <div key={i} className="absolute top-2 text-[10px] font-medium whitespace-nowrap" style={{ left: t.x, color: '#9AA39D', transform: 'translateX(3px)' }}>{t.text}</div>)}
            </div>
          </div>
          {/* 본문 */}
          <div ref={bodyRef} className="relative">
            {/* 배경: 그리드/오늘 (타임라인 영역) */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: LABEL_W, width: contentWidth }}>
              {/* 막대 연결선 (의존성) */}
              {connLines.length > 0 && (
                <svg className="absolute top-0 left-0 pointer-events-none" width={contentWidth} height="100%" style={{ overflow: 'visible', zIndex: 5 }}>
                  {connLines.map((l, i) => { const mx = (l.x1 + l.x2) / 2; return (
                    <g key={i}>
                      <path d={`M ${l.x1} ${l.y1} C ${mx} ${l.y1}, ${mx} ${l.y2}, ${l.x2} ${l.y2}`} fill="none" stroke="#2B62C4" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
                      <circle cx={l.x2} cy={l.y2} r={2.5} fill="#2B62C4" opacity={0.7} />
                    </g>
                  ); })}
                </svg>
              )}
              {dayLines.map((x, i) => <div key={`d${i}`} className="absolute top-0 bottom-0 w-px" style={{ left: x, backgroundColor: '#EEEEE8' }} />)}
              {strongLines.map((x, i) => <div key={`s${i}`} className="absolute top-0 bottom-0 w-px" style={{ left: x, backgroundColor: '#E2E2DA' }} />)}
              {/* 오프(휴무) 밴드는 막대 위 마스크로 그림(아래 참고) */}
              {todayStr >= rangeStart && daysBetween(rangeStart, todayStr) < span && <div className="absolute top-0 bottom-0 w-px" style={{ left: todayX, backgroundColor: '#9DFE3B' }} />}
            </div>
            {rowsDraw.length === 0 ? (
              <div className="flex"><div className="sticky left-0 bg-white" style={{ width: LABEL_W }} /><p className="text-[12px] py-8 px-4" style={{ color: '#9AA39D' }}>항목이 없어요. 오른쪽 위 ‘내용 수정’으로 Plan에서 만들어보세요.</p></div>
            ) : rowsDraw.map(r => {
              const pgIdx0 = pgOrder.get(r.pgKey) ?? 0;
              if (r.isAdd) return (
                <div key={r.key} className="flex" style={{ height: ROW_H - 6, backgroundColor: pgIdx0 % 2 === 1 ? '#FBFBF9' : 'transparent' }}>
                  <div className="sticky left-0 z-20 flex items-center gap-1 border-b" style={{ width: LABEL_W, paddingLeft: 8 + (r.level - 1) * 15 + 20, borderColor: '#F4F4F0', backgroundColor: pgIdx0 % 2 === 1 ? '#FBFBF9' : '#fff' }}>
                    <button onClick={() => (r.addKind === 'todo' ? addTodoInline(r) : addDeadlineInline(r))} className="flex items-center gap-1 text-[11px] font-semibold rounded-md px-1.5 py-0.5 transition-colors hover:bg-neutral-100 flex-shrink-0" style={{ color: '#3E7A2E' }} title={`여기서 ${r.addKind === 'todo' ? '산출물' : '프로젝트'} 바로 추가`}>
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>여기서 추가
                    </button>
                  </div>
                  <div className="relative" style={{ width: contentWidth }} />
                </div>
              );
              const placed = !!(r.start && r.end);
              const isCollapsed = !isOpen(r.key, r.level);
              const hl = r.key === selectedKey;
              const checked = sel.has(r.key);
              const pgIdx = pgIdx0;
              const left = placed ? xOf(r.start!) : 0;
              const width = placed ? wOf(r.start!, r.end!) : 0;
              const offSpan = placed && r.level >= 1 ? offDaysInSpan(r.start!, r.end!) : 0; // 프로젝트·영역별 산출물 span 안 휴무일수 → 연장 표시
              const dragging = calDrag?.key === r.key;
              const bl = sortMode === 'dday' ? 2 : r.level; // 시작일순에서는 산출물 막대를 비즈니스별 산출물(2단계) 디자인과 동일하게
              return (
                <div key={r.key} data-rm-row={r.key} className="flex" style={{ minHeight: ROW_H, backgroundColor: pgIdx % 2 === 1 ? '#FBFBF9' : 'transparent' }}>
                  <div
                    onClick={() => (selMode ? toggleSel(rowSel(r)) : enterLevel(r))}
                    data-ask data-ask-label={`${r.kind === 'deadline' ? '프로젝트' : '산출물'} · ${r.name}`} data-ask-content={`[비즈니스: ${programs.find(p => p.id === r.programId)?.wsName || '내 비즈니스'}] ${r.kind === 'deadline' ? '프로젝트' : '산출물'}: ${r.name}${r.subName ? ` (${r.subName})` : ''}`}
                    className="group sticky left-0 z-20 flex items-center gap-1 pr-2 border-b cursor-pointer"
                    style={{ width: LABEL_W, paddingLeft: 8 + (r.level - 1) * 15, borderColor: '#F4F4F0', backgroundColor: checked ? '#F3F0FF' : hl ? '#EAF7DA' : pgIdx % 2 === 1 ? '#FBFBF9' : '#fff' }}
                    draggable={!selMode && r.level > 0 && !placed}
                    onDragStart={!selMode && r.level > 0 && !placed ? e => { e.stopPropagation(); startListDrag({ level: r.kind, wsId: r.wsId, programId: r.programId, deadlineId: r.deadlineId, todoId: r.todoId, subtaskId: r.subtaskId, unitId: r.unitId }, e); } : undefined}
                    title={!placed && r.level > 0 ? '드래그해서 타임라인에 배치' : r.name}
                  >
                    {selMode && <SelCheck on={checked} />}
                    {r.hasChildren ? (
                      <button onClick={e => { e.stopPropagation(); toggleOpen(r.key, r.level); }} className="w-4 h-4 flex items-center justify-center flex-shrink-0" title={isCollapsed ? '하위 펼치기' : '하위 접기'}><svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}><path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                    ) : <span className="w-4 flex-shrink-0" />}
                    <span className="rounded-full flex-shrink-0" style={{ width: r.level === 0 ? 8 : 6, height: r.level === 0 ? 8 : 6, backgroundColor: r.color, opacity: r.level >= 2 ? 0.6 : 1 }} />
                    <span className="flex-1 min-w-0 py-1 leading-snug">
                      {editingKey === r.key ? (
                        <input autoFocus defaultValue={r.name} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                          onKeyDown={e => { if (e.key === 'Enter') { renameRow(r, (e.target as HTMLInputElement).value); setEditingKey(null); } else if (e.key === 'Escape') setEditingKey(null); }}
                          onBlur={e => { renameRow(r, e.target.value); setEditingKey(null); }}
                          className="w-full text-[12px] px-1.5 py-1 rounded-md bg-white outline-none" style={{ border: `1.5px solid ${r.color}` }} />
                      ) : (
                        <span className="line-clamp-2 break-words block cursor-text" onDoubleClick={e => { e.stopPropagation(); setEditingKey(r.key); }} title="더블클릭하여 이름 수정" style={{ fontSize: r.level === 0 ? 13 : 12, fontWeight: r.level === 0 ? 800 : r.level === 1 ? 600 : 400, color: r.level >= 2 ? '#5B6560' : '#16211E' }}>{r.name}</span>
                      )}
                      {r.subName && <span className="truncate block text-[10px]" style={{ color: '#9AA39D' }}>{r.subName}</span>}
                    </span>
                    {!placed && r.level > 0 && <span className="text-[9px] flex-shrink-0" style={{ color: '#C4A24A' }}>미배치</span>}
                    {r.level > 0 && editingKey !== r.key && <button onClick={e => { e.stopPropagation(); setEditingKey(r.key); }} className="text-neutral-300 hover:text-violet-500 text-[11px] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="이름 수정">✎</button>}
                    <button onClick={e => { e.stopPropagation(); delRow(r); }} className="text-neutral-300 hover:text-red-500 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="삭제">×</button>
                  </div>
                  <div className="relative" style={{ width: contentWidth }}>
                    {placed && (
                      <div data-rm-bar={r.key} data-teach={r.kind === 'deadline' ? 'roadmap-bar' : undefined} onMouseDown={e => startCalDrag(r, 'move', e)} onClick={() => { if (movedRef.current) { movedRef.current = false; return; } enterLevel(r); }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (r.level > 0 && r.start && r.end) { const z = htmlZoom(); setCtxMenu({ r, x: e.clientX / z, y: e.clientY / z, days: daysBetween(r.start, r.end) + 1, start: r.start }); } }}
                        className="group/bar absolute top-1/2 -translate-y-1/2 flex items-center cursor-pointer"
                        style={{
                          left, width: Math.max(width, bl === 1 ? 14 : 6), height: barH(bl),
                          // 위계: 프로젝트=진한 단색(흰 글씨), 산출물=연한 채움+테두리
                          backgroundColor: bl === 1 ? r.color : `${r.color}33`,
                          border: bl === 1 ? `1px solid ${r.color}` : `1.5px solid ${r.color}`,
                          borderRadius: bl === 1 ? 8 : 6,
                          opacity: dragging ? 0.95 : 1,
                          boxShadow: hl ? `0 0 0 2px #fff, 0 0 0 3px ${r.color}` : (bl === 1 ? '0 2px 5px rgba(0,0,0,0.15)' : 'none'),
                          zIndex: hl ? 6 : bl === 1 ? 4 : 1,
                        }}
                        title={`${r.name} — 클릭: 하위 단계로 · 드래그: 이동 · 양끝: 기간 조절 · 우클릭: 소요일 입력`}>
                        {bl >= 2 && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1.5" style={{ backgroundColor: r.color }} />}
                        <span className="truncate px-2 pointer-events-none" style={{ fontSize: bl === 1 ? 12 : 12, fontWeight: bl === 1 ? 800 : 600, color: bl === 1 ? '#fff' : '#16211E', textShadow: bl === 1 ? '0 1px 1.5px rgba(0,0,0,0.3)' : undefined }}>{r.name}</span>
                        {r.level > 0 && <>
                          <div onMouseDown={e => startCalDrag(r, 'resize-start', e)} onClick={e => e.stopPropagation()} className="absolute left-0 top-0 bottom-0 w-2 flex items-center justify-center cursor-ew-resize z-20" title="시작일 조절"><span className="w-1 h-3 rounded-full" style={{ backgroundColor: r.color }} /></div>
                          <div onMouseDown={e => startCalDrag(r, 'resize-end', e)} onClick={e => e.stopPropagation()} className="absolute right-0 top-0 bottom-0 w-2 flex items-center justify-center cursor-ew-resize z-20" title="완료일 조절"><span className="w-1 h-3 rounded-full" style={{ backgroundColor: r.color }} /></div>
                        </>}
                        {/* 막대 연결(의존성) */}
                        {r.kind === 'todo' && r.todoId && (
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onBarLinkClick(r.todoId); }}
                            title={linkFrom ? (linkFrom === r.todoId ? '연결 취소' : '이 막대를 뒤에 연결') : (dependentIds.has(r.todoId) ? '연결됨 (클릭: 선행으로 지정) · 아래 × 로 해제' : '연결 시작(선행 막대로 지정)')}
                            className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center z-30 transition-opacity ${linkFrom || dependentIds.has(r.todoId) ? '' : 'opacity-0 group-hover/bar:opacity-100'}`}
                            style={{ backgroundColor: linkFrom === r.todoId ? '#2B62C4' : dependentIds.has(r.todoId) ? '#E7F0FF' : '#fff', border: '1px solid #2B62C4' }}>
                            <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke={linkFrom === r.todoId ? '#fff' : '#2B62C4'} strokeWidth="1.6"><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" strokeLinecap="round" /></svg>
                          </button>
                        )}
                        {r.kind === 'todo' && r.todoId && dependentIds.has(r.todoId) && !linkFrom && (
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); unlinkTodo(r.todoId!); }} title="연결 해제" className="absolute -bottom-1.5 -left-1 w-3.5 h-3.5 rounded-full flex items-center justify-center z-30 text-[9px]" style={{ backgroundColor: '#fff', border: '1px solid #C4CCC4', color: '#9AA39D' }}>×</button>
                        )}
                      </div>
                    )}
                    {/* 휴무일수만큼 프로젝트 연장 표시(오프 기간은 위 마스크로 비워짐) */}
                    {placed && offSpan > 0 && (
                      <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none" title={`휴무 ${offSpan}일만큼 연장`}
                        style={{ left: xOf(addDaysStr(r.end!, 1)), width: offSpan * pxPerDay, height: barH(bl), backgroundColor: `${r.color}2E`, border: `1px dashed ${r.color}`, borderRadius: bl === 1 ? 8 : 6, opacity: 0.85, zIndex: 2 }} />
                    )}
                  </div>
                </div>
              );
            })}
            {/* 오프(휴무) 마스크 — 막대 위를 덮어 오프 기간엔 아무 것도 없게 */}
            {offBands.length > 0 && (
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: LABEL_W, width: contentWidth, zIndex: 7 }}>
                {offBands.map(b => (
                  <div key={`offmask${b.start}`} className="absolute top-0 bottom-0 overflow-hidden flex items-start justify-center" style={{ left: xOf(b.start), width: wOf(b.start, b.end), borderLeft: '1px solid #E7E0D2', borderRight: '1px solid #E7E0D2', background: 'repeating-linear-gradient(45deg, #EFE7D6, #EFE7D6 5px, #F6F1E6 5px, #F6F1E6 10px)' }}>
                    <span className="text-[9px] font-bold mt-1 px-1 rounded-full whitespace-nowrap" style={{ backgroundColor: '#FBE7C6', color: '#96631A' }}>off</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 우클릭: 막대 소요 일수 입력 */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div data-teach-ctx className="fixed z-[80] rounded-xl bg-white shadow-xl p-3" style={{ left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth / htmlZoom() : 9999) - 210), top: ctxMenu.y + 6, border: '1px solid #E7E7E1', width: 196 }} onClick={e => e.stopPropagation()}>
            <div className="text-[11px] font-bold mb-1.5 truncate" style={{ color: '#16211E' }}>{ctxMenu.r.kind === 'deadline' ? '프로젝트' : '산출물'} 일정</div>
            <div className="text-[10px] mb-2 truncate" style={{ color: '#9AA39D' }}>{ctxMenu.r.name}</div>
            <div className="text-[10px] font-semibold mb-1" style={{ color: '#5B6560' }}>시작 날짜</div>
            <input type="date" value={ctxMenu.start}
              onChange={e => setCtxMenu(c => c ? { ...c, start: e.target.value } : c)}
              onKeyDown={e => { if (e.key === 'Enter') { setBarRange(ctxMenu.r, ctxMenu.start, ctxMenu.days); setCtxMenu(null); } else if (e.key === 'Escape') setCtxMenu(null); }}
              className="w-full text-[13px] px-2 py-1.5 rounded-lg outline-none tabular-nums mb-2.5" style={{ border: '1.5px solid #C9D6C2' }} />
            <div className="text-[10px] font-semibold mb-1" style={{ color: '#5B6560' }}>소요 일수</div>
            <div className="flex items-center gap-1.5">
              <input type="number" min={1} value={ctxMenu.days}
                onChange={e => setCtxMenu(c => c ? { ...c, days: Math.max(1, Number(e.target.value) || 1) } : c)}
                onKeyDown={e => { if (e.key === 'Enter') { setBarRange(ctxMenu.r, ctxMenu.start, ctxMenu.days); setCtxMenu(null); } else if (e.key === 'Escape') setCtxMenu(null); }}
                className="w-16 text-[13px] px-2 py-1.5 rounded-lg outline-none tabular-nums text-center" style={{ border: '1.5px solid #C9D6C2' }} />
              <span className="text-[12px]" style={{ color: '#5B6560' }}>일</span>
              <button onClick={() => { setBarRange(ctxMenu.r, ctxMenu.start, ctxMenu.days); setCtxMenu(null); }} className="ml-auto text-[12px] font-bold rounded-lg px-3 py-1.5 text-white" style={{ backgroundColor: '#3E6B1F' }}>적용</button>
            </div>
            {ctxMenu.r.kind === 'deadline' && <div className="text-[10px] mt-2 leading-snug" style={{ color: '#9AA39D' }}>시작일부터 소요 일수만큼 배치 · 하위 산출물도 함께 조정돼요.</div>}
          </div>
        </>
      )}

      {/* 완료 시 실제 소요시간 입력 */}
      {actualTarget && (
        <ActualTimeModal
          taskName={actualTarget.s.name}
          estimatedMin={actualTarget.s.durationMin}
          onSave={min => { updateSub(actualTarget.col, actualTarget.s.id, { actualMin: min }); setActualTarget(null); }}
          onSkip={() => setActualTarget(null)}
        />
      )}

      {/* 카테고리 추가 / 템플릿 */}
      {catPanel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setCatPanel(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto p-5" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-black" style={{ color: '#16211E' }}>카테고리 추가</h3>
              <button onClick={() => setCatPanel(false)} className="text-neutral-300 hover:text-neutral-700 text-lg leading-none">×</button>
            </div>
            <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>새 카테고리(산출물) 이름 <span style={{ color: '#C4CCC4' }}>· 영역: 내용 형태 가능</span></label>
            <div className="flex gap-1.5 mt-1 mb-4">
              <input autoFocus value={catName} onChange={e => setCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && catName.trim()) addCategory(catName); }} placeholder="예: 디자인: 랜딩 페이지 시안" className="flex-1 bg-neutral-50 border rounded-xl px-3 py-2 text-[14px] outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              <button onClick={() => addCategory(catName)} disabled={!catName.trim()} className="px-3.5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>추가</button>
            </div>
            {store.boardTemplates.length > 0 && (
              <>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>저장된 템플릿 <span style={{ color: '#C4CCC4' }}>· 카테고리 또는 그룹(여러 카테고리) 세트를 불러와요</span></label>
                <div className="mt-1.5 space-y-1.5">
                  {store.boardTemplates.map(tpl => { const isGroup = !!tpl.columns?.length; return (
                    <div key={tpl.id} className="flex items-center gap-2 border rounded-xl px-3 py-2" style={{ borderColor: isGroup ? '#E3D9FB' : 'var(--spira-border-subtle)', backgroundColor: isGroup ? '#FAF8FF' : undefined }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold truncate flex items-center gap-1" style={{ color: '#16211E' }}>{isGroup && <span className="text-[9px] font-black rounded px-1 py-0.5 flex-shrink-0" style={{ backgroundColor: '#EDE7FB', color: '#7C3AED' }}>그룹</span>}{tpl.name}</p>
                        <p className="text-[11px]" style={{ color: '#9AA39D' }}>{isGroup ? `카테고리 ${tpl.columns!.length}개 · task ${tpl.columns!.reduce((n, c) => n + c.tasks.length, 0)}개` : `task ${tpl.tasks.length}개`}</p>
                      </div>
                      <button onClick={() => isGroup ? applyGroupTemplate(tpl.columns!) : addCategory(tpl.name, tpl.tasks)} className="text-[12px] font-bold rounded-full px-2.5 py-1 flex-shrink-0" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>적용</button>
                      <button onClick={() => store.deleteBoardTemplate(tpl.id)} className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0" title="템플릿 삭제">×</button>
                    </div>
                  ); })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 업무 영역 관리 모달 — 추가/수정/삭제 */}
      {areaPanel && (() => {
        const bizList = store.allWorkspacesEntries.map(e => ({ id: e.workspace.id, name: e.workspace.name || '내 비즈니스' }));
        const targetWs = (areaPanelWs && bizList.some(b => b.id === areaPanelWs) ? areaPanelWs : bizList[0]?.id) ?? null;
        const areas = targetWs ? (store.allWorkspacesEntries.find(e => e.workspace.id === targetWs)?.plan.workAreas ?? []) : [];
        const AREA_PAL = ['#7C9EF6', '#6FCF97', '#F2994A', '#BB6BD9', '#EB5757', '#56CCF2', '#F2C94C', '#27AE60'];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setAreaPanel(false)}>
            <div className="bg-white rounded-2xl w-full max-w-[440px] p-5 max-h-[85vh] overflow-y-auto" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[15px] font-black" style={{ color: '#16211E' }}>업무 영역 관리</h3>
                <button onClick={() => setAreaPanel(false)} className="text-neutral-300 hover:text-neutral-700 text-lg leading-none">×</button>
              </div>
              <p className="text-[11px] mb-3" style={{ color: '#9AA39D' }}>영역 이름·색을 바꾸거나, 새로 추가·삭제할 수 있어요. 삭제해도 그 영역의 일정은 미분류로 남아요.</p>
              {bizList.length > 1 && (
                <div className="flex items-center gap-1 flex-wrap mb-3">
                  {bizList.map(b => (
                    <button key={b.id} onClick={() => setAreaPanelWs(b.id)} className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 transition-colors" style={targetWs === b.id ? { backgroundColor: '#16211E', color: '#fff' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: businessColor(b.id) }} />{b.name}
                    </button>
                  ))}
                </div>
              )}
              {!targetWs ? (
                <p className="text-[13px] text-center py-6" style={{ color: '#9AA39D' }}>비즈니스를 먼저 만들어주세요.</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {areas.length === 0 && <p className="text-[12px] text-center py-3" style={{ color: '#9AA39D' }}>아직 업무 영역이 없어요. 아래에서 추가해보세요.</p>}
                    {areas.map(a => (
                      <div key={a.id} className="flex items-center gap-2 border rounded-xl px-2.5 py-2" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                        <button onClick={() => { const i = AREA_PAL.indexOf(a.color); store.updateWorkArea(targetWs, a.id, { color: AREA_PAL[(i + 1) % AREA_PAL.length] }); }} className="w-4 h-4 rounded-full flex-shrink-0 border border-black/10" style={{ backgroundColor: a.color }} title="색 바꾸기" />
                        <input value={a.name} onChange={e => store.updateWorkArea(targetWs, a.id, { name: e.target.value })} placeholder="영역 이름" className="flex-1 min-w-0 bg-transparent text-[13px] font-bold outline-none" style={{ color: '#16211E' }} />
                        <button onClick={() => { if (window.confirm(`'${a.name || '이 영역'}'을(를) 삭제할까요?\n이 영역의 일정은 미분류로 남습니다.`)) store.deleteWorkArea(targetWs, a.id); }} className="text-neutral-300 hover:text-red-500 text-sm flex-shrink-0" title="영역 삭제">×</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-3">
                    <input value={newAreaName} onChange={e => setNewAreaName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && newAreaName.trim()) { store.addWorkArea(targetWs, { name: newAreaName.trim() }); setNewAreaName(''); } }} placeholder="새 업무 영역 (예: 마케팅)" className="flex-1 bg-neutral-50 border rounded-xl px-3 py-2 text-[13px] outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                    <button onClick={() => { if (newAreaName.trim()) { store.addWorkArea(targetWs, { name: newAreaName.trim() }); setNewAreaName(''); } }} disabled={!newAreaName.trim()} className="px-3.5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>추가</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 그룹 저장: 저장할 카테고리 선택 모달 */}
      {groupSaveOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setGroupSaveOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[440px] p-5 max-h-[85vh] flex flex-col" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[15px] font-black" style={{ color: '#16211E' }}>템플릿으로 저장</h3>
              <button onClick={() => setGroupSaveOpen(false)} className="text-neutral-300 hover:text-neutral-700 text-lg leading-none">×</button>
            </div>
            <p className="text-[11px] mb-3" style={{ color: '#9AA39D' }}>저장할 카테고리를 고르세요. 1개만 고르면 그 카테고리가, 여러 개를 고르면 묶음(그룹)으로 저장돼요.</p>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setGroupSelIds(new Set(kbColsView.map(c => c.todoId)))} className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>전체 선택</button>
              <button onClick={() => setGroupSelIds(new Set())} className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>전체 해제</button>
              <span className="text-[11px] ml-auto tabular-nums" style={{ color: '#9AA39D' }}>{groupSelIds.size}개 선택</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 mb-3">
              {kbColsView.map(c => { const on = groupSelIds.has(c.todoId); return (
                <button key={c.todoId} onClick={() => setGroupSelIds(prev => { const n = new Set(prev); if (n.has(c.todoId)) n.delete(c.todoId); else n.add(c.todoId); return n; })} className="w-full flex items-center gap-2 border rounded-xl px-3 py-2 text-left transition-colors" style={{ borderColor: on ? '#C9B8F5' : 'var(--spira-border-subtle)', backgroundColor: on ? '#FAF8FF' : '#fff' }}>
                  <span className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: on ? '#7C3AED' : '#C7CEC7', backgroundColor: on ? '#7C3AED' : '#fff' }}>{on && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate" style={{ color: '#16211E' }}>{c.p.wsName ? `${c.p.wsName} · ` : ''}{c.area}</p>
                    <p className="text-[11px]" style={{ color: '#9AA39D' }}>task {c.subtasks.length}개</p>
                  </div>
                </button>
              ); })}
            </div>
            <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>템플릿 이름 <span style={{ color: '#C4CCC4' }}>· 비우면 자동으로 지어져요</span></label>
            <div className="flex gap-1.5 mt-1">
              <input value={groupSaveName} onChange={e => setGroupSaveName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && groupSelIds.size > 0) saveSelectedAsGroup(); }} placeholder={groupSelIds.size === 1 ? (kbColsView.find(c => groupSelIds.has(c.todoId))?.area || '카테고리') : `카테고리 ${groupSelIds.size}개 세트`} className="flex-1 bg-neutral-50 border rounded-xl px-3 py-2 text-[13px] outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              <button onClick={saveSelectedAsGroup} disabled={groupSelIds.size === 0} className="px-3.5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 수정 팝업 */}
      {bulkOpen && sel.size > 0 && (
        <BulkEditModal items={[...sel.values()]} context={programs.filter(p => [...sel.values()].some(i => i.programId === p.id)).map(p => `${p.name}${p.goal ? ` (${p.goal})` : ''}`).join(' / ')} onApply={applyBulkPatches} onClose={() => setBulkOpen(false)} />
      )}

      {/* task / 세부작업 추가 팝업 */}
      {kbForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setKbForm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[360px] p-5" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-black" style={{ color: '#16211E' }}>{kbForm.mode === 'task' ? (kbForm.editTaskId ? 'task 수정' : 'task 추가') : kbForm.editUnitId ? '세부 작업 수정' : '세부 작업 추가'}</h3>
              <button onClick={() => setKbForm(null)} className="text-neutral-300 hover:text-neutral-700 text-lg leading-none">×</button>
            </div>
            <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>이름</label>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) kbSubmitForm(); }}
              placeholder={kbForm.mode === 'task' ? '예: 메인 화면 시안 디자인' : '예: 아이콘 세트 정리'}
              className="w-full mt-1 mb-3 bg-neutral-50 border rounded-xl px-3 py-2 text-[14px] outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
            {(
              <>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>소요 시간 (선택){kbForm.mode === 'task' ? ' · 날짜는 자동 지정' : ''}</label>
                <div className="flex flex-wrap gap-1.5 mt-1 mb-4">
                  {[15, 30, 60, 90, 120, 180, 240, 480].map(min => {
                    const on = formDur === String(min);
                    return <button key={min} onClick={() => setFormDur(on ? '' : String(min))} className="text-[12px] font-semibold rounded-full px-2.5 py-1 border transition-colors" style={on ? { backgroundColor: '#DFF9C4', borderColor: '#BCE89A', color: '#3E6B1F' } : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#5B6560' }}>{fmtDur(min)}</button>;
                  })}
                </div>
              </>
            )}
            {kbForm.mode === 'task' && (
              <>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>일정 성격</label>
                <div className="flex gap-1.5 mt-1 mb-3">
                  {([['flexible', '자유', '언제든 이동 가능'], ['due', '기한', '기한 내 자유 배치'], ['fixed', '고정', '이 날짜에 고정']] as const).map(([v, label, hint]) => {
                    const on = formType === v;
                    return <button key={v} onClick={() => setFormType(v)} title={hint} className="flex-1 text-[12px] font-semibold rounded-lg py-1.5 border transition-colors" style={on ? { backgroundColor: '#EEF6FF', borderColor: '#B9D4F5', color: '#2B62C4' } : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#9AA39D' }}>{label}</button>;
                  })}
                </div>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>우선순위</label>
                <div className="flex gap-1.5 mt-1 mb-4">
                  {([[1, '낮음'], [2, '보통'], [3, '높음'], [4, '긴급']] as const).map(([v, label]) => {
                    const on = formPriority === v;
                    return <button key={v} onClick={() => setFormPriority(v)} className="flex-1 text-[12px] font-semibold rounded-lg py-1.5 border transition-colors" style={on ? { backgroundColor: v >= 4 ? '#FFE1E1' : '#DFF9C4', borderColor: v >= 4 ? '#F3C7C7' : '#BCE89A', color: v >= 4 ? '#C0392B' : '#3E6B1F' } : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#9AA39D' }}>{label}</button>;
                  })}
                </div>
                <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>매주 반복 {formDays.length > 0 && <span style={{ color: '#7C3AED' }}>· 반복 업무</span>}</label>
                <div className="flex gap-1 mt-1 mb-4">
                  {['일', '월', '화', '수', '목', '금', '토'].map((label, dow) => {
                    const on = formDays.includes(dow);
                    return <button key={dow} onClick={() => setFormDays(prev => on ? prev.filter(x => x !== dow) : [...prev, dow])} className="flex-1 text-[12px] font-bold rounded-lg py-1.5 border transition-colors" style={on ? { backgroundColor: '#F3F0FF', borderColor: '#C9BCF0', color: '#7C3AED' } : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#C4CCC4' }}>{label}</button>;
                  })}
                </div>
                {(() => {
                  const cands = depCandidates(kbForm.col, kbForm.editTaskId);
                  if (!cands.length) return null;
                  return (
                    <>
                      <label className="text-[11px] font-semibold" style={{ color: '#9AA39D' }}>선행 작업 (먼저 끝나야 하는 것)</label>
                      <div className="flex flex-col gap-1 mt-1 mb-4 max-h-28 overflow-y-auto rounded-lg border p-1.5" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                        {cands.map(c => {
                          const on = formDeps.includes(c.id);
                          return (
                            <button key={c.id} onClick={() => setFormDeps(prev => on ? prev.filter(x => x !== c.id) : [...prev, c.id])} className="flex items-center gap-2 text-left rounded-md px-1.5 py-1 transition-colors" style={on ? { backgroundColor: '#F3F0FF' } : undefined}>
                              <span className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: on ? '#7C3AED' : '#C7CEC7', backgroundColor: on ? '#7C3AED' : 'transparent' }}>{on && <svg className="w-2 h-2" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
                              <span className="text-[12px] truncate" style={{ color: '#5B6560' }}>{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => setKbForm(null)} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>취소</button>
              <button onClick={kbSubmitForm} disabled={!formName.trim()} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>{(kbForm.editUnitId || kbForm.editTaskId) ? '수정' : '추가'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// 선택 항목 일괄 수정 — 기한/소요시간 직접 지정 + AI 대화로 이름·시간 변경
function BulkEditModal({ items, context, onApply, onClose }: {
  items: SelItem[]; context: string;
  onApply: (ups: { key: string; patch: BulkPatch }[]) => void;
  onClose: () => void;
}) {
  type Msg = { role: 'user' | 'assistant'; content: string; items?: { id: string; name: string; durationMin?: number; deadline?: string }[] };
  const [due, setDue] = useState('');
  const [dur, setDur] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fmtDur = (min?: number) => !min ? '' : min >= 60 ? (min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min / 60}시간`) : `${min}분`;
  const hasSched = items.some(i => i.kind !== 'unit');
  const hasUnit = items.some(i => i.kind === 'unit');
  const applyDue = () => { if (!due) return; onApply(items.filter(i => i.kind !== 'unit').map(i => ({ key: i.key, patch: { deadline: due } }))); };
  const applyDur = () => { if (!dur) return; onApply(items.filter(i => i.kind === 'unit').map(i => ({ key: i.key, patch: { durationMin: dur } }))); };

  const call = async (log: Msg[]) => {
    setLoading(true);
    try {
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'bulk-edit', context, today, items: items.map(i => ({ id: i.key, kind: i.kind, name: i.name, durationMin: i.durationMin, deadline: i.deadline })), messages: log.map(m => ({ role: m.role, content: m.content })) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { setMessages(m => [...m, { role: 'assistant', content: '앗, 잠시 문제가 생겼어요.' }]); return; }
      setMessages(m => [...m, { role: 'assistant', content: String(data.reply ?? ''), items: Array.isArray(data.items) ? data.items : [] }]);
    } catch { setMessages(m => [...m, { role: 'assistant', content: '네트워크 오류가 발생했어요.' }]); }
    finally { setLoading(false); }
  };
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, loading]);
  const send = () => { const t = input.trim(); if (!t || loading) return; const log = [...messages, { role: 'user' as const, content: t }]; setMessages(log); setInput(''); void call(log); };
  const latest = [...messages].reverse().find(m => m.items && m.items.length)?.items;
  const applyAi = () => { if (!latest) return; onApply(latest.map(it => ({ key: it.id, patch: { name: it.name, deadline: it.deadline, durationMin: it.durationMin } }))); };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-2 flex-shrink-0">
          <div><h3 className="text-[15px] font-black text-neutral-900">일괄 수정 · {items.length}개</h3><p className="text-[12px] text-neutral-400 mt-0.5">기한·소요시간을 한 번에 바꾸거나, 아래에서 AI와 대화로 바꿔보세요.</p></div>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-600 text-lg leading-none flex-shrink-0">×</button>
        </div>
        {/* 직접 수정 */}
        <div className="px-5 pb-2 flex-shrink-0 space-y-2">
          {hasSched && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold w-14 flex-shrink-0" style={{ color: '#5B6560' }}>기한</span>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} className="text-[13px] tabular-nums bg-neutral-50 border rounded-lg px-2 py-1 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
              <button onClick={applyDue} disabled={!due} className="text-[12px] font-bold rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>기한 적용</button>
            </div>
          )}
          {hasUnit && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold w-14 flex-shrink-0" style={{ color: '#5B6560' }}>소요시간</span>
              {[15, 30, 60, 90, 120, 240].map(min => <button key={min} onClick={() => setDur(dur === min ? null : min)} className="text-[12px] font-semibold rounded-full px-2 py-1 border" style={dur === min ? { backgroundColor: '#DFF9C4', borderColor: '#BCE89A', color: '#3E6B1F' } : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#5B6560' }}>{fmtDur(min)}</button>)}
              <button onClick={applyDur} disabled={!dur} className="text-[12px] font-bold rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>적용</button>
            </div>
          )}
        </div>
        {/* AI 대화 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2 space-y-2.5 border-t border-neutral-100 min-h-[120px]">
          {messages.length === 0 && <p className="text-[12px] text-center py-6" style={{ color: '#9AA39D' }}>예: “이름을 더 구체적으로” · “각각 30분으로” · “기한을 이번 주 안으로”</p>}
          {messages.map((m, mi) => (
            m.role === 'user' ? (
              <div key={mi} className="flex justify-end"><div className="max-w-[85%] text-[13px] leading-relaxed rounded-2xl px-3 py-2" style={{ backgroundColor: '#DFF9C4', color: '#16211E' }}>{m.content}</div></div>
            ) : (
              <div key={mi} className="space-y-2">
                {m.content && <div className="flex justify-start"><div className="max-w-[90%] text-[13px] leading-relaxed rounded-2xl px-3 py-2" style={{ backgroundColor: '#F1F1EB', color: '#3E4A44' }}>{m.content}</div></div>}
                {m.items && m.items.length > 0 && (
                  <div className="space-y-1">
                    {m.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] border border-neutral-200 rounded-lg px-2.5 py-1.5">
                        <span className="flex-1 min-w-0 truncate font-semibold" style={{ color: '#16211E' }}>{it.name}</span>
                        {it.durationMin ? <span className="flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtDur(it.durationMin)}</span> : null}
                        {it.deadline ? <span className="flex-shrink-0" style={{ color: '#7A9463' }}>~{it.deadline.slice(2).replace(/-/g, '.')}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ))}
          {loading && <div className="flex justify-start"><div className="rounded-2xl px-3 py-2" style={{ backgroundColor: '#F1F1EB' }}><span className="inline-block w-4 h-4 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin" /></div></div>}
        </div>
        <div className="px-5 pt-3 pb-4 flex-shrink-0 border-t border-neutral-100">
          <div className="flex items-end gap-2 mb-2.5">
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} rows={1} placeholder="AI에게 일괄 변경을 요청…" className="flex-1 resize-none bg-neutral-50 border border-neutral-200 rounded-2xl px-3.5 py-2.5 text-[13px] outline-none focus:border-violet-400 max-h-24" />
            <button onClick={send} disabled={!input.trim() || loading} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ backgroundColor: '#16211E', color: '#EDFF9F' }}><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-2.5-6L4 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg></button>
          </div>
          <button onClick={applyAi} disabled={!latest || loading} className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>AI 제안 적용{latest ? ` (${latest.length})` : ''}</button>
        </div>
      </div>
    </div>
  );
}

export default GoalsRoadmap;
