'use client';
import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUI } from './UIContext';
import { useToast } from './ToastContext';
import { useUpgrade } from './UpgradeContext';
import { isOnboardingActive } from './onboarding';
import { createClient } from './supabase/client';
import { PLAN_MARKER, ROUTINE_MARKER, GOALS_MARKER, QUARTER_PLAN_MARKER, AREA_ASSIGN_MARKER, PROJECT_ASSIGN_MARKER } from './ai/markers';
import { FEEDBACK, AI_COPY } from './ai/messages';

// 대화 내용에서 인식된 '앱에 자동 반영' 액션. 버튼으로 노출되며, 클릭 시 실제 반영(Pro/온보딩 게이트).
export interface ChatAction {
  kind: 'plan' | 'goals';   // 버튼 색/구분용 (Plan 계열 / Goals 계열)
  marker: string;           // 어떤 마커인지 (핸들러 라우팅용)
  payload: unknown;         // 파싱된 JSON
  route: string;            // 반영 대상 페이지 ('/plan' | '/programs')
  label: string;            // 버튼 문구
  feedback: string;         // 반영 완료 후 메시지에 덧붙일 문구
  done?: boolean;           // 이미 반영됨
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: ChatAction;
}

// sendMessage 옵션: 온보딩 자동 생성 등에서 사용
export interface SendOptions {
  hideUser?: boolean;  // 사용자 말풍선 없이 조용히 요청
  intro?: string;      // 답변 문구를 이 문구로 고정 (모델 산문 대신)
  autoApply?: boolean; // 응답에 반영 액션이 있으면 버튼 없이 바로 반영 (시작 칩용)
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

export type PlanPatch = {
  tagline?: string;
  mission?: string;
  vision?: string;
  concept?: string;
  problems?: string[];
  solutions?: Array<{ title: string; memo: string }>;
  revenueModel?: Array<{ title: string; memo: string }>;
  products?: Array<string | { title: string; memo: string }>;
  brandingKeywords?: string[];
  valueProposition?: {
    personal?: string;
    social?: string;
    environmental?: string;
  };
  targetCustomers?: Array<{
    name: string;
    occupation: string;
    age: string;
    personality: string;
    lifestyle: string;
    notes: string;
  }>;
  growthStages?: Array<{ title: string; metric: string; direction: string; projects?: string[] }>;
  workAreas?: Array<{ name: string; goal: string; color?: string }>;
};

export type AISuggestedRoutine = {
  name: string;
  days: number[];
  format?: string;
  tasks: Array<{ name: string; days?: number[] }>;
};

export type GoalsOperation =
  | { op: 'add_program'; wsId: string; data: { name: string; goal?: string; color?: string; weight?: number; startDate?: string } }
  | { op: 'update_program'; wsId: string; id: string; data: { name?: string; goal?: string; color?: string; weight?: number; startDate?: string } }
  | { op: 'delete_program'; wsId: string; id: string }
  | { op: 'reorder_programs'; wsId: string; ids: string[] }
  | { op: 'add_routine'; wsId: string; data: { name: string; programId?: string | null; days?: number[]; format?: string; startDate?: string; tasks?: Array<{ name: string; days?: number[]; deadline?: string }> } }
  | { op: 'update_routine'; wsId: string; id: string; data: { name?: string; programId?: string | null; days?: number[]; format?: string; startDate?: string; tasks?: Array<{ id?: string; name: string; days?: number[]; deadline?: string }> } }
  | { op: 'delete_routine'; wsId: string; id: string };

// AI가 설계한 분기 계획 (연도 → 분기 → 프로그램 → 데드라인 → 할일)
// 할일(todo)은 문자열 또는 {name, days?, light?} 객체 (days = 매주 반복 요일)
export type QuarterPlanTodo = string | { name: string; days?: number[]; light?: boolean; date?: string; deadline?: string };
export type QuarterPlan = {
  wsId?: string;
  year?: number;
  quarter?: number;
  programs: Array<{
    name?: string;
    goal?: string;
    project?: string; // 소속 프로젝트(큰 목표) 이름 — 같은 이름끼리 하나의 프로젝트로 묶임
    projectType?: 'routine' | 'build';
    workAreaId?: string; // 소속 업무 영역 id (있으면 그 영역 컨테이너로 들어감)
    deadlines?: Array<{ name: string; date: string; todos?: QuarterPlanTodo[] }>;
  }>;
};

// AI가 미분류 목표를 업무 영역에 배정
export type AreaAssignment = { programId: string; wsId: string; workAreaId: string };

// AI가 기존 데드라인을 프로젝트로 정리 (사업별 assign 목록)
export type ProjectAssignPlan = { wsId?: string; assign: Array<{ deadlineId: string; projectName: string; projectType?: 'routine' | 'build' }> };

const SESSIONS_KEY = 'spira_chat_sessions';
const CURRENT_KEY = 'spira_chat_current';

interface ChatContextType {
  open: boolean;
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  messages: Message[];
  loading: boolean;
  sendMessage: (text: string, displayText?: string, opts?: SendOptions) => Promise<void>;
  applyAction: (idx: number) => void;
  openWithContext: (label: string, content: string) => void;
  registerPlanHandler: (handler: (patch: PlanPatch) => void) => void;
  unregisterPlanHandler: () => void;
  registerRoutineHandler: (handler: (routines: AISuggestedRoutine[]) => void) => void;
  unregisterRoutineHandler: () => void;
  sessions: ChatSession[];
  loadSession: (session: ChatSession) => void;
  deleteSession: (id: string) => void;
  newChat: () => void;
  setAppContext: (data: string) => void;
  registerGoalsHandler: (handler: (ops: GoalsOperation[]) => void) => void;
  unregisterGoalsHandler: () => void;
  registerQuarterPlanHandler: (handler: (plans: QuarterPlan[]) => void) => void;
  unregisterQuarterPlanHandler: () => void;
  registerAreaAssignHandler: (handler: (assigns: AreaAssignment[]) => void) => void;
  unregisterAreaAssignHandler: () => void;
  registerProjectAssignHandler: (handler: (plans: ProjectAssignPlan[]) => void) => void;
  unregisterProjectAssignHandler: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

// AI 응답에서 자동 반영 마커를 찾아 파싱하고, 버튼용 액션 메타로 변환한다.
// (예전엔 즉시 자동 반영했지만, 이제는 버튼 클릭으로 반영해 '대화'와 '앱 반영(유료 기능)'을 분리)
function extractAction(full: string): ChatAction & { display: string } | null {
  const tryParse = (j: string) => { try { return JSON.parse(j); } catch { return undefined; } };
  const sliceObj = (raw: string) => { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); return s !== -1 && e > s ? raw.slice(s, e + 1) : raw; };
  const sliceArr = (raw: string) => { const s = raw.indexOf('['), e = raw.lastIndexOf(']'); return s !== -1 && e > s ? raw.slice(s, e + 1) : raw; };
  const before = (marker: string) => full.split(marker)[0].trimEnd();
  const after = (marker: string) => full.split(marker)[1]?.trim() ?? '';

