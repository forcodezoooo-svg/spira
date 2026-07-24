'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MainShell from './MainShell';
import AppContextBridge from './AppContextBridge';
import AIChatButton from './AIChatButton';

// 인증 화면(로그인/OAuth)에서는 사이드바·플레이바·메모·AI 버튼 등 앱 크롬을 숨기고
// 로그인 박스만 보이게 한다. 그 외 페이지에서는 전체 앱 크롬을 렌더한다.
export default function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // 인증 화면 + 여정 지도는 앱 크롬(사이드바·플레이바·메모·AI) 없이 단독 화면으로
  const bare = path === '/login' || path.startsWith('/auth') || path === '/journey';

  if (bare) return <>{children}</>;

  return (
    <>
      <Sidebar />
      <MobileHeader />
      <MainShell>{children}</MainShell>
      <AppContextBridge />
      <AIChatButton />
    </>
  );
}
