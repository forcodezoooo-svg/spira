'use client';
import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'spira_task_times';
const SESSIONS_KEY = 'spira_active_sessions';
const FOCUS_TIMES_KEY = 'spira_focus_times';
const FOCUS_START_KEY = 'spira_focus_started';
const SESSION_LOG_KEY = 'spira_session_log';

export interface WorkSession { taskId: string; start: number; end: number; }

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 자정을 넘는 세션은 날짜별로 쪼개서 각 날짜에 초를 배분 (자정 이후 시간이 전날로 잘못 쌓이는 것 방지)
function splitByDay(start: number, end: number): Record<string, number> {
  const res: Record<string, number> = {};
  let cur = start;
  while (cur < end) {
    const d = new Date(cur);
    const dayStr = localDateStr(d);
    const nextMid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
    const segEnd = Math.min(end, nextMid);
    res[dayStr] = (res[dayStr] ?? 0) + Math.floor((segEnd - cur) / 1000);
    cur = segEnd;
  }
  return res;
}

// dateStr(YYYY-MM-DD)의 로컬 자정 timestamp
function dayStartMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

type AllTimes = Record<string, Record<string, number>>;
type ActiveSessions = Record<string, number>; // taskId -> startedAt(ms)

interface TimerContextType {
  running: boolean;
  elapsed: number;
  toggle: () => void;
  reset: () => void;
  taskTimes: Record<string, number>;
  isTaskActive: (taskId: string) => boolean;
  activeTaskIds: string[];
  anyActive: boolean;
  toggleTaskTimer: (taskId: string) => void;
  stopTaskTimer: (taskId: string) => void;
  stopAll: () => void;
  getTaskSeconds: (dateStr: string, taskId: string) => number;
  getDisplaySeconds: (dateStr: string, taskId: string) => number;
  getDayTotalSeconds: (dateStr: string) => number;
  getSessionsForDate: (dateStr: string) => WorkSession[];
}

