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
  linkedWsId?: string; // (프로덕트 전용) 이 프로덕트를 대표하는 다른 비즈니스 = 계열사. 소유 비즈니스 안에서만 표시
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

// 프로젝트 — 업무 영역을 묶는 상위 단위. Plan에서 정의하고 Goals에서 조직화한다.
// (Goals 구조: 프로젝트 > 업무 영역 > 데드라인 > 업무)
export type ProjectType = 'routine' | 'build'; // 루틴형(반복 운영) / 기획·신규개발형
export type RoutineCycle = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type ProjectStatus = 'planned' | 'active' | 'done' | 'onhold';
export interface Project {
  id: string;
  name: string;
  type?: ProjectType;
  color?: string;
  goal?: string;    // 프로젝트 목표/설명
  order?: number;
  routineCycle?: RoutineCycle; // 루틴형 프로젝트의 반복 주기 (주1회/2주1회/월1회/분기1회/연1회)
  importance?: number; // 중요도 (1=낮음, 2=보통, 3=높음)
  deadline?: string;   // 프로젝트 전체 데드라인 (YYYY-MM-DD)
  // 멤버십은 데드라인 단위: 각 데드라인(ProgramDeadline)이 projectId로 이 프로젝트에 속함.
  // (프로젝트 = 여러 업무 영역의 데드라인을 묶는 '일의 순서/루틴')
  // ── Plan(전략) 계층에서 추가되는 필드 (Goals와 공유하는 동일 엔티티) ──
  goalId?: string;          // 소속 Goal(plan.goals[].id)
  strategyId?: string;      // 연결된 Strategy(Goal.strategies[].id)
  startDate?: string;       // 프로젝트 시작일 YYYY-MM-DD
  endDate?: string;         // 프로젝트 종료일 YYYY-MM-DD (= deadline과 병행; 신규 UI는 endDate 사용)
  finalDeliverable?: string;// 이 프로젝트가 끝났을 때의 최종 결과물
  status?: ProjectStatus;   // 진행 상태
  areaDeliverables?: AreaDeliverable[]; // 업무 영역별 산출물 (Project 하위)
}

// ── 새 Plan 구조 (Plan 독립) ──────────────────────────────────────────────────
// 업로드한 사업계획서 파일 (사용자가 이미 계획서가 있는 경우)
export interface PlanDoc {
  name: string;
  dataUrl: string; // base64 data URL
  type?: string;   // MIME 타입
  thumbDataUrl?: string; // 미리보기 썸네일(이미지 dataURL) — PDF는 첫 페이지를 렌더해 저장
}

// 사업계획서가 없을 때 직접 작성하는 간략한 사업 개요
export interface BusinessOverview {
  category?: string; // 업종 카테고리 (서비스/콘텐츠/스튜디오/자영업 등)
  tagline: string;  // 한 줄 소개
  concept: string;  // 컨셉
  problem: string;  // 문제 정의
  solution: string; // 솔루션
  mission: string;  // 미션
  vision: string;   // 비전
}

// 중첩 사업 목표: 사업목표(1단계) > 산출물(2단계) > 업무영역별 산출물(3단계)
export interface AreaDeliverable {   // 3단계: 업무 영역별 산출물
  id: string;
  area: string;    // 업무 영역 이름
  content: string; // 그 영역의 산출물
  done?: boolean;  // 완료 여부
}
export interface Deliverable {        // 2단계: 산출물
  id: string;
  name: string;
  areaDeliverables: AreaDeliverable[];
}
export interface BizGoal {            // (구) 1단계: 큰 사업 목표 — 마이그레이션 원본으로 보존
  id: string;
  name: string;
  desc?: string;   // 이 단계에 대한 한 줄 설명
  deliverables: Deliverable[];
}

// ── PM/전략 구조 (Goal > Strategy > Project > Area Deliverable) ──────────────────
// Strategy: Goal을 달성하기 위해 '어떤 방향으로 움직일지' 업무 영역별로 정의 (선택적)
export interface Strategy {
  id: string;
  area: string;    // 업무 영역 (예: Product, Marketing, Customer, Revenue …)
  content: string; // 그 영역의 핵심 전략 방향
}

