'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUI } from '../lib/UIContext';
import { useTimer } from '../lib/TimerContext';
import { useChatContext } from '../lib/ChatContext';
import { useStore } from '../lib/useStore';

// 두 종류의 티칭:
//  1) 온보딩 직후 투어(TOUR) — Plan→Goals→Home. 대부분 '사용자가 실제 동작'을 하면 자동 진행.
//  2) 페이지별 첫 진입 안내(PAGE_TIPS) — 각 페이지 최초 방문 시 1회.
// await* = 사용자가 실제 동작을 완료하면 다음 단계로 진행(다음 버튼 없음).
type Step = {
  page?: string; target?: string; targets?: string[]; text: string;
  closeChat?: boolean; go?: string; last?: boolean; prefill?: string; celebrate?: boolean;
  awaitChatOpen?: boolean; awaitTodos?: boolean; awaitPlaced?: boolean; awaitTimer?: boolean;
  awaitGoals?: boolean;       // '다음'/버튼으로 사업 목표가 생성될 때까지 대기 후 진행
  awaitProject?: boolean;     // '다음'으로 프로젝트가 생성될 때까지 대기 후 진행
  expandGoals?: boolean;      // 단계 시작 시 첫 사업 목표를 자동으로 펼침
  breakdownOnNext?: boolean;  // '다음' 클릭 시 첫 목표에 AI로 프로젝트(초안) 자동 생성
  // Goals 투어 전용
  openCtx?: boolean;          // 단계 시작 시 로드맵 막대의 우클릭 팝업을 자동으로 띄움
  kbView?: boolean;           // 단계 시작 시 카테고리 보드 뷰로 전환
  genTasksOnNext?: boolean;   // '다음' 클릭 시 카테고리 보드 AI 버튼으로 할일 생성
  awaitTasks?: boolean;       // 할일(subtask)이 생성될 때까지 대기 후 진행
  forceTemplate?: boolean;    // '템플릿 저장' 버튼을 강제로 노출(hover 없이도 보이게)
  forceUnitAdd?: boolean;     // '+ 세부 작업' 추가 버튼을 강제로 노출(hover 없이도 보이게)
  // 다중 대상 단계에서 툴팁을 '첫 번째 대상' 바로 위에 띄우고 싶을 때 (예: 드래그할 업무 위)
  tipAbove?: boolean;
  // 툴팁을 대상 '왼쪽'에 강제 배치(오른쪽 끝 버튼이라 오른쪽엔 잘릴 때)
  tipLeft?: boolean;
  // 단계 시작 시 대상을 화면 중앙으로 자동 스크롤
  scrollCenter?: boolean;
  // 온보딩 자동 생성: 사용자가 입력하지 않아도 '버튼 있는 답변'이 자동으로 나오게 함
  autoSend?: string;    // 조용히 전송할 요청(사용자 말풍선 없음)
  autoIntro?: string;   // 답변에 고정으로 표시할 문구
};