  if (full.includes(PLAN_MARKER)) {
    const payload = tryParse(sliceObj(after(PLAN_MARKER)));
    if (payload) return { kind: 'plan', marker: PLAN_MARKER, payload, route: '/plan', label: 'Plan에 자동으로 채우기', feedback: FEEDBACK.planUpdated, display: before(PLAN_MARKER) };
  }
  if (full.includes(QUARTER_PLAN_MARKER)) {
    const raw = after(QUARTER_PLAN_MARKER);
    const aStart = raw.indexOf('['), oStart = raw.indexOf('{');
    let j = raw;
    if (aStart !== -1 && (oStart === -1 || aStart < oStart)) j = raw.slice(aStart, raw.lastIndexOf(']') + 1);
    else if (oStart !== -1) j = raw.slice(oStart, raw.lastIndexOf('}') + 1);
    const parsed = tryParse(j);
    if (parsed) {
      const plans = (Array.isArray(parsed) ? parsed : [parsed]) as QuarterPlan[];
      const progCount = plans.reduce((s, p) => s + (p.programs?.length ?? 0), 0);
      return { kind: 'goals', marker: QUARTER_PLAN_MARKER, payload: plans, route: '/programs', label: 'Goals에 자동으로 채우기', feedback: FEEDBACK.quarterApplied(plans.length, progCount), display: before(QUARTER_PLAN_MARKER) };
    }
  }
  if (full.includes(AREA_ASSIGN_MARKER)) {
    const payload = tryParse(sliceArr(after(AREA_ASSIGN_MARKER)));
    if (Array.isArray(payload)) return { kind: 'goals', marker: AREA_ASSIGN_MARKER, payload, route: '/programs', label: 'Goals에 자동으로 반영', feedback: FEEDBACK.areaAssigned(payload.length), display: before(AREA_ASSIGN_MARKER) };
  }
  if (full.includes(PROJECT_ASSIGN_MARKER)) {
    const payload = tryParse(sliceArr(after(PROJECT_ASSIGN_MARKER)));
    if (Array.isArray(payload)) {
      const cnt = (payload as ProjectAssignPlan[]).reduce((s, p) => s + (p.assign?.length ?? 0), 0);
      return { kind: 'goals', marker: PROJECT_ASSIGN_MARKER, payload, route: '/programs', label: '프로젝트로 자동 정리', feedback: `데드라인 ${cnt}개를 프로젝트로 정리했어요. Goals에서 확인해보세요. 🌿`, display: before(PROJECT_ASSIGN_MARKER) };
    }
  }
  if (full.includes(GOALS_MARKER)) {
    const payload = tryParse(sliceArr(after(GOALS_MARKER)));
    if (Array.isArray(payload)) return { kind: 'goals', marker: GOALS_MARKER, payload, route: '/programs', label: 'Goals에 자동으로 반영', feedback: FEEDBACK.goalsUpdated, display: before(GOALS_MARKER) };
  }
  if (full.includes(ROUTINE_MARKER)) {
    const payload = tryParse(sliceArr(after(ROUTINE_MARKER)));
    if (Array.isArray(payload)) return { kind: 'goals', marker: ROUTINE_MARKER, payload, route: '/programs', label: 'Goals에 반복 루틴 추가', feedback: FEEDBACK.routineAdded(payload.length), display: before(ROUTINE_MARKER) };
  }
  return null;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  // 채팅 표시 상태는 UIContext(chatOpen)가 실제 패널을 제어하므로 그것과 하나로 묶는다.
  // (예전엔 별도 useState라 chat.setOpen(true)로는 패널이 열리지 않았음)
  const ui = useUI();
  const router = useRouter();
  const open = ui.chatOpen;
  const setOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(ui.chatOpen) : v;
    if (next) ui.openChat(); else ui.closeChat();
  }, [ui]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  const appContextRef = useRef<string>('');
  const setAppContext = useCallback((data: string) => {
    appContextRef.current = data;
  }, []);

  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { showUpgrade } = useUpgrade();
  const upgradeRef = useRef(showUpgrade);
  upgradeRef.current = showUpgrade;

