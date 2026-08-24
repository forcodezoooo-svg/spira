import { WorkspaceEntry, TodoRecord, Program } from './types';

// 프로그램이 속한 분기 목록 "YYYY-Q" (Goals 페이지와 동일 규칙)
export function programQuarters(p: Program): string[] {
  if (p.quarters?.length) return p.quarters;
  const now = new Date();
  const sy = p.year ?? now.getFullYear();
  const sq = p.quarter ?? 1;
  const qIndex = (y: number, q: number) => y * 4 + (q - 1);
  const startIdx = qIndex(sy, sq);
  let endIdx = startIdx;
  if (p.deadline) {
    const d = new Date(p.deadline);
    endIdx = Math.max(startIdx, qIndex(d.getFullYear(), Math.floor(d.getMonth() / 3) + 1));
  }
  const list: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) list.push(`${Math.floor(i / 4)}-${(i % 4) + 1}`);
  return list;
}

const PALETTE = ['#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899'];

// 사업 고유 컬러: Plan에서 설정한 색 우선, 없으면 순서 기반 팔레트
export function workspaceColor(entries: WorkspaceEntry[], wsId: string): string {
  const idx = entries.findIndex(e => e.workspace.id === wsId);
  const ws = entries[idx]?.workspace;
  if (ws?.color) return ws.color;
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}

export interface GoalTask {
  key: string;
  wsId: string;
  programId: string;
  deadlineId: string;
  todoId: string;
  name: string;
  done: boolean;
  color: string;
  workAreaId?: string; // 소속 업무 영역 (프로그램의 workAreaId)
  programName: string;
  deadlineName: string;
  date?: string;
  deadline?: string;
  days?: number[];
  record?: TodoRecord;
  recurring: boolean; // 매주 반복 여부 (완료가 날짜별로 관리됨)
  starred: boolean;
  light: boolean; // 가벼운 작업 여부 (오프데이에도 가능)
  startTime?: string; // 시작 예정 시각 "HH:MM"
}

// 특정 날짜(dateStr, 요일 dow)에 표시할 Goals 할일 목록 (전체 사업)
// - date = '시작 날짜'. [시작 날짜 ~ 완수기한(자체 또는 상위 데드라인 날짜)] 구간에 표시
// - 매주 반복(days)은 그 구간 내 해당 요일에만 표시
//   (완료한 항목도 사라지지 않고 완수 표시로 남는다)
// - 디데이(완수기한)가 임박한 순서로 정렬, 기한 없는 항목은 뒤로
// - opts.quarterKey 지정 시 해당 분기(YYYY-Q)에 속한 프로그램만 포함 (Home에서 현재 분기만 보기)
// 'YYYY-MM-DD' → 'YYYY-Q' 분기 키
function quarterOf(ds: string): string {
  const [y, m] = ds.split('-').map(Number);
  return `${y}-${Math.ceil(m / 3)}`;
}

export function getGoalTasksForDate(entries: WorkspaceEntry[], dateStr: string, dow: number): GoalTask[] {
  const out: GoalTask[] = [];
  // 오늘(로컬) — 기한 지난 미완료 업무를 오늘로 자동 이월하기 위해 사용
  const nowD = new Date();
  const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
  for (const e of entries) {
    for (const p of e.programs) {
      if (p.enabled === false) continue;          // off된 목표는 미반영
      if (!p.workAreaId) continue;                // '미분류'(영역 미지정) 컨테이너는 Goals에서 숨김 → Task/Home도 미표시(정합성)
      // 분기·우선순위 필터 없음 — 배치된 모든 업무를 그 날짜에 표시(홈/Task 동일).
      // 특정 날짜에 배치된 업무는 프로그램의 분기/우선순위 설정과 무관하게 그 날짜에 노출된다.
      for (const dl of p.deadlines ?? []) {
        if (dl.enabled === false) continue;       // off된 데드라인은 미반영
        for (const t of dl.todos ?? []) {
          const hasDays = (t.days?.length ?? 0) > 0;
          const ownStart = t.date;      // 캘린더에 올린 시작일
          const ownEnd = t.deadline;    // 캘린더에 올린 완수기한
          // 반복 업무의 창(window)은 상위 데드라인 날짜를 상속, 비반복은 자체 날짜만 사용
          const effDeadline = hasDays ? (t.deadline || dl.date || undefined) : (ownEnd || undefined);
          // 비반복 업무는 캘린더에 올려야(날짜가 있어야) 표시 — 미배치면 제외
          if (!hasDays && !ownStart && !ownEnd) continue;
          let show: boolean;
          let done: boolean;
          if (hasDays) {
            // 매주 반복: 구간 내 해당 요일에 표시, 완료는 날짜별(doneDates)
            const afterStart = !ownStart || ownStart <= dateStr;
            const beforeDeadline = !effDeadline || effDeadline >= dateStr;
            show = afterStart && beforeDeadline && t.days!.includes(dow);
            done = (t.doneDates ?? []).includes(dateStr);
          } else if (t.done) {
            // 단발 완료: 완료한 날에만 표시 (그 다음날부터 숨김)
            show = t.doneDate === dateStr;
            done = true;
          } else {
            // 비반복: 캘린더에 올린 기간 [시작~완수기한]에 표시.
            // 기한이 지났는데 미완료면 오늘로 자동 이월 — 단, 같은 분기 안에서만.
            // (지난 분기 업무는 자동으로 이번 분기로 넘어오지 않음. 이번 분기로 옮기려면 날짜를 연장/재배치해야 함)
            const a = ownStart || ownEnd!;
            const b = ownEnd || ownStart!;
            const lo = a <= b ? a : b, hi = a <= b ? b : a;
            const overdue = dateStr === todayStr && hi < todayStr && quarterOf(hi) === quarterOf(todayStr);
            show = (dateStr >= lo && dateStr <= hi) || overdue;
            done = false;
          }
          if (show) {
            out.push({
              key: `${e.workspace.id}:${p.id}:${dl.id}:${t.id}`,
              wsId: e.workspace.id,
              programId: p.id,
              deadlineId: dl.id,
              todoId: t.id,
              name: t.name,
              done,
              color: workspaceColor(entries, e.workspace.id),
              workAreaId: p.workAreaId,
              programName: p.name,
              deadlineName: dl.name,
              date: t.date,
              deadline: effDeadline,
              days: t.days,
              record: t.record,
              recurring: hasDays,
              starred: !!t.starred,
              light: !!t.light,
              startTime: t.startTime,
            });
          }
        }
      }
    }
  }
  // 디데이 임박 순 (기한 있는 항목 먼저, 기한 없는 항목은 뒤로)
  out.sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
  return out;
}

