'use client';
import type { ReactNode } from 'react';

// 빈 화면 — 아이콘 + 제목 + 설명(+ 선택 CTA). 모든 페이지 공통 톤.
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? 'py-8' : 'py-14'}`}>
      <div className={`${compact ? 'w-11 h-11' : 'w-14 h-14'} rounded-2xl flex items-center justify-center mb-3.5`} style={{ backgroundColor: '#EEF7E2', color: '#5EA63A' }}>
        {icon ?? (
          <svg className={compact ? 'w-5 h-5' : 'w-6 h-6'} viewBox="0 0 24 24" fill="none">
            <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3" />
            <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className={`${compact ? 'text-[14px]' : 'text-[15px]'} font-bold mb-1`} style={{ color: '#16211E' }}>{title}</p>
      {description && <p className="text-[13px] leading-relaxed max-w-[280px]" style={{ color: '#9AA39D' }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// 완료 화면 — 무언가를 다 끝냈을 때의 축하 피드백.
export function SuccessState({ title, description, compact = false }: { title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? 'py-8' : 'py-12'}`}>
      <div className={`${compact ? 'w-12 h-12' : 'w-16 h-16'} rounded-full flex items-center justify-center mb-3.5 spira-bob`} style={{ backgroundColor: '#9DFE3B', color: '#16211E', boxShadow: '0 8px 24px rgba(157,254,59,0.4)' }}>
        <svg className={compact ? 'w-6 h-6' : 'w-8 h-8'} viewBox="0 0 24 24" fill="none">
          <path d="M6 12.5l3.6 3.6L18 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className={`${compact ? 'text-[15px]' : 'text-[17px]'} font-black mb-1`} style={{ color: '#16211E' }}>{title}</p>
      {description && <p className="text-[13px] leading-relaxed max-w-[300px]" style={{ color: '#5B6560' }}>{description}</p>}
    </div>
  );
}
