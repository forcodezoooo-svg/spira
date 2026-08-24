'use client';
import { useState } from 'react';
import { fmtMin } from '../lib/capacity';

// 완료한 task의 '실제 소요시간'을 기록 (§14). 강제하지 않음 — 건너뛸 수 있다.
export default function ActualTimeModal({
  taskName, estimatedMin, onSave, onSkip,
}: {
  taskName: string;
  estimatedMin?: number;
  onSave: (min: number) => void;
  onSkip: () => void;
}) {
  const [val, setVal] = useState<number | null>(estimatedMin ?? null);
  const [custom, setCustom] = useState('');
  // 예상값 주변 + 대표 소요시간 후보
  const base = [15, 30, 60, 90, 120, 180, 240, 480];
  const chips = Array.from(new Set([...(estimatedMin ? [estimatedMin] : []), ...base])).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={onSkip}>
      <div className="bg-white rounded-2xl w-full max-w-[360px] p-5" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-[15px] font-black mb-1" style={{ color: '#16211E' }}>실제로 얼마나 걸렸어요?</h3>
        <p className="text-[12px] mb-3 truncate" style={{ color: '#9AA39D' }}>{taskName}{estimatedMin ? ` · 예상 ${fmtMin(estimatedMin)}` : ''}</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {chips.map(min => {
            const on = val === min && custom === '';
            const isEst = min === estimatedMin;
            return (
              <button key={min} onClick={() => { setVal(min); setCustom(''); }} className="text-[12px] font-semibold rounded-full px-2.5 py-1 border transition-colors" style={on ? { backgroundColor: '#DFF9C4', borderColor: '#BCE89A', color: '#3E6B1F' } : { backgroundColor: '#fff', borderColor: isEst ? '#BCE89A' : 'var(--spira-border)', color: isEst ? '#3E6B1F' : '#5B6560' }}>
                {fmtMin(min)}{isEst ? ' · 예상' : ''}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <input type="number" min={0} step={15} value={custom} onChange={e => { setCustom(e.target.value); const n = Number(e.target.value); setVal(Number.isFinite(n) && n > 0 ? n : null); }} placeholder="직접 입력(분)" className="flex-1 text-[13px] tabular-nums bg-neutral-50 border rounded-xl px-3 py-2 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
        </div>
        <div className="flex gap-2">
          <button onClick={onSkip} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>건너뛰기</button>
          <button onClick={() => { if (val && val > 0) onSave(val); else onSkip(); }} disabled={!val || val <= 0} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>저장</button>
        </div>
      </div>
    </div>
  );
}