// 성과 기준(Success Criteria) — "어떤 상태가 되면 이 목표를 달성했다고 볼 수 있는가?"
// 업종 불문: 수치(metric) 또는 완료 조건(completion) 어느 쪽도 가능. 숫자 없는 목표도 정상.
export type SuccessCriterionType = 'metric' | 'completion';
export interface SuccessCriterion {
  id: string;
  type: SuccessCriterionType;
  name: string;               // 지표명(월 매출) 또는 완료 조건(매장 공사 완료)
  currentValue?: number;      // metric: 현재값 (마지막 기록치)
  targetValue?: number;       // metric: 목표값
  unit?: string;              // metric: 단위 (원, 명, % 등)
  measurementPeriod?: string; // metric: 입력 주기 (일/주/월/분기/연)
  history?: { period: string; value: number }[]; // metric: 주기별 기록 이력 (쌓여서 추세로)
  completed?: boolean;        // completion: 완료 여부
}

// Goal: 특정 기간 안에 도달하려는 '사업 상태'. 성과형/달성형/복합형 모두 가능.
export interface Goal {
  id: string;
  name: string;              // 목표 이름 (예: "초기 시장 진입")
  statement?: string;        // 목표 문장 (예: "12/31까지 유료 구독자 1,000명 확보")
  description?: string;      // 상세 설명(선택)
  successCriteria?: SuccessCriterion[]; // 성과 기준 (metric/completion 혼합, 0개도 허용)
  // (레거시, 삭제하지 않음) 옛 단일 KPI 필드 — successCriteria로 읽을 때 파생·흡수
  kpi?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  startDate?: string;        // 시작일 YYYY-MM-DD
  targetDate?: string;       // 목표일 YYYY-MM-DD
  status?: ProjectStatus;    // 상태 (planned/active/done/onhold)
  order?: number;
  strategies?: Strategy[];   // 업무 영역별 전략
  // Project는 Project.goalId로 이 Goal에 연결됨 (plan.projects, Goals와 공유)
}

export interface PlanData {
  planDoc?: PlanDoc;                // 업로드한 사업계획서
  overview?: BusinessOverview;      // 직접 작성한 사업 개요
  bizGoals?: BizGoal[];             // (구) 중첩 사업 목표 — 마이그레이션 원본으로 보존
  goals?: Goal[];                   // PM/전략 구조의 Goal 목록 (Project는 plan.projects로 연결)
  goalsMigrated?: boolean;          // bizGoals→goals 마이그레이션 완료 표시 (재실행/부활 방지)
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
  products?: PlanItem[];        // 프로덕트 목록 (이 사업에서 판매하는 것: 웹앱·앱·굿즈 등)
  growthStages?: GrowthStage[]; // 사업 성장 단계 (장기 목표)
  workAreas?: WorkArea[];       // 업무 영역별 세부 목표
  projects?: Project[];         // 프로젝트 (업무 영역을 묶는 상위 단위) — Goals와 연동
}

// 완수 기록 (메모/이미지/링크)
export interface TodoRecord {
  memo?: string;
  image?: string;
  link?: string;
  seconds?: number; // 이 업무에 걸린 시간(초)
}

// 데드라인 내 할일 (depth 3)
export interface ProgramUnit {      // 세부 작업 — 카테고리 보드 task 하위 (소요 시간 기준)
  id: string;
  name: string;
  done: boolean;
  durationMin?: number; // 예상 소요 시간(분)
  date?: string;
  deadline?: string;
  doneDates?: string[]; // 반복(매주) task의 세부작업 — 날짜별 완료 기록. 영구 done 대신 이걸로 관리
}
// Task 일정 유연성 (Time Management): fixed=고정 시간, due=기한 내 자유, flexible=이동 자유
export type TaskSchedulingType = 'fixed' | 'due' | 'flexible';
export interface ProgramSubtask {   // 4단계: 영역별 산출물(Todo) 하위 task — 카테고리 보드로 관리
  id: string;
  name: string;
  done: boolean;
  status?: 'todo' | 'doing' | 'done'; // 칸반 컬럼 (없으면 done 기준)
  durationMin?: number; // 예상 소요 시간(분) — Time Management의 Estimated Duration으로 재사용
  date?: string;     // 시작 날짜 YYYY-MM-DD
  deadline?: string; // 완수 기한 YYYY-MM-DD
  units?: ProgramUnit[]; // 하위 세부 작업 (체크리스트)
  // ── Time Management(실행/배분 레이어) — 값이 있으면 사용, 없으면 기존 동작 ──
  schedulingType?: TaskSchedulingType; // 없으면 flexible로 취급
  startTime?: string;   // fixed 업무의 시작 시각 "HH:MM"
  splittable?: boolean; // 여러 날로 분할 가능 여부
  priority?: number;    // 우선순위 (클수록 중요, 없으면 0)
  dependsOn?: string[]; // 선행 task id 목록 (Dependency, P1에서 활용)
  actualMin?: number;   // 실제 소요 시간(분) — 완료 시 기록 (P2)
  days?: number[];      // 매주 반복 요일 (0=일 ~ 6=토). 있으면 반복 task
  doneDates?: string[]; // 반복 task의 날짜별 완료 기록 "YYYY-MM-DD"
}

