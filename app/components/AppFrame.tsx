'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useUI } from '../lib/UIContext';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MainShell from './MainShell';
import AppContextBridge from './AppContextBridge';
import AIChatButton from './AIChatButton';
import Onboarding from './Onboarding';
import Teaching from './Teaching';

// 인증 화면(로그인/OAuth)에서는 사이드바·플레이바·메모·AI 버튼 등 앱 크롬을 숨기고
// 로그인 박스만 보이게 한다. 그 외 페이지에서는 전체 앱 크롬을 렌더한다.
export default function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { closeChat } = useUI();
  // 다른 메뉴 페이지로 이동하면 열려 있던 채팅창을 자동으로 닫는다.
  useEffect(() => { closeChat(); }, [path, closeChat]);
  // 랜딩(공개) + 인증 화면 + 여정 지도는 앱 크롬(사이드바·플레이바·메모·AI) 없이 단독 화면으로
  const bare = path === '/' || path === '/login' || path.startsWith('/auth') || path === '/journey' || path.startsWith('/pricing') || path === '/terms' || path === '/privacy';

  if (bare) return <>{children}</>;

  return (
    <>
      <Sidebar />
      <MobileHeader />
      <MainShell>{children}</MainShell>
      <AppContextBridge />
      <AIChatButton />
      <Onboarding />
      <Teaching />
    </>
  );
}
