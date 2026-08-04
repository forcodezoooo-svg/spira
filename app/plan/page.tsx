'use client';
import { useState, useEffect, useRef, forwardRef } from 'react';
import { useStore } from '../lib/useStore';
import { useToast } from '../lib/ToastContext';
import { ListSkeleton } from '../components/Skeleton';
import { PlanData, PlanItem, TargetCustomer, GrowthStage, WorkArea } from '../lib/types';
import TargetCustomerModal, { Avatar } from '../components/TargetCustomerModal';
import { uid } from '../lib/store';
import { useChatContext } from '../lib/ChatContext';
import { buildValuePropPrompt, buildSolutionsPrompt, buildRevenuePrompt, buildBrandingPrompt, buildPersonasPrompt, buildGrowthStagesPrompt, buildWorkAreasPrompt } from '../lib/ai/prompts';
import MusicTimer from '../components/MusicTimer';
import MemoPanel from '../components/MemoPanel';
import FlagAward from '../components/FlagAward';

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
          data-teach={onAskAI ? 'plan-fill' : undefined}
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

// ── List section ───────────────────────────────────────────────────────────────

function ListSection({
  label, hint, items, onAdd, onRemove, placeholder, onGenerate,
}: {
  label: string;
  hint: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
  onGenerate?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const chat = useChatContext();

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleAdd = () => {
    const v = input.trim();
    if (!v) return;
    onAdd(v);
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
        onEdit={() => setIsEditing(true)}
        onSave={() => { setIsEditing(false); setInput(''); }}
        onAskAI={handleAskAI}
      />
      <div className={`bg-white border rounded-xl px-5 py-4 transition-all ${isEditing ? 'ring-2 ring-violet-400 border-violet-300' : 'border-neutral-200'}`}>
        {items.length === 0 && !isEditing ? (
          <p className="text-sm text-neutral-400">{placeholder}</p>
        ) : (
          <>
            {items.length > 0 && (
              <ul className="space-y-2 mb-3">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-neutral-400 text-xs mt-0.5 flex-shrink-0">•</span>
                    <span className="text-sm text-neutral-800 flex-1 leading-relaxed">{item}</span>
                    {isEditing && (
                      <button onClick={() => onRemove(i)} className="text-neutral-400 hover:text-red-400 text-xs flex-shrink-0 transition-colors mt-0.5">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isEditing && (
              <div className={`flex gap-2 ${items.length > 0 ? 'pt-3 border-t border-neutral-100' : ''}`}>
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
  const MAX = 10;
  const isFull = images.length >= MAX;

  const readFiles = (files: File[]) => {
    const remaining = MAX - images.length;
    files.filter(f => f.type.startsWith('image/')).slice(0, remaining).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => onAdd(reader.result as string);
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
          <Hint text="로고, 무드보드 등 브랜드를 대표하는 이미지를 최대 10장 업로드하세요." />
        </div>
        <span className={`text-xs ${images.length >= MAX ? 'text-neutral-600 font-medium' : 'text-neutral-700'}`}>
          {images.length}/{MAX}
        </span>
      </div>

      <div
        className={`grid grid-cols-3 gap-2 rounded-xl p-2 transition-colors ${dragging && !isFull ? 'bg-violet-50 ring-2 ring-violet-300 ring-dashed' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {images.map((src, i) => (
          <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-neutral-100">
            <img src={src} alt={`brand-${i}`} className="w-full h-full object-cover" />
            <button
              onClick={() => onRemove(i)}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/50 text-neutral-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none hover:bg-white/70"
            >
              ×
            </button>
          </div>
        ))}
        {!isFull && (
          <button
            onClick={() => fileRef.current?.click()}
            className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all ${
              dragging ? 'border-violet-400 text-neutral-600' : 'border-neutral-200 text-neutral-700 hover:text-neutral-600 hover:border-violet-300'
            }`}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-xs">{dragging ? '여기에 놓기' : '이미지 추가'}</span>
          </button>
        )}
        {dragging && !isFull && images.length === 0 && (
          <div className="col-span-3 py-4 flex flex-col items-center justify-center gap-1 text-neutral-600 pointer-events-none">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm font-medium">이미지를 여기에 놓으세요</p>
          </div>
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
};

export default function PlanPage() {
  const store = useStore();
  const { toast } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const h = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moreOpen]);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
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
            workAreas: patch.workAreas.map((a, i) => ({
              id: uid(),
              name: a.name ?? '',
              goal: a.goal ?? '',
              color: a.color ?? BUSINESS_COLORS[i % BUSINESS_COLORS.length],
            })),
          }),
        };
        const wsId = selectedWsIdRef.current;
        if (wsId) storeRef.current.updatePlanInWs(wsId, next);
        else storeRef.current.updatePlan(next);
        return next;
      });
    });
    return () => chat.unregisterPlanHandler();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const update = (patch: Partial<PlanData>) => {
    const next = { ...plan, ...patch };
    setPlan(next);
    store.updatePlanInWs(selectedWsId, next);
  };

  const addItem = (key: 'problems', value: string) =>
    update({ [key]: [...plan[key], value] });

  const removeItem = (key: 'problems', index: number) =>
    update({ [key]: plan[key].filter((_, i) => i !== index) });

  const addPlanItem = (key: 'solutions' | 'revenueModel', value: PlanItem) =>
    update({ [key]: [...plan[key], value] });

  const updatePlanItem = (key: 'solutions' | 'revenueModel', index: number, value: PlanItem) =>
    update({ [key]: plan[key].map((v, i) => i === index ? value : v) });

  const removePlanItem = (key: 'solutions' | 'revenueModel', index: number) =>
    update({ [key]: plan[key].filter((_, i) => i !== index) });

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

  const buildContext = () => [
    plan.tagline && `한 줄 소개: ${plan.tagline}`,
    plan.mission && `미션: ${plan.mission}`,
    plan.vision && `비전: ${plan.vision}`,
    plan.concept && `컨셉: ${plan.concept}`,
    plan.problems.length && `문제:\n${plan.problems.map(p => `- ${p}`).join('\n')}`,
    plan.solutions.length && `솔루션:\n${plan.solutions.map(s => `- ${s.title}${s.memo ? `: ${s.memo}` : ''}`).join('\n')}`,
    plan.revenueModel.length && `수익 구조:\n${plan.revenueModel.map(r => `- ${r.title}${r.memo ? `: ${r.memo}` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n') || '(아직 사업 정보가 없습니다)';

  // 항목별 채우기 — API엔 상세 명령(마커 지시) 전송, 화면 말풍선엔 자연어만 표시
  const genField = (apiPrompt: string, display: string) => {
    if (!chat || chat.loading) return;
    chat.setOpen(true);
    chat.sendMessage(apiPrompt, display);
  };
  const handleGenerateValueProp = () => genField(buildValuePropPrompt(buildContext()), '핵심 가치 제안을 채워줘');
  const handleGenerateSolutions = () => genField(buildSolutionsPrompt(buildContext()), '솔루션/제품을 제안해줘');
  const handleGenerateRevenueModel = () => genField(buildRevenuePrompt(buildContext()), '수익 구조를 제안해줘');
  const handleGenerateBrandingKeywords = () => genField(buildBrandingPrompt(buildContext()), '브랜딩 키워드를 만들어줘');
  const handleGeneratePersonas = () => genField(buildPersonasPrompt(buildContext()), '타겟 고객 페르소나를 만들어줘');
  const handleGenerateGrowthStages = () => genField(buildGrowthStagesPrompt(buildContext()), '사업 성장 단계를 설계해줘');
  const handleGenerateWorkAreas = () => genField(buildWorkAreasPrompt(buildContext()), '업무 영역을 정리해줘');
  const handleGenerateProblems = () => genField(
    `아래 사업 정보를 바탕으로 이 사업이 해결하려는 고객의 핵심 문제를 2~3개로 구체적으로 정의해줘. 조언만 하지 말고, 반드시 답변 맨 끝에 %%%PLAN_UPDATE%%% 마커와 problems 배열이 담긴 JSON을 출력해줘.\n\n${buildContext()}`,
    '문제 정의를 작성해줘');

  // 기획서 전체 일괄 채우기 (모든 필드)
  const handleFillAll = () => genField(
    `아래 사업 정보를 바탕으로 기획서의 '모든 항목'(tagline, mission, vision, concept, problems, solutions, revenueModel, brandingKeywords, valueProposition, targetCustomers, growthStages, workAreas)을 한 번에 채워줘. 비어 있는 항목까지 전부 채우고, 추가 질문 없이 반드시 %%%PLAN_UPDATE%%% 형식의 JSON으로 모든 필드를 출력해줘.\n\n${buildContext()}`,
    '기획서 전체를 채워줘');

  const handlePrint = () => {
    const brandName = selectedWsName;
    const html = buildPrintHtml(plan, brandName);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) w.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
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
              <button onClick={() => { setMoreOpen(false); handleFillAll(); }} disabled={!chat || chat.loading} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-semibold text-left hover:bg-neutral-50 transition-colors disabled:opacity-40" style={{ color: '#16211E' }}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.73 5.27L19 10l-5.27 1.73L12 17l-1.73-5.27L5 10l5.27-1.73L12 3z" /></svg>
                AI로 전체 채우기
              </button>
              <div className="my-1 h-px" style={{ backgroundColor: 'var(--spira-border-subtle)' }} />
              <button onClick={() => { setMoreOpen(false); handlePrint(); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left hover:bg-neutral-50 transition-colors" style={{ color: '#16211E' }}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                문서 저장
              </button>
              <button onClick={() => { setMoreOpen(false); handleDeleteBusiness(); }} disabled={isLastBusiness} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: '#C24B4B' }} title={isLastBusiness ? '마지막 사업은 삭제할 수 없어요' : undefined}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5.5 4.5l.4 8a1 1 0 001 .95h2.2a1 1 0 001-.95l.4-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                사업 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <BrandImageSection
          images={plan.brandImages ?? []}
          onAdd={v => update({ brandImages: [...(plan.brandImages ?? []), v] })}
          onRemove={i => update({ brandImages: (plan.brandImages ?? []).filter((_, idx) => idx !== i) })}
        />

        <BrandingKeywordsSection
          keywords={plan.brandingKeywords ?? []}
          onAdd={addKeyword}
          onRemove={removeKeyword}
          onGenerate={chat && !chat.loading ? handleGenerateBrandingKeywords : undefined}
        />

        <TextSection
          label="브랜드 한 줄 소개"
          hint={HINTS.tagline}
          value={plan.tagline}
          onChange={v => update({ tagline: v })}
          placeholder="브랜드를 한 문장으로 소개하세요."
        />

        <ListSection
          label="문제 정의"
          hint={HINTS.problems}
          items={plan.problems}
          onAdd={v => addItem('problems', v)}
          onRemove={i => removeItem('problems', i)}
          placeholder="해결하려는 문제를 입력하세요."
          onGenerate={chat && !chat.loading ? handleGenerateProblems : undefined}
        />

        <TextSection
          label="미션"
          hint={HINTS.mission}
          value={plan.mission}
          onChange={v => update({ mission: v })}
          placeholder="우리가 존재하는 이유와 목적을 적어보세요."
        />

        <TextSection
          label="비전"
          hint={HINTS.vision}
          value={plan.vision}
          onChange={v => update({ vision: v })}
          placeholder="이 사업으로 궁극적으로 이루고 싶은 것을 적어보세요."
        />

        <TextSection
          label="컨셉"
          hint={HINTS.concept}
          value={plan.concept}
          onChange={v => update({ concept: v })}
          placeholder="브랜드의 핵심 컨셉과 방향성을 적어보세요."
        />

        <ValuePropSection
          hint={HINTS.valueProposition}
          value={plan.valueProposition}
          onChange={v => update({ valueProposition: v })}
          onAskAI={chat && !chat.loading ? handleGenerateValueProp : undefined}
        />

        <TargetCustomerSection
          hint={HINTS.targetCustomers}
          customers={plan.targetCustomers}
          onAdd={addCustomer}
          onUpdate={updateCustomer}
          onDelete={deleteCustomer}
          onGenerate={chat && !chat.loading ? handleGeneratePersonas : undefined}
        />

        <CardListSection
          label="솔루션/제품"
          hint={HINTS.solutions}
          items={plan.solutions}
          onAdd={v => addPlanItem('solutions', v)}
          onUpdate={(i, v) => updatePlanItem('solutions', i, v)}
          onRemove={i => removePlanItem('solutions', i)}
          onGenerate={chat && !chat.loading ? handleGenerateSolutions : undefined}
        />

        <CardListSection
          label="수익 구조"
          hint={HINTS.revenueModel}
          items={plan.revenueModel}
          onAdd={v => addPlanItem('revenueModel', v)}
          onUpdate={(i, v) => updatePlanItem('revenueModel', i, v)}
          onRemove={i => removePlanItem('revenueModel', i)}
          onGenerate={chat && !chat.loading ? handleGenerateRevenueModel : undefined}
        />

        <GrowthStagesSection
          stages={plan.growthStages ?? []}
          onAdd={addGrowthStage}
          onUpdate={updateGrowthStage}
          onRemove={removeGrowthStage}
          onMove={moveGrowthStage}
          onGenerate={chat && !chat.loading ? handleGenerateGrowthStages : undefined}
          currentIndex={growthIdx}
          onComplete={handleCompleteStage}
        />

        <WorkAreasSection
          areas={plan.workAreas ?? []}
          onAdd={addWorkArea}
          onUpdate={updateWorkArea}
          onRemove={removeWorkArea}
          onGenerate={chat && !chat.loading ? handleGenerateWorkAreas : undefined}
        />
      </div>
    </div>

    {/* ── 오른쪽: 플레이바 + 공용 메모 ── */}
    <aside className="space-y-4 lg:sticky lg:top-8">
      <MusicTimer compact />
      <MemoPanel />
    </aside>

    {flagAward && <FlagAward {...flagAward} onClose={() => setFlagAward(null)} />}
    </div>
  );
}
