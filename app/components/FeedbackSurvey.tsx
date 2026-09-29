'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useToast } from '../lib/ToastContext';
import { submitSurvey } from '../lib/feedback';
import { readSurveyState, writeSurveyState } from '../lib/survey';
import posthog from 'posthog-js';

// 능동적 만족도 설문 — 가입 직후가 아니라 '의미 있는 핵심 행동'을 일정 이상 경험한 뒤 노출.
const FIRST_SHOW_ACTIONS = 30;                 // 첫 노출: 핵심 행동(task_added+completed) 30회 이상
const MIN_DAYS_SINCE_FIRST = 2 * 24 * 60 * 60 * 1000; // + 가입 후 최소 2일(성급한 노출 방지)
const SNOOZE_MS = 10 * 24 * 60 * 60 * 1000;    // '나중에': 다음 방문 말고 10일 뒤
const DISMISS_ACTIONS = 100;                   // 무응답 닫음/이탈: 핵심 행동 100회 더 쌓인 뒤 재시도
const REMEASURE_MS = 30 * 24 * 60 * 60 * 1000; // 응답자: 30일 뒤 재측정(그전엔 다시 안 띄움)
const FACES = [
  { v: 1, e: '😞', label: '아쉬워요' },
  { v: 2, e: '😐', label: '그저그래요' },
  { v: 3, e: '🙂', label: '괜찮아요' },
  { v: 4, e: '😄', label: '좋아요' },
  { v: 5, e: '🤩', label: '최고예요' },
];

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
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!uid) return;
    const st = readSurveyState(uid);
    const now = Date.now();
    const actions = st.actionCount ?? 0;
    if (!st.firstSeenAt) { writeSurveyState(uid, { firstSeenAt: now }); return; } // 첫 방문 기록만
    // 구버전 응답자(submitted 플래그) → 재측정 시각 기준으로 이관해 즉시 재노출 방지
    if (st.submitted && !st.lastSubmittedAt) { writeSurveyState(uid, { lastSubmittedAt: now, submitted: undefined }); return; }
    if (st.lastSubmittedAt && now - st.lastSubmittedAt < REMEASURE_MS) return;             // 응답 후 30일 재측정 대기
    if (st.snoozeUntil && now < st.snoozeUntil) return;                                    // '나중에' 대기(10일)
    if (st.dismissedAtActions != null && actions < st.dismissedAtActions + DISMISS_ACTIONS) return; // 무응답 닫음 후 +100회
    if (actions < FIRST_SHOW_ACTIONS) return;                                              // 핵심 행동 30회 미만
    if (now - st.firstSeenAt < MIN_DAYS_SINCE_FIRST) return;                               // 가입 후 최소 2일
    const t = setTimeout(() => setOpen(true), 1200); // 진입 직후 갑툭튀 방지
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // '나중에' 버튼 — 시간 기준으로 미룸(10일)
  const snooze = () => { writeSurveyState(uid, { snoozeUntil: Date.now() + SNOOZE_MS, dismissedAtActions: undefined }); setOpen(false); };
  // X/바깥 클릭으로 무응답 닫기 — 다음 방문 말고 핵심 행동 100회 더 쌓인 뒤 재시도
  const dismiss = () => { writeSurveyState(uid, { dismissedAtActions: readSurveyState(uid).actionCount ?? 0, snoozeUntil: undefined }); setOpen(false); };

  const submit = async () => {
    if (busy || rating === 0) return;
    setBusy(true);
    try {
      await submitSurvey(rating, good.trim(), bad.trim(), typeof window !== 'undefined' ? window.location.pathname : '');
      // 응답 완료 → 30일 뒤 재측정. 대기 상태(snooze/dismiss)는 초기화.
      writeSurveyState(uid, { lastSubmittedAt: Date.now(), snoozeUntil: undefined, dismissedAtActions: undefined, submitted: undefined });
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
    <div className="fixed inset-0 z-[92] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} onClick={dismiss}>
      <div className="bg-white rounded-3xl w-full max-w-md px-6 pt-6 pb-6" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[19px] font-black" style={{ color: '#16211E' }}>Spira, 써보니 어떠세요?</h2>
          <button onClick={dismiss} className="w-8 h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
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
