'use client';
import { useState } from 'react';
import { useToast } from '../lib/ToastContext';
import { submitFeedback, FeedbackType } from '../lib/feedback';

const TYPES: { key: FeedbackType; label: string; emoji: string }[] = [
  { key: 'bug', label: '버그 신고', emoji: '🐞' },
  { key: 'feature', label: '기능 제안', emoji: '💡' },
  { key: 'inquiry', label: '문의·기타', emoji: '💬' },
];

// 앱 내 피드백 수집 모달 — 유형 선택 + 내용 작성 후 Supabase에 저장.
export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<FeedbackType>('feature');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      await submitFeedback(type, message.trim(), typeof window !== 'undefined' ? window.location.pathname : '');
      toast('소중한 의견 감사해요! 잘 전달했어요.', 'success');
      onClose();
    } catch {
      toast('전송에 실패했어요. 잠시 후 다시 시도해주세요.', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md px-6 pt-6 pb-6" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[19px] font-black" style={{ color: '#16211E' }}>의견 보내기</h2>
          <button onClick={onClose} className="w-8 h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="text-[13px] leading-relaxed mb-4" style={{ color: '#5B6560' }}>Spira를 더 좋게 만드는 데 큰 힘이 돼요. 편하게 남겨주세요.</p>

        <div className="flex gap-2 mb-3">
          {TYPES.map(t => {
            const on = type === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-[13px] font-semibold transition-all"
                style={on
                  ? { backgroundColor: '#F1F6EC', borderColor: '#9DFE3B', color: '#16211E' }
                  : { backgroundColor: '#fff', borderColor: 'rgba(0,41,41,0.1)', color: '#5B6560' }}
              >
                <span className="text-[18px]">{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        <textarea
          autoFocus
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          placeholder="어떤 점이 불편했는지, 어떤 기능이 있으면 좋을지 자유롭게 적어주세요."
          className="w-full resize-none rounded-2xl border px-4 py-3 text-[14px] leading-relaxed outline-none transition-colors focus:border-[#9DFE3B]"
          style={{ borderColor: 'rgba(0,41,41,0.12)', color: '#16211E', alignContent: 'start' }}
        />

        <button
          onClick={submit}
          disabled={!message.trim() || busy}
          className="w-full mt-4 py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:translate-y-0"
          style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
        >
          {busy ? '보내는 중…' : '보내기'}
        </button>
      </div>
    </div>
  );
}
