'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import posthog from 'posthog-js';
import { useToast } from './ToastContext';
import { useAuth } from '../components/AuthProvider';
import { createClient } from './supabase/client';

export type UpgradeReason = 'ai_limit' | 'workspace' | 'autofill' | 'generic';

const REASON_LINE: Record<UpgradeReason, string> = {
  ai_limit: '오늘 사용할 수 있는 무료 AI 대화를 모두 썼어요.',
  workspace: '무료 플랜에서는 워크스페이스를 1개까지 만들 수 있어요.',
  autofill: 'AI가 대신 채워주는 기능은 Pro 플랜에서 열려요.',
  generic: '이 기능은 Pro 플랜에서 열려요.',
};

const Ctx = createContext<{ showUpgrade: (reason?: UpgradeReason) => void }>({ showUpgrade: () => {} });
export const useUpgrade = () => useContext(Ctx);

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  const showUpgrade = useCallback((r: UpgradeReason = 'generic') => { posthog.capture('upgrade_prompt_shown', { reason: r }); setReason(r); setJoined(false); }, []);
  const close = () => setReason(null);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { toast('로그인이 필요해요.', 'error'); setBusy(false); return; }
      const { error } = await supabase.from('pro_waitlist').upsert({ user_id: u.id, email: u.email, reason });
      if (error) throw error;
      posthog.capture('pro_waitlist_joined', { reason });
      setJoined(true);
      toast('신청 완료! 유료 플랜이 나오면 메일로 알려드릴게요.', 'success');
    } catch {
      toast('신청에 실패했어요. 잠시 후 다시 시도해주세요.', 'error');
    }
    setBusy(false);
  };

  return (
    <Ctx.Provider value={{ showUpgrade }}>
      {children}
      {reason && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.5)' }} onClick={close}>
          <div className="bg-white rounded-3xl w-full max-w-sm px-6 pt-6 pb-6 text-center" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-[28px]" style={{ backgroundColor: '#F1F6EC' }}>🚀</div>
            <h2 className="text-[20px] font-black mb-2" style={{ color: '#16211E' }}>유료 플랜을 준비 중이에요</h2>
            <p className="text-[13px] leading-relaxed mb-1" style={{ color: '#5B6560' }}>{REASON_LINE[reason]}</p>
            <p className="text-[13px] leading-relaxed mb-6" style={{ color: '#5B6560' }}>
              워크스페이스 개수·AI 대화 횟수·AI 자동 채우기 등 <b style={{ color: '#16211E' }}>모든 제한이 사라지는</b> Pro 플랜이 곧 나와요.
            </p>

            {joined ? (
              <>
                <div className="w-full py-3 rounded-2xl text-[14px] font-bold mb-2" style={{ backgroundColor: 'rgba(157,254,59,0.18)', color: '#3E6B1F' }}>
                  ✓ 신청 완료
                </div>
                <p className="text-[12px] mb-4" style={{ color: '#9AA39D' }}>출시되면 <b>{user?.email}</b> 로 알려드릴게요.</p>
                <button onClick={close} className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#F1F1EB', color: '#16211E' }}>확인</button>
              </>
            ) : (
              <>
                <button onClick={join} disabled={busy} className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>
                  {busy ? '신청 중…' : '출시 알림 받기'}
                </button>
                <button onClick={close} className="w-full py-2.5 mt-1 text-[14px] font-semibold transition-colors hover:opacity-70" style={{ color: '#9AA39D' }}>닫기</button>
              </>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