  // AI 자동 입력(마커 적용)은 Pro 전용 — 현재 사용자의 Pro 여부를 추적
  const isProRef = useRef(false);
  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { isProRef.current = false; return; }
      const { data } = await supabase.from('user_plan').select('tier, current_period_end').eq('user_id', user.id).maybeSingle();
      isProRef.current = data?.tier === 'pro' && (!data.current_period_end || new Date(data.current_period_end).getTime() > Date.now());
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void check(); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const loadingRef = useRef(false);
  loadingRef.current = loading;
  const planHandlerRef = useRef<((patch: PlanPatch) => void) | null>(null);
  const planModeRef = useRef(false);
  const routineHandlerRef = useRef<((routines: AISuggestedRoutine[]) => void) | null>(null);
  const routineModeRef = useRef(false);
  const goalsHandlerRef = useRef<((ops: GoalsOperation[]) => void) | null>(null);
  const quarterPlanHandlerRef = useRef<((plans: QuarterPlan[]) => void) | null>(null);
  const areaAssignHandlerRef = useRef<((assigns: AreaAssignment[]) => void) | null>(null);
  const projectAssignHandlerRef = useRef<((plans: ProjectAssignPlan[]) => void) | null>(null);
  // 페이지 핸들러가 등록될 때 대기 중인 액션을 반영(아래에서 실제 함수 주입)
  const flushPendingRef = useRef<((marker: string) => void) | null>(null);
  // autoApply용: 액션을 즉시 반영하는 함수(아래에서 주입)
  const runActionRef = useRef<((idx: number, action: ChatAction) => void) | null>(null);

