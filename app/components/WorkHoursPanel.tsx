'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';
import { DEFAULT_BUFFER_PERCENT, weekStartMonday, redistributeWeekTasks } from '../lib/capacity';

// 이번 주 업무시간 — 타일/바로 요약, 클릭하면 모달에서 주별로 요일 근무시간 편집.
// 기본 스케줄(workSchedule)은 유지하고, 주별 override(weekSchedules)로 그 주만 조정할 수 있다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dayHours = (start: string, end: string) => Math.max(0, toMin(end) - toMin(start)) / 60;
const fmtH = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const md = (ds: string) => { const d = new Date(ds + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
const totalOf = (sch: { on: boolean; start: string; end: string }[]) => sch.reduce((s, wd) => s + (wd.on ? dayHours(wd.start, wd.end) : 0), 0);

export default function WorkHoursPanel({ tile = false }: { tile?: boolean }) {
  const store = useStore();
  const base = store.workSchedule;
  const capacity = store.capacity;
  const bufferPct = capacity.bufferPercent ?? DEFAULT_BUFFER_PERCENT;
  const overrides = Object.entries(capacity.dateOverrides ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  const todayStr = ymd(new Date());
  const thisWeekStart = weekStartMonday(todayStr);

  const [open, setOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(thisWeekStart); // 편집 중인 주
  const [ovDate, setOvDate] = useState('');
  const [ovHours, setOvHours] = useState('');
  const [redistMsg, setRedistMsg] = useState('');

  // 편집 중인 주의 유효 스케줄(override 우선), 타일용 이번 주 스케줄
  const weekSched = capacity.weekSchedules?.[weekStart] ?? base;
  const hasOverride = !!capacity.weekSchedules?.[weekStart];
  const thisWeekSched = capacity.weekSchedules?.[thisWeekStart] ?? base;
  const thisWeekTotal = totalOf(thisWeekSched);
  const weekTotal = totalOf(weekSched);
  const onDays = thisWeekSched.map((wd, i) => (wd.on ? DOW[i] : null)).filter(Boolean);

  const addOverride = () => {
    const h = Number(ovHours);
    if (!ovDate || !Number.isFinite(h) || h < 0) return;
    store.setDateCapacityOverride(ovDate, h);
    setOvDate(''); setOvHours('');
  };
  // 이 주에 배당된 업무를 새 스케줄에 맞춰 재배치
  const redistribute = () => {
    const moves = redistributeWeekTasks(store.allWorkspacesEntries, base, capacity, weekStart, todayStr);
    for (const m of moves) store.updateProgramSubtask(m.task.wsId, m.task.programId, m.task.deadlineId, m.task.todoId, m.task.subtaskId, { date: m.toDate, deadline: m.toDate });
    setRedistMsg(moves.length ? `${moves.length}개 업무를 새 시간표에 맞춰 옮겼어요.` : '옮길 업무가 없어요 (이미 시간표에 맞아요).');
    setTimeout(() => setRedistMsg(''), 3500);
  };

  const openModal = () => { setWeekStart(thisWeekStart); setOpen(true); };

  return (
    <>
      {tile ? (
        <button onClick={openModal} className="w-full h-full flex flex-col justify-between bg-white border rounded-2xl p-3.5 text-left transition-colors hover:brightness-[0.99]" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}>
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#5EA63A' }}><circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.6V8l2.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>이번 주 업무시간</span>
            <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: '#9AA39D' }}>설정 ›</span>
          </div>
          <div className="mt-2">
            <div className="text-[22px] font-black tabular-nums leading-none" style={{ color: '#16211E' }}>{fmtH(thisWeekTotal)}<span className="text-[13px] font-bold" style={{ color: '#9AA39D' }}> 시간/주</span></div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>Buffer {Math.round(bufferPct * 100)}%</span>
              <span className="text-[11px] truncate min-w-0" style={{ color: '#5B6560' }}>{onDays.length ? onDays.join('·') : '휴무'}</span>
            </div>
          </div>
        </button>
      ) : (
        <button onClick={openModal} className="w-full flex items-center gap-2.5 bg-white border rounded-2xl px-4 py-2.5 text-left transition-colors hover:brightness-[0.99]" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#5EA63A' }}><circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.6V8l2.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="text-[13px] font-bold flex-shrink-0" style={{ color: '#16211E' }}>이번 주 업무시간</span>
          <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>주 {fmtH(thisWeekTotal)}시간</span>
          <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>Buffer {Math.round(bufferPct * 100)}%</span>
          <span className="ml-auto text-[12px] flex-shrink-0" style={{ color: '#9AA39D' }}>설정 ›</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,33,30,0.4)' }} onClick={() => setOpen(false)}>
          <div className="bg-white rounded-[24px] w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-6" style={{ boxShadow: 'var(--spira-shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[18px] font-black" style={{ color: '#16211E' }}>주간 업무시간</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-300 hover:text-neutral-700 text-lg transition-colors">×</button>
            </div>

            {/* 주 네비게이션 */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setWeekStart(w => addDays(w, -7))} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="이전 주"><svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <div className="text-center">
                <div className="text-[14px] font-bold" style={{ color: '#16211E' }}>{md(weekStart)} ~ {md(addDays(weekStart, 6))}</div>
                <div className="text-[11px]" style={{ color: '#9AA39D' }}>{weekStart === thisWeekStart ? '이번 주' : ''} · 주 {fmtH(weekTotal)}시간 {hasOverride && '· 이 주만 조정됨'}</div>
              </div>
              <button onClick={() => setWeekStart(w => addDays(w, 7))} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }} title="다음 주"><svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            </div>

            <p className="text-[11px] mb-2" style={{ color: '#9AA39D' }}>이 주의 요일별 근무시간을 조정하면 그 주에만 적용돼요. 기본 스케줄은 유지됩니다.</p>
            <div className="space-y-2">
              {weekSched.map((wd, i) => {
                const hrs = wd.on ? dayHours(wd.start, wd.end) : 0;
                const bad = wd.on && hrs === 0;
                return (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors" style={{ borderColor: wd.on ? '#BCE89A' : 'var(--spira-border-subtle)', backgroundColor: wd.on ? '#F8FBF3' : '#FBFBF9' }}>
                    <button onClick={() => store.setWeekWorkDay(weekStart, i, { on: !wd.on })} className="w-10 flex-shrink-0 text-[14px] font-bold rounded-lg py-1.5 transition-colors" style={wd.on ? { backgroundColor: '#9DFE3B', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#9AA39D' }} title={wd.on ? '휴무로 전환' : '근무로 전환'}>{DOW[i]}</button>
                    {wd.on ? (
                      <>
                        <input type="time" value={wd.start} onChange={e => store.setWeekWorkDay(weekStart, i, { start: e.target.value })} className="text-[13px] tabular-nums bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                        <span className="text-[13px]" style={{ color: '#9AA39D' }}>~</span>
                        <input type="time" value={wd.end} onChange={e => store.setWeekWorkDay(weekStart, i, { end: e.target.value })} className="text-[13px] tabular-nums bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" style={{ borderColor: bad ? '#FF696C' : 'var(--spira-border)' }} />
                        <span className="ml-auto text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ color: bad ? '#FF696C' : '#7A9463' }}>{bad ? '시간 오류' : `${fmtH(hrs)}시간`}</span>
                      </>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#C4CCC4' }}>휴무</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 주 액션: 재배치 / 기본값 초기화 */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button onClick={redistribute} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }} title="이 주 업무를 새 시간표에 맞춰 다시 배치">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M13 3.5A6 6 0 1 0 14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M13 1.5V4h-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                이 주 업무 재배치
              </button>
              {hasOverride && (
                <button onClick={() => store.resetWeekSchedule(weekStart)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>기본 스케줄로</button>
              )}
              {redistMsg && <span className="text-[11px] font-semibold" style={{ color: '#3E7A2E' }}>{redistMsg}</span>}
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
