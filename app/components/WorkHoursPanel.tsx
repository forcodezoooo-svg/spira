'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';
import { DEFAULT_BUFFER_PERCENT } from '../lib/capacity';

// 업무시간 타임테이블 — 평소엔 한 줄 요약 바, 클릭하면 모달에서 요일별로 상세 설정.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dayHours = (start: string, end: string) => Math.max(0, toMin(end) - toMin(start)) / 60;
const fmtH = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

export default function WorkHoursPanel({ tile = false }: { tile?: boolean }) {
  const store = useStore();
  const schedule = store.workSchedule;
  const capacity = store.capacity;
  const bufferPct = capacity.bufferPercent ?? DEFAULT_BUFFER_PERCENT;
  const overrides = Object.entries(capacity.dateOverrides ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  const [open, setOpen] = useState(false);
  const [ovDate, setOvDate] = useState('');
  const [ovHours, setOvHours] = useState('');
  const totalH = schedule.reduce((s, wd) => s + (wd.on ? dayHours(wd.start, wd.end) : 0), 0);
  const onDays = schedule.map((wd, i) => (wd.on ? DOW[i] : null)).filter(Boolean);
  const addOverride = () => {
    const h = Number(ovHours);
    if (!ovDate || !Number.isFinite(h) || h < 0) return;
    store.setDateCapacityOverride(ovDate, h);
    setOvDate(''); setOvHours('');
  };

  return (
    <>
      {tile ? (
        /* 직사각형 타일 */
        <button
          onClick={() => setOpen(true)}
          className="w-full h-full flex flex-col justify-between bg-white border rounded-2xl p-3.5 text-left transition-colors hover:brightness-[0.99]"
          style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}
        >
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#5EA63A' }}><circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.6V8l2.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>업무시간</span>
            <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: '#9AA39D' }}>설정 ›</span>
          </div>
          <div className="mt-2">
            <div className="text-[22px] font-black tabular-nums leading-none" style={{ color: '#16211E' }}>{fmtH(totalH)}<span className="text-[13px] font-bold" style={{ color: '#9AA39D' }}> 시간/주</span></div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>Buffer {Math.round(bufferPct * 100)}%</span>
              <span className="text-[11px] truncate min-w-0" style={{ color: '#5B6560' }}>{onDays.length ? onDays.join('·') : '휴무'}</span>
            </div>
          </div>
        </button>
      ) : (
      /* 한 줄 요약 바 */
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 bg-white border rounded-2xl px-4 py-2.5 text-left transition-colors hover:brightness-[0.99]"
        style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#5EA63A' }}><circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.6V8l2.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-[13px] font-bold flex-shrink-0" style={{ color: '#16211E' }}>업무시간</span>
        <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>주 {fmtH(totalH)}시간</span>
        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>Buffer {Math.round(bufferPct * 100)}%</span>
        <span className="text-[12px] truncate min-w-0" style={{ color: '#5B6560' }}>
          {onDays.length ? `근무 ${onDays.join('·')}` : '근무일이 없어요'}
        </span>
        <span className="ml-auto text-[12px] flex-shrink-0" style={{ color: '#9AA39D' }}>설정 ›</span>
      </button>
      )}

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

            {/* Buffer 설정 */}
            <div className="mt-5 rounded-2xl border p-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#FBFBF9' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>Buffer (예비 시간)</span>
                <span className="text-[13px] font-bold tabular-nums" style={{ color: '#7C3AED' }}>{Math.round(bufferPct * 100)}%</span>
              </div>
              <p className="text-[11px] mb-2 leading-relaxed" style={{ color: '#9AA39D' }}>계획되지 않은 일과 시간 초과에 대비해 하루 가용시간의 일부를 비워둬요. 예: 하루 6시간 × {Math.round(bufferPct * 100)}% = {fmtH(6 * bufferPct)}시간</p>
              <input type="range" min={0} max={40} step={5} value={Math.round(bufferPct * 100)} onChange={e => store.setBufferPercent(Number(e.target.value) / 100)} className="w-full accent-violet-500" />
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: '#C4CCC4' }}><span>0%</span><span>20%</span><span>40%</span></div>
            </div>

            {/* 날짜별 Capacity 예외 */}
            <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#FBFBF9' }}>
              <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>특정 날짜 예외</span>
              <p className="text-[11px] mt-0.5 mb-2 leading-relaxed" style={{ color: '#9AA39D' }}>그 날만 가용시간이 다르면 여기에 등록해요(요일 설정보다 우선).</p>
              {overrides.length > 0 && (
                <div className="space-y-1 mb-2">
                  {overrides.map(([date, hrs]) => (
                    <div key={date} className="flex items-center gap-2 text-[12px] bg-white border rounded-lg px-2.5 py-1.5" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                      <span className="tabular-nums" style={{ color: '#5B6560' }}>{date}</span>
                      <span className="font-semibold tabular-nums" style={{ color: '#16211E' }}>{fmtH(hrs)}시간</span>
                      <button onClick={() => store.setDateCapacityOverride(date, null)} className="ml-auto text-neutral-300 hover:text-red-500 text-sm" title="삭제">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input type="date" value={ovDate} onChange={e => setOvDate(e.target.value)} className="text-[12px] tabular-nums bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                <input type="number" min={0} step={0.5} value={ovHours} onChange={e => setOvHours(e.target.value)} placeholder="시간" className="w-16 text-[12px] tabular-nums bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                <button onClick={addOverride} disabled={!ovDate || ovHours === ''} className="px-3 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>추가</button>
              </div>
            </div>

            <button onClick={() => setOpen(false)} className="mt-5 w-full py-2.5 rounded-xl text-[14px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>완료</button>
          </div>
        </div>
      )}
    </>
  );
}
