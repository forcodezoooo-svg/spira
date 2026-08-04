'use client';
import { useUI } from '../lib/UIContext';

export default function MobileHeader() {
  const { toggleSidebar } = useUI();

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-4 z-30 bg-[#F8F8F8]">
      <button
        onClick={toggleSidebar}
        className="w-9 h-9 flex flex-col items-center justify-center gap-1.5"
        aria-label="메뉴 열기"
      >
        <span className="w-5 h-px bg-neutral-900 block" />
        <span className="w-5 h-px bg-neutral-900 block" />
        <span className="w-5 h-px bg-neutral-900 block" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Spira" className="h-5 w-auto" />

      {/* 우측 여백 — 로고 중앙 정렬 유지 (채팅은 우측 하단 플로팅 버튼으로 이동) */}
      <div className="w-9" />
    </div>
  );
}