// 카테고리 보드 템플릿 — 산출물(카테고리) 하나 + 그 안의 task/세부작업을 한 세트로 저장·재사용
export interface BoardTemplateUnit { name: string; durationMin?: number }
export interface BoardTemplateTask { name: string; durationMin?: number; schedulingType?: TaskSchedulingType; priority?: number; days?: number[]; units?: BoardTemplateUnit[] }
export interface BoardTemplate {
  id: string;
  name: string;        // 카테고리(산출물) 이름 (예: "디자인: 최종 UI 시안")
  tasks: BoardTemplateTask[];
  createdAt?: string;
}
export interface ProgramTodo {
  id: string;
  name: string;
  done: boolean;
  subtasks?: ProgramSubtask[]; // 하위 task (일/시 단위)
  date?: string;     // 시작 날짜 YYYY-MM-DD
  days?: number[];   // 매주 반복 요일 (0=일 ~ 6=토)
  deadline?: string; // 완수 기한 YYYY-MM-DD
  record?: TodoRecord; // 완수 기록
  doneDates?: string[]; // 매주 반복 업무의 날짜별 완료 기록 (YYYY-MM-DD)
  doneDate?: string; // 단발성 업무를 완료한 날짜 (완료일 이후 목록에서 숨김)
  starred?: boolean; // 중요 표시 (별표)
  light?: boolean; // 가벼운 작업(외부에서도 가능). 기본 false = 무거운 작업(작업실 필요)
  startTime?: string; // 시작 예정 시각 "HH:MM"
  durationDays?: number; // 대략 소요 일수 — 프로젝트 '일정 이어붙이기'에서 날짜를 순차 배치할 때 사용
  deliverableId?: string; // 원본 Plan 영역별 산출물(Project.areaDeliverables[].id) — Plan 완료 상태 동기화용
  pinned?: boolean; // 카테고리 보드에서 '우선' 표시 — 강조 + 맨 앞 정렬
  dependsOn?: string; // 로드맵 막대 연결(선행) — 이 산출물 앞에 와야 하는 산출물(todo) id. 선행이 밀리면 같이 밀림
}

// 프로그램 내 데드라인 항목 (depth 2)
export interface ProgramDeadline {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD (완수 기한 = 기간의 끝)
  startDate?: string; // 기간의 시작(캘린더 스케줄링용). 없으면 할일 시작일/목표 시작일에서 추론
  todos: ProgramTodo[];
  enabled?: boolean; // 개별 on/off (false면 Task/오늘의 업무에 미반영). 기본 on
  done?: boolean;        // 데드라인 완료(끝내기) 여부 — 완료 시 여정 깃발 증정
  doneAt?: string;       // 완료 시각 ISO
  totalSeconds?: number; // 완료 시점까지 이 데드라인 할일들에 기록된 총 소요시간(초)
  projectId?: string;    // 소속 프로젝트 (plan.projects[].id) — 프로젝트별 그룹핑/필터의 기준
  durationDays?: number; // 대략 소요 일수 — 프로젝트 '일정 이어붙이기'용
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
  projectId?: string; // 소속 프로젝트 (plan.projects[].id) — Goals의 프로젝트 그룹핑용
  enabled?: boolean; // 목표 on/off (false면 Task/오늘의 업무에 미반영). 기본 on
  priority?: number; // 우선순위 숫자 (중복 허용). 1번만 Task/오늘의 업무에 반영. 기본 1
  revenueSource?: string; // 연관 수익원(수익 수단) 이름 — Resources의 revenueSources와 연결
  fromPlan?: boolean; // Plan '사업목표 → Goals로 가져가기'로 생성됨 (Goals 로드맵에 이 항목만 표시)
  planGoalId?: string; // 원본 Plan Goal(plan.goals[].id) — Goals 로드맵 '내용 수정'에서 Plan 해당 목표로 이동
  deadlines?: ProgramDeadline[]; // 분기 내 데드라인 → 할일 (depth 2~3)
}