  const registerGoalsHandler = useCallback((handler: (ops: GoalsOperation[]) => void) => {
    goalsHandlerRef.current = handler;
    flushPendingRef.current?.(GOALS_MARKER);
  }, []);

  const unregisterGoalsHandler = useCallback(() => {
    goalsHandlerRef.current = null;
  }, []);

  const registerQuarterPlanHandler = useCallback((handler: (plans: QuarterPlan[]) => void) => {
    quarterPlanHandlerRef.current = handler;
    flushPendingRef.current?.(QUARTER_PLAN_MARKER);
  }, []);

  const unregisterQuarterPlanHandler = useCallback(() => {
    quarterPlanHandlerRef.current = null;
  }, []);

  const registerAreaAssignHandler = useCallback((handler: (assigns: AreaAssignment[]) => void) => {
    areaAssignHandlerRef.current = handler;
    flushPendingRef.current?.(AREA_ASSIGN_MARKER);
  }, []);

  const registerProjectAssignHandler = useCallback((handler: (plans: ProjectAssignPlan[]) => void) => {
    projectAssignHandlerRef.current = handler;
    flushPendingRef.current?.(PROJECT_ASSIGN_MARKER);
  }, []);

  const unregisterProjectAssignHandler = useCallback(() => {
    projectAssignHandlerRef.current = null;
  }, []);

  const unregisterAreaAssignHandler = useCallback(() => {
    areaAssignHandlerRef.current = null;
  }, []);

  // 마운트 시: 이전 세션을 보관함에 저장하고, 전체 세션 목록 로드
  useEffect(() => {
    let stored: ChatSession[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    } catch { /* empty */ }

    try {
      const prev = localStorage.getItem(CURRENT_KEY);
      if (prev) {
        const msgs: Message[] = JSON.parse(prev);
        // 사용자가 실제로 보낸 메시지가 있을 때만 보관 (자동 안내 메시지만 있으면 저장 안 함)
        if (msgs.some(m => m.role === 'user')) {
          const firstUser = msgs.find(m => m.role === 'user')?.content ?? '';
          const title = firstUser.slice(0, 50) || '대화';
          const session: ChatSession = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            title,
            messages: msgs,
            createdAt: new Date().toISOString(),
          };
          stored = [session, ...stored];
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(stored));
        }
        localStorage.removeItem(CURRENT_KEY);
      }
    } catch { /* empty */ }

