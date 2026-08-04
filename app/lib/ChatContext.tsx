'use client';
import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { useUI } from './UIContext';
import { useToast } from './ToastContext';
import { createClient } from './supabase/client';
import { PLAN_MARKER, ROUTINE_MARKER, GOALS_MARKER, QUARTER_PLAN_MARKER, AREA_ASSIGN_MARKER } from './ai/markers';
import { START_MESSAGES, FEEDBACK, AI_COPY } from './ai/messages';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
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
export type QuarterPlanTodo = string | { name: string; days?: number[]; light?: boolean };
export type QuarterPlan = {
  wsId?: string;
  year?: number;
  quarter?: number;
  programs: Array<{
    name: string;
    goal?: string;
    workAreaId?: string; // 소속 업무 영역 id (있으면 그 영역 컨테이너로 들어감)
    deadlines?: Array<{ name: string; date: string; todos?: QuarterPlanTodo[] }>;
  }>;
};

// AI가 미분류 목표를 업무 영역에 배정
export type AreaAssignment = { programId: string; wsId: string; workAreaId: string };

const SESSIONS_KEY = 'spira_chat_sessions';
const CURRENT_KEY = 'spira_chat_current';

interface ChatContextType {
  open: boolean;
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  messages: Message[];
  loading: boolean;
  sendMessage: (text: string, displayText?: string) => Promise<void>;
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
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  // 채팅 표시 상태는 UIContext(chatOpen)가 실제 패널을 제어하므로 그것과 하나로 묶는다.
  // (예전엔 별도 useState라 chat.setOpen(true)로는 패널이 열리지 않았음)
  const ui = useUI();
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

  const registerGoalsHandler = useCallback((handler: (ops: GoalsOperation[]) => void) => {
    goalsHandlerRef.current = handler;
  }, []);

  const unregisterGoalsHandler = useCallback(() => {
    goalsHandlerRef.current = null;
  }, []);

  const registerQuarterPlanHandler = useCallback((handler: (plans: QuarterPlan[]) => void) => {
    quarterPlanHandlerRef.current = handler;
  }, []);

  const unregisterQuarterPlanHandler = useCallback(() => {
    quarterPlanHandlerRef.current = null;
  }, []);

