'use client';
import { useState, useEffect, useRef, forwardRef, Fragment } from 'react';
import { useStore } from '../lib/useStore';
import { useToast } from '../lib/ToastContext';
import { ListSkeleton } from '../components/Skeleton';
import { PlanData, PlanItem, TargetCustomer, GrowthStage, WorkArea, BizGoal, Deliverable, AreaDeliverable, BusinessOverview, PlanDoc, Goal, Strategy, Project, ProjectStatus, SuccessCriterion } from '../lib/types';

// AI가 돌려주는 성과 기준(id 없음)
type AiCriterion = { type: string; name: string; current?: number; target?: number; unit?: string; measurementPeriod?: string };
// AI 목표 설계 팝업에서 다루는 제안 목표(근거 포함)
type PlanGoal = { name: string; targetDate?: string; rationale?: string; successCriteria: AiCriterion[]; strategies?: { area: string; content: string }[] };
type PlanProject = { name: string; finalDeliverable?: string; startDate?: string; endDate?: string; areaDeliverables?: { area: string; content: string }[] };
// AI 제안 미리보기(승인 전) — 목표 점검 / Goal 쪼개기 / Project 쪼개기
type AiPreview =
  | { kind: 'goal-review'; goalId: string; goalName: string; data: { ok: boolean; issues: string[]; title: string; successCriteria: AiCriterion[]; targetDate: string; note: string } };

// 목표의 성과 기준(레거시 kpi 폴백 포함)과 진행률
function effectiveCriteria(g: Goal): SuccessCriterion[] {
  if (g.successCriteria && g.successCriteria.length) return g.successCriteria;
  // 레거시 단일 KPI → metric 성과 기준 1개로 파생 (편집 시 successCriteria로 흡수)
  if (g.kpi || g.targetValue != null) {
    return [{ id: `${g.id}-legacy`, type: 'metric', name: g.kpi || g.name, currentValue: g.currentValue, targetValue: g.targetValue, unit: g.unit }];
  }
  return [];
}
function goalProgressOf(g: Goal): number | null {
  const cs = effectiveCriteria(g);
  if (!cs.length) return null;
  let sum = 0;
  for (const c of cs) {
    if (c.type === 'completion') sum += c.completed ? 1 : 0;
    else if (c.targetValue && c.targetValue > 0) sum += Math.min(1, Math.max(0, (c.currentValue ?? 0) / c.targetValue));
    // 목표값 없는 metric은 진행률 계산에서 0 취급
  }
  return sum / cs.length;
}
import TargetCustomerModal, { Avatar } from '../components/TargetCustomerModal';
import { uid } from '../lib/store';
import { useChatContext } from '../lib/ChatContext';
import { buildValuePropPrompt, buildSolutionsPrompt, buildRevenuePrompt, buildBrandingPrompt, buildPersonasPrompt, buildGrowthStagesPrompt, buildWorkAreasPrompt } from '../lib/ai/prompts';
import FlagAward from '../components/FlagAward';
import { usePlan } from '../lib/usePlan';
import { useUpgrade } from '../lib/UpgradeContext';
import { isOnboardingActive } from '../lib/onboarding';

// 사업 고유 컬러 팔레트 (Goals 등 서비스 전체에서 사용)
const BUSINESS_COLORS = ['#8B5CF6', '#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899'];

// ── Hint tooltip ───────────────────────────────────────────────────────────────

function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        data-teach="plan-help"
        onClick={() => setOpen(o => !o)}
        className="w-4 h-4 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-500 text-[10px] font-bold flex items-center justify-center transition-colors"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-20 w-60 bg-white border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs text-neutral-600 shadow-xl leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}

// ── Auto-resize textarea ───────────────────────────────────────────────────────

