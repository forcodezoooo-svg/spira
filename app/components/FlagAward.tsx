'use client';

// 깃발 증정 오버레이 (깃발 낙하 바운스 모션) — 데드라인 완료·성장 단계 달성 등에 재사용
export default function FlagAward({ flagSrc, heading, sub, foot, onClose }: {
  flagSrc: string; heading: string; sub: string; foot?: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm px-6 pt-6 pb-6 text-center" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div className="relative w-full h-56 mb-2 flex items-end justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flagSrc} alt="깃발" className="spira-flag-plant w-auto" style={{ height: 200 }} />
        </div>
        <h2 className="text-[21px] font-black leading-snug mb-2 whitespace-pre-line" style={{ color: '#16211E' }}>{heading}</h2>
        <p className="text-[14px] leading-relaxed mb-1" style={{ color: '#5B6560' }}>{sub}</p>
        {foot && <p className="text-[13px] mb-6" style={{ color: '#9AA39D' }}>{foot}</p>}
        <button onClick={onClose} className={`w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 ${foot ? '' : 'mt-5'}`} style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>확인</button>
      </div>
    </div>
  );
}
