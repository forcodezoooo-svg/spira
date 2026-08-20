'use client';
import { useStore } from '../lib/useStore';

// 상단 업무시간 타임테이블 — 요일별로 근무 여부 + 시작·종료 시각을 기록. 주간 총 시간 자동 합산.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dayHours = (start: string, end: string) => Math.max(0, toMin(end) - toMin(start)) / 60;
const fmtH = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

export default function WorkHoursPanel() {
  const store = useStore();
  const schedule = store.workSchedule;
  const totalH = schedule.reduce((s, wd) => s + (wd.on ? dayHours(wd.start, wd.end) : 0), 0);

  return (
    <div className="bg-white border rounded-2xl px-4 py-3" style={{ boxShadow: 'var(--spira-shadow)', borderColor: 'var(--spira-border-subtle)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[14px] font-bold" style={{ color: '#16211E' }}>업무시간</span>
        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>주 {fmtH(totalH)}시간</span>
        <span className="text-[11px]" style={{ color: '#9AA39D' }}>요일별 근무 가능 시간을 정해두면 이 타임테이블대로 일정을 채울 수 있어요.</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {schedule.map((wd, i) => {
          const hrs = wd.on ? dayHours(wd.start, wd.end) : 0;
          const bad = wd.on && hrs === 0;
          return (
            <div key={i} className="rounded-xl border px-2.5 py-2 flex flex-col items-center gap-1.5 transition-colors" style={{ width: 96, borderColor: wd.on ? '#BCE89A' : 'var(--spira-border-subtle)', backgroundColor: wd.on ? '#F8FBF3' : '#FBFBF9' }}>
              <button
                onClick={() => store.setWorkDay(i, { on: !wd.on })}
                className="w-full text-[13px] font-bold rounded-lg py-1 transition-colors"
                style={wd.on ? { backgroundColor: '#9DFE3B', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#9AA39D' }}
                title={wd.on ? '휴무로 전환' : '근무로 전환'}
              >{DOW[i]}</button>
              {wd.on ? (
                <>
                  <input type="time" value={wd.start} onChange={e => store.setWorkDay(i, { start: e.target.value })} className="w-full text-[11px] tabular-nums bg-white border rounded-md px-1 py-0.5 outline-none focus:border-violet-400" style={{ borderColor: 'var(--spira-border)' }} />
                  <input type="time" value={wd.end} onChange={e => store.setWorkDay(i, { end: e.target.value })} className="w-full text-[11px] tabular-nums bg-white border rounded-md px-1 py-0.5 outline-none focus:border-violet-400" style={{ borderColor: bad ? '#FF696C' : 'var(--spira-border)' }} />
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: bad ? '#FF696C' : '#7A9463' }}>{bad ? '시간 오류' : `${fmtH(hrs)}시간`}</span>
                </>
              ) : (
                <span className="text-[10px] py-2" style={{ color: '#C4CCC4' }}>휴무</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
