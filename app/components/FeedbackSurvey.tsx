'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useToast } from '../lib/ToastContext';
import { submitSurvey } from '../lib/feedback';
import posthog from 'posthog-js';

// 능동적 만족도 설문 — 첫 사용 하루 뒤부터 슬쩍 노출. '나중에'로 미룰 수 있고, 한 번 답하면 다시 안 뜸.
const DELAY_MS = 24 * 60 * 60 * 1000; // 첫 사용 후 노출까지 대기(하루)
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // '나중에' 시 다시 묻기까지(7일)
const FACES = [
  { v: 1, e: '😞', label: '아쉬워요' },
  { v: 2, e: '😐', label: '그저그래요' },
  { v: 3, e: '🙂', label: '괜찮아요' },
  { v: 4, e: '😄', label: '좋아요' },
  { v: 5, e: '🤩', label: '최고예요' },
];

type State = { firstSeenAt?: number; submitted?: boolean; snoozeUntil?: number };

export default function FeedbackSurvey() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [good, setGood] = useState('');
  const [bad, setBad] = useState('');
  const [busy, setBusy] = useState(false);

  // 로그인 계정의 표시 이름 (없으면 이름 없이 표현)
  const displayName = (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || '';
  const storeKey = user ? `spira_survey_v1:${user.id}` : null;
  const readState = (): State => {
    if (!storeKey) return {};
    try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; }
  };
  const writeState = (patch: State) => {
    if (!storeKey) return;
    localStorage.setItem(storeKey, JSON.stringify({ ...readState(), ...patch }));
  };

  useEffect(() => {
    if (!storeKey) return;
    const st = readState();
    const now = Date.now();
    if (!st.firstSeenAt) { writeState({ firstSeenAt: now }); return; } // 첫 방문 기록만
    if (st.submitted) return;
    if (st.snoozeUntil && now < st.snoozeUntil) return;
    if (now - st.firstSeenAt < DELAY_MS) return;
    const t = setTimeout(() => setOpen(true), 1200); // 진입 직후 갑툭튀 방지
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  const snooze = () => { writeState({ snoozeUntil: Date.now() + SNOOZE_MS }); setOpen(false); };

  const submit = async () => {
    if (busy || rating === 0) return;
    setBusy(true);
    try {
      await submitSurvey(rating, good.trim(), bad.trim(), typeof window !== 'undefined' ? window.location.pathname : '');
      writeState({ submitted: true });
      posthog.capture('feedback_survey_submitted', { rating });
      toast('소중한 의견 감사해요! 큰 힘이 됐어요.', 'success');
      setOpen(false);
    } catch {
      toast('전송에 실패했어요. 잠시 후 다시 시도해주세요.', 'error');
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} onClick={snooze}>
      <div className="bg-white rounded-3xl w-full max-w-md px-6 pt-6 pb-6" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[19px] font-black" style={{ color: '#16211E' }}>Spira, 써보니 어떠세요?</h2>
          <button onClick={snooze} className="w-8 h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="text-[13px] leading-relaxed mb-5" style={{ color: '#5B6560' }}>잠깐이면 돼요. {displayName ? `${displayName}님의` : '여러분의'} 한마디가 Spira를 더 좋게 만들어요.</p>

        {/* 만족도 */}
        <div className="flex justify-between gap-1.5 mb-5">
          {FACES.map(f => {
            const on = rating === f.v;
            return (
              <button
                key={f.v}
                onClick={() => setRating(f.v)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition-all"
                style={on
                  ? { backgroundColor: '#F1F6EC', borderColor: '#9DFE3B' }
                  : { backgroundColor: '#fff', borderColor: 'rgba(0,41,41,0.08)' }}
                title={f.label}
              >
                <span className="text-[24px] leading-none" style={{ filter: on ? 'none' : 'grayscale(0.4)', opacity: on ? 1 : 0.75 }}>{f.e}</span>
                <span className="text-[10px] font-semibold" style={{ color: on ? '#3E6B1F' : '#9AA39D' }}>{f.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5 mb-5">
          <textarea
            value={good}
            onChange={e => setGood(e.target.value)}
            rows={2}
            placeholder="가장 좋은 점은 무엇인가요?"
            className="w-full resize-none rounded-2xl border px-4 py-2.5 text-[14px] leading-relaxed outline-none transition-colors focus:border-[#9DFE3B]"
            style={{ borderColor: 'rgba(0,41,41,0.12)', color: '#16211E', alignContent: 'start' }}
          />
          <textarea
            value={bad}
            onChange={e => setBad(e.target.value)}
            rows={2}
            placeholder="가장 불편하거나 아쉬운 점은요?"
            className="w-full resize-none rounded-2xl border px-4 py-2.5 text-[14px] leading-relaxed outline-none transition-colors focus:border-[#9DFE3B]"
            style={{ borderColor: 'rgba(0,41,41,0.12)', color: '#16211E', alignContent: 'start' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={snooze} className="px-4 py-3 rounded-2xl text-[14px] font-semibold" style={{ color: '#5B6560', backgroundColor: '#F1F1EB' }}>나중에</button>
          <button
            onClick={submit}
            disabled={rating === 0 || busy}
            className="flex-1 py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:translate-y-0"
            style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
          >
            {busy ? '보내는 중…' : '보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
