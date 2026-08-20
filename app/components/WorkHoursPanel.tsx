'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';

// 업무시간 타임테이블 — 평소엔 한 줄 요약 바, 클릭하면 모달에서 요일별로 상세 설정.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dayHours = (start: string, end: string) => Math.max(0, toMin(end) - toMin(start)) / 60;
const fmtH = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

export default function WorkHoursPanel() {
  const store = useStore();
  const schedule = store.workSchedule;
  const [open, setOpen] = useState(false);
  const totalH = schedule.reduce((s, wd) => s + (wd.on ? dayHours(wd.start, wd.end) : 0), 0);
  const onDays = schedule.map((wd, i) => (wd.on ? DOW[i] : null)).filter(Boolean);

  return (
    <>
      {/* 한 줄 요약 바 */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 bg-white border rounded-2xl px-4 py-2.5 text-left transition-colors hover:brightness-[0.99]"
        style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#5EA63A' }}><circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.6V8l2.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-[13px] font-bold flex-shrink-0" style={{ color: '#16211E' }}>업무시간</span>
        <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>주 {fmtH(totalH)}시간</span>
        <span className="text-[12px] truncate min-w-0" style={{ color: '#5B6560' }}>
          {onDays.length ? `근무 ${onDays.join('·')}` : '근무일이 없어요'}
        </span>
        <span className="ml-auto text-[12px] flex-shrink-0" style={{ color: '#9AA39D' }}>설정 ›</span>
      </button>

      {/* 상세 설정 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setOpen(false)}>
          <div className="bg-white rounded-[24px] w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-6" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[18px] font-black" style={{ color: '#16211E' }}>업무시간 설정</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-300 hover:text-neutral-700 text-lg transition-colors">×</button>
            </div>
            <p className="text-[12px] mb-4" style={{ color: '#9AA39D' }}>요일별 근무 여부와 시간을 정해두면 이 타임테이블대로 일정을 채울 수 있어요. · 주 {fmtH(totalH)}시간</p>

            <div className="space-y-2">
              {schedule.map((wd, i) => {
                const hrs = wd.on ? dayHours(wd.start, wd.end) : 0;
                const bad = wd.on && hrs === 0;
                return (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors" style={{ borderColor: wd.on ? '#BCE89A' : 'var(--spira-border-subtle)', backgroundColor: wd.on ? '#F8FBF3' : '#FBFBF9' }}>
                    <button
                      onClick={() => store.setWorkDay(i, { on: !wd.on })}
                      className="w-10 flex-shrink-0 text-[14px] font-bold rounded-lg py-1.5 transition-colors"
                      style={wd.on ? { backgroundColor: '#9DFE3B', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#9AA39D' }}
                      title={wd.on ? '휴무로 전환' : '근무로 전환'}
                    >{DOW[i]}</button>
                    {wd.on ? (
                      <>
                        <input type="time" value={wd.start} onChange={e => store.setWorkDay(i, { start: e.target.value })} className="text-[13px] tabular-nums bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                        <span className="text-[13px]" style={{ color: '#9AA39D' }}>~</span>
                        <input type="time" value={wd.end} onChange={e => store.setWorkDay(i, { end: e.target.value })} className="text-[13px] tabular-nums bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: bad ? '#FF696C' : 'var(--spira-border)' }} />
                        <span className="ml-auto text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ color: bad ? '#FF696C' : '#7A9463' }}>{bad ? '시간 오류' : `${fmtH(hrs)}시간`}</span>
                      </>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#C4CCC4' }}>휴무</span>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => setOpen(false)} className="mt-5 w-full py-2.5 rounded-xl text-[14px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>완료</button>
          </div>
        </div>
      )}
    </>
  );
}