export interface RoutineTask {
  id: string;
  name: string;
  days: number[];
  deadline: string; // YYYY-MM-DD
  durationMin?: number; // 예상 소요 시간(분) — Capacity에서 루틴 차감용
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
  // ── Financial Resource Planning 연결 (모두 선택, 강제 안 함) ──
  financialPlanId?: string; // 소속 재무계획
  projectId?: string;       // 연결된 프로젝트(plan.projects[].id) — 프로젝트 실지출 집계용
  todoId?: string;          // 연결된 산출물(카테고리 보드 항목=ProgramTodo id) — 산출물별 실지출 집계용
  revenueClass?: 'confirmed' | 'expected'; // income일 때 확정/예상 구분(없으면 실현 실적)
}

// ── Financial Resource Planning (§3~§14) — 전부 WorkspaceEntry(비즈니스) 안에 저장, migration 불필요 ──
// 재무계획 내 수익원: 이름은 기존 revenueSources와 자유 연결. 확정/예상/목표 금액을 구분해 관리.
export interface FinRevenueSource {
  id: string;
  name: string;
  confirmed?: number; // 이미 계약·확정된 수익
  expected?: number;  // 현재 사업 기준 예상 수익
  target?: number;    // 이 소스의 목표 수익
}
// 운영비 항목 (반복=fixed는 기존 subscriptions로 자동 합산 가능, 여기선 추가 항목만)
export interface OperatingBudgetItem {
  id: string;
  name: string;
  amount: number;
  kind: 'fixed' | 'variable';
}
// 예산 배분 (§11) — P0-2에서 사용. Goal/Project에 투자 여력을 배정.
export interface BudgetAllocation {
  id: string;
  goalId?: string;
  projectId?: string;
  category?: string;      // 목표/프로젝트 없이 공통 비용일 수 있음
  plannedAmount: number;  // 계획한 배정액
}
// 기간 단위 재무계획 (§3)
export interface FinancialPlan {
  id: string;
  name: string;              // 예: "2026 Q4 Financial Plan"
  startDate: string;         // YYYY-MM-DD
  endDate: string;
  startingFunds: number;     // 시작 시점 실제 보유 자금 (Target과 절대 동일 취급 안 함)
  // Revenue Target: Goal 지표(metric criterion) 연결 우선, 없으면 직접 입력
  linkedGoalId?: string;
  linkedCriterionId?: string;
  revenueTargetAmount?: number; // 연결 없을 때 직접 입력한 목표수익
  revenueSources?: FinRevenueSource[];
  includeFixedSubscriptions?: boolean; // 고정 운영비를 구독(subscriptions) 합계로 자동 포함 (기본 true)
  operatingItems?: OperatingBudgetItem[];
  reserveTarget?: number;    // 안전하게 남겨둘 자금 (Reserve) — AI가 기본 보호
  allocations?: BudgetAllocation[]; // P0-2
  status?: 'active' | 'draft' | 'closed';
}

export interface Subscription {
  id: string;
  name: string;
  amount: number; // monthly amount
  startMonth?: string; // 구독 시작 월 "YYYY-MM" — 이 달부터 매월 비용에 반영(이전 달엔 미반영)
  endMonth?: string;   // 구독 종료 월 "YYYY-MM" — 이 달까지만 반영(구독 취소 시). 없으면 계속 반영
}

