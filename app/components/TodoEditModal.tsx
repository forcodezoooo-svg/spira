'use client';
import { useState, useEffect } from 'react';
import { ProgramTodo } from '../lib/types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  initial: ProgramTodo;
  onSave: (patch: Partial<ProgramTodo>) => void;
  onClose: () => void;
}

export default function TodoEditModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial.name);
  const [mode, setMode] = useState<'date' | 'weekly'>((initial.days?.length ?? 0) > 0 ? 'weekly' : 'date');
  const [date, setDate] = useState(initial.date ?? '');
  const [days, setDays] = useState<number[]>(initial.days ?? []);
  const [deadline, setDeadline] = useState(initial.deadline ?? '');

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggleDay = (d: number) =>
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  const save = () => {
    if (!name.trim()) return;
    const weekly = mode === 'weekly';
    onSave({
      name: name.trim(),
      date: weekly ? undefined : (date || undefined),
      days: weekly ? days : undefined,
      deadline: deadline || undefined,
    });
    onClose();
  };

  const inputCls = 'w-full bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4" onClick={onClose}>
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-neutral-900">업무 편집</h2>

        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">이름</label>
          <input autoFocus className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="할일 이름" />
        </div>

        {/* 일정 방식 */}
        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">일정</label>
          <div className="flex gap-1 mb-2">
            <button onClick={() => setMode('date')} className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${mode === 'date' ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-200 text-neutral-500'}`}>시작 날짜</button>
            <button onClick={() => setMode('weekly')} className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${mode === 'weekly' ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-200 text-neutral-500'}`}>매주 반복</button>
          </div>
          {mode === 'date' ? (
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              {DOW.map((d, i) => (
                <button key={i} onClick={() => toggleDay(i)} className={`w-7 h-7 rounded-full text-xs transition-colors ${days.includes(i) ? 'bg-violet-600 text-neutral-900' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>{d}</button>
              ))}
            </div>
          )}
        </div>

        {/* 완수 기한 */}
        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">완수 기한 (D-day)</label>
          <div className="flex items-center gap-2">
            <input type="date" className={`${inputCls} flex-1`} value={deadline} onChange={e => setDeadline(e.target.value)} />
            <button
              onClick={() => date && setDeadline(date)}
              disabled={!date}
              className="px-2.5 py-2 text-xs rounded-lg border border-neutral-200 text-neutral-600 hover:border-violet-400 disabled:opacity-30 transition-colors flex-shrink-0"
              title="시작 날짜 당일까지 완수"
            >
              당일
            </button>
            {deadline && <button onClick={() => setDeadline('')} className="text-neutral-400 hover:text-red-400 text-xs flex-shrink-0">×</button>}
          </div>
          {mode === 'date' && !date && <p className="text-[10px] text-neutral-400 mt-1">‘당일’은 시작 날짜를 먼저 선택하면 사용할 수 있어요</p>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors">취소</button>
          <button onClick={save} disabled={!name.trim()} className="px-4 py-2 text-sm bg-neutral-900 hover:bg-neutral-700 disabled:opacity-40 text-white rounded-lg transition-colors">저장</button>
        </div>
      </div>
    </div>
  );
}
