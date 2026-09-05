import type { Metadata } from 'next';
import './globals.css';
import './tokens/spira-tokens.css';
import AppFrame from './components/AppFrame';
import { ChatProvider } from './lib/ChatContext';
import { TimerProvider } from './lib/TimerContext';
import { UIProvider } from './lib/UIContext';
import { UpgradeProvider } from './lib/UpgradeContext';
import { ToastProvider } from './lib/ToastContext';
import AuthProvider from './components/AuthProvider';
import PostHogProvider from './components/PostHogProvider';
import SyncProvider from './components/SyncProvider';
import { siteUrl } from './lib/siteUrl';

const DESC = '생산성 앱이 아니라 방향과 우선순위를 관리하는 AI 워크스페이스. 혼자 사업을 만들어가는 창업자에게 지금 가장 중요한 다음 한 걸음을 제안해요.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Spira — 1인 창업자를 위한 AI 워크스페이스',
    template: '%s · Spira',
  },
  description: DESC,
  applicationName: 'Spira',
  openGraph: {
    title: 'Spira — 1인 창업자를 위한 AI 워크스페이스',
    description: DESC,
    url: siteUrl,
    siteName: 'Spira',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Spira — 1인 창업자를 위한 AI 워크스페이스',
    description: DESC,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tomorrow:wght@500;600;700&display=swap" />
      </head>
      <body className="bg-[#F8F8F8] text-neutral-900 antialiased font-sans">
        <ToastProvider>
        <AuthProvider>
        <PostHogProvider>
        <SyncProvider>
        <TimerProvider>
          <UIProvider>
          <UpgradeProvider>
          <ChatProvider>
            <AppFrame>{children}</AppFrame>
          </ChatProvider>
          </UpgradeProvider>
          </UIProvider>
        </TimerProvider>
        </SyncProvider>
        </PostHogProvider>
        </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
