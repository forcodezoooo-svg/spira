'use client';
import { usePathname } from 'next/navigation';
import { useUI } from '../lib/UIContext';
import MusicTimer from './MusicTimer';
import MemoPanel from './MemoPanel';

export default function MainShell({ children }: { children: React.ReactNode }) {
  const { chatDocked } = useUI();
  const path = usePathname();
  // Home·Task·Goals·Resources·Plan은 우측 대시보드 상단에 타이머 pill을 자체적으로 렌더하므로 전역 상단 타이머 숨김.
  const showGlobalTimer = path !== '/home' && path !== '/task' && path !== '/programs' && path !== '/resources' && path !== '/plan';
  return (
    <main
      className={`ml-0 lg:ml-[104px] min-h-screen p-8 pt-20 lg:pt-8 transition-[margin] duration-300 ${
        chatDocked ? 'mr-0 lg:mr-[420px]' : 'mr-0'
      }`}
    >
      {/* 플레이바 (재생/타이머 + 음악) + 메모 (플레이바 바로 아래 따라다님) */}
      {showGlobalTimer && (
        <div className="mb-6 space-y-3">
          <MusicTimer />
          <MemoPanel />
        </div>
      )}
      {children}
    </main>
  );
}
