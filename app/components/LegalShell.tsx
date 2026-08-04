'use client';
import { useRouter } from 'next/navigation';

// 약관·개인정보처리방침 공용 레이아웃 (단독 화면 · 읽기 편한 폭)
export default function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F8F8' }}>
      <header className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 transition-transform hover:-translate-x-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Spira" className="w-7 h-auto" />
          <span className="text-[17px] font-black tracking-[-0.02em]" style={{ color: '#16211E' }}>Spira</span>
        </button>
        <button onClick={() => router.back()} className="text-[13px] font-semibold transition-colors hover:opacity-70" style={{ color: '#5B6560' }}>← 뒤로</button>
      </header>
      <main className="max-w-3xl mx-auto px-6 pb-24 pt-4">
        <h1 className="text-[26px] font-black mb-1" style={{ color: '#16211E' }}>{title}</h1>
        <p className="text-[13px] mb-9" style={{ color: '#9AA39D' }}>{updated}</p>
        <div className="space-y-7 text-[14px] leading-[1.75]" style={{ color: '#3E4A44' }}>
          {children}
        </div>
      </main>
    </div>
  );
}

// 조항 블록
export function Article({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[16px] font-bold mb-2" style={{ color: '#16211E' }}>{heading}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