    setSessions(stored);
    setStorageReady(true);
  }, []);

  // 메시지 변경 시 현재 세션을 localStorage에 저장
  useEffect(() => {
    if (!storageReady) return;
    if (messages.length > 0) {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(messages));
    } else {
      localStorage.removeItem(CURRENT_KEY);
    }
  }, [messages, storageReady]);

  const newChat = useCallback(() => {
    const current = messagesRef.current;
    if (current.some(m => m.role === 'user')) {
      const firstUser = current.find(m => m.role === 'user')?.content ?? '';
      const session: ChatSession = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: firstUser.slice(0, 50) || '대화',
        messages: current,
        createdAt: new Date().toISOString(),
      };
      setSessions(prev => {
        const next = [session, ...prev];
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
        return next;
      });
    }
    setMessages([]);
    localStorage.removeItem(CURRENT_KEY);
  }, []);

  const loadSession = useCallback((session: ChatSession) => {
    // 현재 진행 중인 채팅이 있으면 먼저 저장 (사용자 메시지가 있을 때만)
    const current = messagesRef.current;
    if (current.some(m => m.role === 'user')) {
      const firstUser = current.find(m => m.role === 'user')?.content ?? '';
      const snap: ChatSession = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: firstUser.slice(0, 50) || '대화',
        messages: current,
        createdAt: new Date().toISOString(),
      };
      setSessions(prev => {
        const next = [snap, ...prev];
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
        return next;
      });
    }
    setMessages(session.messages);
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (text: string, displayText?: string, opts?: SendOptions) => {
    const apiMsg: Message = { role: 'user', content: text };
    const apiNext: Message[] = [...messagesRef.current, apiMsg];
    // hideUser: 사용자 말풍선 없이 조용히 요청 (온보딩 자동 생성용). intro: 답변 문구를 고정.
    if (!opts?.hideUser) {
      setMessages([...messagesRef.current, { role: 'user', content: displayText ?? text }]);
    }
    setLoading(true);
    loadingRef.current = true;

    try {
      // Plan 페이지에서는 등록 타이밍과 무관하게 항상 기획(plan) 모드로 요청 (기획서 일괄 채우기 보장)
      const onPlanRoute = typeof window !== 'undefined' && window.location.pathname === '/plan';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiNext, planMode: planModeRef.current || onPlanRoute, routineMode: routineModeRef.current, appContext: appContextRef.current }),
      });

      if (res.status === 429) {
        // 무료 플랜 하루 한도 초과 — 안내 문구 표시 + 유료 플랜 알림 팝업
        const data = await res.json().catch(() => ({} as { error?: string }));
        setMessages(prev => [...prev, { role: 'assistant', content: data.error ?? AI_COPY.error }]);
        upgradeRef.current('ai_limit');
        return;
      }
      if (!res.ok || !res.body) throw new Error('응답 오류');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });

        if (opts?.intro) continue; // 고정 문구 모드: 스트리밍 중엔 '생각 중' 상태 유지, 완료 시 intro+버튼 표시

        const display = full.includes(PLAN_MARKER)
          ? full.split(PLAN_MARKER)[0].trimEnd()
          : full.includes(ROUTINE_MARKER)
          ? full.split(ROUTINE_MARKER)[0].trimEnd()
          : full.includes(QUARTER_PLAN_MARKER)
          ? full.split(QUARTER_PLAN_MARKER)[0].trimEnd()
          : full.includes(AREA_ASSIGN_MARKER)
          ? full.split(AREA_ASSIGN_MARKER)[0].trimEnd()
          : full.includes(PROJECT_ASSIGN_MARKER)
          ? full.split(PROJECT_ASSIGN_MARKER)[0].trimEnd()
          : full;

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: display };
          return updated;
        });
      }

      // 자동 반영 마커가 있으면 즉시 반영하지 않고 '앱에 반영' 버튼(액션)으로 메시지에 붙인다.
      // 반영은 버튼 클릭 시점에 Pro/온보딩 게이트를 통과해야 실행됨 → '대화'와 '유료 기능'을 분리.
      const action = extractAction(full);
      if (action) {
        const { display, ...act } = action;
        const targetIdx = messagesRef.current.length - 1; // 마지막 assistant 메시지 인덱스
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: opts?.intro ?? display ?? '', action: act };
          return updated;
        });
        // 시작 칩 등에서 autoApply면 버튼 없이 즉시 반영 (게이트는 그대로 — 무료는 유료 안내)
        if (opts?.autoApply) runActionRef.current?.(targetIdx, act);
      } else if (opts?.intro) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: opts.intro! };
          return updated;
        });
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: AI_COPY.error },
      ]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // 핸들러가 다른 페이지에 있을 때, 그 페이지로 이동한 뒤 반영하려고 대기시켜 둔 액션
  const pendingApplyRef = useRef<{ idx: number; marker: string; payload: unknown } | null>(null);

  // 마커에 맞는 핸들러가 현재 등록돼 있으면 반영하고 true 반환 (없으면 false)
  const applyToHandler = useCallback((marker: string, payload: unknown): boolean => {
    if (marker === PLAN_MARKER && planHandlerRef.current) { planHandlerRef.current(payload as PlanPatch); return true; }
    if (marker === ROUTINE_MARKER && routineHandlerRef.current) { routineHandlerRef.current(payload as AISuggestedRoutine[]); return true; }
    if (marker === GOALS_MARKER && goalsHandlerRef.current) { goalsHandlerRef.current(payload as GoalsOperation[]); return true; }
    if (marker === QUARTER_PLAN_MARKER && quarterPlanHandlerRef.current) { quarterPlanHandlerRef.current(payload as QuarterPlan[]); return true; }
    if (marker === AREA_ASSIGN_MARKER && areaAssignHandlerRef.current) { areaAssignHandlerRef.current(payload as AreaAssignment[]); return true; }
    if (marker === PROJECT_ASSIGN_MARKER && projectAssignHandlerRef.current) { projectAssignHandlerRef.current(payload as ProjectAssignPlan[]); return true; }
    return false;
  }, []);

  // 액션 반영 완료 표시: 버튼을 '완료'로 바꾸고 완료 문구를 메시지에 덧붙임
  const markActionDone = useCallback((idx: number) => {
    setMessages(prev => {
      const updated = [...prev];
      const m = updated[idx];
      if (m?.action && !m.action.done) {
        updated[idx] = { ...m, content: (m.content ? m.content + '\n\n' : '') + m.action.feedback, action: { ...m.action, done: true } };
      }
      return updated;
    });
  }, []);

  // 대기 중인 액션이 이 마커용이면 반영 (페이지 핸들러가 막 등록됐을 때 호출)
  const flushPending = useCallback((marker: string) => {
    const p = pendingApplyRef.current;
    if (p && p.marker === marker && applyToHandler(p.marker, p.payload)) {
      markActionDone(p.idx);
      pendingApplyRef.current = null;
    }
  }, [applyToHandler, markActionDone]);
  flushPendingRef.current = flushPending;

  // 액션 실제 반영. Pro/온보딩이 아니면 유료 알림 팝업. 핸들러가 없으면 해당 페이지로 이동 후 반영.
  const runAction = useCallback((idx: number, action: ChatAction) => {
    const canAutofill = isProRef.current || isOnboardingActive();
    if (!canAutofill) { upgradeRef.current('autofill'); return; }
    if (applyToHandler(action.marker, action.payload)) {
      markActionDone(idx);
    } else {
      pendingApplyRef.current = { idx, marker: action.marker, payload: action.payload };
      router.push(action.route);
    }
  }, [applyToHandler, markActionDone, router]);
  runActionRef.current = runAction;

  // 버튼 클릭 → 앱 반영.
  const applyAction = useCallback((idx: number) => {
    const m = messagesRef.current[idx];
    if (!m?.action || m.action.done) return;
    runAction(idx, m.action);
  }, [runAction]);

  const openWithContext = useCallback((label: string, content: string) => {
    if (loadingRef.current) return;
    setOpen(true);
    const msg = content.trim()
      ? `[${label}]\n현재 내용:\n${content.trim()}\n\n이 내용에 대해 개선점이나 조언을 해줘.`
      : `[${label}]을 어떻게 작성하면 좋을지 알려줘.`;
    sendMessage(msg);
  }, [sendMessage, setOpen]);

  const registerPlanHandler = useCallback((handler: (patch: PlanPatch) => void) => {
    planHandlerRef.current = handler;
    planModeRef.current = true;
    // (예전엔 여기서 환영 메시지를 넣어 Plan에선 채팅으로 시작했지만,
    //  이제 모든 화면이 동일하게 '예시 버튼' 시작 화면으로 시작하도록 주입하지 않는다)
    flushPendingRef.current?.(PLAN_MARKER);
  }, []);

  const unregisterPlanHandler = useCallback(() => {
    planHandlerRef.current = null;
    planModeRef.current = false;
  }, []);

  const registerRoutineHandler = useCallback((handler: (routines: AISuggestedRoutine[]) => void) => {
    routineHandlerRef.current = handler;
    routineModeRef.current = true;
  }, []);

  const unregisterRoutineHandler = useCallback(() => {
    routineHandlerRef.current = null;
    routineModeRef.current = false;
  }, []);

  return (
    <ChatContext.Provider value={{
      open, setOpen, messages, loading,
      sendMessage, applyAction, openWithContext,
      registerPlanHandler, unregisterPlanHandler,
      registerRoutineHandler, unregisterRoutineHandler,
      sessions, loadSession, deleteSession, newChat,
      setAppContext,
      registerGoalsHandler, unregisterGoalsHandler,
      registerQuarterPlanHandler, unregisterQuarterPlanHandler,
      registerAreaAssignHandler, unregisterAreaAssignHandler,
      registerProjectAssignHandler, unregisterProjectAssignHandler,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  return useContext(ChatContext);
}