const TimerContext = createContext<TimerContextType | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  // 음악 플레이바 스톱워치
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartRef = useRef<number>(0);

  const [allTimes, setAllTimes] = useState<AllTimes>({});
  const [activeSessions, setActiveSessions] = useState<ActiveSessions>({});
  const [focusTimes, setFocusTimes] = useState<Record<string, number>>({});
  const [sessionLog, setSessionLog] = useState<WorkSession[]>([]);
  const [ready, setReady] = useState(false);
  const [, setTick] = useState(0);

  // 최신 세션/집중창 시작 시각 (이벤트 핸들러에서만 갱신 → 렌더 중 부수효과 방지)
  const activeSessionsRef = useRef<ActiveSessions>({});
  const focusStartRef = useRef<number | null>(null);

  // 로드 + 진행 중이던 세션/집중창 복원 (마운트 시 localStorage → state, 의도된 초기화 패턴)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) setAllTimes(JSON.parse(raw)); } catch { /* empty */ }
    try { const raw = localStorage.getItem(FOCUS_TIMES_KEY); if (raw) setFocusTimes(JSON.parse(raw)); } catch { /* empty */ }
    try { const raw = localStorage.getItem(SESSION_LOG_KEY); if (raw) setSessionLog(JSON.parse(raw)); } catch { /* empty */ }

    let restored: ActiveSessions = {};
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          restored = ('taskId' in p && 'startedAt' in p) ? { [p.taskId]: p.startedAt } : (p as ActiveSessions);
        }
      }
    } catch { /* empty */ }
    if (Object.keys(restored).length > 0) {
      setActiveSessions(restored);
      activeSessionsRef.current = restored;
    }

    try { const raw = localStorage.getItem(FOCUS_START_KEY); if (raw) focusStartRef.current = JSON.parse(raw); } catch { /* empty */ }
    if (focusStartRef.current == null && Object.keys(restored).length > 0) {
      focusStartRef.current = Math.min(...Object.values(restored));
      try { localStorage.setItem(FOCUS_START_KEY, JSON.stringify(focusStartRef.current)); } catch { /* empty */ }
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allTimes)); } catch { /* empty */ } } }, [allTimes, ready]);
  useEffect(() => { if (ready) { try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(activeSessions)); } catch { /* empty */ } } }, [activeSessions, ready]);
  useEffect(() => { if (ready) { try { localStorage.setItem(FOCUS_TIMES_KEY, JSON.stringify(focusTimes)); } catch { /* empty */ } } }, [focusTimes, ready]);
  useEffect(() => { if (ready) { try { localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(sessionLog)); } catch { /* empty */ } } }, [sessionLog, ready]);

  const anyActive = Object.keys(activeSessions).length > 0;

  // 진행 중이면 매초 라이브 갱신
  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [anyActive]);

  // 음악 스톱워치
  useEffect(() => {
    if (running) {
      timerStartRef.current = Date.now() - elapsed * 1000;
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - timerStartRef.current) / 1000)), 500);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const toggle = useCallback(() => setRunning(r => !r), []);
  const reset = useCallback(() => { setRunning(false); setElapsed(0); }, []);

  // 순수 누적기 (functional setState — 부수효과 없음)
  const addTaskTime = useCallback((taskId: string, start: number, end: number) => {
    if (end - start < 1000) return;
    const perDay = splitByDay(start, end); // 자정 넘으면 날짜별로 배분
    setAllTimes(prev => {
      const next = { ...prev };
      for (const [key, s] of Object.entries(perDay)) {
        if (s <= 0) continue;
        const day = { ...(next[key] ?? {}) };
        day[taskId] = (day[taskId] ?? 0) + s;
        next[key] = day;
      }
      return next;
    });
    // 업무 시작/종료 시각 기록
    setSessionLog(prev => [...prev, { taskId, start, end }]);
  }, []);
  const addFocusTime = useCallback((start: number, end: number) => {
    if (end - start < 1000) return;
    const perDay = splitByDay(start, end);
    setFocusTimes(prev => {
      const next = { ...prev };
      for (const [key, s] of Object.entries(perDay)) if (s > 0) next[key] = (next[key] ?? 0) + s;
      return next;
    });
  }, []);

  const persistFocusStart = (v: number | null) => {
    try { if (v != null) localStorage.setItem(FOCUS_START_KEY, JSON.stringify(v)); else localStorage.removeItem(FOCUS_START_KEY); } catch { /* empty */ }
  };
  const applySessions = (next: ActiveSessions) => { activeSessionsRef.current = next; setActiveSessions(next); };

  // 집중창: 활성 세션이 0→1이면 열고, 1→0이면 닫으며 누적 (각 업무와 동일한 타임스탬프)
  const openFocusIfNeeded = (wasEmpty: boolean, isEmpty: boolean, now: number) => {
    if (wasEmpty && !isEmpty) { focusStartRef.current = now; persistFocusStart(now); }
    else if (!wasEmpty && isEmpty && focusStartRef.current != null) {
      addFocusTime(focusStartRef.current, now);
      focusStartRef.current = null;
      persistFocusStart(null);
    }
  };

  // 실제 업무 타이머 종료 후, 배경 세션(FOCUS_ID)만 남은 경우 함께 종료
  const FOCUS_ID = '__focus__';
  const stopFocusIfOrphaned = (next: ActiveSessions, now: number) => {
    const remaining = Object.keys(next);
    if (remaining.length === 1 && remaining[0] === FOCUS_ID) {
      addTaskTime(FOCUS_ID, next[FOCUS_ID], now);
      delete next[FOCUS_ID];
    }
  };

  const toggleTaskTimer = useCallback((taskId: string) => {
    const now = Date.now();
    const prev = activeSessionsRef.current;
    const wasEmpty = Object.keys(prev).length === 0;
    let next: ActiveSessions;
    if (prev[taskId] != null) {
      addTaskTime(taskId, prev[taskId], now);
      next = { ...prev }; delete next[taskId];
      if (taskId !== FOCUS_ID) stopFocusIfOrphaned(next, now);
    } else {
      next = { ...prev, [taskId]: now };
    }
    openFocusIfNeeded(wasEmpty, Object.keys(next).length === 0, now);
    applySessions(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTaskTime, addFocusTime]);

  const stopTaskTimer = useCallback((taskId: string) => {
    const prev = activeSessionsRef.current;
    if (prev[taskId] == null) return;
    const now = Date.now();
    addTaskTime(taskId, prev[taskId], now);
    const next = { ...prev }; delete next[taskId];
    if (taskId !== FOCUS_ID) stopFocusIfOrphaned(next, now);
    openFocusIfNeeded(false, Object.keys(next).length === 0, now);
    applySessions(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTaskTime, addFocusTime]);

  const stopAll = useCallback(() => {
    const prev = activeSessionsRef.current;
    if (Object.keys(prev).length === 0) return;
    const now = Date.now();
    for (const [id, start] of Object.entries(prev)) addTaskTime(id, start, now);
    openFocusIfNeeded(false, true, now);
    applySessions({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTaskTime, addFocusTime]);

  const today = localDateStr();
  const taskTimes = allTimes[today] ?? {};
  const isTaskActive = useCallback((taskId: string) => activeSessions[taskId] != null, [activeSessions]);
  const getTaskSeconds = useCallback((dateStr: string, taskId: string) => (allTimes[dateStr] ?? {})[taskId] ?? 0, [allTimes]);

  const getDisplaySeconds = useCallback((dateStr: string, taskId: string) => {
    const base = (allTimes[dateStr] ?? {})[taskId] ?? 0;
    const st = activeSessions[taskId];
    // 라이브 구간은 오늘 자정 이후만 카운트 (자정 넘겨 실행 중이어도 오늘분은 00:00부터)
    if (dateStr === today && st != null) return base + Math.floor((Date.now() - Math.max(st, dayStartMs(today))) / 1000);
    return base;
  }, [allTimes, activeSessions, today]);

  const getDayTotalSeconds = useCallback((dateStr: string) => {
    const base = focusTimes[dateStr] ?? 0;
    if (dateStr === today && focusStartRef.current != null) return base + Math.floor((Date.now() - Math.max(focusStartRef.current, dayStartMs(today))) / 1000);
    return base;
  }, [focusTimes, today]);

  const getSessionsForDate = useCallback((dateStr: string) =>
    sessionLog.filter(s => localDateStr(new Date(s.start)) === dateStr).sort((a, b) => a.start - b.start),
  [sessionLog]);

  return (
    <TimerContext.Provider value={{
      running, elapsed, toggle, reset,
      taskTimes, isTaskActive, activeTaskIds: Object.keys(activeSessions), anyActive, toggleTaskTimer, stopTaskTimer, stopAll,
      getTaskSeconds, getDisplaySeconds, getDayTotalSeconds, getSessionsForDate,
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within TimerProvider');
  return ctx;
}
