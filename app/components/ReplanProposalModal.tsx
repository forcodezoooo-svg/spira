'use client';
import { ReplanProposal, fmtMin } from '../lib/capacity';

// 오늘 Capacity 초과 시 재배치 제안 — 사용자가 승인해야만 실제 이동(§13).
export default function ReplanProposalModal({
  proposal, onApply, onClose,
}: {
  proposal: ReplanProposal;
  onApply: (proposal: ReplanProposal) => void;
  onClose: () => void;
}) {
  const { keep, move, overMin, resolvedMin, stillOverMin } = proposal;
  const mdLabel = (ds: string) => { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-[24px] w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-6" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[18px] font-black" style={{ color: '#16211E' }}>일정 조정 제안</h2>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-700 text-lg transition-colors">×</button>
        </div>
        <p className="text-[12px] mb-4 leading-relaxed" style={{ color: '#9AA39D' }}>
          오늘 <b style={{ color: '#FF696C' }}>{fmtMin(overMin)}</b> 초과예요. 우선순위가 낮고 옮겨도 되는 업무를 다른 날로 이동하면 오늘 일정에 맞출 수 있어요.
          {stillOverMin > 0 && <> 이동해도 <b style={{ color: '#C48A2E' }}>{fmtMin(stillOverMin)}</b>는 여전히 초과라, 업무시간·예상시간을 조정해야 할 수 있어요.</>}
        </p>

        {/* 오늘 유지 */}
        <div className="mb-3">
          <p className="text-[12px] font-bold mb-1.5" style={{ color: '#3E7A2E' }}>오늘 유지</p>
          {keep.length === 0 ? (
            <p className="text-[12px] px-1" style={{ color: '#C4CCC4' }}>유지할 업무가 없어요.</p>
          ) : (
            <ul className="space-y-1.5">
              {keep.map(t => (
                <li key={t.key} className="flex items-center gap-2 border rounded-xl px-3 py-2" style={{ borderColor: '#E7EFDD', backgroundColor: '#F8FBF3' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-[13px] font-semibold flex-1 min-w-0 truncate" style={{ color: '#16211E' }}>{t.name}</span>
                  {t.durationMin ? <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: '#7C3AED' }}>{fmtMin(t.durationMin)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 이동 제안 */}
        <div className="mb-4">
          <p className="text-[12px] font-bold mb-1.5" style={{ color: '#7C3AED' }}>다른 날로 이동 ({fmtMin(resolvedMin)} 확보)</p>
          {move.length === 0 ? (
            <p className="text-[12px] px-1" style={{ color: '#C4CCC4' }}>이동할 수 있는 업무가 없어요.</p>
          ) : (
            <ul className="space-y-1.5">
              {move.map(m => (
                <li key={m.task.key} className="flex items-center gap-2 border rounded-xl px-3 py-2" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.task.color }} />
                  <span className="text-[13px] font-semibold flex-1 min-w-0 truncate" style={{ color: '#16211E' }}>{m.task.name}</span>
                  {m.task.durationMin ? <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: '#9AA39D' }}>{fmtMin(m.task.durationMin)}</span> : null}
                  <span className="text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>{mdLabel(m.toDate)}로</span>
                  <span className="text-[10px] font-semibold flex-shrink-0" style={m.withinDeadline ? { color: '#3E7A2E' } : { color: '#C0392B' }}>{m.withinDeadline ? '기한 내' : '⚠ 기한 초과'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => onApply(proposal)} disabled={move.length === 0} className="flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>적용</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-[14px] font-bold transition-colors" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>유지</button>
        </div>
      </div>
    </div>
  );
}