  const registerAreaAssignHandler = useCallback((handler: (assigns: AreaAssignment[]) => void) => {
    areaAssignHandlerRef.current = handler;
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

  const sendMessage = useCallback(async (text: string, displayText?: string) => {
    const displayMsg: Message = { role: 'user', content: displayText ?? text };
    const apiMsg: Message = { role: 'user', content: text };
    const displayNext: Message[] = [...messagesRef.current, displayMsg];
    const apiNext: Message[] = [...messagesRef.current, apiMsg];
    setMessages(displayNext);
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

      if (!res.ok || !res.body) throw new Error('응답 오류');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });

        const display = full.includes(PLAN_MARKER)
          ? full.split(PLAN_MARKER)[0].trimEnd()
          : full.includes(ROUTINE_MARKER)
          ? full.split(ROUTINE_MARKER)[0].trimEnd()
          : full.includes(QUARTER_PLAN_MARKER)
          ? full.split(QUARTER_PLAN_MARKER)[0].trimEnd()
          : full.includes(AREA_ASSIGN_MARKER)
          ? full.split(AREA_ASSIGN_MARKER)[0].trimEnd()
          : full;

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: display };
          return updated;
        });
      }

      // AI 자동 입력(기획서·할일·영역 자동 반영)은 Pro 전용 — 무료는 조언까지만
      const hadMarker = full.includes(PLAN_MARKER) || full.includes(ROUTINE_MARKER) || full.includes(GOALS_MARKER) || full.includes(QUARTER_PLAN_MARKER) || full.includes(AREA_ASSIGN_MARKER);
      if (hadMarker && !isProRef.current) {
        toastRef.current('AI 자동 입력은 Pro 전용이에요. 업그레이드하면 자동으로 채워드려요.', 'info');
      }

      if (full.includes(PLAN_MARKER) && planHandlerRef.current && isProRef.current) {
        const rawPart = full.split(PLAN_MARKER)[1]?.trim() ?? '';
        // 코드펜스나 앞뒤 설명이 섞여도 첫 '{' ~ 마지막 '}'만 잘라 파싱
        const objStart = rawPart.indexOf('{');
        const objEnd = rawPart.lastIndexOf('}');
        const jsonPart = objStart !== -1 && objEnd > objStart
          ? rawPart.slice(objStart, objEnd + 1)
          : rawPart;
        if (jsonPart) {
          try {
            const patch = JSON.parse(jsonPart) as PlanPatch;
            planHandlerRef.current(patch);
            const displayContent = full.split(PLAN_MARKER)[0].trimEnd();
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: (displayContent ? displayContent + '\n\n' : '') + FEEDBACK.planUpdated,
              };
              return updated;
            });
          } catch { /* empty */ }
        }
      }

      if (full.includes(ROUTINE_MARKER) && routineHandlerRef.current && isProRef.current) {
        const rawPart = full.split(ROUTINE_MARKER)[1]?.trim() ?? '';
        const arrayStart = rawPart.indexOf('[');
        const arrayEnd = rawPart.lastIndexOf(']');
        const jsonPart = arrayStart !== -1 && arrayEnd > arrayStart
          ? rawPart.slice(arrayStart, arrayEnd + 1)
          : rawPart;
        if (jsonPart) {
          try {
            const routines = JSON.parse(jsonPart) as AISuggestedRoutine[];
            const count = routines.length;
            routineHandlerRef.current(routines);
            routineHandlerRef.current = null;
            routineModeRef.current = false;
            const displayContent = full.split(ROUTINE_MARKER)[0].trimEnd();
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: (displayContent ? displayContent + '\n\n' : '') + FEEDBACK.routineAdded(count),
              };
              return updated;
            });
          } catch { /* empty */ }
        }
      }

      if (full.includes(GOALS_MARKER) && goalsHandlerRef.current && isProRef.current) {
        const rawPart = full.split(GOALS_MARKER)[1]?.trim() ?? '';
        const arrayStart = rawPart.indexOf('[');
        const arrayEnd = rawPart.lastIndexOf(']');
        const jsonPart = arrayStart !== -1 && arrayEnd > arrayStart
          ? rawPart.slice(arrayStart, arrayEnd + 1)
          : rawPart;
        if (jsonPart) {
          try {
            const ops = JSON.parse(jsonPart) as GoalsOperation[];
            goalsHandlerRef.current(ops);
            const displayContent = full.split(GOALS_MARKER)[0].trimEnd();
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: (displayContent ? displayContent + '\n\n' : '') + FEEDBACK.goalsUpdated,
              };
              return updated;
            });
          } catch { /* empty */ }
        }
      }

      if (full.includes(QUARTER_PLAN_MARKER) && quarterPlanHandlerRef.current && isProRef.current) {
        const rawPart = full.split(QUARTER_PLAN_MARKER)[1]?.trim() ?? '';
        // 배열([...]) 또는 단일 객체({...}) 모두 지원 — 먼저 등장하는 형태를 추출
        const aStart = rawPart.indexOf('[');
        const oStart = rawPart.indexOf('{');
        let jsonPart = rawPart;
        if (aStart !== -1 && (oStart === -1 || aStart < oStart)) {
          jsonPart = rawPart.slice(aStart, rawPart.lastIndexOf(']') + 1);
        } else if (oStart !== -1) {
          jsonPart = rawPart.slice(oStart, rawPart.lastIndexOf('}') + 1);
        }
        if (jsonPart) {
          try {
            const parsed = JSON.parse(jsonPart) as QuarterPlan | QuarterPlan[];
            const plans = Array.isArray(parsed) ? parsed : [parsed];
            const progCount = plans.reduce((s, p) => s + (p.programs?.length ?? 0), 0);
            const quarterCount = plans.length;
            quarterPlanHandlerRef.current(plans);
            const displayContent = full.split(QUARTER_PLAN_MARKER)[0].trimEnd();
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: (displayContent ? displayContent + '\n\n' : '') + FEEDBACK.quarterApplied(quarterCount, progCount),
              };
              return updated;
            });
          } catch { /* empty */ }
        }
      }

      if (full.includes(AREA_ASSIGN_MARKER) && areaAssignHandlerRef.current && isProRef.current) {
        const rawPart = full.split(AREA_ASSIGN_MARKER)[1]?.trim() ?? '';
        const aStart = rawPart.indexOf('[');
        const aEnd = rawPart.lastIndexOf(']');
        const jsonPart = aStart !== -1 && aEnd > aStart ? rawPart.slice(aStart, aEnd + 1) : rawPart;
        if (jsonPart) {
          try {
            const assigns = JSON.parse(jsonPart) as AreaAssignment[];
            areaAssignHandlerRef.current(assigns);
            const displayContent = full.split(AREA_ASSIGN_MARKER)[0].trimEnd();
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: (displayContent ? displayContent + '\n\n' : '') + FEEDBACK.areaAssigned(assigns.length),
              };
              return updated;
            });
          } catch { /* empty */ }
        }
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
    if (messagesRef.current.length === 0) {
      setMessages([{
        role: 'assistant',
        content: START_MESSAGES.business,
      }]);
    }
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
      sendMessage, openWithContext,
      registerPlanHandler, unregisterPlanHandler,
      registerRoutineHandler, unregisterRoutineHandler,
      sessions, loadSession, deleteSession, newChat,
      setAppContext,
      registerGoalsHandler, unregisterGoalsHandler,
      registerQuarterPlanHandler, unregisterQuarterPlanHandler,
      registerAreaAssignHandler, unregisterAreaAssignHandler,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  return useContext(ChatContext);
}
