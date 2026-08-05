import type { Metadata } from 'next';
import './globals.css';
import './tokens/spira-tokens.css';
import AppFrame from './components/AppFrame';
import { ChatProvider } from './lib/ChatContext';
import { TimerProvider } from './lib/TimerContext';
import { UIProvider } from './lib/UIContext';
import { ToastProvider } from './lib/ToastContext';
import AuthProvider from './components/AuthProvider';
import SyncProvider from './components/SyncProvider';
import { siteUrl } from './lib/siteUrl';

const DESC = '기획부터 목표, 오늘 할 일, 수익 관리까지. AI 어시스턴트 Sparky와 함께 사업을 체계적으로 운영하세요.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Spira — 1인 창업가를 위한 사업 운영 OS',
    template: '%s · Spira',
  },
  description: DESC,
  applicationName: 'Spira',
  openGraph: {
    title: 'Spira — 1인 창업가를 위한 사업 운영 OS',
    description: DESC,
    url: siteUrl,
    siteName: 'Spira',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Spira — 1인 창업가를 위한 사업 운영 OS',
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
        <SyncProvider>
        <TimerProvider>
          <UIProvider>
          <ChatProvider>
            <AppFrame>{children}</AppFrame>
          </ChatProvider>
          </UIProvider>
        </TimerProvider>
        </SyncProvider>
        </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
