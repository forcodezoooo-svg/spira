'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { useToast } from '../lib/ToastContext';
import { emptyPlan, uid } from '../lib/store';
import type { PlanItem } from '../lib/types';

const PALETTE = ['#5EA63A', '#4E7CF5', '#E0913C', '#9B6BD6', '#3CB8A6', '#E0648C'];
type NamedGoal = { name: string; goal: string };

// 편집 가능한 리스트(분기목표/업무영역 공통). 모듈 레벨 — 렌더마다 재생성돼 포커스 풀리는 것 방지.
// withDesc=true 이면 이름 아래 한 줄 설명(goal) 입력도 함께 표시.
function EditList({ items, setItems, placeholder, descPlaceholder, numbered = false, withDesc = false }: { items: NamedGoal[]; setItems: (v: NamedGoal[]) => void; placeholder: string; descPlaceholder?: string; numbered?: boolean; withDesc?: boolean }) {
  return (
    <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
      {items.map((it, i) => (
        <div key={i} className={`flex gap-2 bg-neutral-50 border rounded-2xl px-3 py-2 ${withDesc ? 'items-start' : 'items-center'}`} style={{ borderColor: 'var(--spira-border-subtle)' }}>
          {numbered && (
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: '#EEF7E2', color: '#3E7A2E' }}>{i + 1}</span>
          )}
          <div className="flex-1 min-w-0">
            <input value={it.name} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              placeholder={placeholder} className="w-full bg-transparent text-[14px] font-semibold outline-none" style={{ color: '#16211E' }} />
            {withDesc && (
              <input value={it.goal} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, goal: e.target.value } : x))}
                placeholder={descPlaceholder} className="w-full bg-transparent text-[12px] outline-none mt-0.5" style={{ color: '#8A938C' }} />
            )}
          </div>
          <button onClick={() => setItems(items.filter((_, j) => j !== i))} className={`text-neutral-300 hover:text-red-500 text-sm flex-shrink-0 ${withDesc ? 'mt-0.5' : ''}`}>×</button>
        </div>
      ))}
      <button onClick={() => setItems([...items, { name: '', goal: '' }])} className="text-[13px] font-semibold px-3 py-1.5" style={{ color: '#5EA63A' }}>+ 추가</button>
    </div>
  );
}

