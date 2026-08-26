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

  // Home은 자체 대시보드 타이머 유지. 상단 전역 타이머 바가 뜨는 페이지도 제외(중복 방지).
  // → Task·Goals·Resources·Plan(자체 타이머 제거함) 등 비-Home·비-상단바 페이지에서 floating 표시.
  if (path === '/home') return null;
  const hasTopBar = path !== '/task' && path !== '/programs' && path !== '/resources' && path !== '/plan' && !path.startsWith('/pricing');
  if (hasTopBar) return null;
  if (!hasSpecificTask) return null;

  return <MusicTimer floating />;
}
