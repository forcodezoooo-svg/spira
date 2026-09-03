'use client';
import { PullProposal, fmtMin } from '../lib/capacity';

// 가용시간이 남는 날 — 뒤 날짜의 업무를 앞으로 당겨 채우는 제안. 사용자가 승인해야만 이동.
export default function PullForwardModal({
  proposal, onApply, onClose,
}: {
  proposal: PullProposal;
  onApply: (proposal: PullProposal) => void;
  onClose: () => void;
}) {
  const { freeMin, pull, filledMin } = proposal;
  const mdLabel = (ds: string) => { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const remain = Math.max(0, freeMin - filledMin);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-[24px] w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-6" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[18px] font-black" style={{ color: '#16211E' }}>업무 앞당기기 제안</h2>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-700 text-lg transition-colors">×</button>
        </div>
        <p className="text-[12px] mb-4 leading-relaxed" style={{ color: '#9AA39D' }}>
          오늘 <b style={{ color: '#3E7A2E' }}>{fmtMin(freeMin)}</b> 여유가 있어요. 뒤 날짜의 업무를 오늘로 당겨오면 남는 시간을 활용할 수 있어요.
          {remain > 0 && pull.length > 0 && <> 당긴 뒤에도 <b style={{ color: '#5B6560' }}>{fmtMin(remain)}</b>는 남아요.</>}
        </p>

        <div className="mb-4">
          <p className="text-[12px] font-bold mb-1.5" style={{ color: '#7C3AED' }}>오늘로 당기기 ({fmtMin(filledMin)} 채움)</p>
          {pull.length === 0 ? (
            <p className="text-[12px] px-1" style={{ color: '#C4CCC4' }}>당겨올 수 있는 업무가 없어요. (뒤 날짜에 옮길 만한 업무가 없거나, 남는 시간에 안 맞아요.)</p>
          ) : (
            <ul className="space-y-1.5">
              {pull.map(m => (
                <li key={m.task.key} className="flex items-center gap-2 border rounded-xl px-3 py-2" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.task.color }} />
                  <span className="text-[13px] font-semibold flex-1 min-w-0 truncate" style={{ color: '#16211E' }}>{m.task.name}</span>
                  {m.task.durationMin ? <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtMin(m.task.durationMin)}</span> : null}
                  <span className="text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#EAF7DD', color: '#3E6B1F' }}>{mdLabel(m.fromDate)} → 오늘</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => onApply(proposal)} disabled={pull.length === 0} className="flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>적용</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-[14px] font-bold transition-colors" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>닫기</button>
        </div>
      </div>
    </div>
  );
}