export interface QuickTask {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  starred?: boolean; // 중요 표시 (별표)
  light?: boolean; // 가벼운 작업 여부
  startTime?: string; // 시작 예정 시각 "HH:MM"
  // ── Time Management (§11 긴급/ad-hoc + 오늘 워크로드 합산) ──
  durationMin?: number; // 예상 소요 시간(분)
  deadline?: string;    // 완수 기한 YYYY-MM-DD
  priority?: number;    // 우선순위 (클수록 중요)
  schedulingType?: TaskSchedulingType; // 없으면 flexible
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

// Operating Mode — 이 비즈니스가 지금 어떤 상태인지 (Capacity 배분 추천에 활용)
// development=신규 개발 집중, update=개선/업데이트 집중, management=운영·루틴 중심(낮은 프로젝트 Capacity)
export type OperatingMode = 'development' | 'update' | 'management';

export interface WorkspaceEntry {
  workspace: Workspace;
  plan: PlanData;
  programs: Program[];
  operatingMode?: OperatingMode;   // 없으면 development로 취급
  weeklyCapacityHours?: number;    // 이 비즈니스에 배분한 주간 가용시간(시간). 없으면 미배분(추천값 사용)
  routineSystems: RoutineSystem[];
  resources: ResourceEntry[];
  subscriptions: Subscription[];
  revenueSources?: string[]; // 미리 정의한 수익원(수익 수단) 카테고리 — 금액과 별개로 먼저 등록
  revenueSourceBiz?: Record<string, string>; // 수익원 이름 -> 소속 비즈니스(workspace id)
  revenueSourceTargets?: Record<string, number>; // 수익 카테고리 목표 비중(%)
  expenseCategories?: string[]; // 비용 카테고리 (수익 카테고리와 별개, '관리'에서 관리)
  expenseCategoryTargets?: Record<string, number>; // 비용 카테고리 목표 비중(%)
  revenueTarget?: RevenueTarget;
  financialPlans?: FinancialPlan[]; // Financial Resource Planning — 기간별 재무계획(비즈니스별)
  // ── 재무 도식(통합 페이지): 순이익 − 고정비용 − 프로젝트투자비 − 비상금(%) = 개인순이익 ──
  emergencyFundPct?: number;              // 비상금 비율(%) — 순이익 대비 남겨둘 비율
  projectInvestPlan?: Record<string, number>; // projectId -> 이번 기간 투자 예정액
  reserveEarmarks?: { id: string; wsId?: string; projectId?: string; goalId?: string; amount: number }[]; // 비상금을 쓸 미래 목표/프로젝트(다른 비즈니스 포함) + 필요액
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
  deadlineId?: string; // 데드라인 완료로 얻은 깃발이면 그 데드라인 id (영역 깃발과 구분)
  totalSeconds?: number; // 데드라인 완료 소요시간(초)
}

export interface AppData {
  activeWorkspaceId: string | null;
  workspaces: WorkspaceEntry[];
  homeHiddenTodos?: Record<string, string[]>; // 날짜별("YYYY-MM-DD") Home에서 숨긴 목표 할일 키 (날짜 바뀌면 다시 표시)
  offDays?: string[]; // 출근 불가(오프) 날짜 목록 "YYYY-MM-DD" — 오프데이엔 가벼운 작업만 표시
  areaOrder?: string[]; // 업무 영역(이름) 표시 순서 — Goals에서 사용자가 조정
  calendarMemos?: Record<string, string>; // 월별("YYYY-MM") 간단 메모
  journeyFlags?: JourneyFlag[]; // 나의 여정 지도 — 달성한 영역 목표 깃발 (전 비즈니스 통합)
  workSchedule?: WorkSchedule; // 주간 업무시간 타임테이블 (요일별 근무 가능 시간)
  capacity?: CapacitySettings; // Time Management: Buffer 비율 + 날짜별 Capacity 예외
  boardTemplates?: BoardTemplate[]; // 카테고리 보드 템플릿 (산출물+task 세트 저장·재사용)
  attendance?: Record<string, { in?: number; out?: number }>; // 날짜별("YYYY-MM-DD") 출근/퇴근 시각(ms)
  autoDelay?: boolean; // 로드맵 딜레이 자동 반영 — 시작 안 하면 밀고, 안 끝나면 마감 연장
  updatedAt?: number; // 마지막 변경 시각(ms) — 새로고침 시 로컬/서버 중 최신본을 판별 (데이터 유실 방지)
}

// Time Management — 가용시간(Capacity) 관련 사용자 설정 (사용자 전체 공통)
export interface CapacitySettings {
  bufferPercent?: number;                 // 하루 Capacity 대비 Buffer 비율 (0~1, 기본 0.15)
  dateOverrides?: Record<string, number>; // "YYYY-MM-DD" -> 그 날 총 가용시간(시간). 있으면 요일 업무시간보다 우선
  weekSchedules?: Record<string, WorkSchedule>; // 주(월요일 "YYYY-MM-DD") -> 그 주 전용 업무시간표. 없으면 기본 workSchedule 사용
}

// 주간 업무시간 — 요일(0=일 ~ 6=토)별로 근무 여부 + 시작·종료 시각("HH:MM")
export interface WorkDay { on: boolean; start: string; end: string }
export type WorkSchedule = WorkDay[]; // 길이 7, 인덱스 = 요일(0=일)