const TOUR: Step[] = [
  { page: '/plan', text: '입력하신 내용으로 사업개요를 작성했어요. 이미 작성해둔 사업계획서가 있다면, 업로드 해서 사업 계획에 참고할 수 있어요.' },
  { page: '/plan', target: '[data-teach="plan-help"]', text: '각 항목 옆에 있는 물음표를 클릭하면, 어떤 내용을 기입해야 하는지 간단한 설명을 볼 수 있어요.' },
  { page: '/plan', target: '[data-teach="plan-fill"]', text: '타이틀 옆의 다이아몬드 아이콘을 클릭하면, Sparky가 해당 칸의 내용을 채워줘요.' },
  { page: '/plan', target: '[data-teach="goal-suggest"]', text: '‘AI로 목표추천’ 버튼을 눌러보세요. 사업개요의 내용에 맞춰 사업 성장 목표가 자동으로 생성되어요.', scrollCenter: true, tipLeft: true, awaitGoals: true },
  { page: '/plan', target: '[data-teach="goal-card"]', text: '사업목표를 이루기 위한 전략과 성과지표를 설정하고, 본격적인 업무 프로젝트를 설정할 수 있어요.', expandGoals: true, scrollCenter: true },
  { page: '/plan', target: '[data-teach="goal-ai"]', text: '어떤 내용으로 채워야 할지 막막할 때는, AI가 사업개요에 맞춰 간단히 초안을 채워넣어줄 수 있어요.', scrollCenter: true, breakdownOnNext: true, awaitProject: true },
  { page: '/plan', target: '[data-teach="project-card"]', text: 'AI가 생성해준 내용들을 확인하고, 수정이나 보완해보세요!', scrollCenter: true },
  { page: '/plan', text: '첫 사업 목표를 세웠어요. 이제 본격적으로 시작해볼까요?', last: true, celebrate: true },
  // ── Goals 투어 (별도) — 로드맵이 비었을 때 '첫 목표 가져오기'로 시작 (GOALS_START부터) ──
  { page: '/programs', target: '[data-teach="roadmap-bar"]', text: '프로젝트 막대 위에 마우스를 올려놓고 우클릭하면 프로젝트 시작 날짜와 소요 기간을 설정할 수 있어요!', scrollCenter: true },
  { page: '/programs', target: '[data-teach-ctx]', text: '직접 날짜를 입력할 수도 있지만, 드래그를 통해서 기간을 조절하거나 옮기는 것도 가능해요.', openCtx: true },
  { page: '/programs', target: '[data-teach="kb-toggle"]', text: '카테고리 보드로 이동해볼까요?' },
  { page: '/programs', target: '[data-teach="kb-ai"]', text: 'AI 버튼을 누르면 이 프로젝트를 위한 할일이 자동으로 생성돼요.', kbView: true, scrollCenter: true, genTasksOnNext: true, awaitTasks: true },
  { page: '/programs', target: '[data-teach="kb-task"]', text: '이 task를 위한 세부 업무도 만들어서 할 일을 좀 더 촘촘히 계획할 수 있어요. 할일 수정이나 반복 설정은 텍스트를 클릭하면 가능해요.', scrollCenter: true, forceUnitAdd: true },
  { page: '/programs', target: '[data-teach="kb-template"]', text: '이 프로세스를 다음에 또 하고 싶을 땐 템플릿 저장을 해보세요. 필요할 때 또 템플릿을 불러와서 사용할 수 있어요.', forceTemplate: true, scrollCenter: true, last: true },
];
// Goals 투어 시작 인덱스(위 온보딩 8단계 다음). '첫 목표 가져오기' 시 이 인덱스로 점프.
const GOALS_START = 8;

// 온보딩 투어가 다루지 않는 페이지의 첫 진입 안내. Home·Goals는 위 투어가 다룸.
const PAGE_TIPS: Record<string, Step[]> = {
  '/home': [
    { target: '[data-teach="hp-workhours"]', text: '이번 주에 일할 날짜와 시간을 이곳에서 설정할 수 있어요. 설정된 시간에 맞춰서 매일 소화할 수 있는 만큼의 업무가 계획돼요.', scrollCenter: true },
    { target: '[data-teach="hp-timer"]', text: '오늘의 업무를 진행하며 플레이버튼을 누르면 소요 시간을 기록하고, 다음에 비슷한 일을 할 때 평균 소요 시간을 반영해 계획할 수 있어요.', scrollCenter: true },
    { target: '[data-teach="hp-clockin"]', text: '출근, 퇴근 버튼을 통해 총 업무시간을 기록하고 업무와 일상을 분리할 수 있게 도와줘요.', scrollCenter: true, last: true },
  ],
  '/task': [
    { text: 'Task에서는 날짜별 업무를 관리하고, 타이머로 집중한 작업 시간을 기록할 수 있어요.', last: true },
  ],
  '/resources': [
    { text: 'Resources에는 사업에 필요한 자료·링크·메모를 한곳에 모아둘 수 있어요.', last: true },
  ],
};

