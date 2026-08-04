'use client';
import { useTimer } from '../lib/TimerContext';

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtTaskTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return sec > 0 ? `${m}분 ${sec}초` : `${m}분`;
  return `${sec}초`;
}

// 작업별 시간 기록 + 재생/정지 버튼
// - dateStr: 보고 있는 날짜 (없으면 오늘). 오늘이 아니면 읽기 전용으로 기록만 표시
// - done: 완료된 작업이면 기록을 고정해 표시(재생 불가)
export default function TaskTimerButton({ taskId, dateStr, done }: { taskId: string; dateStr?: string; done?: boolean }) {
  const { isTaskActive, toggleTaskTimer, getDisplaySeconds } = useTimer();
  const today = localDateStr();
  const viewDate = dateStr ?? today;
  const isToday = viewDate === today;
  const active = isTaskActive(taskId);
  const secs = getDisplaySeconds(viewDate, taskId);
  const readOnly = !isToday || !!done;

  if (readOnly) {
    // 기록만 고정 표시
    return secs > 0 ? (
      <span className="text-[10px] text-neutral-500 font-medium tabular-nums flex-shrink-0">⏱ {fmtTaskTime(secs)}</span>
    ) : null;
  }

  return (
    <>
      {secs > 0 && (
        <span className="text-[10px] text-neutral-600 font-medium tabular-nums flex-shrink-0">{fmtTaskTime(secs)}</span>
      )}
      <button
        data-teach="today-timer"
        onClick={() => toggleTaskTimer(taskId)}
        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          active ? 'bg-violet-600 text-neutral-900' : 'text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-neutral-900'
        }`}
        title={active ? '시간 기록 정지' : '시간 기록 시작'}
      >
        {active ? (
          <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor">
            <rect x="1" y="1" width="3" height="8" rx="0.5" />
            <rect x="6" y="1" width="3" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3 ml-0.5" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 1.5l7 3.5-7 3.5V1.5z" />
          </svg>
        )}
      </button>
    </>
  );
}
