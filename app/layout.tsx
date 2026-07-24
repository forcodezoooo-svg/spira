import type { Metadata } from 'next';
import './globals.css';
import './tokens/spira-tokens.css';
import AppFrame from './components/AppFrame';
import { ChatProvider } from './lib/ChatContext';
import { TimerProvider } from './lib/TimerContext';
import { UIProvider } from './lib/UIContext';
import AuthProvider from './components/AuthProvider';
import SyncProvider from './components/SyncProvider';

export const metadata: Metadata = {
  title: 'Spira',
  description: '1인 창업가를 위한 사업 운영 OS',
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
      </body>
    </html>
  );
}