const TOUR_KEY = 'spira_teach_idx';
const seenKey = (p: string) => `spira_seen:${p}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// localStorage에서 직접 데드라인/할일 수 집계 (스토어 인스턴스 공유 문제 회피)
function readCounts(): { total: number; placedToday: number } {
  try {
    const d = JSON.parse(localStorage.getItem('spira') || '{}');
    const today = todayStr();
    let total = 0, placedToday = 0;
    for (const e of d.workspaces ?? []) {
      for (const p of e.programs ?? []) {
        for (const dl of p.deadlines ?? []) {
          total += 1;
          for (const t of dl.todos ?? []) {
            total += 1;
            if (t.date === today || t.deadline === today) placedToday += 1;
          }
        }
      }
    }
    return { total, placedToday };
  } catch {
    return { total: 0, placedToday: 0 };
  }
}

// 전체 워크스페이스의 사업 목표(plan.goals) 수 — 온보딩 투어의 '목표 생성' 감지용
function readGoalCount(): number {
  try {
    const d = JSON.parse(localStorage.getItem('spira') || '{}');
    let n = 0;
    for (const e of d.workspaces ?? []) n += (e.plan?.goals ?? []).length;
    return n;
  } catch { return 0; }
}

// 전체 워크스페이스의 프로젝트(plan.projects) 수 — 투어의 '프로젝트 생성' 감지용
function readProjectCount(): number {
  try {
    const d = JSON.parse(localStorage.getItem('spira') || '{}');
    let n = 0;
    for (const e of d.workspaces ?? []) n += (e.plan?.projects ?? []).length;
    return n;
  } catch { return 0; }
}

// 전체 워크스페이스의 할일(subtask) 수 — Goals 투어의 '할일 생성' 감지용
function readSubtaskCount(): number {
  try {
    const d = JSON.parse(localStorage.getItem('spira') || '{}');
    let n = 0;
    for (const e of d.workspaces ?? []) for (const p of e.programs ?? []) for (const dl of p.deadlines ?? []) for (const t of dl.todos ?? []) n += (t.subtasks ?? []).length;
    return n;
  } catch { return 0; }
}

export default function Teaching() {
  const pathname = usePathname();
  const router = useRouter();
  const ui = useUI();
  const chat = useChatContext();
  const store = useStore();
  const { anyActive } = useTimer();
  const autoSentRef = useRef<Set<number>>(new Set());
  const [tourIdx, setTourIdx] = useState(-1);
  const [pageIdx, setPageIdx] = useState(-1);
  const [rects, setRects] = useState<DOMRect[]>([]); // 하이라이트 대상들(다중 지원)
  const [busy, setBusy] = useState(false); // 목표/프로젝트 AI 생성 중 로딩 표시

  // 경로 변경 시: 투어 진행값 로드 + (네비게이션 대기 단계면) 목표 페이지 도달 시 자동 진행 + 페이지 첫 진입 안내
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const rawTour = localStorage.getItem(TOUR_KEY);
    let ti = rawTour == null ? -1 : Number(rawTour);
    if (ti >= 0 && ti < TOUR.length && TOUR[ti].go && TOUR[ti].go === pathname) {
      ti = ti + 1;
      if (ti >= TOUR.length) localStorage.removeItem(TOUR_KEY);
      else localStorage.setItem(TOUR_KEY, String(ti));
    }
    setTourIdx(ti);
    const tourHere = ti >= 0 && ti < TOUR.length && TOUR[ti].page === pathname;
    const tips = PAGE_TIPS[pathname];
    setPageIdx(!tourHere && tips && !localStorage.getItem(seenKey(pathname)) ? 0 : -1);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const tourActive = tourIdx >= 0 && tourIdx < TOUR.length && TOUR[tourIdx]?.page === pathname;
  const pageTips = PAGE_TIPS[pathname];
  const pageActive = !tourActive && !!pageTips && pageIdx >= 0 && pageIdx < pageTips.length;
  const step: Step | null = tourActive ? TOUR[tourIdx] : pageActive ? pageTips![pageIdx] : null;

  // 실제 동작 완료 시 다음 단계로 (투어 전용)
  const advanceTour = useCallback(() => {
    setTourIdx(prev => {
      if (prev < 0 || prev >= TOUR.length) return prev;
      const nextIdx = prev + 1;
      if (TOUR[prev].last || nextIdx >= TOUR.length) { localStorage.removeItem(TOUR_KEY); return -1; }
      localStorage.setItem(TOUR_KEY, String(nextIdx));
      return nextIdx;
    });
  }, []);

  // await 감지 (채팅 열기 / 타이머 시작)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tourActive && step?.awaitChatOpen && ui.chatOpen) advanceTour();
  }, [tourActive, step, ui.chatOpen, advanceTour]);
  useEffect(() => {
    if (tourActive && step?.awaitTimer && anyActive) advanceTour();
  }, [tourActive, step, anyActive, advanceTour]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 온보딩 자동 생성: 사용자가 입력하지 않아도 '버튼 있는 답변'이 자동으로 나오게 (단계당 1회)
  useEffect(() => {
    if (!tourActive || !step?.autoSend || !chat) return;
    if (autoSentRef.current.has(tourIdx)) return;
    autoSentRef.current.add(tourIdx);
    ui.openChat();
    void chat.sendMessage(step.autoSend, undefined, { hideUser: true, intro: step.autoIntro });
  }, [tourActive, tourIdx, step, chat, ui]);

  // 채팅 입력창 프리필: 특정 단계에서 안내 문구를 미리 채워둠(사용자가 그대로 전송)
  useEffect(() => {
    if (tourActive && step?.prefill) {
      window.dispatchEvent(new CustomEvent('spira-chat-prefill', { detail: step.prefill }));
    }
  }, [tourActive, step]);

  // 타이머 단계에선 호버 시에만 보이는 플레이 버튼을 강제로 노출(하이라이트가 보이게)
  useEffect(() => {
    document.body.classList.toggle('spira-teach-timer', !!(tourActive && step?.awaitTimer));
    return () => document.body.classList.remove('spira-teach-timer');
  }, [tourActive, step]);

  // await 감지 (할일 생성 / 캘린더 배치) — localStorage 폴링
  useEffect(() => {
    if (!tourActive || !step || (!step.awaitTodos && !step.awaitPlaced)) return;
    const base = readCounts();
    const baseVal = step.awaitPlaced ? base.placedToday : base.total;
    const iv = setInterval(() => {
      const c = readCounts();
      const cur = step.awaitPlaced ? c.placedToday : c.total;
      if (cur > baseVal) { clearInterval(iv); if (step.closeChat) ui.closeChat(); advanceTour(); }
    }, 500);
    return () => clearInterval(iv);
  }, [tourActive, step, advanceTour, ui]);

  // await 감지 (사업 목표 생성) — plan.goals 수 증가 폴링
  useEffect(() => {
    if (!tourActive || !step?.awaitGoals) return;
    const base = readGoalCount();
    const iv = setInterval(() => {
      if (readGoalCount() > base) { clearInterval(iv); advanceTour(); }
    }, 500);
    return () => clearInterval(iv);
  }, [tourActive, step, advanceTour]);

  // await 감지 (프로젝트 생성) — plan.projects 수 증가 폴링
  useEffect(() => {
    if (!tourActive || !step?.awaitProject) return;
    const base = readProjectCount();
    const iv = setInterval(() => {
      if (readProjectCount() > base) { clearInterval(iv); advanceTour(); }
    }, 500);
    return () => clearInterval(iv);
  }, [tourActive, step, advanceTour]);

  // 단계 시작 시 첫 목표 자동 펼침
  useEffect(() => {
    if (tourActive && step?.expandGoals) window.dispatchEvent(new CustomEvent('spira-teach:expand-goals'));
  }, [tourActive, tourIdx, step]);

  // Goals 투어 시작: '첫 목표 가져오기'가 호출하는 이벤트로 GOALS_START 단계로 점프
  useEffect(() => {
    const onStart = () => { localStorage.setItem(TOUR_KEY, String(GOALS_START)); setTourIdx(GOALS_START); };
    window.addEventListener('spira-teach:start-goals', onStart);
    return () => window.removeEventListener('spira-teach:start-goals', onStart);
  }, []);

  // Goals 투어: 카테고리 보드 뷰로 전환
  useEffect(() => {
    if (tourActive && step?.kbView) window.dispatchEvent(new CustomEvent('spira-teach:kb-view'));
  }, [tourActive, tourIdx, step]);

  // Goals 투어: 로드맵 막대의 우클릭 팝업 자동 표시(막대에 합성 contextmenu 이벤트 디스패치). 단계 벗어나면 팝업 닫기.
  useEffect(() => {
    if (!tourActive || !step?.openCtx) return;
    let tries = 0;
    const iv = setInterval(() => {
      const el = document.querySelector('[data-teach="roadmap-bar"]') as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        clearInterval(iv);
      } else if (++tries > 40) clearInterval(iv);
    }, 120);
    return () => { clearInterval(iv); window.dispatchEvent(new CustomEvent('spira-teach:close-ctx')); };
  }, [tourActive, tourIdx, step]);

  // Goals 투어: '템플릿 저장' 버튼 강제 노출(hover 없이 보이게)
  useEffect(() => {
    document.body.classList.toggle('spira-teach-template', !!(tourActive && step?.forceTemplate));
    return () => document.body.classList.remove('spira-teach-template');
  }, [tourActive, step]);

  // Goals 투어: '+ 세부 작업' 버튼 강제 노출(hover 없이 보이게)
  useEffect(() => {
    document.body.classList.toggle('spira-teach-unitadd', !!(tourActive && step?.forceUnitAdd));
    return () => document.body.classList.remove('spira-teach-unitadd');
  }, [tourActive, step]);

  // await 감지 (할일 생성) — subtask 수 증가 폴링
  useEffect(() => {
    if (!tourActive || !step?.awaitTasks) return;
    const base = readSubtaskCount();
    const iv = setInterval(() => {
      if (readSubtaskCount() > base) { clearInterval(iv); advanceTour(); }
    }, 500);
    return () => clearInterval(iv);
  }, [tourActive, step, advanceTour]);

  // 목표 추천 단계: '목표 추천' 버튼이 모달 대신 직접 생성 경로를 타게 하는 플래그 + 클릭 시 로딩 표시
  useEffect(() => {
    setBusy(false); // 단계 진입 시 로딩 초기화
    const w = window as Window & { __spiraTeachDirectGoals?: boolean };
    const on = !!(tourActive && step?.awaitGoals);
    w.__spiraTeachDirectGoals = on;
    if (!on) return () => { w.__spiraTeachDirectGoals = false; };
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('[data-teach="goal-suggest"]')) setBusy(true);
    };
    document.addEventListener('click', onClick, true);
    return () => { w.__spiraTeachDirectGoals = false; document.removeEventListener('click', onClick, true); };
  }, [tourActive, tourIdx, step]);

  // 생성 실패 등으로 로딩이 멈추지 않도록 안전 타임아웃(목표 감지되면 단계 전환으로 먼저 초기화됨)
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 45000);
    return () => clearTimeout(t);
  }, [busy]);

  const locate = useCallback(() => {
    const sels = step ? (step.targets ?? (step.target ? [step.target] : [])) : [];
    const found: DOMRect[] = [];
    // html { zoom } 보정: getBoundingClientRect은 zoom이 반영된 좌표를 주는데
    // fixed 오버레이(SVG/툴팁)도 html zoom 안에서 다시 zoom배 스케일되어 좌표가 두 번 곱해진다.
    // → rect을 html zoom으로 한 번 나눠 오버레이 좌표계에 맞춘다.
    const zc = parseFloat(getComputedStyle(document.documentElement).zoom || '1');
    const scl = zc && !isNaN(zc) && zc > 0.5 && zc < 3 ? zc : 1;
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      found.push(scl === 1 ? b : new DOMRect(b.left / scl, b.top / scl, b.width / scl, b.height / scl));
    }
    setRects(found);
  }, [step]);

  // 대상 위치 추적(동적 렌더 대비 재시도 + 스크롤/리사이즈 갱신)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!step) { setRects([]); return; }
    locate();
    let tries = 0;
    const iv = setInterval(() => { locate(); if (++tries > 40) clearInterval(iv); }, 120);
    const upd = () => locate();
    window.addEventListener('scroll', upd, true);
    window.addEventListener('resize', upd);
    return () => { clearInterval(iv); window.removeEventListener('scroll', upd, true); window.removeEventListener('resize', upd); };
  }, [step, locate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 단계 시작 시 대상을 화면 중앙으로 스크롤(scrollCenter 지정 단계). 대상이 렌더될 때까지 재시도 후 1회 실행.
  useEffect(() => {
    if (!step?.scrollCenter) return;
    const sel = step.target ?? step.targets?.[0];
    if (!sel) return;
    let tries = 0;
    const iv = setInterval(() => {
      const el = document.querySelector(sel);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); clearInterval(iv); }
      else if (++tries > 40) clearInterval(iv);
    }, 120);
    return () => clearInterval(iv);
  }, [step]);

  if (!step) return null;

  // 툴팁 위치 기준. 기본은 마지막 하이라이트, tipAbove면 '첫 번째' 하이라이트(드래그할 업무) 기준.
  const rect: DOMRect | null = rects.length ? (step.tipAbove ? rects[0] : rects[rects.length - 1]) : null;

  // 온보딩 투어[0,GOALS_START)와 Goals 투어[GOALS_START,끝)를 분리해 점 개수/위치 표시
  const inGoals = tourActive && tourIdx >= GOALS_START;
  const segStart = inGoals ? GOALS_START : 0;
  const segEnd = inGoals ? TOUR.length : GOALS_START;
  const dotCount = tourActive ? (segEnd - segStart) : pageTips!.length;
  const dotIdx = tourActive ? (tourIdx - segStart) : pageIdx;

  const setTour = (n: number) => {
    if (n < 0 || n >= TOUR.length) { localStorage.removeItem(TOUR_KEY); setTourIdx(-1); }
    else { localStorage.setItem(TOUR_KEY, String(n)); setTourIdx(n); }
  };
  const endPage = () => { localStorage.setItem(seenKey(pathname), '1'); setPageIdx(-1); };

  // 지정 버튼(채팅 열기·페이지 이동·자동 채우기·캘린더 배치·타이머) 대신 '다음'을 눌러도
  // 그 버튼을 누른 것과 동일한 동작을 대신 실행해 흐름이 끊기지 않게 한다.
  const applyPendingChatAction = () => {
    const msgs = chat?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].action && !msgs[i].action?.done) { chat?.applyAction(i); return; }
    }
  };
  const placeAnyTodoToday = () => {
    const today = todayStr();
    for (const e of store.allWorkspacesEntries) {
      for (const p of e.programs) {
        for (const dl of p.deadlines ?? []) {
          for (const t of dl.todos ?? []) {
            if (t.date !== today && t.deadline !== today) {
              store.updateProgramTodo(e.workspace.id, p.id, dl.id, t.id, { date: today });
              return;
            }
          }
        }
      }
    }
  };

  const next = () => {
    // 투어의 '동작 대기' 단계: 다음을 눌러도 지정 버튼과 같은 동작을 대신 수행하고,
    // 각 동작의 완료 감지 이펙트/폴링이 자동으로 다음 단계로 진행시킨다.
    if (tourActive && !step.last) {
      if (step.go) { if (step.closeChat) ui.closeChat(); router.push(step.go); return; }
      if (step.awaitChatOpen) { ui.openChat(); return; }
      if (step.awaitTodos) { applyPendingChatAction(); return; }
      if (step.awaitPlaced) { placeAnyTodoToday(); return; }
      if (step.awaitTimer) {
        // 하이라이트된 플레이 버튼을 대신 눌러 업무 타이머를 시작 (타이머 감지로 다음 단계 진행)
        const btn = document.querySelector<HTMLElement>('[data-teach="today-timer"]');
        if (btn) { btn.click(); return; }
      }
      if (step.awaitGoals) {
        // 'AI로 목표추천' 버튼을 대신 눌러 목표 생성 시작 (목표 생성 감지로 다음 단계 진행)
        setBusy(true);
        const btn = document.querySelector<HTMLElement>('[data-teach="goal-suggest"]');
        if (btn) { btn.click(); return; }
      }
      if (step.breakdownOnNext) {
        // 첫 목표에 AI로 프로젝트(초안) 자동 생성 트리거 → 생성 감지(awaitProject)로 다음 단계 진행
        if (step.awaitProject) setBusy(true);
        window.dispatchEvent(new CustomEvent('spira-teach:breakdown-goals'));
        if (step.awaitProject) return;
      }
      if (step.genTasksOnNext) {
        // 카테고리 보드 AI 버튼을 대신 눌러 할일 생성 → 생성 감지(awaitTasks)로 다음 단계 진행
        if (step.awaitTasks) setBusy(true);
        const btn = document.querySelector<HTMLElement>('[data-teach="kb-ai"]');
        if (btn) { btn.click(); if (step.awaitTasks) return; }
      }
    }
    if (step.closeChat) ui.closeChat();
    if (tourActive) { if (step.last) { setTour(-1); return; } setTour(tourIdx + 1); return; }
    if (step.last || pageIdx >= pageTips!.length - 1) { endPage(); return; }
    setPageIdx(pageIdx + 1);
  };
  // 티칭 전체 건너뛰기 (투어면 투어 종료, 페이지 안내면 해당 안내 종료)
  const skip = () => {
    if (step.closeChat) ui.closeChat();
    if (tourActive) setTour(-1);
    else endPage();
  };
  const isLast = step.last || (!tourActive && pageIdx >= pageTips!.length - 1);
  const nextLabel = tourActive ? (step.last ? '시작하기' : '다음') : (isLast ? '알겠어요' : '다음');

  // 마무리 축하: 여정 지도 목표 깃발 증정 모션 + '이제 시작해보세요!'
  if (step.celebrate) {
    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.55)' }}>
        <div className="bg-white rounded-3xl w-full max-w-sm px-6 pt-6 pb-6 text-center" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
          <div className="relative w-full h-56 mb-2 flex items-end justify-center">
            {/* 목표 깃발 — 위에서 내려오며 바운스 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/flag-goal-hero.svg" alt="목표 깃발" className="spira-flag-plant w-auto" style={{ height: 220 }} />
          </div>
          <h2 className="text-[21px] font-black leading-snug mb-2" style={{ color: '#16211E' }}>이제 시작해보세요! 🎉</h2>
          <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#5B6560' }}>{step.text}</p>
          <button onClick={next} className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>시작하기</button>
        </div>
      </div>
    );
  }

  // 툴팁 위치: 대상 주변 4방향 중 공간이 있는 쪽으로 배치(패널과 겹치지 않게).
  const PAD = 8, GAP = 12, TW = 420, TH = 180, EDGE = 30; // EDGE: 하이라이트/화면 가장자리와의 여백
  // rects는 zoom 보정(÷zoom)된 좌표계이므로 뷰포트도 같은 좌표계로 맞춘다.
  const zc0 = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).zoom || '1') : 1;
  const zf = zc0 && !isNaN(zc0) && zc0 > 0.5 && zc0 < 3 ? zc0 : 1;
  const vw = (typeof window !== 'undefined' ? window.innerWidth : 1200) / zf;
  const vh = (typeof window !== 'undefined' ? window.innerHeight : 800) / zf;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const g = EDGE; // 모든 단계: 하이라이트 영역에서 50px 띄움
  let tipStyle: React.CSSProperties;
  if (rect) {
    let left: number, top: number | undefined, bottom: number | undefined;
    if (step.tipLeft) {                             // 강제 '왼쪽' — 오른쪽 끝 버튼이라 오른쪽엔 잘릴 때
      left = rect.left - g - TW; top = rect.top + rect.height / 2 - TH / 2;
    } else if (step.tipAbove) {                     // 강제 '위' — 드래그할 업무 하이라이트 바로 위에 배치
      bottom = vh - rect.top + g; left = rect.left + rect.width / 2 - TW / 2;
    } else if (vh - rect.bottom >= TH + g) {        // 아래
      top = rect.bottom + g; left = rect.left + rect.width / 2 - TW / 2;
    } else if (rect.top >= TH + g) {               // 위 — 박스 '하단'을 대상 상단에서 정확히 g(30px) 위에 배치(박스 높이와 무관)
      bottom = vh - rect.top + g; left = rect.left + rect.width / 2 - TW / 2;
    } else if (rect.left >= TW + g) {              // 왼쪽 (오른쪽 꽉 찬 패널/캘린더용)
      left = rect.left - g - TW; top = rect.top + rect.height / 2 - TH / 2;
    } else if (vw - rect.right >= TW + g) {         // 오른쪽
      left = rect.right + g; top = rect.top + rect.height / 2 - TH / 2;
    } else {                                        // 폴백: 하단 중앙
      left = vw / 2 - TW / 2; top = vh - TH - 24;
    }
    tipStyle = {
      left: clamp(left, GAP, vw - TW - EDGE),
      width: `min(92vw, ${TW}px)`,
      ...(bottom !== undefined
        ? { bottom: clamp(bottom, GAP, vh - GAP) }
        : { top: clamp(top!, GAP, vh - TH - GAP) }),
    };
  } else {
    tipStyle = { left: '50%', bottom: 24, transform: 'translateX(-50%)', width: 'min(92vw, 430px)' };
  }

  return (
    <>
      {/* 스포트라이트: 대상(들) 주변만 밝히고 나머지 딤. 구멍/링 모두 SVG 라운드 사각형으로 그려 자연스럽게 */}
      {rects.length > 0 ? (
        <svg className="fixed inset-0 z-[78] pointer-events-none w-full h-full">
          <defs>
            <mask id="spira-teach-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
              {rects.map((r, i) => (
                <rect key={i} x={r.left - PAD} y={r.top - PAD} width={r.width + PAD * 2} height={r.height + PAD * 2} rx="16" ry="16" fill="#000" />
              ))}
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="#002929" fillOpacity="0.55" mask="url(#spira-teach-mask)" />
          {rects.map((r, i) => (
            <rect key={i} x={r.left - PAD} y={r.top - PAD} width={r.width + PAD * 2} height={r.height + PAD * 2} rx="16" ry="16" fill="none" stroke="#9DFE3B" strokeWidth="2" />
          ))}
        </svg>
      ) : (
        <div className="fixed inset-0 z-[78] pointer-events-none" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} />
      )}

      {/* 클릭 차단막: 하이라이트된 대상(지시한 버튼)과 툴팁만 조작 가능. 나머지 영역은 실수 클릭 방지.
          대상 주변을 4개의 띠로 덮어 대상 영역만 '구멍'으로 열어둔다(대상 없으면 전체 차단). */}
      {(() => {
        const blockStyles: React.CSSProperties[] = [];
        if (rects.length) {
          const l = Math.max(0, Math.min(...rects.map(r => r.left)) - PAD);
          const t = Math.max(0, Math.min(...rects.map(r => r.top)) - PAD);
          const r = Math.max(...rects.map(x => x.right)) + PAD;
          const b = Math.max(...rects.map(x => x.bottom)) + PAD;
          blockStyles.push({ left: 0, right: 0, top: 0, height: t });               // 위
          blockStyles.push({ left: 0, right: 0, top: b, bottom: 0 });               // 아래
          blockStyles.push({ left: 0, top: t, width: l, height: Math.max(0, b - t) }); // 왼쪽
          blockStyles.push({ left: r, top: t, right: 0, height: Math.max(0, b - t) }); // 오른쪽
        } else {
          blockStyles.push({ inset: 0 });
        }
        return blockStyles.map((s, i) => (
          <div key={i} className="fixed z-[79]" style={s} onMouseDown={e => e.preventDefault()} />
        ));
      })()}

      {/* 툴팁 카드 */}
      <div className="fixed z-[80]" style={tipStyle}>
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: '0 16px 44px rgba(0,0,0,0.28)' }}>
          <p className="text-[14px] leading-relaxed" style={{ color: '#16211E' }}>{step.text}</p>
          {busy ? (
            <div className="flex items-center gap-2 mt-3.5" style={{ color: '#5B6560' }}>
              <span className="w-4 h-4 rounded-full border-2 border-neutral-200 border-t-violet-400 animate-spin" />
              <span className="text-[13px] font-semibold">{step.awaitTasks ? '할일을 만들고 있어요…' : step.awaitProject ? '프로젝트를 만들고 있어요…' : '사업 성장 목표를 만들고 있어요…'}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-3.5">
              <div className="flex items-center gap-1">
                {Array.from({ length: dotCount }).map((_, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i === dotIdx ? '#5EA63A' : '#E1E1DA' }} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {!isLast && (
                  <button onClick={skip} className="px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
                    건너뛰기
                  </button>
                )}
                <button onClick={next} className="px-4 py-1.5 rounded-full text-[13px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#16211E', color: '#EDFF9F' }}>
                  {nextLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
