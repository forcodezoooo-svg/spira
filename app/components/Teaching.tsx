'use client';
import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useUI } from '../lib/UIContext';
import { useTimer } from '../lib/TimerContext';

// 두 종류의 티칭:
//  1) 온보딩 직후 투어(TOUR) — Plan→Goals→Home. 대부분 '사용자가 실제 동작'을 하면 자동 진행.
//  2) 페이지별 첫 진입 안내(PAGE_TIPS) — 각 페이지 최초 방문 시 1회.
// await* = 사용자가 실제 동작을 완료하면 다음 단계로 진행(다음 버튼 없음).
type Step = {
  page?: string; target?: string; targets?: string[]; text: string;
  closeChat?: boolean; go?: string; last?: boolean; prefill?: string; celebrate?: boolean;
  awaitChatOpen?: boolean; awaitTodos?: boolean; awaitPlaced?: boolean; awaitTimer?: boolean;
};

const TOUR: Step[] = [
  { page: '/plan', text: '입력하신 내용으로 기획서 초안을 작성했어요. 기획서의 내용을 채우면서 프로젝트의 방향성을 구체화해 보아요. 잘 모르겠는 내용은 AI 어시스턴트 Sparky에게 물어보면 도와줄거예요.' },
  { page: '/plan', target: '[data-teach="plan-help"]', text: '각 항목 옆에 있는 물음표를 클릭하면, 어떤 내용을 기입해야 하는지 간단한 설명을 볼 수 있어요.' },
  { page: '/plan', target: '[data-teach="plan-fill"]', text: '타이틀 옆의 다이아몬드 아이콘을 클릭하면, Sparky가 해당 칸의 내용을 채워줘요.' },
  { page: '/plan', target: '[data-teach="sparky"]', text: 'Sparky를 불러볼까요? 아래 아이콘을 눌러 대화창을 직접 열어보세요.', awaitChatOpen: true },
  { page: '/plan', target: '[data-teach="sparky-panel"]', text: '아직 아이디어가 정리되지 않아도 괜찮아요. 자유롭게 대화하듯 Sparky와 이야기한 뒤 ‘이 내용으로 기획서 작성해줘’라고 부탁하면, 답변 아래에 ‘Plan에 자동으로 채우기’ 버튼이 생겨요. 그 버튼을 누르면 기획서에 바로 반영돼요.', closeChat: true },
  { page: '/plan', target: '[data-teach="nav-goals"]', text: '위의 깃발 모양 아이콘을 눌러 Goals 페이지로 이동해보세요!', go: '/programs' },
  { page: '/programs', target: '[data-teach="sparky"]', text: '아래 Sparky 아이콘을 눌러 대화창을 직접 열어보세요.', awaitChatOpen: true },
  { page: '/programs', target: '[data-teach="sparky-panel"]', text: '채팅창에 ‘기획안을 기반으로 할 일 생성해줘’ 문구를 넣어뒀어요. 그대로 전송한 뒤, 답변 아래 ‘Goals에 자동으로 채우기’ 버튼을 누르면 할 일이 만들어져요!', prefill: '기획안을 기반으로 할 일 생성해줘', awaitTodos: true, closeChat: true },
  { page: '/programs', target: '[data-teach="goal-card"]', text: '생성된 할 일을 자유롭게 수정하거나 추가할 수 있어요.' },
  { page: '/programs', targets: ['[data-teach="todo-item"]', '[data-teach="calendar"]'], text: '왼쪽에서 강조된 업무를 클릭한 채로, 이 캘린더의 오늘 날짜(연두색 칸)로 드래그해서 올려보세요.', awaitPlaced: true },
  { page: '/programs', target: '[data-teach="nav-home"]', text: '위의 집 모양 아이콘을 눌러 Home 페이지로 이동해보세요!', go: '/home' },
  { page: '/home', target: '[data-teach="today-timer"]', text: '오늘의 업무 옆 플레이 버튼을 눌러보세요. 플레이 버튼은 업무 위에 마우스를 올리면 나타나요. 누르면 타이머가 시작되고 업무 시간이 기록돼요.', awaitTimer: true },
  { page: '/home', text: '여정 지도에 첫 목표 깃발을 꽂았어요. 업무를 완수할 때마다 깃발이 하나씩 쌓여요.', last: true, celebrate: true },
];

// 온보딩 투어가 다루지 않는 페이지의 첫 진입 안내. Home·Goals는 위 투어가 다룸.
const PAGE_TIPS: Record<string, Step[]> = {
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

export default function Teaching() {
  const pathname = usePathname();
  const ui = useUI();
  const { anyActive } = useTimer();
  const [tourIdx, setTourIdx] = useState(-1);
  const [pageIdx, setPageIdx] = useState(-1);
  const [rects, setRects] = useState<DOMRect[]>([]); // 하이라이트 대상들(다중 지원)

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

  const locate = useCallback(() => {
    const sels = step ? (step.targets ?? (step.target ? [step.target] : [])) : [];
    const found: DOMRect[] = [];
    for (const s of sels) { const el = document.querySelector(s); if (el) found.push(el.getBoundingClientRect()); }
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

  if (!step) return null;

  // 툴팁 위치 기준 = 마지막 하이라이트(배치 단계에선 캘린더). 없으면 null.
  const rect: DOMRect | null = rects.length ? rects[rects.length - 1] : null;

  const dotCount = tourActive ? TOUR.length : pageTips!.length;
  const dotIdx = tourActive ? tourIdx : pageIdx;

  const setTour = (n: number) => {
    if (n < 0 || n >= TOUR.length) { localStorage.removeItem(TOUR_KEY); setTourIdx(-1); }
    else { localStorage.setItem(TOUR_KEY, String(n)); setTourIdx(n); }
  };
  const endPage = () => { localStorage.setItem(seenKey(pathname), '1'); setPageIdx(-1); };

  const next = () => {
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
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const g = EDGE; // 모든 단계: 하이라이트 영역에서 50px 띄움
  let tipStyle: React.CSSProperties;
  if (rect) {
    let left: number, top: number | undefined, bottom: number | undefined;
    if (vh - rect.bottom >= TH + g) {              // 아래
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

      {/* 툴팁 카드 */}
      <div className="fixed z-[80]" style={tipStyle}>
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: '0 16px 44px rgba(0,0,0,0.28)' }}>
          <p className="text-[14px] leading-relaxed" style={{ color: '#16211E' }}>{step.text}</p>
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
        </div>
      </div>
    </>
  );
}