export interface SubtaskTask {
  key: string;
  wsId: string;
  programId: string;
  deadlineId: string;
  todoId: string;
  subtaskId: string;
  name: string;
  done: boolean;
  color: string;
  programName: string;     // 업무 영역(사업목표/영역 이름)
  deliverableName: string; // 소속 산출물(todo) 이름
  date?: string;
  deadline?: string;
  durationMin?: number;
  schedulingType?: 'fixed' | 'due' | 'flexible';
  priority?: number;
  dependsOn?: string[];       // 선행 task id 목록
  projectDeadline?: string;   // 소속 프로젝트(ProgramDeadline) 마감일
  projectName?: string;       // 소속 프로젝트 이름
  actualMin?: number;         // 실제 소요 시간(분)
}

// 특정 날짜에 캘린더에 배치된 task(ProgramSubtask) 목록 — Home 캘린더와 동일 소스(fromPlan)
// [시작~완수기한] 구간에 dateStr가 포함되면 그 날짜의 업무로 표시
export function getSubtaskTasksForDate(entries: WorkspaceEntry[], dateStr: string, opts?: { onlyFromPlan?: boolean }): SubtaskTask[] {
  const out: SubtaskTask[] = [];
  for (const e of entries) {
    for (const p of e.programs) {
      if (p.enabled === false) continue;
      if (opts?.onlyFromPlan && !p.fromPlan) continue;
      for (const dl of p.deadlines ?? []) {
        if (dl.enabled === false) continue;
        for (const t of dl.todos ?? []) {
          for (const s of t.subtasks ?? []) {
            const a = s.date, b = s.deadline;
            if (!a && !b) continue;
            const lo = a && b ? (a <= b ? a : b) : (a || b)!;
            const hi = a && b ? (a <= b ? b : a) : (b || a)!;
            if (dateStr < lo || dateStr > hi) continue;
            out.push({
              key: `s:${e.workspace.id}:${p.id}:${dl.id}:${t.id}:${s.id}`,
              wsId: e.workspace.id, programId: p.id, deadlineId: dl.id, todoId: t.id, subtaskId: s.id,
              name: s.name, done: !!s.done, color: workspaceColor(entries, e.workspace.id),
              programName: p.name, deliverableName: t.name, date: s.date, deadline: s.deadline, durationMin: s.durationMin,
              schedulingType: s.schedulingType, priority: s.priority,
              dependsOn: s.dependsOn, projectDeadline: dl.date || undefined, projectName: dl.name,
              actualMin: s.actualMin,
            });
          }
        }
      }
    }
  }
  out.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  return out;
}

export interface GoalDeadlineMilestone {
  key: string;
  name: string;
  date: string;       // 완수기한(끝)
  startDate?: string; // 기간 시작일
  color: string;      // 소속 비즈니스(워크스페이스) 색상
  wsId: string;
  wsName: string;
  programId: string;
  deadlineId: string;
  programName: string;
}

// 다가오는 데드라인(프로그램 내 데드라인 항목)들 — Home 여정/캘린더용
export function getGoalDeadlines(entries: WorkspaceEntry[]): GoalDeadlineMilestone[] {
  const out: GoalDeadlineMilestone[] = [];
  for (const e of entries) {
    for (const p of e.programs) {
      if (!p.workAreaId) continue; // '미분류' 컨테이너 제외 (Goals와 정합)
      for (const dl of p.deadlines ?? []) {
        if (!dl.date) continue;
        out.push({
          key: `${p.id}:${dl.id}`,
          name: dl.name,
          date: dl.date,
          startDate: dl.startDate,
          color: workspaceColor(entries, e.workspace.id),
          wsId: e.workspace.id,
          wsName: e.workspace.name,
          programId: p.id,
          deadlineId: dl.id,
          programName: p.name,
        });
      }
    }
  }
  return out;
}

