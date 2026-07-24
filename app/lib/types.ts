export interface Workspace {
  id: string;
  name: string;
  color?: string; // 사업 고유 컬러 (서비스 전체에서 사용)
}

export interface TargetCustomer {
  id: string;
  image: string;
  name: string;
  occupation: string;
  age: string;
  personality: string;
  lifestyle: string;
  notes: string;
}

export interface PlanItem {
  title: string;
  memo: string;
}

// 사업 성장 단계 (장기 목표 단계) — 성장 지표 + 확장 방향성 + 상세 프로젝트 목표
export interface GrowthStage {
  id: string;
  title: string;      // 단계 이름 (예: "1단계 · MVP 검증")
  metric: string;     // 성장 지표 (예: "월 매출 1,000만원 / MAU 1만")
  direction: string;  // 이 단계에서의 확장 방향성
  projects?: string[]; // 이 단계에서 진행할 상세 프로젝트 목표 목록
}

// 업무 영역 (디자인, 기획, 마케팅, 개발 등) — 영역별 목표
export interface WorkArea {
  id: string;
  name: string;  // 영역 이름
  color: string; // 영역 컬러
  goal: string;  // 영역별 목표
}

export interface PlanData {
  brandImages: string[];
  brandingKeywords: string[];
  tagline: string;
  problems: string[];
  mission: string;
  vision: string;
  concept: string;
  valueProposition: {
    personal: string;
    social: string;
    environmental: string;
  };
  targetCustomers: TargetCustomer[];
  solutions: PlanItem[];
  revenueModel: PlanItem[];
  growthStages?: GrowthStage[]; // 사업 성장 단계 (장기 목표)
  workAreas?: WorkArea[];       // 업무 영역별 세부 목표
}

// 완수 기록 (메모/이미지/링크)
export interface TodoRecord {
  memo?: string;
  image?: string;
  link?: string;
  seconds?: number; // 이 업무에 걸린 시간(초)
}

// 데드라인 내 할일 (depth 3)
export interface ProgramTodo {
  id: string;
  name: string;
  done: boolean;
  date?: string;     // 시작 날짜 YYYY-MM-DD
  days?: number[];   // 매주 반복 요일 (0=일 ~ 6=토)
  deadline?: string; // 완수 기한 YYYY-MM-DD
  record?: TodoRecord; // 완수 기록
  doneDates?: string[]; // 매주 반복 업무의 날짜별 완료 기록 (YYYY-MM-DD)
  doneDate?: string; // 단발성 업무를 완료한 날짜 (완료일 이후 목록에서 숨김)
  starred?: boolean; // 중요 표시 (별표)
  light?: boolean; // 가벼운 작업(외부에서도 가능). 기본 false = 무거운 작업(작업실 필요)
  startTime?: string; // 시작 예정 시각 "HH:MM"
}

// 프로그램 내 데드라인 항목 (depth 2)
export interface ProgramDeadline {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD (완수 기한 = 기간의 끝)
  startDate?: string; // 기간의 시작(캘린더 스케줄링용). 없으면 할일 시작일/목표 시작일에서 추론
  todos: ProgramTodo[];
  enabled?: boolean; // 개별 on/off (false면 Task/오늘의 업무에 미반영). 기본 on
}

export interface Program {
  id: string;
  name: string;
  goal: string;
  color: string;
  weight?: number; // relative priority weight (1–10), default 1
  startDate?: string; // YYYY-MM-DD
  deadline?: string; // YYYY-MM-DD
  year?: number; // 연도별 관리 (시작 분기의 연도)
  quarter?: number; // 1–4 분기 (시작 분기)
  quarters?: string[]; // 속한 분기 목록 "YYYY-Q" (다중 선택). 없으면 year/quarter(+deadline)로 폴백
  order?: number; // 분기 내 정렬 순서
  workAreaId?: string; // 업무 영역 (plan.workAreas[].id) — 영역별 카테고리 그룹핑용
  enabled?: boolean; // 목표 on/off (false면 Task/오늘의 업무에 미반영). 기본 on
  priority?: number; // 우선순위 숫자 (중복 허용). 1번만 Task/오늘의 업무에 반영. 기본 1
  revenueSource?: string; // 연관 수익원(수익 수단) 이름 — Resources의 revenueSources와 연결
  deadlines?: ProgramDeadline[]; // 분기 내 데드라인 → 할일 (depth 2~3)
}