// 첫 실행 온보딩 — 이름·설명·첫 목표 → AI가 기획서 초안/분기별 목표/업무 영역 제안 → 사업 생성.
export default function Onboarding() {
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);   // 0 이름 · 1 설명 · 2 목표 · 3 분기목표검토 · 4 업무영역검토 · 5 완료
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [goal, setGoal] = useState('');
  const [qGoals, setQGoals] = useState<NamedGoal[]>([]);
  const [wAreas, setWAreas] = useState<NamedGoal[]>([]);
  const [planDraft, setPlanDraft] = useState<{ tagline: string; mission: string; vision: string; problems: string[]; solutions: PlanItem[]; revenueModel: PlanItem[] } | null>(null);

  useEffect(() => {
    const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('onboarding') === '1';
    if (preview || (store.ready && store.allWorkspaces.length === 0)) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  if (!visible) return null;

  // 목표 입력 후 AI 분석 → 분기별 목표·업무 영역·기획서 초안 제안
  const analyze = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), goal: goal.trim() }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error();
      setPlanDraft({
        tagline: d.tagline || '', mission: d.mission || '', vision: d.vision || '',
        problems: Array.isArray(d.problems) ? d.problems : [],
        solutions: Array.isArray(d.solutions) ? d.solutions.map((s: PlanItem) => ({ title: s.title || '', memo: s.memo || '' })) : [],
        revenueModel: Array.isArray(d.revenueModel) ? d.revenueModel.map((s: PlanItem) => ({ title: s.title || '', memo: s.memo || '' })) : [],
      });
      const qs: NamedGoal[] = Array.isArray(d.quarterlyGoals) && d.quarterlyGoals.length
        ? d.quarterlyGoals.map((g: NamedGoal) => ({ name: g.name || '', goal: g.goal || '' }))
        : [{ name: goal.trim(), goal: goal.trim() }];
      setQGoals(qs);
      setWAreas(Array.isArray(d.workAreas) ? d.workAreas.map((w: NamedGoal) => ({ name: w.name || '', goal: w.goal || '' })) : []);
    } catch {
      toast('AI 분석에 실패했어요. 입력하신 내용으로 이어갈게요.', 'info');
      setPlanDraft(null);
      setQGoals([{ name: goal.trim(), goal: goal.trim() }]);
      setWAreas([]);
    } finally {
      setLoading(false);
      setStep(3);
    }
  };

  // 검토 완료 → 사업·기획서·목표 생성
  const createAll = () => {
    const wsId = store.addWorkspace(name.trim());
    store.updatePlanInWs(wsId, {
      ...emptyPlan,
      concept: desc.trim(),
      tagline: planDraft?.tagline ?? '',
      mission: planDraft?.mission ?? '',
      vision: planDraft?.vision ?? '',
      problems: planDraft?.problems ?? [],
      solutions: planDraft?.solutions ?? [],
      revenueModel: planDraft?.revenueModel ?? [],
      workAreas: wAreas.filter(w => w.name.trim()).map((w, i) => ({ id: uid(), name: w.name.trim(), color: PALETTE[i % PALETTE.length], goal: w.goal.trim() })),
    });
    qGoals.filter(g => g.name.trim()).forEach((g, i) => store.addProgramToWs(wsId, { name: g.name.trim(), goal: g.goal.trim() || g.name.trim(), color: PALETTE[i % PALETTE.length] }));
    setStep(5);
  };

  const finish = (goPlan: boolean) => {
    setVisible(false);
    try { localStorage.setItem('spira_teach_idx', '0'); } catch { /* empty */ } // 티칭 투어 시작(Plan 진입 시 노출)
    if (goPlan) router.push('/plan');
  };

  const inputCls = 'w-full px-4 py-3 rounded-2xl border text-[15px] outline-none focus:border-neutral-400 transition-colors';
  const primary = 'py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.55)' }}>
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center gap-2.5 px-6 pt-6 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Spira" className="w-6 h-auto" />
          <div className="flex-1" />
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full transition-colors" style={{ backgroundColor: i <= step ? '#9DFE3B' : '#E1E1DA' }} />
          ))}
        </div>

        <div className="px-6 pb-6 pt-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-11 h-11">
                <div className="absolute inset-0 rounded-full border-[3px]" style={{ borderColor: '#E6EFD9' }} />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent animate-spin" style={{ borderTopColor: '#9DFE3B', borderRightColor: '#9DFE3B', animationDuration: '0.8s' }} />
              </div>
              <p className="text-[14px] font-semibold" style={{ color: '#5B6560' }}>Sparky가 분석하고 있어요…</p>
            </div>
          ) : step === 0 ? (
            <>
              <h2 className="text-[21px] font-black leading-snug mb-2" style={{ color: '#16211E' }}>어떤 비즈니스/브랜드를<br />만들고 계신가요? 👋</h2>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: '#5B6560' }}>지금 하고 있거나 하고 싶은 비즈니스/브랜드의 이름을 적어주세요.</p>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && name.trim() && setStep(1)}
                placeholder="예: 아이바이마이, 내 브랜드…" className={inputCls} style={{ borderColor: 'var(--spira-border-strong)', color: '#16211E' }} />
              <button onClick={() => setStep(1)} disabled={!name.trim()} className={`w-full mt-4 ${primary}`} style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>다음</button>
            </>
          ) : step === 1 ? (
            <>
              <h2 className="text-[20px] font-black leading-snug mb-2" style={{ color: '#16211E' }}>그 비즈니스/브랜드에<br />대해 설명해주세요</h2>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: '#5B6560' }}>무엇을, 누구를 위해, 어떻게 만드는 비즈니스/브랜드인지 자유롭게 적어주세요. 이후에 수정할 수 있으니 간단한 내용이어도 괜찮아요.</p>
              <textarea autoFocus value={desc} onChange={e => setDesc(e.target.value)} rows={5}
                placeholder="예: 1인 창업가들이 사업을 체계적으로 운영하도록 돕는 웹 서비스예요. 목표·업무·수익을 한곳에서…"
                className={`${inputCls} resize-none leading-relaxed`} style={{ borderColor: 'var(--spira-border-strong)', color: '#16211E', alignContent: 'start' }} />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(0)} className="px-4 py-3 rounded-2xl text-[14px] font-semibold" style={{ color: '#5B6560', backgroundColor: '#F1F1EB' }}>이전</button>
                <button onClick={() => setStep(2)} disabled={!desc.trim()} className={`flex-1 ${primary}`} style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>다음</button>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <h2 className="text-[20px] font-black leading-snug mb-2" style={{ color: '#16211E' }}>이 프로젝트에서<br />이루고 싶은 첫 목표는?</h2>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: '#5B6560' }}>예: “앱 런칭 후 사용자 10만 달성”. 이 목표를 Sparky가 분기별로 나눠 제안할게요.</p>
              <input autoFocus value={goal} onChange={e => setGoal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && goal.trim() && analyze()}
                placeholder="예: 앱 런칭 후 사용자 10만 달성" className={inputCls} style={{ borderColor: 'var(--spira-border-strong)', color: '#16211E' }} />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(1)} className="px-4 py-3 rounded-2xl text-[14px] font-semibold" style={{ color: '#5B6560', backgroundColor: '#F1F1EB' }}>이전</button>
                <button onClick={analyze} disabled={!goal.trim()} className={`flex-1 ${primary}`} style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>AI로 분석하기</button>
              </div>
            </>
          ) : step === 3 ? (
            <>
              <h2 className="text-[19px] font-black leading-snug mb-1" style={{ color: '#16211E' }}>분기별 목표 제안</h2>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: '#5B6560' }}>첫 목표를 이루기 위한 단계예요. 수정·추가·삭제할 수 있고, 나중에 Goals에서도 바꿀 수 있어요.</p>
              <EditList items={qGoals} setItems={setQGoals} placeholder="목표 이름" numbered />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(2)} className="px-4 py-3 rounded-2xl text-[14px] font-semibold" style={{ color: '#5B6560', backgroundColor: '#F1F1EB' }}>이전</button>
                <button onClick={() => setStep(4)} className={`flex-1 ${primary}`} style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>다음</button>
              </div>
            </>
          ) : step === 4 ? (
            <>
              <h2 className="text-[19px] font-black leading-snug mb-1" style={{ color: '#16211E' }}>업무 영역 제안</h2>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: '#5B6560' }}>목표 달성에 필요한 업무 영역이에요. 수정·추가·삭제할 수 있고, 나중에 Plan에서도 바꿀 수 있어요.</p>
              <EditList items={wAreas} setItems={setWAreas} placeholder="업무 영역 이름" descPlaceholder="이 영역이 하는 일을 한 줄로" withDesc />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(3)} className="px-4 py-3 rounded-2xl text-[14px] font-semibold" style={{ color: '#5B6560', backgroundColor: '#F1F1EB' }}>이전</button>
                <button onClick={createAll} className={`flex-1 ${primary}`} style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>완료</button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 spira-bob" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none"><path d="M6 12.5l3.6 3.6L18 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 className="text-[20px] font-black leading-snug mb-2" style={{ color: '#16211E' }}>좋아요! 이제부터<br />업무를 위한 계획을 세워봐요</h2>
              <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#5B6560' }}>
                ‘{name.trim()}’ 기획서 초안·분기별 목표·업무 영역을 만들었어요. Plan에서 기획서를 다듬고, Goals에서 목표를 데드라인·업무로 쪼개 캘린더에 배치해보세요.
              </p>
              <button onClick={() => finish(true)} className="w-full py-3 rounded-2xl text-[15px] font-bold mb-2 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>Plan에서 기획서 보기</button>
              <button onClick={() => finish(false)} className="w-full py-2.5 rounded-2xl text-[14px] font-semibold" style={{ color: '#5B6560' }}>먼저 둘러볼게요</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