const AutoTextarea = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}>(function AutoTextarea({ value, onChange, placeholder, onKeyDown }, forwardedRef) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = (forwardedRef ?? innerRef) as React.RefObject<HTMLTextAreaElement>;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="w-full bg-transparent text-sm text-neutral-900 placeholder-neutral-400 outline-none resize-none leading-relaxed overflow-hidden"
    />
  );
});

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  label, hint, isEditing, onEdit, onSave, onAskAI,
}: {
  label: string;
  hint: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onAskAI?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <div
          className={onAskAI ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'}
          onClick={onAskAI}
          title={onAskAI ? 'AI에게 이 항목 묻기' : undefined}
        >
          <h2 className={`text-sm font-semibold text-neutral-900 ${onAskAI ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>
            {label}
          </h2>
          {onAskAI && (
            <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" />
            </svg>
          )}
        </div>
        <div onClick={e => e.stopPropagation()}>
          <Hint text={hint} />
        </div>
      </div>
      {isEditing ? (
        <button onClick={onSave} className="text-xs text-neutral-700 hover:text-neutral-700 font-medium transition-colors">
          저장
        </button>
      ) : (
        <button onClick={onEdit} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors">
          수정
        </button>
      )}
    </div>
  );
}

// ── Text section ───────────────────────────────────────────────────────────────

function TextSection({
  label, hint, value, onChange, placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const chat = useChatContext();

  const handleEdit = () => { setDraft(value); setIsEditing(true); };
  const handleSave = () => { onChange(draft); setIsEditing(false); };
  // 다이아몬드 = 이 항목을 실제로 '채우기' (조언이 아니라 필드 반영)
  const handleAskAI = chat && !chat.loading
    ? () => {
        chat.setOpen(true);
        // API엔 상세 명령(마커 지시), 화면 말풍선엔 자연어만 표시
        const api = `기획서의 '${label}' 항목을 지금 사업 정보에 맞게 ${(value ?? '').trim() ? '보완해서 다시 ' : ''}작성해줘. 조언만 하지 말고 추가 질문 없이, 반드시 답변 맨 끝에 %%%PLAN_UPDATE%%% 마커와 '${label}'에 해당하는 필드가 담긴 JSON을 출력해서 바로 반영되게 해줘.`;
        chat.sendMessage(api, `${label} 항목을 채워줘`);
      }
    : undefined;

  return (
    <section>
      <SectionHeader label={label} hint={hint} isEditing={isEditing} onEdit={handleEdit} onSave={handleSave} onAskAI={handleAskAI} />
      <div className={`bg-white border rounded-xl px-5 py-4 transition-all ${isEditing ? 'ring-2 ring-violet-400 border-violet-300' : 'border-neutral-200'}`}>
        {isEditing ? (
          <AutoTextarea value={draft} onChange={setDraft} placeholder={placeholder} />
        ) : (
          <p className={`text-sm leading-relaxed ${value ? 'text-neutral-900' : 'text-neutral-400'}`}>
            {value || placeholder}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Card list section ──────────────────────────────────────────────────────────

function CardListSection({
  label, hint, items, onAdd, onUpdate, onRemove, onGenerate,
}: {
  label: string;
  hint: string;
  items: PlanItem[];
  onAdd: (v: PlanItem) => void;
  onUpdate: (i: number, v: PlanItem) => void;
  onRemove: (i: number) => void;
  onGenerate?: () => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addMemo, setAddMemo] = useState('');
  const addTitleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (adding) addTitleRef.current?.focus();
  }, [adding]);

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditTitle(items[i].title);
    setEditMemo(items[i].memo);
    setAdding(false);
  };

  const saveEdit = (i: number) => {
    if (editTitle.trim()) onUpdate(i, { title: editTitle.trim(), memo: editMemo.trim() });
    setEditingIdx(null);
  };

  const saveAdd = () => {
    if (addTitle.trim()) {
      onAdd({ title: addTitle.trim(), memo: addMemo.trim() });
      setAddTitle('');
      setAddMemo('');
    }
    setAdding(false);
  };

  const cancelAdd = () => { setAdding(false); setAddTitle(''); setAddMemo(''); };

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={onGenerate ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'}
          onClick={onGenerate}
          title={onGenerate ? `AI가 ${label} 제안` : undefined}
        >
          <h2 className={`text-sm font-semibold text-neutral-900 ${onGenerate ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>
            {label}
          </h2>
          {onGenerate && (
            <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" />
            </svg>
          )}
        </div>
        <Hint text={hint} />
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`bg-white border rounded-xl px-4 py-3 transition-all ${editingIdx === i ? 'ring-2 ring-violet-400 border-violet-300' : 'border-neutral-200'}`}
          >
            {editingIdx === i ? (
              <div className="space-y-2">
                <AutoTextarea value={editTitle} onChange={setEditTitle} placeholder="항목 이름" />
                <div className="border-t border-neutral-100 pt-2">
                  <AutoTextarea value={editMemo} onChange={setEditMemo} placeholder="상세 내용 (선택)" />
                </div>
                <div className="flex gap-3 pt-1 border-t border-neutral-100">
                  <button onClick={() => saveEdit(i)} className="text-xs text-neutral-700 hover:text-neutral-700 font-medium transition-colors">저장</button>
                  <button onClick={() => setEditingIdx(null)} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">취소</button>
                  <button onClick={() => { onRemove(i); setEditingIdx(null); }} className="text-xs text-neutral-700 hover:text-red-400 transition-colors ml-auto">삭제</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 group/card">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-50 text-neutral-600 text-[10px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 leading-relaxed">{item.title}</p>
                  {item.memo && (
                    <p className="text-xs text-neutral-400 leading-relaxed mt-0.5 whitespace-pre-wrap">{item.memo}</p>
                  )}
                </div>
                <button
                  onClick={() => startEdit(i)}
                  className="flex-shrink-0 text-xs text-neutral-700 hover:text-neutral-700 transition-colors opacity-0 group-hover/card:opacity-100 mt-0.5"
                >
                  수정
                </button>
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <div className="bg-white border border-violet-300 ring-2 ring-violet-400 rounded-xl px-4 py-3 space-y-2">
            <AutoTextarea ref={addTitleRef} value={addTitle} onChange={setAddTitle} placeholder="항목 이름" />
            <div className="border-t border-neutral-100 pt-2">
              <AutoTextarea value={addMemo} onChange={setAddMemo} placeholder="상세 내용 (선택)" />
            </div>
            <div className="flex gap-3 pt-1 border-t border-neutral-100">
              <button onClick={saveAdd} className="text-xs text-neutral-700 hover:text-neutral-700 font-medium transition-colors">추가</button>
              <button onClick={cancelAdd} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">취소</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-neutral-200 text-xs text-neutral-400 hover:text-neutral-600 hover:border-violet-300 transition-all"
          >
            + 항목 추가
          </button>
        )}
      </div>
    </section>
  );
}

// ── Products section (프로덕트 목록 + 계열사 연동) ───────────────────────────────
// 프로덕트를 다른 비즈니스(계열사)에 연동해 이 비즈니스 안에 종속 표시. 뱃지 클릭 시 그 비즈니스로 이동.
function ProductsSection({
  items, businesses, onAdd, onUpdate, onRemove, onGenerate, onOpenBusiness,
}: {
  items: PlanItem[];
  businesses: { id: string; name: string }[];
  onAdd: (v: PlanItem) => void;
  onUpdate: (i: number, v: PlanItem) => void;
  onRemove: (i: number) => void;
  onGenerate?: () => void;
  onOpenBusiness: (wsId: string) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [linkedWsId, setLinkedWsId] = useState('');
  const [adding, setAdding] = useState(false);

  const startAdd = () => { setTitle(''); setMemo(''); setLinkedWsId(''); setAdding(true); setEditingIdx(null); };
  const startEdit = (i: number) => { setTitle(items[i].title); setMemo(items[i].memo); setLinkedWsId(items[i].linkedWsId ?? ''); setEditingIdx(i); setAdding(false); };
  const commit = (i: number | null) => {
    if (!title.trim()) return;
    const v: PlanItem = { title: title.trim(), memo: memo.trim(), ...(linkedWsId ? { linkedWsId } : {}) };
    if (i === null) onAdd(v); else onUpdate(i, v);
    setAdding(false); setEditingIdx(null);
  };
  const bizName = (id?: string) => businesses.find(b => b.id === id)?.name;

  const form = (i: number | null) => (
    <div className="space-y-2">
      <AutoTextarea value={title} onChange={setTitle} placeholder="연계 비즈니스 이름" />
      <div className="border-t border-neutral-100 pt-2">
        <AutoTextarea value={memo} onChange={setMemo} placeholder="상세 내용 (선택)" />
      </div>
      {businesses.length > 0 && (
        <div className="border-t border-neutral-100 pt-2">
          <label className="text-[11px] font-medium text-neutral-400 block mb-1">계열사 연동 (선택) — 이 항목을 다른 비즈니스로 저장</label>
          <select value={linkedWsId} onChange={e => setLinkedWsId(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400">
            <option value="">연동 안 함</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-3 pt-1 border-t border-neutral-100">
        <button onClick={() => commit(i)} className="text-xs text-neutral-700 font-medium transition-colors">{i === null ? '추가' : '저장'}</button>
        <button onClick={() => { setAdding(false); setEditingIdx(null); }} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">취소</button>
        {i !== null && <button onClick={() => { onRemove(i); setEditingIdx(null); }} className="text-xs text-neutral-700 hover:text-red-400 transition-colors ml-auto">삭제</button>}
      </div>
    </div>
  );

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div className={onGenerate ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'} onClick={onGenerate} title={onGenerate ? 'AI가 연계 비즈니스 제안' : undefined}>
          <h2 className={`text-sm font-semibold text-neutral-900 ${onGenerate ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>연계 비즈니스</h2>
          {onGenerate && <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>}
        </div>
        <Hint text="이 사업과 연결된 비즈니스(계열사·제품 라인 등). 다른 비즈니스를 '계열사'로 연동하면, 그 비즈니스가 이 사업 안에 종속되어 여기에만 표시돼요." />
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className={`bg-white border rounded-xl px-4 py-3 transition-all ${editingIdx === i ? 'ring-2 ring-violet-400 border-violet-300' : 'border-neutral-200'}`}>
            {editingIdx === i ? form(i) : (
              <div className="flex items-start gap-3 group/card">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-50 text-neutral-600 text-[10px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-neutral-800 leading-relaxed">{item.title}</p>
                    {item.linkedWsId && bizName(item.linkedWsId) && (
                      <button onClick={() => onOpenBusiness(item.linkedWsId!)} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors hover:brightness-95" style={{ backgroundColor: '#EEF1FF', color: '#5B5BD6' }} title="이 계열사 비즈니스로 이동">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><path d="M3 6h6M6.5 3.5L9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        계열사 · {bizName(item.linkedWsId)}
                      </button>
                    )}
                  </div>
                  {item.memo && <p className="text-xs text-neutral-400 leading-relaxed mt-0.5 whitespace-pre-wrap">{item.memo}</p>}
                </div>
                <button onClick={() => startEdit(i)} className="flex-shrink-0 text-xs text-neutral-700 transition-colors opacity-0 group-hover/card:opacity-100 mt-0.5">수정</button>
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <div className="bg-white border border-violet-300 ring-2 ring-violet-400 rounded-xl px-4 py-3">{form(null)}</div>
        ) : (
          <button onClick={startAdd} className="w-full py-2.5 rounded-xl border-2 border-dashed border-neutral-200 text-xs text-neutral-400 hover:text-neutral-600 hover:border-violet-300 transition-all">+ 연계 비즈니스 추가</button>
        )}
      </div>
    </section>
  );
}

// ── List section ───────────────────────────────────────────────────────────────

function ListSection({
  label, hint, items, onReplace, placeholder, onGenerate,
}: {
  label: string;
  hint: string;
  items: string[];
  onReplace: (items: string[]) => void;
  placeholder: string;
  onGenerate?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState<string[]>(items); // 편집 중 각 항목 텍스트
  const inputRef = useRef<HTMLInputElement>(null);
  const chat = useChatContext();

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  // 편집 시작/외부(AI) 반영 시 드래프트 동기화
  useEffect(() => {
    if (!isEditing) setDrafts(items);
  }, [items, isEditing]);

  // 편집 중에는 추가/삭제/수정 모두 로컬 drafts에만 반영하고, 저장 시 한 번에 커밋
  const handleAdd = () => {
    const v = input.trim();
    if (!v) return;
    setDrafts(prev => [...prev, v]);
    setInput('');
  };

  const startEdit = () => { setDrafts(items); setIsEditing(true); };
  // 저장: 편집한 전체 목록을 한 번에 커밋 (빈 항목은 제거). 개별 update 반복 호출로 인한 유실 방지
  const handleSave = () => {
    onReplace(drafts.map(d => d.trim()).filter(Boolean));
    setIsEditing(false);
    setInput('');
  };

  const handleAskAI = onGenerate ?? (chat && !chat.loading
    ? () => chat.openWithContext(label, items.map(item => `• ${item}`).join('\n'))
    : undefined);

  return (
    <section>
      <SectionHeader
        label={label}
        hint={hint}
        isEditing={isEditing}
        onEdit={startEdit}
        onSave={handleSave}
        onAskAI={handleAskAI}
      />
      <div className={`bg-white border rounded-xl px-5 py-4 transition-all ${isEditing ? 'ring-2 ring-violet-400 border-violet-300' : 'border-neutral-200'}`}>
        {items.length === 0 && !isEditing ? (
          <p className="text-sm text-neutral-400">{placeholder}</p>
        ) : (
          <>
            {(isEditing ? drafts : items).length > 0 && (
              <ul className="space-y-2 mb-3">
                {(isEditing ? drafts : items).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-neutral-400 text-xs mt-0.5 flex-shrink-0">•</span>
                    {isEditing ? (
                      <>
                        <AutoTextarea
                          value={item}
                          onChange={v => setDrafts(prev => prev.map((d, idx) => (idx === i ? v : d)))}
                          placeholder={placeholder}
                        />
                        <button onClick={() => setDrafts(prev => prev.filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-red-400 text-xs flex-shrink-0 transition-colors mt-0.5">
                          ×
                        </button>
                      </>
                    ) : (
                      <span className="text-sm text-neutral-800 flex-1 leading-relaxed">{item}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isEditing && (
              <div className={`flex gap-2 ${drafts.length > 0 ? 'pt-3 border-t border-neutral-100' : ''}`}>
                <input
                  ref={inputRef}
                  className="flex-1 text-sm text-neutral-800 placeholder-neutral-400 outline-none bg-transparent"
                  placeholder={placeholder}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <button
                  onClick={handleAdd}
                  disabled={!input.trim()}
                  className="text-xs text-neutral-600 hover:text-neutral-700 disabled:opacity-30 transition-colors flex-shrink-0 font-medium"
                >
                  + 추가
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ── Value proposition section ──────────────────────────────────────────────────

function ValuePropSection({
  hint, value, onChange, onAskAI,
}: {
  hint: string;
  value: PlanData['valueProposition'];
  onChange: (v: PlanData['valueProposition']) => void;
  onAskAI?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleEdit = () => { setDraft(value); setIsEditing(true); };
  const handleSave = () => { onChange(draft); setIsEditing(false); };

  const fields: { key: keyof PlanData['valueProposition']; label: string; placeholder: string }[] = [
    { key: 'personal', label: '개인적', placeholder: '개인에게 주는 가치를 적어보세요.' },
    { key: 'social', label: '사회적', placeholder: '사회에 주는 가치를 적어보세요.' },
    { key: 'environmental', label: '환경적', placeholder: '환경에 주는 가치를 적어보세요.' },
  ];

  const current = isEditing ? draft : value;

  // Sync draft when value is updated externally (e.g., by AI)
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  return (
    <section>
      <SectionHeader label="핵심 가치 제안" hint={hint} isEditing={isEditing} onEdit={handleEdit} onSave={handleSave} onAskAI={onAskAI} />
      <div className={`bg-white rounded-xl overflow-hidden transition-all ${isEditing ? 'ring-2 ring-violet-400' : ''}`}>
        {fields.map(({ key, label, placeholder }, idx) => (
          <div key={key} className={`px-5 py-4 ${idx < fields.length - 1 ? 'border-b border-neutral-100' : ''}`}>
            <p className="text-xs font-medium text-neutral-400 mb-1.5">{label}</p>
            {isEditing ? (
              <AutoTextarea
                value={draft[key]}
                onChange={v => setDraft(prev => ({ ...prev, [key]: v }))}
                placeholder={placeholder}
              />
            ) : (
              <p className={`text-sm leading-relaxed ${current[key] ? 'text-neutral-900' : 'text-neutral-400'}`}>
                {current[key] || placeholder}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Target customer section ────────────────────────────────────────────────────

function TargetCustomerCard({
  customer, onEdit, onDelete,
}: {
  customer: TargetCustomer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm group">
      {/* top gradient strip */}
      <div className="h-1.5 bg-gradient-to-r from-violet-400 to-cyan-300" />

      <div className="p-5">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar image={customer.image} name={customer.name} size={48} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 truncate">{customer.name}</p>
            {customer.occupation && (
              <p className="text-xs text-neutral-500 truncate">{customer.occupation}</p>
            )}
            {customer.age && (
              <p className="text-xs text-neutral-400">{customer.age}</p>
            )}
          </div>
        </div>

        {/* Tags */}
        {(customer.personality || customer.lifestyle) && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {customer.personality && (
              <span className="text-xs bg-violet-50 text-neutral-700 px-2.5 py-1 rounded-full">
                {customer.personality}
              </span>
            )}
            {customer.lifestyle && (
              <span className="text-xs bg-cyan-50 text-cyan-600 px-2.5 py-1 rounded-full">
                {customer.lifestyle}
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {customer.notes && (
          <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2 mb-4">
            {customer.notes}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-neutral-100">
          <button
            onClick={onEdit}
            className="flex-1 text-xs text-neutral-500 hover:text-neutral-700 transition-colors py-1"
          >
            수정
          </button>
          <div className="w-px bg-neutral-100" />
          <button
            onClick={onDelete}
            className="flex-1 text-xs text-neutral-500 hover:text-red-400 transition-colors py-1"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetCustomerSection({
  hint, customers, onAdd, onUpdate, onDelete, onGenerate,
}: {
  hint: string;
  customers: TargetCustomer[];
  onAdd: (c: Omit<TargetCustomer, 'id'>) => void;
  onUpdate: (c: TargetCustomer) => void;
  onDelete: (id: string) => void;
  onGenerate?: () => void;
}) {
  const [modal, setModal] = useState<'add' | TargetCustomer | null>(null);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={onGenerate ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'}
            onClick={onGenerate}
            title={onGenerate ? 'AI가 페르소나 3개 제안' : undefined}
          >
            <h2 className={`text-sm font-semibold text-neutral-900 ${onGenerate ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>
              타겟 고객
            </h2>
            {onGenerate && (
              <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" />
              </svg>
            )}
          </div>
          <div onClick={e => e.stopPropagation()}>
            <Hint text={hint} />
          </div>
        </div>
        <button
          onClick={() => setModal('add')}
          className="text-xs text-neutral-600 hover:text-neutral-500 transition-colors"
        >
          + 추가
        </button>
      </div>

      {customers.length === 0 ? (
        <div
          className="bg-white rounded-xl px-5 py-8 text-center cursor-pointer hover:ring-2 hover:ring-violet-200 transition-all"
          onClick={() => setModal('add')}
        >
          <p className="text-sm text-neutral-400">타겟 페르소나를 추가하세요</p>
          <p className="text-xs text-neutral-700 mt-1">페르소나가 구체적일수록 제품과 마케팅이 효과적입니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-w-[85%]">
          {customers.map(c => (
            <TargetCustomerCard
              key={c.id}
              customer={c}
              onEdit={() => setModal(c)}
              onDelete={() => onDelete(c.id)}
            />
          ))}
          <button
            onClick={() => setModal('add')}
            className="border-2 border-dashed border-neutral-300 rounded-2xl flex items-center justify-center py-10 text-neutral-400 hover:text-neutral-600 hover:border-violet-400 transition-all text-sm"
          >
            + 페르소나 추가
          </button>
        </div>
      )}

      {modal && (
        <TargetCustomerModal
          initial={modal === 'add' ? undefined : modal}
          onSave={data =>
            modal === 'add'
              ? onAdd(data)
              : onUpdate({ ...data, id: (modal as TargetCustomer).id })
          }
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

// ── Branding keywords section ──────────────────────────────────────────────────

function BrandingKeywordsSection({
  keywords, onAdd, onRemove, onGenerate,
}: {
  keywords: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  onGenerate?: () => void;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX = 10;
  const isFull = keywords.length >= MAX;

  const handleAdd = () => {
    const v = input.trim();
    if (!v || isFull) return;
    onAdd(v);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={onGenerate ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'}
          onClick={onGenerate}
          title={onGenerate ? 'AI가 브랜딩 키워드 제안' : undefined}
        >
          <h2 className={`text-sm font-semibold text-neutral-900 ${onGenerate ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>
            브랜딩 키워드
          </h2>
          {onGenerate && (
            <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" />
            </svg>
          )}
        </div>
        <Hint text="브랜드의 성격을 나타내는 형용사 위주로 추가하세요. 예: 따뜻한, 미니멀한, 지속가능한, 신뢰할 수 있는" />
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl px-5 py-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {keywords.map((kw, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-violet-50 text-neutral-700 text-xs font-medium px-3 py-1.5 rounded-full border border-violet-200"
            >
              {kw}
              <button
                onClick={() => onRemove(i)}
                className="text-neutral-600 hover:text-neutral-700 transition-colors leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
          {isFull ? (
            <span className="text-xs text-neutral-400">최대 {MAX}개까지 등록할 수 있습니다</span>
          ) : (
            <input
              ref={inputRef}
              className="flex-1 text-sm text-neutral-800 placeholder-neutral-400 outline-none bg-transparent"
              placeholder="형용사 입력 후 Enter"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          )}
          <span className={`text-xs ml-3 flex-shrink-0 ${keywords.length >= MAX ? 'text-neutral-600 font-medium' : 'text-neutral-700'}`}>
            {keywords.length}/{MAX}
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Brand identity image section ───────────────────────────────────────────────

function BrandImageSection({
  images, onAdd, onRemove,
}: {
  images: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const MAX = 1;
  const isFull = images.length >= MAX;

  const readFiles = (files: File[]) => {
    const remaining = MAX - images.length;
    files.filter(f => f.type.startsWith('image/')).slice(0, remaining).forEach(file => {
      const reader = new FileReader();
      reader.onload = async () => {
        // 업로드 시점에 축소·압축해 저장 (원본 대용량 base64로 저장/동기화되는 것 방지)
        const compressed = await downscaleDataUrl(reader.result as string);
        onAdd(compressed);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    readFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (isFull) return;
    readFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">브랜드 아이덴티티</h2>
          <Hint text="로고 등 브랜드를 대표하는 이미지 1장을 업로드하세요." />
        </div>
      </div>

      <div
        className={`flex flex-wrap gap-2 rounded-xl p-2 transition-colors ${dragging && !isFull ? 'bg-violet-50 ring-2 ring-violet-300 ring-dashed' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {images.map((src, i) => (
          <div key={i} className="relative group w-32 h-32 rounded-xl overflow-hidden bg-neutral-100">
            <img src={src} alt={`brand-${i}`} className="w-full h-full object-cover" />
            <button
              onClick={() => onRemove(i)}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/60 text-neutral-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none hover:bg-white/80"
            >
              ×
            </button>
          </div>
        ))}
        {!isFull && (
          <button
            onClick={() => fileRef.current?.click()}
            className={`w-32 h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${
              dragging ? 'border-violet-400 text-neutral-600' : 'border-neutral-200 text-neutral-700 hover:text-neutral-600 hover:border-violet-300'
            }`}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-xs">{dragging ? '놓기' : '추가'}</span>
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
    </section>
  );
}

// ── Growth stages section (사업 성장 단계) ──────────────────────────────────────

function GrowthStagesSection({
  stages, onAdd, onUpdate, onRemove, onMove, onGenerate, currentIndex = 0, onComplete,
}: {
  stages: GrowthStage[];
  onAdd: (s: GrowthStage) => void;
  onUpdate: (id: string, patch: Partial<GrowthStage>) => void;
  onRemove: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onGenerate?: () => void;
  currentIndex?: number;           // 현재 진행 중인 단계 인덱스 (이보다 앞선 단계 = 달성 완료)
  onComplete?: (index: number) => void; // 해당 단계 달성 처리 (깃발 증정)
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', metric: '', direction: '', projects: '' });

  // 상세 프로젝트 목표: 한 줄에 하나씩 (배열 ↔ 개행 문자열)
  const parseProjects = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

  const startAdd = () => { setDraft({ title: '', metric: '', direction: '', projects: '' }); setAdding(true); setEditingId(null); };
  const startEdit = (s: GrowthStage) => { setDraft({ title: s.title, metric: s.metric, direction: s.direction, projects: (s.projects ?? []).join('\n') }); setEditingId(s.id); setAdding(false); };
  const saveAdd = () => {
    if (!draft.title.trim()) return;
    onAdd({ id: uid(), title: draft.title.trim(), metric: draft.metric.trim(), direction: draft.direction.trim(), projects: parseProjects(draft.projects) });
    setAdding(false);
  };
  const saveEdit = (id: string) => {
    if (!draft.title.trim()) return;
    onUpdate(id, { title: draft.title.trim(), metric: draft.metric.trim(), direction: draft.direction.trim(), projects: parseProjects(draft.projects) });
    setEditingId(null);
  };

  const formFields = (
    <div className="space-y-2.5">
      <input
        autoFocus
        className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 transition-colors"
        placeholder="단계 이름 (예: 1단계 · MVP 검증)"
        value={draft.title}
        onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
      />
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-neutral-400">📈 성장 지표</label>
        <textarea
          rows={2}
          className="w-full resize-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 transition-colors leading-relaxed"
          placeholder="이 단계에서 도달할 지표 (예: 월 매출 1,000만원 · MAU 1만)"
          value={draft.metric}
          onChange={e => setDraft(d => ({ ...d, metric: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-neutral-400">🧭 확장 방향성</label>
        <textarea
          rows={2}
          className="w-full resize-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 transition-colors leading-relaxed"
          placeholder="이 단계에서 확장할 방향 (예: 신규 카테고리 추가, 지역 확장)"
          value={draft.direction}
          onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-neutral-400">📌 상세 프로젝트 목표 <span className="text-neutral-300">(한 줄에 하나씩)</span></label>
        <textarea
          rows={3}
          className="w-full resize-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 transition-colors leading-relaxed"
          placeholder={'이 단계에서 진행할 구체적 프로젝트 목표\n예) 결제 시스템 구축\n예) 첫 100명 고객 확보'}
          value={draft.projects}
          onChange={e => setDraft(d => ({ ...d, projects: e.target.value }))}
        />
      </div>
    </div>
  );

  return (
    <section id="growth-stages" className="scroll-mt-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={onGenerate ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'}
            onClick={onGenerate}
            title={onGenerate ? 'AI가 성장 단계 제안' : undefined}
          >
            <h2 className={`text-sm font-semibold text-neutral-900 ${onGenerate ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>사업 성장 단계</h2>
            {onGenerate && (
              <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" />
              </svg>
            )}
          </div>
          <div onClick={e => e.stopPropagation()}>
            <Hint text="사업이 성장하는 장기 단계를 순서대로 정의하세요. 각 단계마다 도달할 성장 지표와, 그 단계에서 확장할 방향성을 기록합니다." />
          </div>
        </div>
        <button onClick={startAdd} className="text-xs text-neutral-600 hover:text-neutral-900 transition-colors">+ 단계 추가</button>
      </div>

      <div className="relative">
        {stages.length > 1 && <div className="absolute left-[13px] top-3 bottom-3 w-px bg-neutral-200" />}
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={s.id} className="relative">
              {editingId === s.id ? (
                <div className="bg-white border border-violet-300 ring-2 ring-violet-400 rounded-xl px-4 py-3 ml-9">
                  {formFields}
                  <div className="flex gap-3 pt-2 mt-2 border-t border-neutral-100">
                    <button onClick={() => saveEdit(s.id)} className="text-xs text-neutral-700 hover:text-neutral-900 font-medium transition-colors">저장</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">취소</button>
                    <button onClick={() => { onRemove(s.id); setEditingId(null); }} className="text-xs text-neutral-700 hover:text-red-400 transition-colors ml-auto">삭제</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 group/stage">
                  {/* 단계 번호 + 순서 조정 */}
                  <div className="flex flex-col items-center flex-shrink-0 z-10">
                    <span className="w-[27px] h-[27px] rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center ring-4 ring-white">{i + 1}</span>
                    <div className="flex flex-col items-center mt-1 opacity-0 group-hover/stage:opacity-100 transition-opacity">
                      <button onClick={() => onMove(i, -1)} disabled={i === 0} className="w-4 h-3.5 flex items-center justify-center text-neutral-300 hover:text-neutral-600 disabled:opacity-0 transition-colors">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <button onClick={() => onMove(i, 1)} disabled={i === stages.length - 1} className="w-4 h-3.5 flex items-center justify-center text-neutral-300 hover:text-neutral-600 disabled:opacity-0 transition-colors">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 bg-white border border-neutral-200 rounded-xl px-4 py-3">
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-semibold text-neutral-900 flex-1 leading-relaxed">{s.title}</p>
                      {onComplete && i < currentIndex && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-0.5" style={{ color: '#3E6B1F', backgroundColor: '#EAF7DD' }} title="달성 완료">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>달성
                        </span>
                      )}
                      <button onClick={() => startEdit(s)} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors opacity-0 group-hover/stage:opacity-100 flex-shrink-0">수정</button>
                    </div>
                    {s.metric && (
                      <p className="text-xs text-neutral-600 leading-relaxed mt-1.5">
                        <span className="text-neutral-400 font-medium mr-1">📈 지표</span>{s.metric}
                      </p>
                    )}
                    {s.direction && (
                      <p className="text-xs text-neutral-600 leading-relaxed mt-1">
                        <span className="text-neutral-400 font-medium mr-1">🧭 방향</span>{s.direction}
                      </p>
                    )}
                    {(s.projects?.length ?? 0) > 0 && (
                      <div className="mt-2 pt-2 border-t border-neutral-100">
                        <p className="text-[11px] font-medium text-neutral-400 mb-1">📌 프로젝트 목표</p>
                        <ul className="space-y-0.5">
                          {s.projects!.map((pj, pi) => (
                            <li key={pi} className="text-xs text-neutral-700 leading-relaxed flex items-start gap-1.5">
                              <span className="text-neutral-300 mt-0.5">•</span>
                              <span className="flex-1">{pj}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {onComplete && i === currentIndex && (
                      <div className="mt-2.5 pt-2.5 border-t border-neutral-100">
                        <button
                          onClick={() => onComplete(i)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 transition-colors"
                          title="이 단계를 달성하고 여정 깃발 받기"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 1v10M3 2h6l-1.4 1.9L9 5.8H3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          단계 완료
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {adding ? (
            <div className="bg-white border border-violet-300 ring-2 ring-violet-400 rounded-xl px-4 py-3 ml-9">
              {formFields}
              <div className="flex gap-3 pt-2 mt-2 border-t border-neutral-100">
                <button onClick={saveAdd} className="text-xs text-neutral-700 hover:text-neutral-900 font-medium transition-colors">추가</button>
                <button onClick={() => setAdding(false)} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">취소</button>
              </div>
            </div>
          ) : (
            stages.length === 0 && (
              <button onClick={startAdd} className="w-full py-2.5 rounded-xl border-2 border-dashed border-neutral-200 text-xs text-neutral-400 hover:text-neutral-600 hover:border-violet-300 transition-all">
                + 첫 번째 성장 단계 추가
              </button>
            )
          )}
        </div>
      </div>
    </section>
  );
}

// ── Work areas section (업무 영역별 목표) ────────────────────────────────────────

const DEFAULT_WORK_AREAS = ['기획', '디자인', '개발', '마케팅', '운영'];

function WorkAreasSection({
  areas, onAdd, onUpdate, onRemove, onGenerate,
}: {
  areas: WorkArea[];
  onAdd: (a: WorkArea) => void;
  onUpdate: (id: string, patch: Partial<WorkArea>) => void;
  onRemove: (id: string) => void;
  onGenerate?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(BUSINESS_COLORS[0]);
  const [goal, setGoal] = useState('');

  const nextColor = () => BUSINESS_COLORS[areas.length % BUSINESS_COLORS.length];

  const startAdd = () => { setName(''); setColor(nextColor()); setGoal(''); setAdding(true); setEditingId(null); };
  const startEdit = (a: WorkArea) => { setName(a.name); setColor(a.color); setGoal(a.goal); setEditingId(a.id); setAdding(false); };
  const saveAdd = () => {
    if (!name.trim()) return;
    onAdd({ id: uid(), name: name.trim(), color, goal: goal.trim() });
    setAdding(false);
  };
  const saveEdit = (id: string) => {
    if (!name.trim()) return;
    onUpdate(id, { name: name.trim(), color, goal: goal.trim() });
    setEditingId(null);
  };
  const quickAdd = (label: string) => {
    onAdd({ id: uid(), name: label, color: BUSINESS_COLORS[areas.length % BUSINESS_COLORS.length], goal: '' });
  };

  const editForm = (onSave: () => void, onCancel: () => void, isAdd: boolean) => (
    <div className="space-y-2.5">
      <input
        autoFocus
        className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 transition-colors"
        placeholder="영역 이름 (예: 디자인)"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <textarea
        rows={2}
        className="w-full resize-none bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 outline-none focus:border-violet-400 transition-colors leading-relaxed"
        placeholder="이 영역의 목표 (예: 일관된 브랜드 경험 구축)"
        value={goal}
        onChange={e => setGoal(e.target.value)}
      />
      <div className="flex gap-3 pt-1 border-t border-neutral-100">
        <button onClick={onSave} className="text-xs text-neutral-700 hover:text-neutral-900 font-medium transition-colors">{isAdd ? '추가' : '저장'}</button>
        <button onClick={onCancel} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">취소</button>
      </div>
    </div>
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={onGenerate ? 'flex items-center gap-1 cursor-pointer group' : 'flex items-center'}
            onClick={onGenerate}
            title={onGenerate ? 'AI가 업무 영역 제안' : undefined}
          >
            <h2 className={`text-sm font-semibold text-neutral-900 ${onGenerate ? 'group-hover:text-neutral-700 transition-colors' : ''}`}>업무 영역별 목표</h2>
            {onGenerate && (
              <svg className="w-3 h-3 text-neutral-500 group-hover:text-neutral-600 transition-colors ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" />
              </svg>
            )}
          </div>
          <div onClick={e => e.stopPropagation()}>
            <Hint text="사업을 만들어가는 데 필요한 업무 영역(디자인·기획·마케팅·개발 등)을 나누고, 각 영역의 목표를 설정하세요. 이후 업무를 이 영역에 맞춰 관리할 수 있습니다." />
          </div>
        </div>
        <button onClick={startAdd} className="text-xs text-neutral-600 hover:text-neutral-900 transition-colors">+ 영역 추가</button>
      </div>

      {areas.length === 0 && !adding ? (
        <div className="bg-white border border-neutral-200 rounded-xl px-5 py-6">
          <p className="text-sm text-neutral-400 mb-3">업무 영역을 나눠 각 영역의 목표를 설정하세요</p>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_WORK_AREAS.map(label => (
              <button
                key={label}
                onClick={() => quickAdd(label)}
                className="flex items-center gap-1.5 text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 hover:border-violet-300 hover:bg-violet-50 rounded-full px-3 py-1.5 transition-colors"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {areas.map(a => (
            <div
              key={a.id}
              className={`bg-white border rounded-xl px-4 py-3 transition-all ${editingId === a.id ? 'ring-2 ring-violet-400 border-violet-300 col-span-2' : 'border-neutral-200'}`}
            >
              {editingId === a.id ? (
                editForm(() => saveEdit(a.id), () => setEditingId(null), false)
              ) : (
                <div className="group/area">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900 flex-1 truncate">{a.name}</p>
                    <button onClick={() => startEdit(a)} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors opacity-0 group-hover/area:opacity-100 flex-shrink-0">수정</button>
                    <button onClick={() => onRemove(a.id)} className="text-neutral-300 hover:text-red-500 text-xs transition-colors opacity-0 group-hover/area:opacity-100 flex-shrink-0">×</button>
                  </div>
                  <p className={`text-xs leading-relaxed mt-1.5 ${a.goal ? 'text-neutral-600' : 'text-neutral-300'}`}>
                    {a.goal || '목표 미설정'}
                  </p>
                </div>
              )}
            </div>
          ))}

          {adding && (
            <div className="bg-white border border-violet-300 ring-2 ring-violet-400 rounded-xl px-4 py-3 col-span-2">
              {editForm(saveAdd, () => setAdding(false), true)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Image downscaling ──────────────────────────────────────────────────────────
// 업로드한 브랜드 이미지가 원본(수 MB base64)으로 저장되면 저장/동기화가 무거워지고,
// 특히 '문서 저장' 시 이 거대한 base64들을 한 HTML에 전부 인라인해 새 탭에서 디코딩하느라
// 브라우저 전체가 렉이 걸린다. 캔버스로 축소·재인코딩해 용량을 크게 줄인다.
// PDF 첫 페이지를 렌더해 작은 JPEG 썸네일 dataURL로 반환 (실패 시 null)
async function renderPdfThumb(dataUrl: string, maxW = 260): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const pdfjs = await import('pdfjs-dist');
    // public/ 에 복사해 둔 ESM 워커를 절대경로로 로드 (번들러 의존 없이 확실히 로드)
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const b64 = dataUrl.split(',')[1] ?? '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxW / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) { await loadingTask.destroy(); return null; }
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.72);
    await loadingTask.destroy();
    return url;
  } catch {
    return null;
  }
}

async function downscaleDataUrl(dataUrl: string, maxDim = 1400, forceJpeg = false): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image')) return dataUrl;
  const isPng = dataUrl.startsWith('data:image/png');
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(w0, h0));
      // 이미 충분히 작으면(축소 불필요 + 저용량) 원본 유지
      if (scale >= 1 && dataUrl.length < 300_000) { resolve(dataUrl); return; }
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      // PNG(투명 로고 등)는 형식 유지, 그 외/강제 시 JPEG로 압축
      const out = (!forceJpeg && isPng) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
      resolve(out.length < dataUrl.length ? out : dataUrl); // 더 커지면 원본 유지
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Print document builder ─────────────────────────────────────────────────────

function buildPrintHtml(plan: PlanData, brandName: string): string {
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  const str = (v: string | undefined) => v?.trim() ?? '';
  const arr = (v: string[] | undefined) => v?.filter(Boolean) ?? [];

  const listItems = (items: string[]) =>
    items.map(i => `<li>${i}</li>`).join('');

  const imagesHtml = plan.brandImages?.length
    ? `<div class="img-grid">${plan.brandImages.map(s => `<img src="${s}" alt="" />`).join('')}</div>`
    : '';

  const keywordsHtml = arr(plan.brandingKeywords).length
    ? `<div class="keywords">${plan.brandingKeywords.map(k => `<span class="keyword">${k}</span>`).join('')}</div>`
    : '';

  const vp = plan.valueProposition;
  const vpHtml = (vp?.personal || vp?.social || vp?.environmental)
    ? `<div class="vp-grid">
        ${vp.personal ? `<div class="vp-card"><div class="vp-label">개인적 가치</div><p>${vp.personal}</p></div>` : ''}
        ${vp.social ? `<div class="vp-card"><div class="vp-label">사회적 가치</div><p>${vp.social}</p></div>` : ''}
        ${vp.environmental ? `<div class="vp-card"><div class="vp-label">환경적 가치</div><p>${vp.environmental}</p></div>` : ''}
      </div>` : '';

  const customersHtml = plan.targetCustomers?.length
    ? `<div class="customer-grid">${plan.targetCustomers.map(c => `
        <div class="customer-card">
          <div class="customer-name">${c.name}</div>
          ${c.occupation ? `<div class="customer-meta">${c.occupation}${c.age ? ` · ${c.age}` : ''}</div>` : ''}
          ${c.personality ? `<div class="customer-tag">${c.personality}</div>` : ''}
          ${c.lifestyle ? `<div class="customer-tag lifestyle">${c.lifestyle}</div>` : ''}
          ${c.notes ? `<p class="customer-notes">${c.notes}</p>` : ''}
        </div>`).join('')}</div>` : '';

  const stagesHtml = plan.growthStages?.length
    ? plan.growthStages.map((s, i) => `
        <div class="stage">
          <div class="stage-num">${i + 1}</div>
          <div class="stage-body">
            <div class="stage-title">${s.title}</div>
            ${s.metric ? `<div class="stage-line"><b>지표</b>${s.metric}</div>` : ''}
            ${s.direction ? `<div class="stage-line"><b>방향</b>${s.direction}</div>` : ''}
            ${s.projects?.length ? `<ul style="margin-top:4px">${s.projects.map(pj => `<li style="font-size:12px;color:#5B6560">${pj}</li>`).join('')}</ul>` : ''}
          </div>
        </div>`).join('')
    : '';

  const areasHtml = plan.workAreas?.length
    ? `<div class="area-grid">${plan.workAreas.map(a => `
        <div class="area-card">
          <div class="area-name">${a.name}</div>
          ${a.goal ? `<div class="area-goal">${a.goal}</div>` : ''}
        </div>`).join('')}</div>`
    : '';

  const sec = (title: string, content: string) =>
    content.trim() ? `<section><h2>${title}</h2>${content}</section>` : '';

  const textBlock = (v: string) => v ? `<p>${v}</p>` : '';
  const listBlock = (items: string[]) => items.length ? `<ul>${listItems(items)}</ul>` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${brandName || 'Plan'} — 사업 기획서</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'SUIT Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif; font-size: 14px; color: #16211E; background: #F8F8F8; padding: 56px 60px; max-width: 880px; margin: 0 auto; line-height: 1.7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { border-bottom: 2px solid #E7E7E1; padding-bottom: 24px; margin-bottom: 40px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  header .logo { width: 34px; flex-shrink: 0; margin-top: 6px; }
  header .header-text { flex: 1; }
  header h1 { font-size: 30px; font-weight: 900; color: #16211E; letter-spacing: -0.02em; margin-bottom: 6px; }
  header .tagline { font-size: 15px; color: #5B6560; }
  header .date { font-size: 12px; color: #9AA39D; margin-top: 10px; }
  section { margin-bottom: 34px; page-break-inside: avoid; }
  h2 { font-size: 15px; font-weight: 800; color: #16211E; letter-spacing: -0.01em; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #E7E7E1; }
  p { color: #44514B; margin-bottom: 6px; }
  ul { padding-left: 18px; color: #44514B; }
  ul li { margin-bottom: 5px; }
  ul li strong { color: #16211E; font-weight: 700; }
  .img-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 8px; }
  .img-grid img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 14px; }
  .keywords { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .keyword { background: #DFF9C4; color: #3E6B1F; border: none; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.01em; }
  .vp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .vp-card { background: #fff; border: 1px solid #EDEDE6; border-top: 3px solid #9DFE3B; border-radius: 16px; padding: 16px 18px; }
  .vp-label { font-size: 11px; font-weight: 800; color: #5B6560; letter-spacing: 0.04em; margin-bottom: 8px; }
  .vp-card p { font-size: 13px; color: #44514B; margin: 0; }
  .customer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .customer-card { background: #fff; border: 1px solid #EDEDE6; border-radius: 18px; padding: 16px; }
  .customer-name { font-size: 15px; font-weight: 800; color: #16211E; margin-bottom: 3px; letter-spacing: -0.01em; }
  .customer-meta { font-size: 12px; color: #9AA39D; margin-bottom: 10px; }
  .customer-tag { display: inline-block; background: #F1F1EB; color: #5B6560; border-radius: 999px; padding: 3px 11px; font-size: 11px; font-weight: 600; margin: 2px 3px 2px 0; }
  .customer-tag.lifestyle { background: #DFF9C4; color: #3E6B1F; }
  .customer-notes { font-size: 13px; color: #5B6560; margin-top: 10px; }
  .stage { display: flex; gap: 14px; margin-bottom: 14px; align-items: flex-start; }
  .stage-num { width: 26px; height: 26px; border-radius: 50%; background: #16211E; color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .stage-body { flex: 1; }
  .stage-title { font-size: 15px; font-weight: 700; color: #16211E; margin-bottom: 4px; }
  .stage-line { font-size: 13px; color: #44514B; margin: 2px 0; }
  .stage-line b { color: #16211E; font-weight: 700; margin-right: 4px; }
  .area-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .area-card { background: #fff; border: 1px solid #EDEDE6; border-left: 4px solid #16211E; border-radius: 14px; padding: 12px 14px; }
  .area-name { font-size: 14px; font-weight: 700; color: #16211E; margin-bottom: 4px; }
  .area-goal { font-size: 13px; color: #5B6560; }
  @media print {
    body { padding: 20px 28px; background: #fff; }
    section { page-break-inside: avoid; }
    .img-grid img { max-height: 150px; }
    .print-btn { display: none; }
  }
  @media screen {
    .print-btn { position: fixed; top: 24px; right: 24px; background: #9DFE3B; color: #16211E; border: none; padding: 11px 22px; border-radius: 999px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 6px 20px rgba(157,254,59,0.4); }
    .print-btn:hover { filter: brightness(0.97); }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>
<header>
  <div class="header-text">
    <h1>${brandName || '사업 기획서'}</h1>
    ${str(plan.tagline) ? `<div class="tagline">${plan.tagline}</div>` : ''}
    <div class="date">${date}</div>
  </div>
  <svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 31 34" fill="none"><path fill="#002929" d="M30.2597 32.7575L29.468 27.8251C29.4301 27.5827 29.3695 27.1887 29.3429 26.9463C29.2217 25.931 28.5247 21.9116 25.0508 19.775C24.2666 19.2939 23.346 18.9037 22.2512 18.6726L9.53387 16.2253C8.95047 16.1117 8.37465 15.9677 7.82155 15.7556C6.1206 15.1116 4.81363 14.0811 4.81363 12.3309C4.81363 9.64883 6.79113 8.92526 8.20417 8.81919L13.4851 8.77373C16.6256 8.77373 19.1789 11.327 19.1789 14.4676H22.2588C22.2588 11.3233 24.8083 8.77373 27.9526 8.77373V5.69383C24.8083 5.69383 22.2588 3.1443 22.2588 0H19.1789C19.1789 3.14051 16.6256 5.69383 13.4851 5.69383H8.24205C6.93509 5.69383 5.6357 5.97038 4.47647 6.57651C2.83614 7.43266 1.08594 9.09194 1.08594 12.2893C1.08594 16.4526 4.0143 18.2634 7.52228 19.0969C10.9204 19.9038 13.5874 20.6917 13.5874 20.6917C13.5874 20.6917 15.2959 21.0441 16.9173 22.1806C18.372 23.2034 19.7585 24.8665 19.7585 27.488V32.9242C19.7585 33.5152 20.2396 33.9963 20.8306 33.9963H29.2028C29.8619 33.9963 30.3658 33.4053 30.2597 32.7537V32.7575ZM20.7207 4.9589C21.3345 5.84915 22.1073 6.62197 22.9975 7.23567C22.1073 7.84938 21.3345 8.62219 20.7207 9.51245C20.107 8.62219 19.3342 7.84938 18.444 7.23567C19.3342 6.62197 20.107 5.84915 20.7207 4.9589Z"/><path fill="#002929" d="M11.936 22.8624L3.40469 21.1009C3.25694 21.0668 3.09783 21.1198 3.00692 21.241C1.27566 23.5595 0.862732 27.1811 0.862732 27.1811L0.01415 32.7575C-0.0919227 33.4091 0.411923 34 1.07109 34H10.2502C10.8411 34 11.3223 33.5189 11.3223 32.928L11.2844 28.7002C11.2692 26.9538 11.5382 25.2187 12.1178 23.5708C12.1254 23.5481 12.133 23.5254 12.1443 23.5026C12.2428 23.2261 12.2239 22.9344 11.9398 22.8662L11.936 22.8624Z"/></svg>
</header>

${imagesHtml ? sec('브랜드 아이덴티티', imagesHtml) : ''}
${keywordsHtml ? sec('브랜딩 키워드', keywordsHtml) : ''}
${sec('문제 정의', listBlock(arr(plan.problems)))}
${sec('미션', textBlock(str(plan.mission)))}
${sec('비전', textBlock(str(plan.vision)))}
${sec('컨셉', textBlock(str(plan.concept)))}
${vpHtml ? sec('핵심 가치 제안', vpHtml) : ''}
${customersHtml ? sec('타겟 고객', customersHtml) : ''}
${sec('솔루션 / 제품', (plan.solutions ?? []).length
    ? `<ul>${plan.solutions.map(s => `<li><strong>${s.title}</strong>${s.memo ? `<br><span style="color:#5B6560;font-size:12px">${s.memo}</span>` : ''}</li>`).join('')}</ul>`
    : '')}
${stagesHtml ? sec('사업 성장 단계', stagesHtml) : ''}
${areasHtml ? sec('업무 영역별 목표', areasHtml) : ''}
${sec('수익 구조', (plan.revenueModel ?? []).length
    ? `<ul>${plan.revenueModel.map(r => `<li><strong>${r.title}</strong>${r.memo ? `<br><span style="color:#5B6560;font-size:12px">${r.memo}</span>` : ''}</li>`).join('')}</ul>`
    : '')}
</body>
</html>`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

const HINTS: Record<string, string> = {
  tagline: '한 문장으로 브랜드가 무엇을 하는지, 누구를 위한 것인지 설명하세요. 예: "1인 창업가를 위한 사업 운영 OS"',
  problems: '이 사업이 해결하려는 고객의 핵심 문제를 구체적으로 정의하세요. 문제가 명확할수록 솔루션도 명확해집니다.',
  mission: '우리 조직이 존재하는 이유와 매일 달성하려는 목적입니다. 예: "창업가들이 사업에만 집중할 수 있도록 돕는다"',
  vision: '5~10년 후 우리가 만들고 싶은 세계의 모습입니다. 예: "모든 1인 창업가가 대기업처럼 운영되는 세상"',
  concept: '브랜드의 핵심 아이디어, 방향성, 감성을 설명하세요. 어떤 경험을 전달하고 싶은지 표현하세요.',
  valueProposition: '고객이 우리를 선택해야 하는 이유를 개인적·사회적·환경적 관점에서 설명하세요.',
  targetCustomers: '우리 제품을 사용할 핵심 고객을 페르소나로 구체적으로 설명하세요. 페르소나가 명확할수록 마케팅과 제품이 효과적입니다.',
  solutions: '고객의 문제를 해결하기 위해 제공하는 구체적인 솔루션이나 제품을 설명하세요.',
  revenueModel: '어떤 방식으로 수익을 창출하는지 설명하세요. 예: 구독, 거래 수수료, 광고, B2B 라이선스 등',
  products: '이 사업에서 판매·출시하는 것을 항목별로 정리하세요. 예: 웹앱, 아이패드 전용 앱, 휴대폰 앱, 굿즈 등',
};

// 업종 카테고리 (사업 개요) — AI가 업종에 맞는 목표/전략을 제안하도록 컨텍스트로 사용
const BIZ_CATEGORIES = ['서비스', '콘텐츠/크리에이터', '스튜디오', '자영업/매장', '커머스/쇼핑몰', '앱/온라인 서비스', '프리랜서', '교육/클래스', '제조/공방', '컨설팅', '기타'];

// ── 상단 박스: 사업계획서 업로드 또는 사업 개요 직접 작성 ──────────────────────────
function BusinessDocBox({
  doc, overview, onSetDoc, onRemoveDoc, onChangeOverview, onGenerateField, aiEnabled, analyzing,
}: {
  doc?: PlanDoc;
  overview?: BusinessOverview;
  onSetDoc: (d: PlanDoc) => void;
  onRemoveDoc: () => void;
  onChangeOverview: (o: BusinessOverview) => void;
  onGenerateField?: (field: keyof BusinessOverview) => void;
  aiEnabled?: boolean;
  analyzing?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ov: BusinessOverview = overview ?? { tagline: '', concept: '', problem: '', solution: '', mission: '', vision: '' };
  const set = (patch: Partial<BusinessOverview>) => onChangeOverview({ ...ov, ...patch });

  const MAX_BYTES = 4 * 1024 * 1024; // 4MB
  const handleFile = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { alert('파일이 너무 커요(최대 4MB). 더 작은 파일을 올려주세요.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const thumbDataUrl = isPdf ? (await renderPdfThumb(dataUrl)) ?? undefined : undefined;
      onSetDoc({ name: file.name, dataUrl, type: file.type, thumbDataUrl });
    };
    reader.readAsDataURL(file);
  };
  const isImg = !!doc?.type?.startsWith('image/');
  const thumb = doc?.thumbDataUrl || (isImg ? doc?.dataUrl : undefined); // 실제 미리보기 이미지

  const OV_FIELDS: { key: keyof BusinessOverview; label: string; ph: string; hint: string }[] = [
    { key: 'tagline', label: '한 줄 소개', ph: '사업을 한 문장으로 소개', hint: '이 사업이 무엇인지 한 문장으로 설명하는 슬로건이에요.' },
    { key: 'concept', label: '컨셉', ph: '브랜드의 핵심 컨셉과 방향성', hint: '브랜드의 핵심 아이디어·방향성·감성을 설명하세요. 어떤 경험을 전달하고 싶은지 표현하세요.' },
    { key: 'problem', label: '문제 정의', ph: '해결하려는 핵심 문제', hint: '고객이 겪는 핵심 문제를 구체적으로 정의하세요. 문제가 명확할수록 솔루션도 명확해져요.' },
    { key: 'solution', label: '솔루션', ph: '그 문제를 어떻게 해결하는지', hint: '정의한 문제를 어떻게 해결하는지, 제공하는 제품/서비스를 설명하세요.' },
    { key: 'mission', label: '미션', ph: '우리가 존재하는 이유', hint: '우리 조직이 존재하는 이유와 매일 달성하려는 목적이에요.' },
    { key: 'vision', label: '비전', ph: '궁극적으로 이루려는 모습', hint: '5~10년 후 이 사업으로 만들고 싶은 세상의 모습이에요.' },
  ];

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 sm:p-6">
      {/* 헤더: 제목 + (우) 작은 사업계획서 업로드 버튼 / 썸네일 */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-neutral-900">사업 개요</h2>
          <p className="text-[12px] text-neutral-400 mt-0.5">사업계획서를 올리거나, 아래 항목을 직접 채워보세요.</p>
        </div>
        {doc ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={doc.dataUrl} target="_blank" rel="noreferrer" download={doc.name} title={`${doc.name} · 열기`}
               className="relative block w-16 h-16 rounded-xl overflow-hidden border border-neutral-200 flex-shrink-0 bg-white">
              {thumb ? (
                <img src={thumb} alt={doc.name} className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-violet-500" style={{ backgroundColor: '#F3F0FF' }}>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                  <span className="text-[9px] font-bold leading-none">{/\.pdf$/i.test(doc.name) ? 'PDF' : (doc.name.split('.').pop() || 'DOC').slice(0, 4).toUpperCase()}</span>
                </span>
              )}
            </a>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => fileRef.current?.click()} className="text-[11px] text-neutral-500 hover:text-neutral-800 transition-colors text-left">교체</button>
              <button onClick={onRemoveDoc} className="text-[11px] text-neutral-400 hover:text-red-500 transition-colors text-left">삭제</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} title="사업계획서 업로드 (최대 4MB)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 bg-white text-[12px] font-semibold text-neutral-600 hover:border-violet-300 hover:text-violet-600 transition-colors flex-shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            사업계획서
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />

      {/* 업로드 직후 자동 분석 진행 표시 */}
      {analyzing && (
        <div className="w-full mb-4 py-2 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5" style={{ backgroundColor: '#EEF7E4', color: '#3E7A2E' }}>
          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />사업계획서 분석해 채우는 중…
        </div>
      )}

      {/* 업종 카테고리 (드롭다운) */}
      <div className="mb-3 flex items-center gap-2">
        <label className="text-[11px] font-semibold text-neutral-400 flex-shrink-0">업종</label>
        <select value={ov.category ?? ''} onChange={e => set({ category: e.target.value })}
          className="bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-700 outline-none focus:border-violet-400">
          <option value="">업종 선택</option>
          {BIZ_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OV_FIELDS.map(f => (
          <div key={f.key} className="bg-white border border-neutral-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[11px] font-semibold text-neutral-400">{f.label}</label>
              {onGenerateField && aiEnabled && (
                <button onClick={() => onGenerateField(f.key)} data-teach="plan-fill" title="AI가 이 항목 채우기" className="text-violet-400 hover:text-violet-600 transition-colors">
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>
                </button>
              )}
              <Hint text={f.hint} />
            </div>
            <AutoTextarea value={ov[f.key] ?? ''} onChange={v => set({ [f.key]: v } as Partial<BusinessOverview>)} placeholder={f.ph} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 인라인 추가 입력(사업목표/산출물 공통)
function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [v, setV] = useState('');
  const submit = () => { const n = v.trim(); if (!n) return; onAdd(n); setV(''); };
  return (
    <div className="flex items-center gap-2">
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder={placeholder} className="flex-1 bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400" />
      <button onClick={submit} disabled={!v.trim()} className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-neutral-900 text-white disabled:opacity-30 transition-opacity flex-shrink-0">추가</button>
    </div>
  );
}

// ── 중첩 사업 목표: 사업목표(1) > 산출물(2) > 업무영역별 산출물(3) — 접이식(아코디언) ──────
// 상태 배지 메타
const GOAL_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: '예정', color: '#8A938A', bg: '#F0F0EA' },
  active: { label: '진행 중', color: '#3E7A2E', bg: '#EAF7DE' },
  done: { label: '완료', color: '#5B6560', bg: '#E7E7E1' },
  onhold: { label: '보류', color: '#C24B4B', bg: '#FCEBEB' },
};
const fmtNum = (n?: number) => (n === undefined ? '' : n.toLocaleString('ko-KR'));
const dateShort = (d?: string) => (d ? d.slice(2).replace(/-/g, '.') : '');

// 성과 지표 입력 주기 → 이번 주기의 키 (기록 이력 누적용)
const PERIOD_OPTS = ['일', '주', '월', '분기', '연'];
function periodKeyOf(period: string, d = new Date()): string {
  const y = d.getFullYear(); const m = d.getMonth();
  switch (period) {
    case '일': return `${y}-${String(m + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    case '주': { const jan1 = new Date(y, 0, 1); const wk = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7); return `${y}-W${String(wk).padStart(2, '0')}`; }
    case '분기': return `${y}-Q${Math.floor(m / 3) + 1}`;
    case '연': return `${y}`;
    case '월': default: return `${y}-${String(m + 1).padStart(2, '0')}`;
  }
}
// 성과 지표 추이 미니 라인 차트 (단일 계열, 시간축 — 브랜드 그린 한 색, 목표선은 점선)
// 성과 지표 다중 시리즈 추이 그래프. 전체 보기(목표 대비 %로 정규화, 단일 축)에서 하나 클릭 시 그 지표만 실제 수치로.
// 카테고리 색상은 dataviz 검증 팔레트(고정 순서). 지표별로 색이 고정됨.
const METRIC_CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
function MetricsChart({ metrics, focusId, onFocus }: {
  metrics: SuccessCriterion[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const shortP = (p: string) => p.replace(/^\d{4}-/, '');
  const series = metrics.map((m, i) => ({
    m, color: METRIC_CAT[i % METRIC_CAT.length],
    hist: (m.history ?? []).slice().sort((a, b) => a.period < b.period ? -1 : 1),
  }));
  const withData = series.filter(s => s.hist.length > 0);
  const focus = focusId ? series.find(s => s.m.id === focusId) ?? null : null;
  const shown = focus ? [focus] : withData;
  // 공유 시간축: 표시 중인 시리즈의 모든 기록 주기(키)를 합집합·정렬
  const periods = Array.from(new Set(shown.flatMap(s => s.hist.map(h => h.period)))).sort();
  const W = 560, H = 190, padL = 8, padR = 8, padT = 14, padB = 24;
  const xOf = (p: string) => periods.length <= 1 ? (W - padL - padR) / 2 + padL : padL + periods.indexOf(p) * ((W - padL - padR) / (periods.length - 1));

  // y 스케일: 포커스면 실제 수치(+목표 점선), 전체면 목표(없으면 자기 최대) 대비 %
  const isFocus = !!focus;
  let yMax: number, yMin: number, targetLine: number | undefined;
  if (isFocus && focus) {
    const vals = focus.hist.map(h => h.value);
    const t = focus.m.targetValue;
    const ys = t !== undefined ? [...vals, t] : vals;
    yMax = Math.max(...ys); yMin = Math.min(...ys, 0); targetLine = t;
  } else {
    const norms = shown.flatMap(s => { const d = (s.m.targetValue && s.m.targetValue > 0) ? s.m.targetValue : Math.max(...s.hist.map(h => h.value), 1); return s.hist.map(h => (h.value / d) * 100); });
    yMax = Math.max(...norms, 100); yMin = 0; targetLine = 100;
  }
  const range = yMax - yMin || 1;
  const yOf = (v: number) => H - padB - ((v - yMin) / range) * (H - padT - padB);
  const normVal = (s: typeof series[number], v: number) => { const d = (s.m.targetValue && s.m.targetValue > 0) ? s.m.targetValue : Math.max(...s.hist.map(h => h.value), 1); return (v / d) * 100; };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 190 }}>
        {/* 목표 기준선 (전체=100%, 포커스=목표값) */}
        {targetLine !== undefined && targetLine >= yMin && targetLine <= yMax && (
          <>
            <line x1={padL} x2={W - padR} y1={yOf(targetLine)} y2={yOf(targetLine)} stroke="#C4CCC4" strokeWidth="1" strokeDasharray="3 3" />
            <text x={W - padR} y={yOf(targetLine) - 3} textAnchor="end" className="fill-neutral-400" style={{ fontSize: 9 }}>목표{isFocus ? '' : ' 100%'}</text>
          </>
        )}
        {shown.map(s => {
          const pts = s.hist;
          const path = pts.map((h, i) => `${i === 0 ? 'M' : 'L'}${xOf(h.period).toFixed(1)},${yOf(isFocus ? h.value : normVal(s, h.value)).toFixed(1)}`).join(' ');
          return (
            <g key={s.m.id}>
              {pts.length > 1 && <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {pts.map((h, i) => (
                <circle key={i} cx={xOf(h.period)} cy={yOf(isFocus ? h.value : normVal(s, h.value))} r="3" fill={s.color}>
                  <title>{s.m.name} · {shortP(h.period)} · {h.value.toLocaleString('ko-KR')}{s.m.unit ?? ''}{isFocus ? '' : ` (${Math.round(normVal(s, h.value))}%)`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* x축 라벨: 처음·마지막 주기 */}
        {periods.length > 0 && (
          <>
            <text x={padL} y={H - 6} className="fill-neutral-400 tabular-nums" style={{ fontSize: 9 }}>{shortP(periods[0])}</text>
            {periods.length > 1 && <text x={W - padR} y={H - 6} textAnchor="end" className="fill-neutral-400 tabular-nums" style={{ fontSize: 9 }}>{shortP(periods[periods.length - 1])}</text>}
          </>
        )}
      </svg>
      {/* 범례(클릭해서 하나만 보기) */}
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {series.map(s => {
          const active = !focusId || focusId === s.m.id;
          const empty = s.hist.length === 0;
          return (
            <button key={s.m.id} onClick={() => onFocus(focusId === s.m.id ? null : s.m.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-semibold transition-all ${active ? 'border-neutral-200 bg-white' : 'border-transparent bg-transparent opacity-40'}`}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className={empty ? 'text-neutral-400' : 'text-neutral-700'}>{s.m.name || '(이름 없음)'}</span>
              {empty && <span className="text-neutral-300 text-[9px]">기록 없음</span>}
            </button>
          );
        })}
      </div>
      {focusId && <p className="text-[10px] text-neutral-400 mt-1">지표를 다시 누르면 전체 보기로 돌아가요.</p>}
      {!isFocus && <p className="text-[10px] text-neutral-400 mt-1">전체 보기는 목표(없으면 최고 기록) 대비 <b>%</b>로 겹쳐 보여줘요.</p>}
    </div>
  );
}
// 성과 지표 카드 — 목표 설정 + 주기별 기록 입력 + 누적 추이(그래프). 반응형 그리드 셀에 들어감
function MetricRow({ c, onPatch, onDel, inputCls }: {
  c: SuccessCriterion;
  onPatch: (p: Partial<SuccessCriterion>) => void;
  onDel: () => void;
  inputCls: string;
}) {
  const [logVal, setLogVal] = useState('');
  const period = c.measurementPeriod || '월';
  const hist = c.history ?? [];
  const doLog = () => {
    if (logVal === '') return; const v = Number(logVal); if (!Number.isFinite(v)) return;
    const key = periodKeyOf(period);
    const next = [...hist.filter(h => h.period !== key), { period: key, value: v }].sort((a, b) => a.period < b.period ? -1 : 1);
    onPatch({ history: next, currentValue: v });
    setLogVal('');
  };
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <input value={c.name} onChange={e => onPatch({ name: e.target.value })} placeholder="지표 (예: 월 매출)" className={`flex-1 min-w-0 font-semibold ${inputCls}`} />
        <button onClick={onDel} className="text-neutral-300 hover:text-red-500 text-sm transition-colors flex-shrink-0">×</button>
      </div>
      <div className="flex items-center gap-1 flex-wrap text-[11px]">
        <span className="text-neutral-400 flex-shrink-0">목표</span>
        <input type="number" value={c.targetValue ?? ''} onChange={e => onPatch({ targetValue: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="목표" className={`flex-1 min-w-[3rem] ${inputCls}`} />
        <input value={c.unit ?? ''} onChange={e => onPatch({ unit: e.target.value })} placeholder="단위" className={`w-12 flex-shrink-0 ${inputCls}`} />
        <select value={period} onChange={e => onPatch({ measurementPeriod: e.target.value })} className={`flex-shrink-0 ${inputCls}`}>{PERIOD_OPTS.map(p => <option key={p} value={p}>{p}</option>)}</select>
      </div>
      <div className="text-[11px] text-neutral-500">현재 <b className="text-neutral-800 tabular-nums">{c.currentValue !== undefined ? c.currentValue.toLocaleString('ko-KR') : '—'}</b>{c.unit ?? ''}{hist.length > 0 && <span className="text-neutral-400"> · {hist.length}회</span>}</div>
      <div className="flex items-center gap-1">
        <input type="number" value={logVal} onChange={e => setLogVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doLog(); }} placeholder={`이번 ${period} 값`} className={`flex-1 min-w-0 ${inputCls}`} />
        <button onClick={doLog} disabled={logVal === ''} className="text-[11px] font-semibold px-2 py-1 rounded-lg text-white bg-neutral-900 disabled:opacity-30 transition-opacity flex-shrink-0">기록</button>
      </div>
    </div>
  );
}

// 업무 영역 입력 — 자유 입력 + ▼로 기존 업무 영역 '전체'를 언제나 다시 선택 (datalist 필터 문제 해결)
function AreaField({ value, onChange, options, placeholder, done, className }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; done?: boolean; className: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative w-28 flex-shrink-0">
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full ${options.length ? 'pr-6' : ''} font-semibold ${className} ${done ? 'line-through text-neutral-400' : ''}`} />
      {options.length > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)} className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-700" title="업무 영역 선택">
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {open && options.length > 0 && (
        <div className="absolute z-30 top-full left-0 mt-1 w-full min-w-[7rem] max-h-44 overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg py-1">
          {options.map(o => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }} className="block w-full text-left px-2.5 py-1 text-[13px] hover:bg-neutral-100 truncate" style={o === value ? { backgroundColor: '#F3F0FF', color: '#7C3AED', fontWeight: 700 } : { color: '#5B6560' }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 사업 목표: Goal > Strategy > Project > Area Deliverable (Progressive Disclosure) ──
function GoalsSection({
  goals, projectsOfGoal, workAreas,
  onAddGoal, onUpdateGoal, onRemoveGoal,
  onAddProject, onUpdateProject, onRemoveProject,
  onReviewGoal, onBreakdownGoal, onBreakdownProject, onSuggestGoals, onImportGoal, onReviseProjects, onResequenceProjects, onToggleAreaDone, onSetProjectStatus,
  aiBusyId, aiEnabled, focusGoal, onFocusHandled,
}: {
  goals: Goal[];
  projectsOfGoal: (goalId: string) => Project[];
  workAreas: string[];
  focusGoal?: { id?: string; name?: string } | null;
  onFocusHandled?: () => void;
  onAddGoal: (name: string) => void;
  onUpdateGoal: (id: string, patch: Partial<Goal>) => void;
  onRemoveGoal: (id: string) => void;
  onAddProject: (goalId: string, name: string) => void;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onRemoveProject: (id: string) => void;
  onReviewGoal: (goalId: string) => void;
  onBreakdownGoal: (goalId: string) => void;
  onBreakdownProject: (goalId: string, projectId: string) => void;
  onSuggestGoals?: () => void;
  onImportGoal?: (goalId: string) => void;
  onReviseProjects?: (goalId: string) => void;
  onResequenceProjects?: (goalId: string) => void;
  onToggleAreaDone?: (projectId: string, deliverableId: string) => void;
  onSetProjectStatus?: (projectId: string, status: ProjectStatus) => void;
  aiBusyId: string | null;
  aiEnabled?: boolean;
}) {
  const chat = useChatContext();
  const [openGoals, setOpenGoals] = useState<Set<string>>(new Set());
  const [aiMenuGoal, setAiMenuGoal] = useState<string | null>(null); // AI 버튼 드롭다운 열린 목표
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [chartGoals, setChartGoals] = useState<Set<string>>(new Set()); // 그래프 탭 켜진 목표
  const [chartFocus, setChartFocus] = useState<Record<string, string | null>>({}); // 목표별 포커스 지표
  // Goals 로드맵 '내용 수정'으로 진입 시(?goal=/?goalName=) 해당 목표를 펼치고 스크롤
  useEffect(() => {
    if (!focusGoal) return;
    const g = focusGoal.id ? goals.find(x => x.id === focusGoal.id) : goals.find(x => x.name === focusGoal.name);
    if (!g) { onFocusHandled?.(); return; }
    setOpenGoals(prev => new Set(prev).add(g.id));
    requestAnimationFrame(() => {
      document.getElementById(`plan-goal-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onFocusHandled?.();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGoal, goals]);
  // 티칭 투어 연동: 첫 목표 자동 펼침 / 첫 목표에 AI로 프로젝트(초안) 자동 생성
  useEffect(() => {
    const onExpand = () => { const g = goals[0]; if (g) setOpenGoals(prev => new Set(prev).add(g.id)); };
    const onBreakdown = () => { const g = goals[0]; if (g) { setOpenGoals(prev => new Set(prev).add(g.id)); onBreakdownGoal(g.id); } };
    const onExpandProject = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (id) setOpenProjects(prev => new Set(prev).add(id)); };
    window.addEventListener('spira-teach:expand-goals', onExpand);
    window.addEventListener('spira-teach:breakdown-goals', onBreakdown);
    window.addEventListener('spira:expand-project', onExpandProject);
    return () => {
      window.removeEventListener('spira-teach:expand-goals', onExpand);
      window.removeEventListener('spira-teach:breakdown-goals', onBreakdown);
      window.removeEventListener('spira:expand-project', onExpandProject);
    };
  }, [goals, onBreakdownGoal]);
  const toggle = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setFn(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const startEdit = (id: string, cur: string) => { setEditId(id); setEditVal(cur); };
  const saveEdit = (fn: (n: string) => void) => { const n = editVal.trim(); if (n) fn(n); setEditId(null); };
  const goalProgress = goalProgressOf; // 성과 기준(metric+completion) 종합 진행률

  const Chevron = ({ open }: { open: boolean }) => (
    <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: '#9AA39D' }} viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  const nameInput = (onSave: (n: string) => void) => (
    <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') saveEdit(onSave); if (e.key === 'Escape') setEditId(null); }}
      onBlur={() => saveEdit(onSave)} onClick={e => e.stopPropagation()}
      className="flex-1 bg-neutral-50 border border-violet-300 rounded-lg px-2 py-1 text-sm outline-none" />
  );
  // AI 버튼 (점검/쪼개기). busy면 스피너
  const AiBtn = ({ id, onClick, label, icon }: { id: string; onClick: () => void; label: string; icon: 'check' | 'split' | 'revise' }) => {
    const busy = aiBusyId === id;
    return (
      <button onClick={onClick} disabled={!!aiBusyId} title={label}
        className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
        style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>
        {busy ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          : icon === 'check'
            ? <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3 3 8-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            : icon === 'revise'
              ? <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M13 3.5A6 6 0 1 0 14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M13 1.5V4h-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>}
        {label}
      </button>
    );
  };
  const inputCls = 'bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-violet-400';
  const areaRow = (area: string, content: string, onArea: (v: string) => void, onContent: (v: string) => void, onDel: () => void, areaPh: string, contentPh: string, done?: boolean, onToggle?: () => void, onDiscuss?: () => void) => (
    <div className="flex items-start gap-2" data-ask data-ask-label={area || '항목'} data-ask-content={area ? `${area}: ${content}` : content}>
      {onToggle && (
        <button onClick={onToggle} title={done ? '완료됨 (눌러서 해제)' : '완료로 표시'}
          className={`flex-shrink-0 mt-1.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${done ? 'bg-[#5EA63A] border-[#5EA63A] text-white' : 'bg-white border-neutral-300 text-transparent hover:border-[#5EA63A]'}`}>
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <AreaField value={area} onChange={onArea} options={workAreas} placeholder={areaPh} done={done} className={inputCls} />
      <div className={`flex-1 min-w-0 bg-white border border-neutral-200 rounded-lg px-3 py-1.5 ${done ? 'opacity-60' : ''}`}>
        <AutoTextarea value={content} onChange={onContent} placeholder={contentPh} />
      </div>
      {onDiscuss && (
        <button onClick={onDiscuss} title="AI와 이 내용을 다듬기" className="flex-shrink-0 mt-1.5 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-violet-50" style={{ color: '#7C3AED' }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>
        </button>
      )}
      <button onClick={onDel} className="text-neutral-300 hover:text-red-500 text-sm transition-colors flex-shrink-0 mt-1.5">×</button>
    </div>
  );

  return (
    <section>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-[17px] font-black text-neutral-900">사업 목표</h2>
        {aiEnabled && onSuggestGoals && (
          <button onClick={onSuggestGoals} disabled={!!aiBusyId} data-teach="goal-suggest"
            className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
            style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>
            {aiBusyId === '__goals__'
              ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>}
            AI로 목표 추천
          </button>
        )}
      </div>
      <p className="text-[12px] text-neutral-400 mb-4">현실적인 수치 기반 목표를 세우고, 목표 아래 프로젝트로 실행하세요. 프로젝트를 완료할 때마다 진행도가 올라가요. AI 추천은 바로 추가되고, 점검·쪼개기는 확인 후 반영돼요.</p>
      <div className="space-y-2.5">
        {goals.map(g => {
          const gOpen = openGoals.has(g.id);
          const projects = projectsOfGoal(g.id);
          const doneCount = projects.filter(p => (p.status ?? 'planned') === 'done').length;
          const prog = projects.length ? doneCount / projects.length : null; // 진행도 = 완료한 프로젝트 비율
          const st = GOAL_STATUS_META[g.status ?? 'active'];
          return (
            <div key={g.id} id={`plan-goal-${g.id}`} data-teach="goal-card" className="border border-neutral-200 rounded-2xl bg-white scroll-mt-24">
              {/* Goal 헤더 (기본 노출) */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(setOpenGoals, g.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <Chevron open={gOpen} />
                    {editId === g.id ? nameInput(n => onUpdateGoal(g.id, { name: n })) : (
                      <span className="text-sm font-bold text-neutral-900 truncate">{g.name}</span>
                    )}
                  </button>
                  {editId !== g.id && (
                    <>
                      <input type="date" value={g.targetDate ?? ''} onClick={e => e.stopPropagation()} onChange={e => onUpdateGoal(g.id, { targetDate: e.target.value })}
                        title="기한" className="text-[11px] text-neutral-500 border border-neutral-200 rounded-lg px-1.5 py-0.5 flex-shrink-0 outline-none focus:border-violet-400 tabular-nums" />
                      <select value={g.status ?? 'active'} onClick={e => e.stopPropagation()} onChange={e => onUpdateGoal(g.id, { status: e.target.value as ProjectStatus })}
                        title="상태" className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 border-0 outline-none cursor-pointer appearance-none" style={{ backgroundColor: st.bg, color: st.color }}>
                        <option value="planned">예정</option><option value="active">진행 중</option><option value="done">완료</option><option value="onhold">보류</option>
                      </select>
                      {(aiEnabled || (onResequenceProjects && projects.length > 0)) && (() => {
                        const open = aiMenuGoal === g.id;
                        const openG = () => { setOpenGoals(prev => new Set(prev).add(g.id)); setAiMenuGoal(null); };
                        return (
                          <span className="relative flex-shrink-0">
                            <button onClick={() => setAiMenuGoal(open ? null : g.id)} data-teach="goal-ai" title="AI 도우미" className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full transition-transform hover:-translate-y-0.5" style={open ? { backgroundColor: '#16211E', color: '#fff' } : { backgroundColor: '#F3F0FF', color: '#7C3AED' }}>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>
                              AI
                              <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                            {open && (
                              <>
                                <div className="fixed inset-0 z-[59]" onClick={() => setAiMenuGoal(null)} />
                                <div className="absolute left-0 top-full mt-1 z-[60] rounded-xl bg-white shadow-xl p-1.5 flex flex-col gap-0.5 whitespace-nowrap" style={{ border: '1px solid #E7E7E1', minWidth: 132 }}>
                                  {aiEnabled && (
                                    <button onClick={() => { onBreakdownGoal(g.id); openG(); }} className="flex items-center gap-2 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors" style={{ color: '#16211E' }}>
                                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#7C3AED' }}><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>프로젝트 생성
                                    </button>
                                  )}
                                  {aiEnabled && onReviseProjects && projects.length > 0 && (
                                    <button onClick={() => { onReviseProjects(g.id); openG(); }} className="flex items-center gap-2 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors" style={{ color: '#16211E' }}>
                                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#7C3AED' }}><path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>프로젝트 수정
                                    </button>
                                  )}
                                  {onResequenceProjects && projects.length > 0 && (
                                    <button onClick={() => { onResequenceProjects(g.id); openG(); }} title="프로젝트들을 오늘부터 순서대로(기간 유지) 겹치지 않게 날짜 재조정" className="flex items-center gap-2 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors" style={{ color: '#16211E' }}>
                                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#2B62C4' }}><path d="M13 3.5A6 6 0 1 0 14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M13 1.5V4h-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>날짜 재조정
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </span>
                        );
                      })()}
                      {onImportGoal && projects.length > 0 && (
                        <button onClick={() => onImportGoal(g.id)} title="이 목표·프로젝트·산출물을 Goals 로드맵으로 가져가 날짜대로 배치"
                          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors flex-shrink-0" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0L5 7m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Goals로 가져가기
                        </button>
                      )}
                      <button onClick={() => startEdit(g.id, g.name)} className="text-neutral-300 hover:text-neutral-700 text-xs transition-colors flex-shrink-0">이름 수정</button>
                      <button onClick={() => onRemoveGoal(g.id)} className="text-neutral-300 hover:text-red-500 text-sm transition-colors flex-shrink-0">×</button>
                    </>
                  )}
                </div>
                {projects.length > 0 && <p className="mt-1 ml-6 text-[12px] text-neutral-500 truncate">프로젝트: {projects.map(p => p.name).join(' · ')}</p>}
                {prog !== null && (
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#EEF1EC' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round(prog * 100)}%`, backgroundColor: '#5EA63A' }} />
                    </div>
                    <span className="text-[11px] font-semibold text-neutral-500 tabular-nums">{doneCount}/{projects.length} 완료 · {Math.round(prog * 100)}%</span>
                  </div>
                )}
              </div>

              {/* 펼침: Goal 상세 + Strategy + Projects */}
              {gOpen && (
                <div className="px-4 pb-4 pl-9 space-y-4 border-t border-neutral-100 pt-3">
                  {/* 업무 영역별 전략 (제일 상단) */}
                  <div className="bg-neutral-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <p className="text-[11px] font-semibold text-neutral-400">업무 영역별 전략</p>
                      <Hint text="이 목표를 이루기 위한 업무 영역별 핵심 전략 방향을 적어두세요. 아래 프로젝트의 방향이 됩니다. (AI '프로젝트 수정'이 이 전략을 참고해요)" />
                    </div>
                    <div className="space-y-1.5">
                      {(g.strategies ?? []).map(s => areaRow(
                        s.area, s.content,
                        v => onUpdateGoal(g.id, { strategies: (g.strategies ?? []).map(x => x.id === s.id ? { ...x, area: v } : x) }),
                        v => onUpdateGoal(g.id, { strategies: (g.strategies ?? []).map(x => x.id === s.id ? { ...x, content: v } : x) }),
                        () => onUpdateGoal(g.id, { strategies: (g.strategies ?? []).filter(x => x.id !== s.id) }),
                        '업무 영역', '이 영역의 전략 방향',
                        undefined, undefined,
                        () => chat?.openWithTarget(`업무 영역별 전략${s.area ? ` · ${s.area}` : ''} (목표: ${g.name})`, s.content, text => onUpdateGoal(g.id, { strategies: (g.strategies ?? []).map(x => x.id === s.id ? { ...x, content: text } : x) })),
                      ))}
                      <button onClick={() => onUpdateGoal(g.id, { strategies: [...(g.strategies ?? []), { id: uid(), area: '', content: '' }] })} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:border-violet-300 hover:text-violet-600 transition-colors">+ 전략 추가</button>
                    </div>
                  </div>

                  {/* 성과 지표 — [지표] 편집 / [그래프] 추이 두 탭. 진행도는 아래 프로젝트 완료로 계산됨 */}
                  <div className="bg-neutral-50 rounded-xl p-3">
                    {(() => {
                      const cur = (g.successCriteria ?? effectiveCriteria(g)).filter(c => c.type === 'metric');
                      const setC = (arr: SuccessCriterion[]) => onUpdateGoal(g.id, { successCriteria: arr });
                      const patch = (id: string, p: Partial<SuccessCriterion>) => setC(cur.map(c => c.id === id ? { ...c, ...p } : c));
                      const del = (id: string) => setC(cur.filter(c => c.id !== id));
                      const add = () => setC([...cur, { id: uid(), type: 'metric', name: '' }]);
                      const isChart = chartGoals.has(g.id);
                      const hasData = cur.some(c => (c.history ?? []).length > 0);
                      const tabCls = (on: boolean) => `text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${on ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'}`;
                      return (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <p className="text-[11px] font-semibold text-neutral-400 mr-1">성과 지표</p>
                            <button onClick={() => setChartGoals(prev => { const n = new Set(prev); n.delete(g.id); return n; })} className={tabCls(!isChart)}>지표</button>
                            <button onClick={() => setChartGoals(prev => { const n = new Set(prev); n.add(g.id); return n; })} className={tabCls(isChart)}>그래프</button>
                            <Hint text="목표 수치와 입력 주기를 정하고, 주기마다 값을 '기록'하면 추이가 쌓여요. '그래프' 탭에서 지표별 추이를 겹쳐 보고, 하나를 눌러 그것만 볼 수 있어요. (진행도 막대는 아래 프로젝트 완료로 계산돼요)" />
                          </div>
                          {isChart ? (
                            hasData
                              ? <MetricsChart metrics={cur} focusId={chartFocus[g.id] ?? null} onFocus={id => setChartFocus(prev => ({ ...prev, [g.id]: id }))} />
                              : <p className="text-[11px] text-neutral-400 text-center py-8">아직 기록된 값이 없어요. ‘지표’ 탭에서 값을 기록하면 추이 그래프가 그려져요.</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 items-start">
                                {cur.map(c => (
                                  <MetricRow key={c.id} c={c} inputCls={inputCls} onPatch={p => patch(c.id, p)} onDel={() => del(c.id)} />
                                ))}
                              </div>
                              <button onClick={add} className="mt-2 text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:border-violet-300 hover:text-violet-600 transition-colors">+ 지표 추가</button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Projects (진행 순서 → 화살표) */}
                  <div>
                    <p className="text-[11px] font-semibold text-neutral-400 mb-1.5">프로젝트</p>
                    <div className="space-y-1.5">
                      {projects.map((p, pi) => {
                        const pOpen = openProjects.has(p.id);
                        const pst = GOAL_STATUS_META[p.status ?? 'planned'];
                        return (
                          <Fragment key={p.id}>
                            <div data-teach="project-card" className="border border-neutral-200 rounded-xl bg-neutral-50">
                              <div className="flex items-center gap-2 px-3 py-2">
                                <button onClick={() => toggle(setOpenProjects, p.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                  <Chevron open={pOpen} />
                                  {editId === p.id ? nameInput(n => onUpdateProject(p.id, { name: n })) : (
                                    <>
                                      <span className="text-[13px] font-semibold text-neutral-900 truncate">{p.name}</span>
                                      {(p.startDate || p.endDate) && <span className="text-[10px] text-neutral-400 flex-shrink-0">{dateShort(p.startDate)}–{dateShort(p.endDate)}</span>}
                                    </>
                                  )}
                                </button>
                                {editId !== p.id && (
                                  <>
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: pst.bg, color: pst.color }}>{pst.label}</span>
                                    <button onClick={() => startEdit(p.id, p.name)} className="text-neutral-300 hover:text-neutral-700 text-[11px] transition-colors flex-shrink-0">이름 수정</button>
                                    <button onClick={() => onRemoveProject(p.id)} className="text-neutral-300 hover:text-red-500 text-sm transition-colors flex-shrink-0">×</button>
                                  </>
                                )}
                              </div>
                              {pOpen && (
                                <div className="px-3 pb-3 pl-8 space-y-2.5 border-t border-neutral-200 pt-2">
                                  <div>
                                    <label className="text-[10px] font-semibold text-neutral-400 block mb-1">최종 결과물 (Final Deliverable)</label>
                                    <div className="bg-white border border-neutral-200 rounded-lg px-3 py-1.5">
                                      <AutoTextarea value={p.finalDeliverable ?? ''} onChange={v => onUpdateProject(p.id, { finalDeliverable: v })} placeholder="이 프로젝트가 끝났을 때의 최종 결과물" />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="text-[10px] text-neutral-400">기간</label>
                                    <input type="date" value={p.startDate ?? ''} onChange={e => onUpdateProject(p.id, { startDate: e.target.value })} className={inputCls} />
                                    <span className="text-neutral-300 text-xs">–</span>
                                    <input type="date" value={p.endDate ?? ''} onChange={e => onUpdateProject(p.id, { endDate: e.target.value })} className={inputCls} />
                                    <select value={p.status ?? 'planned'} onChange={e => (onSetProjectStatus ? onSetProjectStatus(p.id, e.target.value as ProjectStatus) : onUpdateProject(p.id, { status: e.target.value as ProjectStatus }))} className={inputCls}>
                                      <option value="planned">예정</option><option value="active">진행 중</option><option value="done">완료</option><option value="onhold">보류</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold text-neutral-400 block mb-1">업무 영역별 산출물{(() => { const ads = p.areaDeliverables ?? []; const d = ads.filter(x => x.done).length; return ads.length ? ` · ${d}/${ads.length} 완료` : ''; })()}</label>
                                    <div className="space-y-1.5">
                                      {(p.areaDeliverables ?? []).map(a => areaRow(
                                        a.area, a.content,
                                        v => onUpdateProject(p.id, { areaDeliverables: (p.areaDeliverables ?? []).map(x => x.id === a.id ? { ...x, area: v } : x) }),
                                        v => onUpdateProject(p.id, { areaDeliverables: (p.areaDeliverables ?? []).map(x => x.id === a.id ? { ...x, content: v } : x) }),
                                        () => onUpdateProject(p.id, { areaDeliverables: (p.areaDeliverables ?? []).filter(x => x.id !== a.id) }),
                                        '업무 영역', '이 영역의 결과물',
                                        a.done,
                                        () => (onToggleAreaDone ? onToggleAreaDone(p.id, a.id) : onUpdateProject(p.id, { areaDeliverables: (p.areaDeliverables ?? []).map(x => x.id === a.id ? { ...x, done: !x.done } : x) })),
                                        () => chat?.openWithTarget(`영역별 산출물${a.area ? ` · ${a.area}` : ''} (프로젝트: ${p.name})`, a.content, text => onUpdateProject(p.id, { areaDeliverables: (p.areaDeliverables ?? []).map(x => x.id === a.id ? { ...x, content: text } : x) })),
                                      ))}
                                      <button onClick={() => onUpdateProject(p.id, { areaDeliverables: [...(p.areaDeliverables ?? []), { id: uid(), area: '', content: '' }] })}
                                        className="w-full py-1.5 rounded-lg border-2 border-dashed border-neutral-200 text-[12px] text-neutral-400 hover:text-neutral-600 hover:border-violet-300 transition-all">+ 업무 영역별 산출물</button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            {pi < projects.length - 1 && (
                              <div className="flex justify-center py-0.5">
                                <svg className="w-4 h-4" style={{ color: '#C4CCC4' }} viewBox="0 0 16 16" fill="none"><path d="M8 3v9M4.5 8.5L8 12l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </div>
                            )}
                          </Fragment>
                        );
                      })}
                      <AddInline placeholder="새 프로젝트 (예: Spira MVP Launch)" onAdd={name => { onAddProject(g.id, name); setOpenGoals(prev => new Set(prev).add(g.id)); }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <AddInline placeholder="새 사업 목표 (예: 초기 시장 진입)" onAdd={onAddGoal} />
      </div>
    </section>
  );
}

// AI 제안 미리보기(승인 전) 모달 — 적용 눌러야 반영
function AiPreviewModal({ preview, onApply, onClose }: { preview: AiPreview; onApply: () => void; onClose: () => void }) {
  const title = 'AI 목표 점검';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-violet-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>
          <h3 className="text-[15px] font-black text-neutral-900">{title}</h3>
        </div>
        <p className="text-[12px] text-neutral-400 mb-4">AI 제안이에요. 확인하고 <b className="text-neutral-600">적용</b>을 눌러야 반영돼요.</p>

        {preview.kind === 'goal-review' && (
          <div className="space-y-3 text-[13px]">
            {preview.data.issues.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-[11px] font-bold text-amber-700 mb-1">보완하면 좋은 점</p>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-800">{preview.data.issues.map((it, i) => <li key={i}>{it}</li>)}</ul>
              </div>
            )}
            <div className="bg-neutral-50 rounded-xl p-3 space-y-2">
              {preview.data.title && <p><span className="text-neutral-400 text-[11px]">제안 목표</span><br /><b className="text-neutral-900">{preview.data.title}</b></p>}
              {preview.data.successCriteria.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-neutral-500 mb-1">성과 기준 (달성 판단 방법)</p>
                  <div className="space-y-1">{preview.data.successCriteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.type === 'metric' ? '#EAF0FB' : '#EAF7DE', color: c.type === 'metric' ? '#4E7CF5' : '#3E7A2E' }}>{c.type === 'metric' ? '측정' : '완료'}</span>
                      <span className="text-neutral-800">{c.name}{c.type === 'metric' && c.target !== undefined ? ` — 목표 ${fmtNum(c.target)}${c.unit ? ` ${c.unit}` : ''}${c.measurementPeriod ? ` / ${c.measurementPeriod}` : ''}` : ''}</span>
                    </div>
                  ))}</div>
                </div>
              )}
              {preview.data.targetDate && <p className="text-neutral-600 text-[12px]">기한: {preview.data.targetDate}</p>}
              {preview.data.note && <p className="text-[12px] text-neutral-400">{preview.data.note}</p>}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2.5 rounded-2xl text-[14px] font-semibold text-neutral-500 bg-neutral-100 hover:bg-neutral-200 transition-colors">취소</button>
          <button onClick={onApply} className="flex-1 py-2.5 rounded-2xl text-[14px] font-bold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>적용</button>
        </div>
      </div>
    </div>
  );
}

// AI 목표 설계 팝업 — 5단계 성장 목표 제안 + 근거 + 하단 채팅으로 실시간 조정
function GoalPlanModal({ context, areas, onApply, onClose }: {
  context: string; areas: string[];
  onApply: (goals: PlanGoal[]) => void;
  onClose: () => void;
}) {
  type Msg = { role: 'user' | 'assistant'; content: string; goals?: PlanGoal[] };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const SEED = '이 사업의 성장 목표 5단계를 현실적이고 촘촘하게(달성 가능한 작은 수치부터) 제안해줘.';
  // 가장 최근에 제안된 목표 (아래 새 버전이 쌓일수록 최신 것을 적용)
  const latestGoals = [...messages].reverse().find(m => m.goals && m.goals.length)?.goals ?? [];

  const call = async (log: Msg[]) => {
    setLoading(true);
    try {
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const convo = [{ role: 'user' as const, content: SEED }, ...log.map(m => ({ role: m.role, content: m.content }))];
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'goal-suggest', context, areas, today, messages: convo, currentGoals: latestGoals.length ? latestGoals : undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { setMessages(m => [...m, { role: 'assistant', content: '앗, 잠시 문제가 생겼어요. 다시 시도해 주세요.' }]); return; }
      const gs = (Array.isArray(data.goals) ? data.goals : []) as PlanGoal[];
      // 답변 + 이번 버전 목표를 하나의 어시스턴트 메시지로 아래에 쌓는다 (항상 새 버전이 최하단에 보이게)
      setMessages(m => [...m, { role: 'assistant', content: String(data.reply ?? ''), goals: gs }]);
    } catch { setMessages(m => [...m, { role: 'assistant', content: '네트워크 오류가 발생했어요.' }]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (startedRef.current) return; startedRef.current = true; void call([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, loading]);

  const send = () => { const t = input.trim(); if (!t || loading) return; const log = [...messages, { role: 'user' as const, content: t }]; setMessages(log); setInput(''); void call(log); };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-2 flex-shrink-0">
          <div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-violet-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>
              <h3 className="text-[15px] font-black text-neutral-900">AI 목표 설계</h3>
            </div>
            <p className="text-[12px] text-neutral-400 mt-0.5">달성 가능한 5단계 성장 목표예요. 아래 대화로 수치를 함께 맞춰보세요.</p>
          </div>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-600 text-lg leading-none flex-shrink-0">×</button>
        </div>

        {/* 스크롤: 대화 + (각 응답마다) 새 목표 버전이 아래로 쌓임 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 space-y-2.5 min-h-[140px] pb-1">
          {messages.length === 0 && loading && (
            <div className="py-8 flex flex-col items-center gap-2 text-neutral-400">
              <span className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-violet-400 animate-spin" />
              <p className="text-[13px]">성장 목표를 설계하는 중…</p>
            </div>
          )}
          {messages.map((m, mi) => (
            m.role === 'user' ? (
              <div key={mi} className="flex justify-end">
                <div className="max-w-[85%] text-[13px] leading-relaxed rounded-2xl px-3 py-2" style={{ backgroundColor: '#DFF9C4', color: '#16211E' }}>{m.content}</div>
              </div>
            ) : (
              <div key={mi} className="space-y-2">
                {m.content && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] text-[13px] leading-relaxed rounded-2xl px-3 py-2" style={{ backgroundColor: '#F1F1EB', color: '#3E4A44' }}>{m.content}</div>
                  </div>
                )}
                {m.goals && m.goals.length > 0 && (
                  <div className="space-y-2">
                    {m.goals.map((g, i) => (
                      <div key={i} className="border border-neutral-200 rounded-xl px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: '#EEF7E2', color: '#3E7A2E' }}>{i + 1}</span>
                          <b className="text-[14px] text-neutral-900">{g.name}</b>
                          {g.targetDate && <span className="text-[11px] text-neutral-400 flex-shrink-0">~{g.targetDate.slice(2).replace(/-/g, '.')}</span>}
                        </div>
                        {g.rationale && <p className="text-[12px] text-neutral-500 mt-1 ml-7">{g.rationale}</p>}
                        {g.successCriteria.length > 0 && (
                          <div className="mt-1.5 ml-7 flex flex-wrap gap-1">
                            {g.successCriteria.map((c, j) => (
                              <span key={j} className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EAF0FB', color: '#4E7CF5' }}>
                                {c.name}{c.target !== undefined ? ` ${c.target.toLocaleString('ko-KR')}${c.unit ?? ''}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {(g.strategies?.length ?? 0) > 0 && (
                          <div className="mt-1.5 ml-7 flex flex-wrap gap-1">
                            {g.strategies!.map((s, k) => (
                              <span key={k} className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>🎯 {s.area}: {s.content}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ))}
          {loading && messages.length > 0 && (
            <div className="flex justify-start"><div className="rounded-2xl px-3 py-2" style={{ backgroundColor: '#F1F1EB' }}><span className="inline-block w-4 h-4 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin" /></div></div>
          )}
        </div>

        {/* 입력 + 적용 */}
        <div className="px-5 pt-3 pb-4 flex-shrink-0 border-t border-neutral-100">
          <div className="flex items-end gap-2 mb-2.5">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              rows={1} placeholder="예: 구독 가격은 9,900원이야 / 첫 목표는 더 작게 / 6개월 더 여유있게"
              className="flex-1 resize-none bg-neutral-50 border border-neutral-200 rounded-2xl px-3.5 py-2.5 text-[13px] outline-none focus:border-violet-400 max-h-24" />
            <button onClick={send} disabled={!input.trim() || loading} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#16211E', color: '#EDFF9F' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-2.5-6L4 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
            </button>
          </div>
          <button onClick={() => onApply(latestGoals)} disabled={!latestGoals.length || loading} className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>
            이 목표로 만들기{latestGoals.length ? ` (${latestGoals.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// AI 프로젝트 수정 — 대화형 팝업. 상황·전략을 대화로 맞춰가며 프로젝트 '전체'를 다시 제안 → 적용 시 교체
function ProjectReviseModal({ context, areas, goalName, goalDesc, goalTargetDate, strategies, currentProjects, onApply, onClose }: {
  context: string; areas: string[]; goalName: string; goalDesc: string; goalTargetDate: string;
  strategies: { area: string; content: string }[];
  currentProjects: PlanProject[];
  onApply: (projects: PlanProject[]) => void;
  onClose: () => void;
}) {
  type Msg = { role: 'user' | 'assistant'; content: string; projects?: PlanProject[] };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestProjects = [...messages].reverse().find(m => m.projects && m.projects.length)?.projects ?? [];
  const shortD = (d?: string) => (d ? d.slice(2).replace(/-/g, '.') : '');

  const call = async (log: Msg[]) => {
    setLoading(true);
    try {
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        mode: 'project-revise', context, areas, today, goalName, goalDesc, goalTargetDate, strategies, currentProjects,
        messages: log.map(m => ({ role: m.role, content: m.content })),
      }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { setMessages(m => [...m, { role: 'assistant', content: '앗, 잠시 문제가 생겼어요. 다시 시도해 주세요.' }]); return; }
      const ps = (Array.isArray(data.projects) ? data.projects : []) as PlanProject[];
      setMessages(m => [...m, { role: 'assistant', content: String(data.reply ?? ''), projects: ps }]);
    } catch { setMessages(m => [...m, { role: 'assistant', content: '네트워크 오류가 발생했어요.' }]); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (startedRef.current) return; startedRef.current = true; void call([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, loading]);
  const send = () => { const t = input.trim(); if (!t || loading) return; const log = [...messages, { role: 'user' as const, content: t }]; setMessages(log); setInput(''); void call(log); };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,41,41,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-2 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-violet-500" viewBox="0 0 16 16" fill="none"><path d="M13 3.5A6 6 0 1 0 14 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M13 1.5V4h-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <h3 className="text-[15px] font-black text-neutral-900 truncate">AI 프로젝트 수정</h3>
            </div>
            <p className="text-[12px] text-neutral-400 mt-0.5 truncate">‘{goalName}’ · 상황·전략을 대화로 맞춰 프로젝트를 다시 짜요.</p>
          </div>
          <button onClick={onClose} className="text-neutral-300 hover:text-neutral-600 text-lg leading-none flex-shrink-0">×</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 space-y-2.5 min-h-[140px] pb-1">
          {messages.length === 0 && loading && (
            <div className="py-8 flex flex-col items-center gap-2 text-neutral-400">
              <span className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-violet-400 animate-spin" />
              <p className="text-[13px]">프로젝트를 점검하는 중…</p>
            </div>
          )}
          {messages.map((m, mi) => (
            m.role === 'user' ? (
              <div key={mi} className="flex justify-end"><div className="max-w-[85%] text-[13px] leading-relaxed rounded-2xl px-3 py-2" style={{ backgroundColor: '#DFF9C4', color: '#16211E' }}>{m.content}</div></div>
            ) : (
              <div key={mi} className="space-y-2">
                {m.content && <div className="flex justify-start"><div className="max-w-[90%] text-[13px] leading-relaxed rounded-2xl px-3 py-2" style={{ backgroundColor: '#F1F1EB', color: '#3E4A44' }}>{m.content}</div></div>}
                {m.projects && m.projects.length > 0 && (
                  <div className="space-y-2">
                    {m.projects.map((p, i) => (
                      <div key={i} className="border border-neutral-200 rounded-xl px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: '#EEF7E2', color: '#3E7A2E' }}>{i + 1}</span>
                          <b className="text-[14px] text-neutral-900 flex-1 min-w-0 truncate">{p.name}</b>
                          {p.startDate && p.endDate && <span className="text-[11px] text-neutral-400 flex-shrink-0">{shortD(p.startDate)}~{shortD(p.endDate)}</span>}
                        </div>
                        {p.finalDeliverable && <p className="text-[12px] text-neutral-500 mt-1 ml-7">🎯 {p.finalDeliverable}</p>}
                        {(p.areaDeliverables?.length ?? 0) > 0 && (
                          <div className="mt-1.5 ml-7 flex flex-wrap gap-1">
                            {p.areaDeliverables!.map((a, j) => <span key={j} className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EAF0FB', color: '#4E7CF5' }}>{a.area}: {a.content}</span>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ))}
          {loading && messages.length > 0 && (
            <div className="flex justify-start"><div className="rounded-2xl px-3 py-2" style={{ backgroundColor: '#F1F1EB' }}><span className="inline-block w-4 h-4 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin" /></div></div>
          )}
        </div>

        <div className="px-5 pt-3 pb-4 flex-shrink-0 border-t border-neutral-100">
          <div className="flex items-end gap-2 mb-2.5">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              rows={1} placeholder="예: 목표 달성이 어려워졌어 / 마케팅 전략을 인플루언서로 바꿔줘 / 일정을 2개월 미뤄줘"
              className="flex-1 resize-none bg-neutral-50 border border-neutral-200 rounded-2xl px-3.5 py-2.5 text-[13px] outline-none focus:border-violet-400 max-h-24" />
            <button onClick={send} disabled={!input.trim() || loading} className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#16211E', color: '#EDFF9F' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-2.5-6L4 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
            </button>
          </div>
          <button onClick={() => onApply(latestProjects)} disabled={!latestProjects.length || loading} className="w-full py-3 rounded-2xl text-[15px] font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-40" style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}>
            이 프로젝트로 수정{latestProjects.length ? ` (${latestProjects.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// 기존(옛 구조) 데이터를 새 레이아웃으로 매핑 — 데이터 유실 없이 그대로 보여주기 위한 폴백.
// 새 필드(overview/bizGoals)가 아직 없을 때만 옛 필드에서 끌어온다. 사용자가 새로 편집하면 새 필드로 '흡수'된다.
function deriveOverview(plan: PlanData): BusinessOverview {
  return {
    tagline: plan.tagline ?? '',
    concept: plan.concept ?? '',
    problem: (plan.problems ?? []).filter(Boolean).join('\n'),
    solution: (plan.solutions ?? []).map(s => (s.memo ? `${s.title} — ${s.memo}` : s.title)).filter(Boolean).join('\n'),
    mission: plan.mission ?? '',
    vision: plan.vision ?? '',
  };
}
function deriveBizGoals(plan: PlanData): BizGoal[] {
  // 옛 '사업 성장 단계'(growthStages)를 사업 목표로, 그 상세 프로젝트를 산출물로 매핑 (id는 결정적으로 생성해 재렌더 안정)
  return (plan.growthStages ?? []).map(s => ({
    id: s.id,
    name: s.title || s.metric || '사업 목표',
    desc: s.metric || s.direction || '',
    deliverables: (s.projects ?? []).filter(Boolean).map((p, i) => ({ id: `${s.id}-d${i}`, name: p, areaDeliverables: [] })),
  }));
}

export default function PlanPage() {
  const store = useStore();
  const { toast } = useToast();
  const { plan: userPlan } = usePlan();
  const { showUpgrade } = useUpgrade();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const h = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moreOpen]);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [analyzingDoc, setAnalyzingDoc] = useState(false);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null); // AI 처리 중인 Goal/Project id
  const [preview, setPreview] = useState<AiPreview | null>(null); // AI 제안 미리보기(승인 전)
  const [goalPlanOpen, setGoalPlanOpen] = useState(false); // AI 목표 설계 팝업(대화형)
  const [reviseGoalId, setReviseGoalId] = useState<string | null>(null); // AI 프로젝트 수정 팝업(대화형)
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [focusGoal, setFocusGoal] = useState<{ id?: string; name?: string } | null>(null); // Goals 로드맵 '내용 수정'으로 진입 시 포커스할 목표
  const migratedRef = useRef<Set<string>>(new Set()); // bizGoals→goals 마이그레이션 1회 가드
  const [flagAward, setFlagAward] = useState<{ flagSrc: string; heading: string; sub: string } | null>(null); // 성장 단계 달성 깃발 오버레이
  const chat = useChatContext();

  // 현재 진행 중인 성장 단계 인덱스 (선택된 사업 기준)
  const growthIdx = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId)?.growthStageIndex ?? 0;

  // Goals의 'Plan에서 보기'로 #growth-stages 해시와 함께 진입하면 해당 섹션으로 스크롤
  useEffect(() => {
    if (!plan || window.location.hash !== '#growth-stages') return;
    const el = document.getElementById('growth-stages');
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', window.location.pathname); // 해시 정리(재진입/스크롤 반복 방지)
    });
  }, [plan]);

  // 성장 단계 달성 처리 — 다음 단계로 넘기고 여정 깃발 증정
  const handleCompleteStage = (index: number) => {
    if (!selectedWsId) return;
    const stage = (plan?.growthStages ?? [])[index];
    if (!stage) return;
    if (!window.confirm(`'${stage.title}' 단계를 달성하고 다음 단계로 넘어갈까요?`)) return;
    store.setGrowthStageIndex(selectedWsId, index + 1);
    setFlagAward({
      flagSrc: '/flag-goal-hero.svg',
      heading: '성장 단계 달성! 🎉\n목표 깃발을 획득했어요',
      sub: `‘${stage.title}’ 단계를 달성했어요.`,
    });
  };
  const storeRef = useRef(store);
  const selectedWsIdRef = useRef(selectedWsId);
  storeRef.current = store;
  selectedWsIdRef.current = selectedWsId;

  // 마이그레이션(1회): 옛 bizGoals/growthStages → 새 goals + projects(공유). 비파괴(bizGoals 보존).
  useEffect(() => {
    if (!plan || !selectedWsId) return;
    if (plan.goalsMigrated) return;               // 이미 마이그레이션됨 → 재실행/부활 방지
    if (migratedRef.current.has(selectedWsId)) return;
    migratedRef.current.add(selectedWsId);
    const src = plan.bizGoals?.length ? plan.bizGoals : deriveBizGoals(plan);
    const newGoals: Goal[] = [];
    const newProjects: Project[] = [];
    src.forEach((bg, gi) => {
      const goalId = bg.id || uid();
      newGoals.push({ id: goalId, name: bg.name, statement: bg.desc ?? '', strategies: [], order: gi, status: 'active' });
      (bg.deliverables ?? []).forEach((d, di) => {
        newProjects.push({ id: uid(), name: d.name, goalId, order: di, status: 'planned', areaDeliverables: d.areaDeliverables ?? [] });
      });
    });
    // 마이그레이션 표시는 항상 기록(빈 소스여도) — 이후 사용자가 목표를 다 지워도 부활하지 않게.
    const next: PlanData = {
      ...plan,
      goalsMigrated: true,
      ...(newGoals.length ? { goals: [...(plan.goals ?? []), ...newGoals], projects: [...(plan.projects ?? []), ...newProjects] } : {}),
    };
    setPlan(next);
    storeRef.current.updatePlanInWs(selectedWsId, next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, selectedWsId]);

  // 초기 선택 워크스페이스 설정 — 마지막으로 보던 기획서(비즈니스)로 복원
  useEffect(() => {
    if (!store.ready) return;
    const saved = localStorage.getItem('spira_plan_ws');
    const validSaved = saved && store.allWorkspacesEntries.some(e => e.workspace.id === saved) ? saved : null;
    const wsId = selectedWsId ?? validSaved ?? store.data.workspace?.id ?? null;
    setSelectedWsId(wsId);
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === wsId);
    setPlan(entry ? { ...entry.plan } : store.data.plan);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  // Goals 로드맵 '내용 수정'으로 ?ws=&goal=(또는 goalName=) 파라미터와 함께 진입 시: 해당 사업으로 전환 + 목표 포커스
  useEffect(() => {
    if (!store.ready) return;
    const params = new URLSearchParams(window.location.search);
    const ws = params.get('ws');
    const goal = params.get('goal');
    const goalName = params.get('goalName');
    if (ws && store.allWorkspacesEntries.some(e => e.workspace.id === ws)) setSelectedWsId(ws);
    if (goal || goalName) setFocusGoal({ id: goal ?? undefined, name: goalName ?? undefined });
    if (ws || goal || goalName) history.replaceState(null, '', window.location.pathname); // 파라미터 정리(재진입 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  // 탭 전환 시 해당 워크스페이스 플랜 로드 + 마지막 선택 저장
  useEffect(() => {
    if (!store.ready || !selectedWsId) return;
    try { localStorage.setItem('spira_plan_ws', selectedWsId); } catch { /* empty */ }
    const entry = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId);
    if (entry) setPlan({ ...entry.plan });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWsId]);

  useEffect(() => {
    if (!chat) return;
    chat.registerPlanHandler((patch) => {
      setPlan(prev => {
        if (!prev) return prev;
        const next: PlanData = {
          ...prev,
          ...(patch.tagline !== undefined && { tagline: patch.tagline }),
          ...(patch.mission !== undefined && { mission: patch.mission }),
          ...(patch.vision !== undefined && { vision: patch.vision }),
          ...(patch.concept !== undefined && { concept: patch.concept }),
          ...(patch.problems?.length && { problems: patch.problems }),
          ...(patch.solutions?.length && {
            solutions: patch.solutions.map(s =>
              typeof s === 'string' ? { title: s, memo: '' } : s
            ),
          }),
          ...(patch.revenueModel?.length && {
            revenueModel: patch.revenueModel.map(r =>
              typeof r === 'string' ? { title: r, memo: '' } : r
            ),
          }),
          ...(patch.products?.length && {
            products: patch.products.map(r =>
              typeof r === 'string' ? { title: r, memo: '' } : r
            ),
          }),
          ...(patch.brandingKeywords?.length && { brandingKeywords: patch.brandingKeywords }),
          ...(patch.valueProposition && {
            valueProposition: { ...prev.valueProposition, ...patch.valueProposition },
          }),
          ...(patch.targetCustomers?.length && {
            targetCustomers: patch.targetCustomers.map(tc => ({
              ...tc,
              id: uid(),
              image: '',
            })),
          }),
          ...(patch.growthStages?.length && {
            growthStages: patch.growthStages.map(s => ({
              id: uid(),
              title: s.title ?? '',
              metric: s.metric ?? '',
              direction: s.direction ?? '',
              projects: Array.isArray(s.projects) ? s.projects : [],
            })),
          }),
          ...(patch.workAreas?.length && {
            // 이름이 같은 기존 영역은 id를 '유지' — 그래야 그 영역에 달린 데드라인·업무가 사라지지 않음
            workAreas: patch.workAreas.map((a, i) => {
              const existing = (prev.workAreas ?? []).find(w => w.name === (a.name ?? ''));
              return {
                id: existing?.id ?? uid(),
                name: a.name ?? '',
                goal: a.goal ?? '',
                color: a.color ?? existing?.color ?? BUSINESS_COLORS[i % BUSINESS_COLORS.length],
              };
            }),
          }),
        };
        // AI가 채운 값을 새 '사업 개요'(overview)에도 반영 — 새 레이아웃이 overview를 표시하므로.
        const nextOverview: BusinessOverview = { ...(prev.overview ?? deriveOverview(prev)) };
        if (patch.tagline !== undefined) nextOverview.tagline = patch.tagline;
        if (patch.concept !== undefined) nextOverview.concept = patch.concept;
        if (patch.mission !== undefined) nextOverview.mission = patch.mission;
        if (patch.vision !== undefined) nextOverview.vision = patch.vision;
        if (patch.problems?.length) nextOverview.problem = patch.problems.filter(Boolean).join('\n');
        if (patch.solutions?.length) nextOverview.solution = patch.solutions.map(s => typeof s === 'string' ? s : (s.memo ? `${s.title} — ${s.memo}` : s.title)).filter(Boolean).join('\n');
        next.overview = nextOverview;
        const wsId = selectedWsIdRef.current;
        if (wsId) storeRef.current.updatePlanInWs(wsId, next);
        else storeRef.current.updatePlan(next);
        return next;
      });
    });
    return () => chat.unregisterPlanHandler();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 티칭 투어: 모달 없이 사업 목표를 직접 생성·적용 (리스너는 early return 위에서 등록, 실제 로직은 아래 ref로 주입)
  const teachSuggestRef = useRef<() => void>(() => {});
  useEffect(() => {
    const h = () => teachSuggestRef.current();
    window.addEventListener('spira-teach:suggest-goals', h);
    return () => window.removeEventListener('spira-teach:suggest-goals', h);
  }, []);

  if (!store.ready || !plan || !selectedWsId) return <ListSkeleton />;

  const selectedWs = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId)?.workspace;
  const selectedWsName = selectedWs?.name ?? '';
  const selectedWsColor = selectedWs?.color;

  const isLastBusiness = store.allWorkspacesEntries.length <= 1;
  const handleDeleteBusiness = () => {
    if (isLastBusiness) { toast('마지막 사업은 삭제할 수 없어요. 최소 하나는 있어야 해요.', 'info'); return; }
    if (!window.confirm(`'${selectedWsName}' 사업을 정말 삭제할까요?\n\n이 사업의 기획서·목표·업무·수익 등 모든 데이터가 영구 삭제되며 되돌릴 수 없습니다.`)) return;
    const nextId = store.allWorkspacesEntries.find(e => e.workspace.id !== selectedWsId)?.workspace.id ?? null;
    store.deleteWorkspace(selectedWsId);
    setSelectedWsId(nextId);
  };
  const handleRenameBusiness = () => {
    if (!selectedWs) return;
    const name = window.prompt('사업 이름을 입력하세요', selectedWs.name);
    if (name == null) return; // 취소
    const trimmed = name.trim();
    if (!trimmed || trimmed === selectedWs.name) return;
    store.setWorkspace({ ...selectedWs, name: trimmed });
  };

  const update = (patch: Partial<PlanData>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    store.updatePlanInWs(selectedWsId, next);
  };

  // 리스트 항목 전체를 한 번에 교체 (개별 update를 연달아 호출하면 stale closure로 마지막 것만 반영됨)
  const replaceItems = (key: 'problems', values: string[]) =>
    update({ [key]: values });

  const addPlanItem = (key: 'solutions' | 'revenueModel' | 'products', value: PlanItem) =>
    update({ [key]: [...(plan[key] ?? []), value] });

  const updatePlanItem = (key: 'solutions' | 'revenueModel' | 'products', index: number, value: PlanItem) =>
    update({ [key]: (plan[key] ?? []).map((v, i) => i === index ? value : v) });

  const removePlanItem = (key: 'solutions' | 'revenueModel' | 'products', index: number) =>
    update({ [key]: (plan[key] ?? []).filter((_, i) => i !== index) });

  const addKeyword = (v: string) =>
    update({ brandingKeywords: [...(plan.brandingKeywords ?? []), v] });

  const removeKeyword = (i: number) =>
    update({ brandingKeywords: (plan.brandingKeywords ?? []).filter((_, idx) => idx !== i) });

  const addCustomer = (data: Omit<TargetCustomer, 'id'>) =>
    update({ targetCustomers: [...plan.targetCustomers, { ...data, id: uid() }] });

  const updateCustomer = (c: TargetCustomer) =>
    update({ targetCustomers: plan.targetCustomers.map(x => x.id === c.id ? c : x) });

  const deleteCustomer = (id: string) =>
    update({ targetCustomers: plan.targetCustomers.filter(x => x.id !== id) });

  // 성장 단계
  const addGrowthStage = (s: GrowthStage) =>
    update({ growthStages: [...(plan.growthStages ?? []), s] });
  const updateGrowthStage = (id: string, patch: Partial<GrowthStage>) =>
    update({ growthStages: (plan.growthStages ?? []).map(x => x.id === id ? { ...x, ...patch } : x) });
  const removeGrowthStage = (id: string) =>
    update({ growthStages: (plan.growthStages ?? []).filter(x => x.id !== id) });
  const moveGrowthStage = (idx: number, dir: -1 | 1) => {
    const list = [...(plan.growthStages ?? [])];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    update({ growthStages: list });
  };

  // 업무 영역
  const addWorkArea = (a: WorkArea) =>
    update({ workAreas: [...(plan.workAreas ?? []), a] });
  const updateWorkArea = (id: string, patch: Partial<WorkArea>) =>
    update({ workAreas: (plan.workAreas ?? []).map(x => x.id === id ? { ...x, ...patch } : x) });
  const removeWorkArea = (id: string) =>
    update({ workAreas: (plan.workAreas ?? []).filter(x => x.id !== id) });

  const buildContext = () => {
    const ov = plan.overview ?? deriveOverview(plan);
    return [
      selectedWsName && `사업명: ${selectedWsName}`,
      plan.overview?.category && `업종: ${plan.overview.category}`,
      (ov.tagline || plan.tagline) && `한 줄 소개: ${ov.tagline || plan.tagline}`,
      (ov.concept || plan.concept) && `컨셉: ${ov.concept || plan.concept}`,
      (ov.problem || plan.problems.length) && `문제: ${ov.problem || plan.problems.join(', ')}`,
      (ov.solution || plan.solutions.length) && `솔루션: ${ov.solution || plan.solutions.map(s => s.title).join(', ')}`,
      (ov.mission || plan.mission) && `미션: ${ov.mission || plan.mission}`,
      (ov.vision || plan.vision) && `비전: ${ov.vision || plan.vision}`,
      plan.revenueModel.length && `수익 구조: ${plan.revenueModel.map(r => r.title).join(', ')}`,
    ].filter(Boolean).join('\n') || '(아직 사업 정보가 없습니다)';
  };

  // 항목별 채우기 — API엔 상세 명령(마커 지시) 전송, 화면 말풍선엔 자연어만 표시
  const genField = (apiPrompt: string, display: string) => {
    if (!chat || chat.loading) return;
    // AI 자동 채우기는 Pro 전용 → 유료 플랜 알림 팝업.
    // 단, 온보딩 투어 중에는 제한을 풀어 기능을 끝까지 체험하게 한다.
    if (userPlan.tier !== 'pro' && !isOnboardingActive()) {
      showUpgrade('autofill');
      return;
    }
    chat.setOpen(true);
    chat.sendMessage(apiPrompt, display);
  };
  const handleGenerateValueProp = () => genField(buildValuePropPrompt(buildContext()), '핵심 가치 제안을 채워줘');
  const handleGenerateSolutions = () => genField(buildSolutionsPrompt(buildContext()), '솔루션/제품을 제안해줘');
  const handleGenerateRevenueModel = () => genField(buildRevenuePrompt(buildContext()), '수익 구조를 제안해줘');
  const handleGenerateProducts = () => genField(
    `아래 사업 정보를 바탕으로 이 사업에서 판매·출시할 '프로덕트(제품/상품)'를 3~5개로 구체적으로 정리해줘. 예: 웹앱, 아이패드 전용 앱, 휴대폰 앱, 굿즈 등. 조언만 하지 말고, 반드시 답변 맨 끝에 %%%PLAN_UPDATE%%% 마커와 products 배열([{title, memo}])이 담긴 JSON을 출력해줘.\n\n${buildContext()}`,
    '프로덕트 목록을 정리해줘');
  const handleGenerateBrandingKeywords = () => genField(buildBrandingPrompt(buildContext()), '브랜딩 키워드를 만들어줘');
  const handleGeneratePersonas = () => genField(buildPersonasPrompt(buildContext()), '타겟 고객 페르소나를 만들어줘');
  const handleGenerateGrowthStages = () => genField(buildGrowthStagesPrompt(buildContext()), '사업 성장 단계를 설계해줘');
  const handleGenerateWorkAreas = () => genField(buildWorkAreasPrompt(buildContext()), '업무 영역을 정리해줘');
  const handleGenerateProblems = () => genField(
    `아래 사업 정보를 바탕으로 이 사업이 해결하려는 고객의 핵심 문제를 2~3개로 구체적으로 정의해줘. 조언만 하지 말고, 반드시 답변 맨 끝에 %%%PLAN_UPDATE%%% 마커와 problems 배열이 담긴 JSON을 출력해줘.\n\n${buildContext()}`,
    '문제 정의를 작성해줘');
  // 사업 개요(overview) 항목별 AI 채우기 — 각 항목을 대응하는 plan 필드로 출력하게 지시(핸들러가 overview로 동기화)
  const OVERVIEW_FIELD_PROMPT: Partial<Record<keyof BusinessOverview, string>> = {
    tagline: "이 사업의 '한 줄 소개'를 매력적인 한 문장으로 작성해줘. JSON 키는 tagline(문자열).",
    concept: "이 브랜드의 '컨셉'(핵심 아이디어·방향성·감성)을 한두 문장으로 작성해줘. JSON 키는 concept(문자열).",
    problem: "이 사업이 해결하려는 '핵심 문제'를 2~3개로 구체적으로 정의해줘. JSON 키는 problems(문자열 배열).",
    solution: "그 문제를 해결하는 '솔루션'을 구체적으로 정리해줘. JSON 키는 solutions([{title, memo}]).",
    mission: "이 사업의 '미션'(존재 이유와 목적)을 한두 문장으로 작성해줘. JSON 키는 mission(문자열).",
    vision: "이 사업의 '비전'(궁극적으로 이루려는 모습)을 한두 문장으로 작성해줘. JSON 키는 vision(문자열).",
  };
  const handleGenerateOverviewField = (field: keyof BusinessOverview) => genField(
    `아래 사업 정보를 바탕으로 ${OVERVIEW_FIELD_PROMPT[field]} 조언만 하지 말고, 추가 질문 없이 반드시 답변 맨 끝에 %%%PLAN_UPDATE%%% 마커와 해당 JSON을 출력해서 바로 반영되게 해줘.\n\n${buildContext()}`,
    '사업 개요 항목을 채워줘');

  // 업로드한 사업계획서(PDF·텍스트)를 서버에서 분석해 사업 개요 항목을 자동 채움
  const analyzeDocToOverview = async (d: PlanDoc) => {
    const type = d.type ?? '';
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(d.name);
    const isText = type.startsWith('text/') || /\.(txt|md)$/i.test(d.name);
    const isImg = type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(d.name);
    if (!isPdf && !isText && !isImg) { toast('PDF·이미지·텍스트 파일만 분석돼요.', 'info'); return; }
    // AI 자동 채우기는 Pro 전용 (온보딩 투어 중에는 허용)
    if (userPlan.tier !== 'pro' && !isOnboardingActive()) { showUpgrade('autofill'); return; }
    setAnalyzingDoc(true);
    try {
      const blob = await (await fetch(d.dataUrl)).blob();
      const fd = new FormData();
      fd.append('file', blob, d.name);
      const res = await fetch('/api/analyze-doc', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const msg = data.error === 'no-text' ? '문서에서 텍스트를 읽지 못했어요(스캔 이미지 PDF일 수 있어요).'
          : data.error === 'unsupported' ? '지원하지 않는 형식이에요. PDF나 텍스트 파일을 올려주세요.'
          : '문서 분석에 실패했어요. 잠시 후 다시 시도해 주세요.';
        toast(msg, 'error');
        return;
      }
      const f = (data.fields ?? {}) as Partial<BusinessOverview>;
      type DocGoal = { name: string; statement?: string; targetDate?: string; successCriteria?: AiCriterion[]; strategies?: { area: string; content: string }[]; projects?: { name: string; finalDeliverable?: string; areaDeliverables?: { area: string; content: string }[] }[] };
      const docGoals = (data.goals ?? []) as DocGoal[];
      setPlan(prev => {
        if (!prev) return prev;
        const base = prev.overview ?? deriveOverview(prev);
        // 값이 있는 항목만 채우고, 빈 결과는 기존 값 유지
        const merged: BusinessOverview = {
          tagline: f.tagline?.trim() ? f.tagline : base.tagline,
          concept: f.concept?.trim() ? f.concept : base.concept,
          problem: f.problem?.trim() ? f.problem : base.problem,
          solution: f.solution?.trim() ? f.solution : base.solution,
          mission: f.mission?.trim() ? f.mission : base.mission,
          vision: f.vision?.trim() ? f.vision : base.vision,
        };
        let next: PlanData = { ...prev, overview: merged };
        // Goal이 아직 비어 있으면 문서 분석 결과로 채움 (기존 목표는 덮지 않음)
        if ((prev.goals?.length ?? 0) === 0 && docGoals.length > 0) {
          const newGoals: Goal[] = [];
          const newProjects: Project[] = [];
          docGoals.forEach((g, gi) => {
            const goalId = uid();
            newGoals.push({
              id: goalId, name: g.name, statement: g.statement ?? '', targetDate: g.targetDate, status: 'active', order: gi,
              successCriteria: (g.successCriteria ?? []).map(c => c.type === 'metric'
                ? { id: uid(), type: 'metric' as const, name: c.name, currentValue: c.current, targetValue: c.target, unit: c.unit, measurementPeriod: c.measurementPeriod }
                : { id: uid(), type: 'completion' as const, name: c.name, completed: false }),
              strategies: (g.strategies ?? []).map(s => ({ id: uid(), area: s.area, content: s.content })),
            });
            (g.projects ?? []).forEach((p, pi) => {
              newProjects.push({
                id: uid(), name: p.name, goalId, order: pi, finalDeliverable: p.finalDeliverable, status: 'planned',
                areaDeliverables: (p.areaDeliverables ?? []).map(a => ({ id: uid(), area: a.area, content: a.content })),
              });
            });
          });
          next = { ...next, goals: newGoals, projects: [...(prev.projects ?? []), ...newProjects] };
        }
        const wsId = selectedWsIdRef.current;
        if (wsId) store.updatePlanInWs(wsId, next);
        return next;
      });
      toast('사업계획서를 분석해 개요와 사업 목표를 채웠어요. 🌿', 'success');
    } catch {
      toast('네트워크 오류가 발생했어요.', 'error');
    } finally {
      setAnalyzingDoc(false);
    }
  };

  // ── Goal / Project(공유) / Strategy / AreaDeliverable CRUD (plan.goals + plan.projects) ──
  const aiGate = () => {
    if (userPlan.tier !== 'pro' && !isOnboardingActive()) { showUpgrade('autofill'); return false; }
    return true;
  };
  const addGoal = (name: string) => update({ goals: [...(plan.goals ?? []), { id: uid(), name, order: (plan.goals ?? []).length, status: 'active', strategies: [] }] });
  const updateGoal = (id: string, patch: Partial<Goal>) => update({ goals: (plan.goals ?? []).map(g => g.id === id ? { ...g, ...patch } : g) });
  const removeGoal = (id: string) => update({
    goals: (plan.goals ?? []).filter(g => g.id !== id),
    projects: (plan.projects ?? []).map(p => p.goalId === id ? { ...p, goalId: undefined } : p), // 프로젝트는 남기고 연결만 해제
  });
  const projectsOfGoal = (goalId: string) => (plan.projects ?? []).filter(p => p.goalId === goalId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const addProjectToGoal = (goalId: string, name: string) => update({ projects: [...(plan.projects ?? []), { id: uid(), name, goalId, order: (plan.projects ?? []).filter(p => p.goalId === goalId).length, status: 'planned', areaDeliverables: [] }] });

  // Plan 목표 → Goals 로드맵: 목표의 프로젝트를 데드라인으로, 영역별 산출물을 할일로 만들어 날짜대로 배치
  const importGoalToGoals = (goalId: string) => {
    if (!selectedWsId) return;
    const goal = (plan.goals ?? []).find(g => g.id === goalId);
    const projects = projectsOfGoal(goalId);
    if (!goal || !projects.length) { toast('가져올 프로젝트가 없어요. 먼저 프로젝트를 만들어 주세요.', 'info'); return; }

    const projIds = new Set(projects.map(p => p.id));
    const ws = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId);
    const dupPrograms = (ws?.programs ?? []).filter(pg => (pg.deadlines ?? []).some(dl => dl.projectId && projIds.has(dl.projectId)));
    if (dupPrograms.length) {
      if (!window.confirm('이미 Goals로 가져온 목표예요. 기존 것을 지우고 다시 가져올까요?')) return;
      dupPrograms.forEach(pg => store.deleteProgramInWs(selectedWsId, pg.id));
    }

    const deadlines = projects.map(p => {
      const start = p.startDate || '';
      const end = p.endDate || p.deadline || goal.targetDate || start || '';
      const todos = (p.areaDeliverables ?? []).map(a => ({
        id: uid(),
        name: a.area ? `${a.area}: ${a.content}` : a.content,
        done: !!a.done,
        deliverableId: a.id,
        ...(start ? { date: start } : end ? { date: end } : {}),
        ...(end ? { deadline: end } : {}),
      }));
      return { id: uid(), name: p.name, date: end, startDate: start || undefined, todos, enabled: true, projectId: p.id };
    });

    const allDates = deadlines.flatMap(d => [d.startDate, d.date]).filter(Boolean) as string[];
    const anchorDate = allDates.length ? new Date(allDates.sort()[0]) : new Date();
    store.addProgramToWs(selectedWsId, {
      name: goal.name,
      goal: goal.statement || goal.name,
      color: store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId)?.workspace.color || BUSINESS_COLORS[0],
      fromPlan: true,
      deadlines,
      year: anchorDate.getFullYear(),
      quarter: Math.floor(anchorDate.getMonth() / 3) + 1,
      order: (ws?.programs ?? []).length,
    });
    toast(`‘${goal.name}’을(를) Goals 로드맵으로 가져왔어요. 🌿`, 'success');
  };
  const updateProject = (id: string, patch: Partial<Project>) => {
    const prev = (plan.projects ?? []).find(p => p.id === id);
    update({ projects: (plan.projects ?? []).map(p => p.id === id ? { ...p, ...patch } : p) });
    // 시작일/종료일이 바뀌면 Goals 로드맵의 대응 프로젝트(데드라인)도 함께 이동
    if ((patch.startDate !== undefined || patch.endDate !== undefined) && prev) {
      syncDeadlineDates(id, patch.startDate ?? prev.startDate, patch.endDate ?? prev.endDate, prev.startDate);
    }
    // 이름/영역별 산출물이 바뀌면 로드맵 데드라인의 이름·산출물(todo)을 즉시 동기화
    if ((patch.name !== undefined || patch.areaDeliverables !== undefined) && prev) {
      syncProjectToRoadmap(id, { ...prev, ...patch });
    }
  };
  // Plan 프로젝트(이름·영역별 산출물) → 로드맵 데드라인의 이름·산출물(todo) 즉시 반영 (하위 task 보존)
  const syncProjectToRoadmap = (projectId: string, proj: Project) => {
    if (!selectedWsId) return;
    const ads = proj.areaDeliverables ?? [];
    const ws = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId);
    for (const pg of ws?.programs ?? []) {
      let changed = false;
      const deadlines = (pg.deadlines ?? []).map(dl => {
        if (dl.projectId !== projectId) return dl;
        const existing = new Map(dl.todos.filter(t => t.deliverableId).map(t => [t.deliverableId as string, t] as const));
        const start = dl.startDate || dl.date || undefined;
        // Plan의 산출물 순서대로 todo 재구성: 기존은 이름·완료만 갱신(하위 task 보존), 새 산출물은 생성
        const synced = ads.map(a => {
          const name = a.area ? `${a.area}: ${a.content}` : a.content;
          const ex = existing.get(a.id);
          if (ex) return { ...ex, name, done: !!a.done };
          return { id: uid(), name, done: !!a.done, deliverableId: a.id, ...(start ? { date: start, deadline: dl.date || start } : {}) };
        });
        const manual = dl.todos.filter(t => !t.deliverableId); // 로드맵에서 직접 추가한 산출물은 유지
        const nextTodos = [...synced, ...manual];
        const sig = (todos: typeof nextTodos, nm: string) => nm + ' ' + todos.map(t => `${t.id}:${t.name}:${t.done ? 1 : 0}:${t.deliverableId ?? ''}`).join('|');
        if (sig(dl.todos, dl.name) === sig(nextTodos, proj.name)) return dl; // 변화 없으면 그대로 (불필요한 쓰기 방지)
        changed = true;
        return { ...dl, name: proj.name, todos: nextTodos };
      });
      if (changed) store.updateProgramInWs(selectedWsId, { ...pg, deadlines });
    }
  };
  // Plan 프로젝트 날짜 변경 → 로드맵 데드라인(+하위 할일/task) 이동
  const syncDeadlineDates = (projectId: string, newStart?: string, newEnd?: string, oldStart?: string) => {
    if (!selectedWsId) return;
    const addDaysS = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const daysBtw = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
    const ws = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId);
    for (const pg of ws?.programs ?? []) {
      let changed = false;
      const deadlines = (pg.deadlines ?? []).map(dl => {
        if (dl.projectId !== projectId) return dl;
        changed = true;
        const base = dl.startDate || oldStart; // 이동 기준(기존 시작일)
        const delta = newStart && base ? daysBtw(base, newStart) : 0;
        const shift = (d?: string) => (d && delta ? addDaysS(d, delta) : d);
        const todos = dl.todos.map(t => ({
          ...t, date: shift(t.date), deadline: shift(t.deadline),
          subtasks: (t.subtasks ?? []).map(s => ({ ...s, date: shift(s.date), deadline: shift(s.deadline), units: (s.units ?? []).map(u => ({ ...u, date: shift(u.date), deadline: shift(u.deadline) })) })),
        }));
        return { ...dl, startDate: newStart || dl.startDate, date: newEnd || shift(dl.date) || dl.date, todos };
      });
      if (changed) store.updateProgramInWs(selectedWsId, { ...pg, deadlines });
    }
  };
  // 영역별 산출물 완료 토글 — Plan에 반영 + Goals(카테고리 보드)의 대응 산출물(todo) 완료 동기화
  const toggleAreaDeliverableDone = (projectId: string, deliverableId: string) => {
    const proj = (plan.projects ?? []).find(p => p.id === projectId);
    const ad = proj?.areaDeliverables?.find(x => x.id === deliverableId);
    if (!ad) return;
    const nextDone = !ad.done;
    update({ projects: (plan.projects ?? []).map(p => p.id !== projectId ? p : { ...p, areaDeliverables: (p.areaDeliverables ?? []).map(x => x.id === deliverableId ? { ...x, done: nextDone } : x) }) });
    // Goals 프로그램의 대응 todo 동기화 (현재 워크스페이스)
    if (!selectedWsId) return;
    const now = new Date();
    const todayS = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const expectedName = ad.area ? `${ad.area}: ${ad.content}` : ad.content;
    const ws = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId);
    for (const pg of ws?.programs ?? []) {
      let changed = false;
      const deadlines = (pg.deadlines ?? []).map(dl => {
        if (dl.projectId !== projectId) return dl;
        return { ...dl, todos: dl.todos.map(t => {
          const match = t.deliverableId === deliverableId || (!t.deliverableId && t.name === expectedName);
          if (!match) return t;
          changed = true;
          return { ...t, done: nextDone, doneDate: nextDone ? todayS : undefined };
        }) };
      });
      if (changed) store.updateProgramInWs(selectedWsId, { ...pg, deadlines });
    }
  };
  // 프로젝트 상태 변경 — Plan 반영 + Goals(로드맵/보드)의 대응 데드라인 done 동기화(완료 시 숨김)
  const setProjectStatus = (projectId: string, status: ProjectStatus) => {
    update({ projects: (plan.projects ?? []).map(p => p.id === projectId ? { ...p, status } : p) });
    if (!selectedWsId) return;
    const done = status === 'done';
    const ws = store.allWorkspacesEntries.find(e => e.workspace.id === selectedWsId);
    for (const pg of ws?.programs ?? []) {
      let changed = false;
      const deadlines = (pg.deadlines ?? []).map(dl => {
        if (dl.projectId !== projectId || !!dl.done === done) return dl;
        changed = true;
        return { ...dl, done, doneAt: done ? new Date().toISOString() : undefined };
      });
      if (changed) store.updateProgramInWs(selectedWsId, { ...pg, deadlines });
    }
  };
  // 프로젝트 날짜 재조정 — 오늘(또는 목표 시작일)부터 순서대로 기간 유지하며 겹치지 않게 배치
  const resequenceProjects = (goalId: string) => {
    const goal = (plan.goals ?? []).find(g => g.id === goalId);
    const projs = projectsOfGoal(goalId);
    if (!projs.length) { toast('재조정할 프로젝트가 없어요.', 'info'); return; }
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const addDaysS = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const daysBtw = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
    // 각 프로젝트 기간(일): 기존 start~end 유지, 없으면 영역별 산출물 수 기반(1개당 ~1주, 최소 7일)
    const durOf = (p: Project) => {
      if (p.startDate && p.endDate) { const d = daysBtw(p.startDate, p.endDate); if (d >= 0) return d; }
      return Math.max(6, (p.areaDeliverables?.length ?? 1) * 6 - 1);
    };
    let cursor = goal?.startDate && goal.startDate > today ? goal.startDate : today;
    const patchById = new Map<string, { startDate: string; endDate: string; deadline: string }>();
    for (const p of projs) {
      const end = addDaysS(cursor, durOf(p));
      patchById.set(p.id, { startDate: cursor, endDate: end, deadline: end });
      cursor = addDaysS(end, 1);
    }
    update({ projects: (plan.projects ?? []).map(p => patchById.has(p.id) ? { ...p, ...patchById.get(p.id)! } : p) });
    toast(`${projs.length}개 프로젝트 날짜를 순서대로 재조정했어요.`, 'success');
  };
  const removeProject = (id: string) => update({ projects: (plan.projects ?? []).filter(p => p.id !== id) });

  // ── AI: 목표 설계 팝업 열기 / 점검 / 쪼개기 ──
  const suggestGoals = () => {
    if (!aiGate()) return;
    // 티칭 투어 중에는 모달(오버레이에 가려짐) 대신 직접 생성·적용 경로로
    if (typeof window !== 'undefined' && (window as Window & { __spiraTeachDirectGoals?: boolean }).__spiraTeachDirectGoals) {
      window.dispatchEvent(new CustomEvent('spira-teach:suggest-goals')); return;
    }
    setGoalPlanOpen(true);
  };
  // 팝업에서 확정한 목표들을 실제 반영 (첫 목표만 진행중, 나머지 보류)
  const applyPlannedGoals = (planned: PlanGoal[]) => {
    setPlan(prev => {
      if (!prev) return prev;
      const base = prev.goals ?? [];
      const newGoals: Goal[] = planned.map((g, i) => ({
        id: uid(), name: g.name, targetDate: g.targetDate,
        status: (base.length === 0 && i === 0) ? 'active' : 'onhold',
        order: base.length + i,
        strategies: (g.strategies ?? []).map(s => ({ id: uid(), area: s.area, content: s.content })),
        successCriteria: g.successCriteria.filter(c => c.type === 'metric').map(c => ({ id: uid(), type: 'metric' as const, name: c.name, currentValue: c.current, targetValue: c.target, unit: c.unit, measurementPeriod: c.measurementPeriod })),
      }));
      const next = { ...prev, goals: [...base, ...newGoals] };
      const wsId = selectedWsIdRef.current;
      if (wsId) store.updatePlanInWs(wsId, next);
      return next;
    });
    setGoalPlanOpen(false);
    toast(`목표 ${planned.length}개를 추가했어요. 🌿`, 'success');
  };
  // 티칭 투어 직접 생성 로직 주입(리스너는 위에서 등록)
  teachSuggestRef.current = async () => {
    if (!aiGate()) return;
    try {
      const areas = (plan.workAreas ?? []).map(a => a.name);
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'goal-suggest', context: buildContext(), areas, today, messages: [{ role: 'user', content: '이 사업의 성장 목표 5단계를 현실적이고 촘촘하게(달성 가능한 작은 수치부터) 제안해줘.' }] }) });
      const data = await res.json().catch(() => ({}));
      const gs = Array.isArray(data.goals) ? data.goals : [];
      if (gs.length) applyPlannedGoals(gs);
    } catch { /* 무시 */ }
  };
  const reviewGoal = async (goalId: string) => {
    if (!aiGate()) return;
    const goal = (plan.goals ?? []).find(g => g.id === goalId);
    if (!goal) return;
    setAiBusyId(goalId);
    try {
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch('/api/goal-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: buildContext(), goalName: goal.name, goalStatement: goal.statement ?? '', today }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { toast('목표 점검에 실패했어요. 잠시 후 다시 시도해 주세요.', 'error'); return; }
      setPreview({ kind: 'goal-review', goalId, goalName: goal.name, data });
    } catch { toast('네트워크 오류가 발생했어요.', 'error'); }
    finally { setAiBusyId(null); }
  };
  // 목표 → 프로젝트 쪼개기: 미리보기 없이 바로 추가
  const breakdownGoal = async (goalId: string) => {
    if (!aiGate()) return;
    const goal = (plan.goals ?? []).find(g => g.id === goalId);
    if (!goal) return;
    setAiBusyId(goalId);
    try {
      const areas = (plan.workAreas ?? []).map(a => a.name);
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'goal-breakdown', context: buildContext(), goalName: goal.name, goalDesc: goal.statement ?? '', goalTargetDate: goal.targetDate ?? '', today, areas }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { toast('AI 분해에 실패했어요.', 'error'); return; }
      const projs = (data.projects ?? []) as { name: string; finalDeliverable: string; startDate?: string; endDate?: string; areaDeliverables?: { area: string; content: string }[] }[];
      if (!projs.length) { toast('제안할 프로젝트를 찾지 못했어요.', 'info'); return; }
      const baseCount = (plan.projects ?? []).filter(x => x.goalId === goalId).length;
      const newProjects: Project[] = projs.map((p, i) => ({
        id: uid(), name: p.name, goalId, order: baseCount + i, finalDeliverable: p.finalDeliverable,
        startDate: p.startDate || undefined, endDate: p.endDate || undefined, status: 'planned',
        areaDeliverables: (p.areaDeliverables ?? []).map(a => ({ id: uid(), area: a.area, content: a.content })),
      }));
      setPlan(prev => {
        if (!prev) return prev;
        const next = { ...prev, projects: [...(prev.projects ?? []), ...newProjects] };
        const wsId = selectedWsIdRef.current;
        if (wsId) store.updatePlanInWs(wsId, next);
        return next;
      });
      toast(`프로젝트 ${projs.length}개를 추가했어요. 🌿`, 'success');
      // 생성된 첫 프로젝트를 자동으로 펼쳐 보이게
      if (newProjects[0]) window.dispatchEvent(new CustomEvent('spira:expand-project', { detail: newProjects[0].id }));
    } catch { toast('네트워크 오류가 발생했어요.', 'error'); }
    finally { setAiBusyId(null); }
  };
  // 상황 변화(목표 달성 불가·전략 수정 등) → AI와 대화하며 프로젝트 수정 (채팅 팝업)
  const reviseProjects = (goalId: string) => { if (aiGate()) setReviseGoalId(goalId); };
  const applyRevisedProjects = (goalId: string, projs: PlanProject[]) => {
    setPlan(prev => {
      if (!prev) return prev;
      const others = (prev.projects ?? []).filter(x => x.goalId !== goalId);
      const newProjects: Project[] = projs.map((p, i) => ({
        id: uid(), name: p.name, goalId, order: i, finalDeliverable: p.finalDeliverable,
        startDate: p.startDate || undefined, endDate: p.endDate || undefined, status: 'planned',
        areaDeliverables: (p.areaDeliverables ?? []).map(a => ({ id: uid(), area: a.area, content: a.content })),
      }));
      const next = { ...prev, projects: [...others, ...newProjects] };
      const wsId = selectedWsIdRef.current;
      if (wsId) store.updatePlanInWs(wsId, next);
      return next;
    });
    setReviseGoalId(null);
    toast(`프로젝트를 ${projs.length}개로 수정했어요. 🌿`, 'success');
  };
  // 프로젝트 → 최종 결과물·산출물 쪼개기: 미리보기 없이 바로 채움
  const breakdownProject = async (goalId: string, projectId: string) => {
    if (!aiGate()) return;
    const goal = (plan.goals ?? []).find(g => g.id === goalId);
    const project = (plan.projects ?? []).find(p => p.id === projectId);
    if (!project) return;
    setAiBusyId(projectId);
    try {
      const areas = (plan.workAreas ?? []).map(a => a.name);
      const res = await fetch('/api/split', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'project-breakdown', context: buildContext(), goalName: goal?.name ?? '', projectName: project.name, areas }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { toast('AI 분해에 실패했어요.', 'error'); return; }
      const ads = (data.areaDeliverables ?? []) as { area: string; content: string }[];
      const fd = String(data.finalDeliverable ?? '').trim();
      if (!fd && !ads.length) { toast('제안할 내용을 찾지 못했어요.', 'info'); return; }
      setPlan(prev => {
        if (!prev) return prev;
        const next = { ...prev, projects: (prev.projects ?? []).map(p => p.id === projectId ? {
          ...p,
          finalDeliverable: p.finalDeliverable || fd,
          areaDeliverables: [...(p.areaDeliverables ?? []), ...ads.map(a => ({ id: uid(), area: a.area, content: a.content }))],
        } : p) };
        const wsId = selectedWsIdRef.current;
        if (wsId) store.updatePlanInWs(wsId, next);
        return next;
      });
      toast('산출물을 채웠어요. 🌿', 'success');
    } catch { toast('네트워크 오류가 발생했어요.', 'error'); }
    finally { setAiBusyId(null); }
  };
  // 목표 점검 제안 승인 → 반영 (목표 자체를 바꾸는 점검만 미리보기 유지)
  const applyPreview = () => {
    if (!preview) return;
    const d = preview.data;
    const criteria: SuccessCriterion[] = d.successCriteria.filter(c => c.type === 'metric').map(c => ({ id: uid(), type: 'metric', name: c.name, currentValue: c.current, targetValue: c.target, unit: c.unit, measurementPeriod: c.measurementPeriod }));
    update({ goals: (plan.goals ?? []).map(g => g.id === preview.goalId ? {
      ...g,
      name: d.title || g.name,
      targetDate: d.targetDate || g.targetDate,
      ...(criteria.length ? { successCriteria: criteria } : {}),
    } : g) });
    setPreview(null);
    toast('적용했어요. 🌿', 'success');
  };

  // 기획서 전체 일괄 채우기 (모든 필드)
  const handleFillAll = () => genField(
    `아래 사업 정보를 바탕으로 기획서의 '모든 항목'(tagline, mission, vision, concept, problems, solutions, revenueModel, products, brandingKeywords, valueProposition, targetCustomers, growthStages, workAreas)을 한 번에 채워줘. products는 이 사업에서 판매·출시하는 것(웹앱·앱·굿즈 등). 비어 있는 항목까지 전부 채우고, 추가 질문 없이 반드시 %%%PLAN_UPDATE%%% 형식의 JSON으로 모든 필드를 출력해줘.\n\n${buildContext()}`,
    '기획서 전체를 채워줘');

  const handlePrint = async () => {
    // 새 탭을 사용자 제스처 안에서 먼저 열어야 팝업 차단을 피할 수 있음 (async 이후엔 차단됨)
    const w = window.open('', '_blank');
    const brandName = selectedWsName;
    // 문서용으로 이미지를 축소·압축(최대 1000px, JPEG)해 거대한 base64 인라인으로 인한 렉 방지
    const imgs = await Promise.all((plan.brandImages ?? []).map(s => downscaleDataUrl(s, 1000, true)));
    const html = buildPrintHtml({ ...plan, brandImages: imgs }, brandName);
    if (!w) return; // 팝업이 차단된 경우
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="grid grid-cols-1 gap-8 items-start">
    {/* ── 왼쪽: 메인 ── */}
    <div className="min-w-0 pb-24">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-[28px] font-black tracking-[-0.02em]" style={{ color: '#16211E' }}>Plan</h1>
      </div>

      {/* 비즈니스 버튼 (기획서 선택) */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {store.allWorkspacesEntries.map(entry => {
          const sel = selectedWsId === entry.workspace.id;
          return (
            <button
              key={entry.workspace.id}
              onClick={() => setSelectedWsId(entry.workspace.id)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
              style={sel ? { backgroundColor: '#DFF9C4', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
            >
              {entry.workspace.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.workspace.color }} />}
              {entry.workspace.name}
            </button>
          );
        })}
        <button
          onClick={() => {
            // 무료 플랜: 비즈니스 1개까지 — 추가는 Pro (유료 안내 팝업)
            if (userPlan.tier !== 'pro' && store.allWorkspaces.length >= 1) { showUpgrade('workspace'); return; }
            const name = window.prompt('새 기획서 이름을 입력하세요');
            if (name?.trim()) store.addWorkspace(name.trim());
          }}
          className="px-3 py-1.5 text-[13px] transition-colors hover:opacity-70"
          style={{ color: '#9AA39D' }}
        >
          + 새 기획서
        </button>
      </div>

      {/* 사업 고유 컬러 설정 + 더보기 */}
      <div className="flex items-center gap-1.5 mb-8">
        <span className="text-[12px] mr-1" style={{ color: '#9AA39D' }}>사업 컬러</span>
        {BUSINESS_COLORS.map(c => (
          <button
            key={c}
            onClick={() => store.setWorkspaceColor(selectedWsId, c)}
            style={{ backgroundColor: c }}
            title={c}
            className={`w-5 h-5 rounded-full transition-transform ${
              selectedWsColor === c ? 'ring-2 ring-offset-1 ring-neutral-400 scale-110' : 'hover:scale-105'
            }`}
          />
        ))}
        <div className="relative flex-shrink-0 ml-auto" ref={moreRef}>
          <button
            onClick={() => setMoreOpen(o => !o)}
            className="w-8 h-8 rounded-full border bg-white flex items-center justify-center transition-colors hover:bg-neutral-50"
            style={{ borderColor: 'var(--spira-border-strong)', color: '#5B6560' }}
            title="더보기"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border rounded-2xl shadow-lg py-1.5 z-30" style={{ borderColor: 'var(--spira-border-subtle)', boxShadow: 'var(--spira-shadow-lg)' }}>
              <button onClick={() => { setMoreOpen(false); handleRenameBusiness(); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left hover:bg-neutral-50 transition-colors" style={{ color: '#16211E' }}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10a2 2 0 00-2.83-2.83L5.17 17.17 4 20z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                사업 이름 변경
              </button>
              <div className="my-1 h-px" style={{ backgroundColor: 'var(--spira-border-subtle)' }} />
              <button onClick={() => { setMoreOpen(false); handleDeleteBusiness(); }} disabled={isLastBusiness} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: '#C24B4B' }} title={isLastBusiness ? '마지막 사업은 삭제할 수 없어요' : undefined}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5.5 4.5l.4 8a1 1 0 001 .95h2.2a1 1 0 001-.95l.4-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                사업 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {/* 상단: 사업계획서 업로드 또는 사업 개요 직접 작성 */}
        <BusinessDocBox
          doc={plan.planDoc}
          overview={plan.overview ?? deriveOverview(plan)}
          onSetDoc={d => { update({ planDoc: d }); void analyzeDocToOverview(d); }}
          onRemoveDoc={() => update({ planDoc: undefined })}
          onChangeOverview={o => update({ overview: o })}
          onGenerateField={chat && !chat.loading ? handleGenerateOverviewField : undefined}
          aiEnabled={!!chat && !chat.loading}
          analyzing={analyzingDoc}
        />

        {/* 하단: 사업 목표 (Goal > Strategy > Project > Area Deliverable) */}
        <GoalsSection
          goals={plan.goals ?? []}
          projectsOfGoal={projectsOfGoal}
          workAreas={(plan.workAreas ?? []).map(a => a.name)}
          onAddGoal={addGoal}
          onUpdateGoal={updateGoal}
          onRemoveGoal={removeGoal}
          onAddProject={addProjectToGoal}
          onUpdateProject={updateProject}
          onRemoveProject={removeProject}
          onReviewGoal={reviewGoal}
          onBreakdownGoal={breakdownGoal}
          onBreakdownProject={breakdownProject}
          onSuggestGoals={suggestGoals}
          onImportGoal={importGoalToGoals}
          onReviseProjects={reviseProjects}
          onResequenceProjects={resequenceProjects}
          onToggleAreaDone={toggleAreaDeliverableDone}
          onSetProjectStatus={setProjectStatus}
          aiBusyId={aiBusyId}
          aiEnabled={!!chat && !chat.loading}
          focusGoal={focusGoal}
          onFocusHandled={() => setFocusGoal(null)}
        />
      </div>

    </div>

    {/* AI 제안 미리보기(승인 전) 모달 */}
    {preview && <AiPreviewModal preview={preview} onApply={applyPreview} onClose={() => setPreview(null)} />}
    {goalPlanOpen && <GoalPlanModal context={buildContext()} areas={(plan.workAreas ?? []).map(a => a.name)} onApply={applyPlannedGoals} onClose={() => setGoalPlanOpen(false)} />}
    {reviseGoalId && (() => {
      const g = (plan.goals ?? []).find(x => x.id === reviseGoalId);
      if (!g) return null;
      return <ProjectReviseModal
        context={buildContext()} areas={(plan.workAreas ?? []).map(a => a.name)}
        goalName={g.name} goalDesc={g.statement ?? ''} goalTargetDate={g.targetDate ?? ''}
        strategies={(g.strategies ?? []).map(s => ({ area: s.area, content: s.content }))}
        currentProjects={projectsOfGoal(reviseGoalId).map(p => ({ name: p.name, finalDeliverable: p.finalDeliverable ?? '', areaDeliverables: (p.areaDeliverables ?? []).map(a => ({ area: a.area, content: a.content })) }))}
        onApply={projs => applyRevisedProjects(reviseGoalId, projs)} onClose={() => setReviseGoalId(null)} />;
    })()}

    {flagAward && <FlagAward {...flagAward} onClose={() => setFlagAward(null)} />}
    </div>
  );
}
