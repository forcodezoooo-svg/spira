'use client';
import { usePathname } from 'next/navigation';
import { useTimer } from '../lib/TimerContext';
import MusicTimer from './MusicTimer';

const FOCUS_ID = '__focus__';

// 특정 업무를 플레이 중일 때, Home 이외의 (자체 타이머가 없는) 페이지에서 우측 하단 floating 타이머 위젯을 띄운다.
export default function FloatingTimer() {
  const path = usePathname();
  const { activeTaskIds } = useTimer();
  const hasSpecificTask = activeTaskIds.some(id => id !== FOCUS_ID); // 일반 세션(FOCUS) 말고 실제 업무

  // 자체 대시보드 타이머가 있는 페이지(Home·Task·Goals)는 제외
  if (path === '/home' || path === '/task' || path === '/programs') return null;
  // 상단 전역 타이머 바가 뜨는 페이지도 제외 (중복 방지) — MainShell의 showGlobalTimer와 동일 규칙
  const hasTopBar = path !== '/resources' && path !== '/plan' && !path.startsWith('/pricing');
  if (hasTopBar) return null;
  if (!hasSpecificTask) return null;

  return <MusicTimer floating />;
}
