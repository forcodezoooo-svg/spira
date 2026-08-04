'use client';
import type { CSSProperties } from 'react';

// 셔머 스켈레톤 블록
export function Skel({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`spira-skeleton rounded-lg ${className}`} style={style} />;
}

const ROW_W = ['70%', '52%', '64%', '46%', '60%', '56%', '68%'];

function Row({ w }: { w: string }) {
  return (
    <div className="flex items-center gap-3 bg-white border rounded-2xl px-4 py-3.5" style={{ borderColor: 'var(--spira-border-subtle)' }}>
      <Skel className="w-[18px] h-[18px] rounded-full flex-shrink-0" />
      <Skel className="h-3.5" style={{ width: w }} />
      <Skel className="w-10 h-4 rounded-full flex-shrink-0 ml-auto" />
    </div>
  );
}

// 대시보드형 페이지(홈·태스크) 로딩 스켈레톤 — 좌: 목록 / 우: 위젯
export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="min-w-0">
        <Skel className="h-3 w-28 mb-3" />
        <Skel className="h-8 w-2/3 mb-8" />
        <Skel className="h-4 w-24 mb-4" />
        <div className="space-y-3">
          {ROW_W.slice(0, 6).map((w, i) => <Row key={i} w={w} />)}
        </div>
      </div>
      <aside className="space-y-4">
        <Skel className="h-12 rounded-full" />
        <Skel className="h-16 rounded-2xl" />
        <Skel className="h-56 rounded-[22px]" />
      </aside>
    </div>
  );
}

// 단일 컬럼(목록형) 페이지 스켈레톤
export function ListSkeleton() {
  return (
    <div className="max-w-2xl">
      <Skel className="h-8 w-40 mb-6" />
      <div className="space-y-3">
        {ROW_W.map((w, i) => <Row key={i} w={w} />)}
      </div>
    </div>
  );
}