export interface RoutineTask {
  id: string;
  name: string;
  days: number[];
  deadline: string; // YYYY-MM-DD
}

export interface Topic {
  id: string;
  name: string;
  completed: boolean;
}

export interface RoutineSystem {
  id: string;
  programId: string | null;
  name: string;
  days: number[];
  format: string;
  tasks: RoutineTask[];
  topics: Topic[];
  startDate?: string; // YYYY-MM-DD
}

export type ResourceType = 'income' | 'expense';

export interface ResourceEntry {
  id: string;
  type: ResourceType;
  amount: number;
  description: string;
  date: string;
  source?: string; // 수익원(수익 수단) — income 항목에만 사용, 월별 추이 집계용
}

export interface Subscription {
  id: string;
  name: string;
  amount: number; // monthly amount
}

export interface QuickTask {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  starred?: boolean; // 중요 표시 (별표)
  light?: boolean; // 가벼운 작업 여부
  startTime?: string; // 시작 예정 시각 "HH:MM"
}

// 캘린더에 직접 추가하는 외부 일정/이벤트
export interface CalendarEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
}

export interface TaskProof {
  id: string;
  rsId: string;
  taskId: string;
  taskName: string;
  routineName: string;
  date: string;
  image: string;
  link: string;
  memo?: string;
  completedAt: string;
}

export interface TaskTimeRecord {
  id: string;
  rsId: string;
  taskId: string;
  taskName: string;
  routineName: string;
  date: string;
  seconds: number;
  completedAt: string;
}

export interface MilestoneProgram {
  name: string;
  goal: string;
  color: string;
}

export interface RevenueTarget {
  amount: number;
  milestoneProgram?: MilestoneProgram;
}

export interface WorkspaceEntry {
  workspace: Workspace;
  plan: PlanData;
  programs: Program[];
  routineSystems: RoutineSystem[];
  resources: ResourceEntry[];
  subscriptions: Subscription[];
  revenueSources?: string[]; // 미리 정의한 수익원(수익 수단) 카테고리 — 금액과 별개로 먼저 등록
  revenueSourceBiz?: Record<string, string>; // 수익원 이름 -> 소속 비즈니스(workspace id)
  revenueSourceTargets?: Record<string, number>; // 수익 카테고리 목표 비중(%)
  expenseCategories?: string[]; // 비용 카테고리 (수익 카테고리와 별개, '관리'에서 관리)
  expenseCategoryTargets?: Record<string, number>; // 비용 카테고리 목표 비중(%)
  revenueTarget?: RevenueTarget;
  annualGoals?: Record<string, string>; // "2026" -> 연간 목표 텍스트
  growthStageIndex?: number; // 현재 진행 중인 사업 성장 단계(plan.growthStages) 인덱스. 달성 시 +1
  achievedAreaGoals?: string[]; // 달성 처리한 업무 영역(workArea) id 목록
  completions: Record<string, string[]>;
  skipped: Record<string, string[]>; // "YYYY-MM-DD" -> ["rsId:taskId", ...]
  quickTasks: QuickTask[];
  events: CalendarEvent[];
  proofs: TaskProof[];
  timeRecords: TaskTimeRecord[];
}

// 나의 여정 지도 — 업무 영역 목표를 달성할 때마다 얻는 깃발
export interface JourneyFlag {
  id: string;
  wsId: string;
  wsName: string;
  areaId: string;
  areaName: string;
  goal: string;
  color: string;      // 소속 비즈니스 색
  achievedAt: string; // ISO 날짜
}

export interface AppData {
  activeWorkspaceId: string | null;
  workspaces: WorkspaceEntry[];
  homeHiddenTodos?: Record<string, string[]>; // 날짜별("YYYY-MM-DD") Home에서 숨긴 목표 할일 키 (날짜 바뀌면 다시 표시)
  offDays?: string[]; // 출근 불가(오프) 날짜 목록 "YYYY-MM-DD" — 오프데이엔 가벼운 작업만 표시
  areaOrder?: string[]; // 업무 영역(이름) 표시 순서 — Goals에서 사용자가 조정
  calendarMemos?: Record<string, string>; // 월별("YYYY-MM") 간단 메모
  journeyFlags?: JourneyFlag[]; // 나의 여정 지도 — 달성한 영역 목표 깃발 (전 비즈니스 통합)
}
