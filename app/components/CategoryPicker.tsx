'use client';
import { useState, useRef, useEffect } from 'react';

// 수익/비용 입력 폼의 카테고리 선택 — 고정 너비(수익·비용 통일) + 드롭다운 안에서 바로 카테고리 추가.
export default function CategoryPicker({
  value, onChange, categories, recurring, onAdd,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
  recurring?: { value: string; label: string } | null; // 비용의 '구독료' 같은 고정 항목(맨 위)
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setAdding(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const commitAdd = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    onChange(n);
    setName(''); setAdding(false); setOpen(false);
  };

  const opt = 'w-full text-left px-3 py-2 text-[13px] rounded-lg transition-colors hover:bg-neutral-50';

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-32 flex items-center justify-between gap-1 rounded-full pl-3.5 pr-2.5 py-2 text-[13px] font-semibold"
        style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}
      >
        <span className="truncate">{value || '카테고리'}</span>
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-48 max-w-[calc(100vw-2.5rem)] bg-white border rounded-2xl py-1.5 px-1" style={{ borderColor: 'rgba(0,41,41,0.1)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}>
          {/* 스크롤되는 카테고리 목록 */}
          <div className="max-h-56 overflow-y-auto">
            <button onClick={() => { onChange(''); setOpen(false); }} className={opt} style={{ color: value === '' ? '#3E6B1F' : '#9AA39D' }}>카테고리 없음</button>
            {recurring && (
              <button onClick={() => { onChange(recurring.value); setOpen(false); }} className={opt} style={{ color: value === recurring.value ? '#3E6B1F' : '#16211E', fontWeight: value === recurring.value ? 700 : 400 }}>{recurring.label}</button>
            )}
            {categories.map(c => (
              <button key={c} onClick={() => { onChange(c); setOpen(false); }} className={`${opt} truncate`} style={{ color: value === c ? '#3E6B1F' : '#16211E', fontWeight: value === c ? 700 : 400 }}>{c}</button>
            ))}
          </div>

          {/* 항상 하단 고정 — 스크롤과 무관하게 보임 */}
          <div className="border-t mt-1 pt-1" style={{ borderColor: 'rgba(0,41,41,0.07)' }}>
            {adding ? (
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitAdd(); if (e.key === 'Escape') { setAdding(false); setName(''); } }}
                  placeholder="새 카테고리"
                  className="flex-1 min-w-0 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-neutral-400 transition-colors placeholder-neutral-400"
                />
                <button onClick={commitAdd} disabled={!name.trim()} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 transition-colors flex-shrink-0">추가</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className={`${opt} font-semibold`} style={{ color: '#3E6B1F' }}>+ 카테고리 추가</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
