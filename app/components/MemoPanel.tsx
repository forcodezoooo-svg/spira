'use client';
import { useState, useEffect } from 'react';
import { uid } from '../lib/store';
import { useAuth } from './AuthProvider';

// 로그인 계정별로 메모를 분리 저장(공통 데이터 아님). 비로그인은 guest.
const memoKey = (userId?: string | null) => `spira_goals_memos:${userId ?? 'guest'}`;
interface MemoEntry { id: string; text: string; createdAt: string; }

// 플레이바 아래에 따라다니는 접이식 메모 패널 (모든 페이지 공통)
export default function MemoPanel() {
  const { user } = useAuth();
  const key = memoKey(user?.id);
  const [memos, setMemos] = useState<MemoEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  // 계정(키)이 바뀌면 그 계정의 메모를 로드 (새 계정이면 빈 상태)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      let raw = localStorage.getItem(key);
      // 레거시 전역 메모(spira_goals_memos) 1회 복구: 로그인 계정의 개인 메모가 없고 아직 이관 전이면 이관
      if (!raw && user?.id && !localStorage.getItem('spira_goals_memos_claimed')) {
        const legacy = localStorage.getItem('spira_goals_memos');
        if (legacy) {
          localStorage.setItem(key, legacy);
          localStorage.setItem('spira_goals_memos_claimed', user.id);
          raw = legacy;
        }
      }
      setMemos(raw ? JSON.parse(raw) : []);
    } catch { setMemos([]); }
  }, [key, user?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persist = (list: MemoEntry[]) => { setMemos(list); localStorage.setItem(key, JSON.stringify(list)); };
  const save = () => {
    const t = draft.trim();
    if (!t) return;
    persist([{ id: uid(), text: t, createdAt: new Date().toISOString() }, ...memos]);
    setDraft('');
  };
  const remove = (id: string) => persist(memos.filter(m => m.id !== id));

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-neutral-50">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold" style={{ color: '#16211E' }}>메모</span>
          {memos.length > 0 && (
            <span className="text-[12px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: '#E1E1DA', color: '#5B6560' }}>{memos.length}</span>
          )}
        </div>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" style={{ color: '#9AA39D' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: 'var(--spira-border)' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="생각이나 아이디어를 적어보세요..."
            rows={2}
            className="w-full resize-y bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-400 transition-colors leading-relaxed mt-3"
          />
          <div className="flex justify-end mt-2">
            <button onClick={save} disabled={!draft.trim()} className="px-4 py-1.5 text-xs font-bold rounded-lg disabled:opacity-30 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>저장</button>
          </div>
          {memos.length > 0 && (
            <ul className="mt-4 space-y-2">
              {memos.map(m => (
                <li key={m.id} className="group bg-neutral-50 border border-neutral-100 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed flex-1">{m.text}</p>
                    <button onClick={() => remove(m.id)} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-red-500 text-xs transition-all flex-shrink-0">×</button>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1.5">{new Date(m.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
