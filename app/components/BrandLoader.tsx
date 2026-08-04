'use client';

// 브랜드 로딩 화면 — 라임 링 스피너 + 로고. 전체 화면 로딩(인증·동기화 등)에 사용.
export default function BrandLoader({ label = '불러오는 중…', fullScreen = true }: { label?: string; fullScreen?: boolean }) {
  return (
    <div className={`${fullScreen ? 'min-h-screen' : 'py-24'} flex items-center justify-center`} style={fullScreen ? { backgroundColor: '#F8F8F8' } : undefined}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          {/* 배경 링 */}
          <div className="absolute inset-0 rounded-full border-[3px]" style={{ borderColor: '#E6EFD9' }} />
          {/* 라임 스피너 */}
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent animate-spin" style={{ borderTopColor: '#9DFE3B', borderRightColor: '#9DFE3B', animationDuration: '0.8s' }} />
          {/* 로고 (중앙, 살짝 바운스) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Spira" className="absolute inset-0 m-auto w-5 h-auto spira-bob" />
        </div>
        {label && <p className="text-[13px] font-medium" style={{ color: '#9AA39D' }}>{label}</p>}
      </div>
    </div>
  );
}
