'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { workspaceColor } from '../lib/goalTasks';
import { ListSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useChatContext } from '../lib/ChatContext';
import { useUI } from '../lib/UIContext';
import { ResourceType } from '../lib/types';
import { todayStr } from '../lib/store';
import CategoryPicker from '../components/CategoryPicker';
import FinancialHub from '../components/FinancialHub';

type Tab = ResourceType | 'manage' | 'hub';

const COLORS = ['#ccff00','#a78bfa','#60a5fa','#34d399','#fb923c','#f472b6','#e879f9','#38bdf8'];
const RECURRING_CAT = '구독료'; // 이 비용 카테고리로 추가하면 매월 반복(구독)으로 처리

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
}
function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function recentMonths(n: number): string[] {
  // 날짜 연산(setMonth) 대신 년/월만 감소 — 31일 등에서 달 오버플로로 같은 달이 중복되던 버그 방지
  const result: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0~11
  for (let i = 0; i < n; i++) {
    result.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return result;
}

const NO_SOURCE = '미분류';
const NO_BIZ = '__nobiz__';

export default function ResourcesPage() {
  const store = useStore();
  const router = useRouter();
  const chat = useChatContext();
  const { openChat } = useUI();
  const [tab, setTab] = useState<Tab>('hub');
  const [month, setMonth] = useState(currentYM());
  const [bizFilter, setBizFilter] = useState<string | null>(null);

  // 입력 폼 (날짜는 자동 = 오늘)
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [linkProjectId, setLinkProjectId] = useState(''); // 지출을 프로젝트에 연결(실지출 집계용)

  // 구독료(비용 카테고리 '구독료'로 통합) — 목록 편집용 상태만 유지
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubAmount, setEditSubAmount] = useState('');

  // 관리: 카테고리 추가/편집
  const [newIncomeCat, setNewIncomeCat] = useState('');
  const [newExpenseCat, setNewExpenseCat] = useState('');
  const [addOpen, setAddOpen] = useState<'income' | 'expense' | null>(null);
  const [editCat, setEditCat] = useState<{ type: 'income' | 'expense'; name: string } | null>(null);
  // 카테고리 편집 팝오버: 바깥 클릭 시 닫기
  const catPopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editCat) return;
    const h = (e: MouseEvent) => { if (catPopRef.current && !catPopRef.current.contains(e.target as Node)) setEditCat(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [editCat]);

  // 다음달 자산 목표 (칩 선택 후 % 입력)
  const [selGoalCat, setSelGoalCat] = useState<{ type: 'income' | 'expense'; name: string } | null>(null);
  const [goalPct, setGoalPct] = useState('');

  const goToGoalsBySource = (src: string) => {
    const wsId = store.data.workspace?.id;
    router.push(`/programs?source=${encodeURIComponent(src)}${wsId ? `&ws=${encodeURIComponent(wsId)}` : ''}`);
  };

  if (!store.ready) return <ListSkeleton />;

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const businesses = store.allWorkspaces;
  // 전 비즈니스(워크스페이스) 거래·구독을 합산해 표시 — 홈 수익/지출 박스와 값이 일치하고,
  // 비활성 워크스페이스에 저장된 예전 데이터도 여기서 보고 삭제할 수 있다. 각 항목은 소유 워크스페이스(wsId)를 갖는다.
  const allResources = store.allWorkspacesEntries.flatMap(e => e.resources.map(r => ({ ...r, wsId: e.workspace.id })));
  const subscriptions = store.allWorkspacesEntries.flatMap(e => (e.subscriptions ?? []).map(s => ({ ...s, wsId: e.workspace.id })));
  // 구독은 시작 월(startMonth)부터 매월 반영 — 시작 이전 달에는 미반영(startMonth 없으면 항상 반영: 구버전 호환)
  const subActiveIn = (ym: string) => subscriptions.filter(s => !s.startMonth || s.startMonth <= ym);
  const subTotalFor = (ym: string) => subActiveIn(ym).reduce((sum, r) => sum + r.amount, 0);
  const monthSubscriptions = subActiveIn(month);
  const subTotal = subTotalFor(month);

  // 카테고리·목표·비즈니스맵은 전 워크스페이스에서 합산 — 활성 워크스페이스가 바뀌어도
  // 예전에 만들어둔 카테고리가 사라지지 않도록. (거래·구독을 전 워크스페이스에서 보는 것과 동일)
  const incomeCats: string[] = Array.from(new Set(store.allWorkspacesEntries.flatMap(e => e.revenueSources ?? [])));
  const expenseCats: string[] = Array.from(new Set(store.allWorkspacesEntries.flatMap(e => e.expenseCategories ?? [])));
  // 리포트/집계용 — '구독료'를 항상 포함하는 내장 비용 카테고리 목록 (구독은 별도 데이터라 여기서 합산)
  const expenseCatsRep: string[] = [RECURRING_CAT, ...expenseCats.filter(c => c !== RECURRING_CAT)];
  const incomeTargets: Record<string, number> = Object.assign({}, ...store.allWorkspacesEntries.map(e => e.revenueSourceTargets ?? {}));
  const expenseTargets: Record<string, number> = Object.assign({}, ...store.allWorkspacesEntries.map(e => e.expenseCategoryTargets ?? {}));
  const bizMap: Record<string, string> = Object.assign({}, ...store.allWorkspacesEntries.map(e => e.revenueSourceBiz ?? {}));

  // 카테고리 색상
  const catColor = (nm: string, type: 'income' | 'expense') => {
    if (!nm || nm === NO_SOURCE) return '#d4d4d4';
    const bizId = bizMap[nm]; // 비즈니스가 지정된 카테고리는 그 비즈니스 컬러로
    if (bizId) return workspaceColor(store.allWorkspacesEntries, bizId);
    const list = type === 'expense' ? expenseCats : incomeCats;
    const i = list.indexOf(nm);
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  };
  const srcOf = (r: { source?: string }) => r.source?.trim() || NO_SOURCE;

  // 비즈니스
  const bizIdOfSource = (src: string) => bizMap[src] || NO_BIZ;

  // 선택 월 집계
  const monthEntries = allResources.filter(r => r.date.startsWith(month));
  const monthIncome  = monthEntries.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const monthExpense = monthEntries.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const totalCost    = monthExpense + subTotal;
  const netProfit    = monthIncome - totalCost;

  // 이번 달 수익 (비즈니스 필터 적용)
  const filteredIncome = monthEntries
    .filter(r => r.type === 'income')
    .filter(r => bizFilter === null || bizIdOfSource(srcOf(r)) === bizFilter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const monthExpenseEntries = monthEntries.filter(r => r.type === 'expense').sort((a, b) => b.date.localeCompare(a.date));

  // 카테고리별 목표/실제 비중 (수익 변화 / 비용 변화)
  const catChangeRows = (type: 'income' | 'expense') => {
    const defined = type === 'expense' ? expenseCatsRep : incomeCats;
    const targets = type === 'expense' ? expenseTargets : incomeTargets;
    const entries = monthEntries.filter(r => r.type === type);
    const subForRep = type === 'expense' ? subTotal : 0; // '구독료' 카테고리 금액 = 이번 달 구독 합계
    const total = entries.reduce((s, r) => s + r.amount, 0) + subForRep;
    const names = [...new Set([...defined, ...entries.map(srcOf)])];
    return names
      .map(nm => {
        const base = entries.filter(r => srcOf(r) === nm).reduce((s, r) => s + r.amount, 0);
        const amt = nm === RECURRING_CAT ? base + subForRep : base; // 구독료엔 구독 합계 포함
        const actual = total > 0 ? Math.round((amt / total) * 100) : 0;
        const target = targets[nm] ?? 0;
        return { name: nm, actual, target, amt };
      })
      .sort((a, b) => b.amt - a.amt);
  };

  // ── 관리 계산 ────────────────────────────────────────────────────────────────
  const monthStat = (ym: string) => {
    const entries = allResources.filter(r => r.date.startsWith(ym));
    const inc = entries.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const exp = entries.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    return { inc, exp, net: inc - exp - subTotalFor(ym) };
  };
  // 순이익 추이 (최근 6개월, 라인 차트)
  const chart6 = recentMonths(6).reverse().map(ym => ({ ym, ...monthStat(ym) }));
  const growthPct = (() => {
    const t = monthStat(currentYM()).net, l = monthStat(prevYM(currentYM())).net;
    return l !== 0 ? Math.round(((t - l) / Math.abs(l)) * 100) : null;
  })();

  // Plan 수익 구조에서 가져올 수 있는 수익 카테고리 제안
  const sourceSuggestions = [...new Set((store.data.plan.revenueModel ?? []).map(r => r.title).filter(Boolean))]
    .filter(s => !incomeCats.includes(s));

  // 수익/비용 비율 (이번 달 카테고리별 실제 비중) — 금액 있는 것만
  const incShares = catChangeRows('income').filter(r => r.amt > 0);
  const expShares = catChangeRows('expense').filter(r => r.amt > 0);

  // ── 핸들러 ─────────────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (tab === 'manage') return;
    const n = Number(amount.replace(/,/g, ''));
    if (!n || !name.trim()) return;
    // 비용 + '구독료' 카테고리 = 매월 반복되는 비용(구독)으로 등록
    if (tab === 'expense' && category.trim() === RECURRING_CAT) {
      store.addSubscription({ name: name.trim(), amount: n });
      setName(''); setAmount('');
      return;
    }
    store.addResource({
      type: tab as ResourceType,
      amount: n,
      description: name.trim(),
      date: todayStr(),
      ...(category.trim() ? { source: category.trim() } : {}),
      ...(tab === 'expense' && linkProjectId ? { projectId: linkProjectId } : {}),
    });
    setName(''); setAmount(''); // 카테고리·프로젝트는 연속 입력 편의를 위해 유지
  };
  const handleSaveSub = (id: string) => {
    const n = Number(editSubAmount.replace(/,/g, ''));
    if (!n || !editSubName.trim()) return;
    const sub = subscriptions.find(x => x.id === id);
    if (sub) store.updateSubscriptionInWs(sub.wsId, { id, name: editSubName.trim(), amount: n });
    setEditingSubId(null);
  };
  // 다음달 자산 목표: 선택한 카테고리에 목표 비중(%) 저장
  const selectGoalCat = (type: 'income' | 'expense', nm: string) => {
    setSelGoalCat({ type, name: nm });
    const cur = (type === 'expense' ? expenseTargets : incomeTargets)[nm];
    setGoalPct(cur != null ? String(cur) : '');
  };
  const commitGoal = () => {
    if (!selGoalCat) return;
    const pct = Math.max(0, Math.min(100, Number(goalPct) || 0));
    if (selGoalCat.type === 'income') store.setRevenueSourceTarget(selGoalCat.name, pct);
    else store.setExpenseCategoryTarget(selGoalCat.name, pct);
  };

  // AI 어시스턴트: 자산 목표에 맞춰 다음 달 수익/비용을 얼마나 늘리고 줄여야 하는지 조언
  const handleAiSuggest = () => {
    if (!chat) return;
    const incRows = catChangeRows('income');
    const expRows = catChangeRows('expense');
    const lines: string[] = [];
    lines.push('[다음 달 자산 목표 조언 요청]');
    lines.push(`이번 달(${fmtYM(month)}) 실제 수익 합계 ${fmt(monthIncome)}원, 실제 비용 합계(구독 포함) ${fmt(totalCost)}원, 순이익 ${fmt(netProfit)}원.`);
    lines.push('');
    lines.push('■ 수익 카테고리 — 실제금액 / 실제비중 → 목표비중');
    incRows.forEach(r => lines.push(`- ${r.name}: ${fmt(r.amt)}원 / ${r.actual}% → 목표 ${r.target}%`));
    lines.push('');
    lines.push('■ 비용 카테고리 — 실제금액 / 실제비중 → 목표비중');
    expRows.forEach(r => lines.push(`- ${r.name}: ${fmt(r.amt)}원 / ${r.actual}% → 목표 ${r.target}%`));
    lines.push('');
    lines.push('위 목표 비중에 맞추려면 다음 달에 각 수익/비용 카테고리를 대략 얼마씩(원 단위) 늘리거나 줄여야 하는지, 실제 금액으로 계산해서 따뜻하게 조언해줘. 목표 비중이 0%인 항목은 아직 설정되지 않은 것이니 참고만 해줘.');
    openChat();
    chat.sendMessage(lines.join('\n'), '다음 달 자산 목표에 맞추려면 수익/비용을 어떻게 조정하면 좋을까?');
  };

  const TABS: { key: Tab; label: string; active: string }[] = [
    { key: 'hub',    label: '통합',   active: '' },
    { key: 'manage', label: '리포트', active: '' },
  ];

  const isIncome = tab === 'income';

  // ── 카테고리 변화 카드 (렌더 함수 — 컴포넌트로 만들면 매 렌더 재생성돼 리마운트됨) ──
  const changeCard = (type: 'income' | 'expense', title: string) => {
    const rows = catChangeRows(type);
    return (
      <div className="bg-white rounded-[24px] border p-6" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
        <p className="text-[16px] font-bold mb-4" style={{ color: '#16211E' }}>{title}</p>
        {rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: '#9AA39D' }}>‘리포트’에서 카테고리를 만들면 여기에 표시돼요.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map(r => {
              const color = r.target > 0
                ? (r.actual < r.target ? '#FF696C' : r.actual > r.target ? '#5B8DEF' : '#9AA39D')
                : '#9AA39D';
              return (
                <li key={r.name} className="flex items-center gap-3">
                  <span
                    className="text-[13px] font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5 min-w-0"
                    style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}
                  >
                    <span className="truncate max-w-[120px]">{r.name}</span>
                  </span>
                  <span className="flex-1" />
                  <span className="text-[14px] tabular-nums" style={{ color: '#9AA39D' }}>{r.target}%</span>
                  <span className="text-[15px] font-bold tabular-nums w-11 text-right" style={{ color }}>{r.actual}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
      {/* ── 왼쪽: 메인 ── */}
      <div className="min-w-0">
        {/* 헤더 */}
        <h1 className="text-[28px] font-black tracking-[-0.02em] mb-3" style={{ color: '#16211E' }}>Financial</h1>

        {/* 월 선택 */}
        <div className="flex items-center gap-2 mb-5">
          <button onClick={() => setMonth(prevYM(month))} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
            <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: '#5B6560' }}>{fmtYM(month)}</span>
          <button onClick={() => setMonth(nextYM(month))} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-neutral-100" style={{ color: '#9AA39D' }}>
            <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {month !== currentYM() && (
            <button onClick={() => setMonth(currentYM())} className="text-[12px] transition-colors hover:opacity-70 ml-1" style={{ color: '#9AA39D' }}>이번 달</button>
          )}
        </div>

        {/* 비즈니스 필터 */}
        {businesses.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {businesses.map(b => {
              const sel = bizFilter === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setBizFilter(sel ? null : b.id)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                  style={sel ? { backgroundColor: '#DFF9C4', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color || '#a78bfa' }} />
                  {b.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 탭 */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="py-3.5 rounded-2xl border text-[15px] font-bold transition-colors"
              style={tab === t.key
                ? { backgroundColor: '#9DFE3B', borderColor: '#9DFE3B', color: '#16211E' }
                : { backgroundColor: '#fff', borderColor: 'var(--spira-border)', color: '#5B6560' }}
            >{t.label}</button>
          ))}
        </div>

        {/* ── 통합 재무 (도식 + 항목별 입력) ── */}
        {tab === 'hub' && <FinancialHub month={month} />}

        {/* ── 수익 / 비용 입력 + 목록 ── */}
        {(tab === 'income' || tab === 'expense') && (
          <>
            {/* 입력 폼 (모바일: 이름은 첫 줄 전체 폭, 금액·카테고리·버튼은 아래 줄로 자연스럽게 줄바꿈) */}
            <div className="flex flex-wrap items-center gap-2 bg-white border rounded-3xl px-4 py-2.5 mb-4" style={{ borderColor: 'var(--spira-border-strong)' }}>
              <input
                className="w-full sm:flex-1 sm:w-auto min-w-0 bg-transparent text-[15px] outline-none placeholder-neutral-400 px-1"
                style={{ color: '#16211E' }}
                placeholder={`+ ${isIncome ? '수익' : '비용'} 이름`}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <input
                type="text"
                className="flex-1 sm:flex-none sm:w-24 min-w-0 bg-transparent text-[15px] outline-none placeholder-neutral-400 text-right px-1"
                style={{ color: '#16211E' }}
                placeholder="금액"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <CategoryPicker
                value={category}
                onChange={setCategory}
                categories={(isIncome ? incomeCats : expenseCats).filter(c => c !== RECURRING_CAT)}
                recurring={tab === 'expense' ? { value: RECURRING_CAT, label: `${RECURRING_CAT} (매월 반복)` } : null}
                onAdd={name => (isIncome ? store.addRevenueSource(name) : store.addExpenseCategory(name))}
              />
              {tab === 'expense' && (store.data.plan.projects?.length ?? 0) > 0 && (
                <select value={linkProjectId} onChange={e => setLinkProjectId(e.target.value)} title="이 지출을 프로젝트에 연결(실지출 집계)" className="flex-shrink-0 text-[13px] rounded-full border px-2.5 py-1.5 outline-none" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }}>
                  <option value="">프로젝트 연결 안 함</option>
                  {(store.data.plan.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button
                onClick={handleAdd}
                disabled={!amount || !name.trim()}
                className="px-4 py-2 rounded-full text-[14px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-30 flex-shrink-0"
                style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
              >
                {isIncome ? '수익' : '비용'} 추가
              </button>
            </div>
            {(isIncome ? incomeCats : expenseCats).length === 0 && (
              <p className="text-[12px] mb-4" style={{ color: '#9AA39D' }}>위 <span className="font-semibold" style={{ color: '#5B6560' }}>카테고리</span> 버튼을 눌러 바로 추가하거나, ‘리포트’ 탭에서 관리할 수 있어요.</p>
            )}

            {/* 수익 목록 */}
            {isIncome && (
              filteredIncome.length === 0 ? (
                <EmptyState compact title={`${fmtYM(month)} 수익 내역이 없어요`} description="위에서 이번 달 수익을 추가해보세요." />
              ) : (
                <div className="space-y-2.5">
                  {filteredIncome.map(r => (
                    <div key={r.id} className="flex items-center gap-3 pl-6 pr-2.5 py-3.5 bg-white border rounded-full group transition-colors" style={{ borderColor: '#CBEE9E' }}>
                      <span className="text-[15px] truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{r.description}</span>
                      <span className="font-mono text-[15px] font-semibold tabular-nums flex-shrink-0" style={{ color: '#16211E' }}>{fmt(r.amount)}원</span>
                      {r.source && (
                        <button
                          onClick={() => goToGoalsBySource(r.source!)}
                          className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1 flex-shrink-0 transition-transform hover:-translate-y-0.5"
                          style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}
                          title="이 수익원과 관련된 Goals 프로젝트 보기"
                        >{r.source}</button>
                      )}
                      <button onClick={() => store.deleteResourceInWs(r.wsId, r.id)} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-neutral-300 hover:text-red-400 text-sm transition-all flex-shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* 비용 목록 (일반 비용 + '구독료' 카테고리 = 매월 반복) */}
            {tab === 'expense' && (
              <>
                <p className="text-[12px] mb-3" style={{ color: '#9AA39D' }}>카테고리를 <span className="font-semibold" style={{ color: '#5B6560' }}>구독료</span>로 추가하면 매월 반복 비용으로 등록돼요.</p>

                {monthExpenseEntries.length === 0 && monthSubscriptions.length === 0 ? (
                  <EmptyState compact title={`${fmtYM(month)} 비용 내역이 없어요`} description="위에서 이번 달 비용을 추가해보세요." />
                ) : (
                  <div className="space-y-2.5">
                    {monthSubscriptions.map((s: { id: string; name: string; amount: number; wsId: string }) => (
                      <div key={s.id} className="bg-white border rounded-full group transition-colors overflow-hidden" style={{ borderColor: 'var(--spira-border-strong)' }}>
                        {editingSubId === s.id ? (
                          <div className="flex gap-2 px-5 py-3">
                            <input className="flex-1 border rounded-full px-4 py-1.5 text-[14px] outline-none" style={{ backgroundColor: '#F7F7F2', borderColor: 'var(--spira-border)' }} value={editSubName} onChange={e => setEditSubName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveSub(s.id)} />
                            <input className="w-28 border rounded-full px-4 py-1.5 text-[14px] outline-none" style={{ backgroundColor: '#F7F7F2', borderColor: 'var(--spira-border)' }} value={editSubAmount} onChange={e => setEditSubAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveSub(s.id)} />
                            <button onClick={() => handleSaveSub(s.id)} className="text-[13px] px-2 transition-colors" style={{ color: '#16211E' }}>저장</button>
                            <button onClick={() => setEditingSubId(null)} className="text-[13px] px-1 transition-colors" style={{ color: '#9AA39D' }}>취소</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 pl-6 pr-4 py-3.5">
                            <span className="text-[15px] truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{s.name}</span>
                            <span className="font-mono text-[15px] font-semibold tabular-nums flex-shrink-0" style={{ color: '#16211E' }}>-{fmt(s.amount)}원</span>
                            <span className="text-[12px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ backgroundColor: '#EAF7DD', color: '#3E6B1F' }}>구독료 · 매월</span>
                            <button onClick={() => { setEditingSubId(s.id); setEditSubName(s.name); setEditSubAmount(String(s.amount)); }} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-[13px] transition-all flex-shrink-0" style={{ color: '#9AA39D' }}>편집</button>
                            <button onClick={() => store.deleteSubscriptionInWs(s.wsId, s.id)} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-neutral-300 hover:text-red-400 text-sm transition-all flex-shrink-0">×</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {monthExpenseEntries.map(r => (
                      <div key={r.id} className="flex items-center gap-3 pl-6 pr-4 py-3.5 bg-white border rounded-full group transition-colors" style={{ borderColor: 'var(--spira-border-strong)' }}>
                        <span className="text-[15px] truncate flex-1 min-w-0" style={{ color: '#16211E' }}>{r.description}</span>
                        <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: '#9AA39D' }}>{r.date.slice(5).replace('-', '.')}</span>
                        <span className="font-mono text-[15px] font-semibold tabular-nums flex-shrink-0" style={{ color: '#16211E' }}>-{fmt(r.amount)}원</span>
                        {r.source && (
                          <span className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>{r.source}</span>
                        )}
                        <button onClick={() => store.deleteResourceInWs(r.wsId, r.id)} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-neutral-300 hover:text-red-400 text-sm transition-all flex-shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── 관리 탭 ── */}
        {tab === 'manage' && (
          <div className="space-y-5">
            {/* 1. 순이익 추이 (라인 차트) */}
            <section className="bg-white border border-neutral-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">순이익 추이</p>
                <div className="flex items-center gap-2">
                  {growthPct !== null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${growthPct >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>전월 대비 {growthPct >= 0 ? '+' : ''}{growthPct}%</span>
                  )}
                  <span className="text-[10px] text-neutral-300">최근 6개월</span>
                </div>
              </div>
              {(() => {
                const nets = chart6.map(x => x.net);
                const yMax = Math.max(...nets, 0);
                const yMin = Math.min(...nets, 0);
                const range = (yMax - yMin) || 1;
                const px = (i: number) => 8 + (i / 5) * 284;
                const py = (v: number) => 8 + (1 - (v - yMin) / range) * 64; // viewBox 80 높이 기준(상·하 8 여백)
                const zeroY = py(0);
                const pts = chart6.map((x, i) => `${px(i)},${py(x.net)}`).join(' ');
                return (
                  <>
                    <svg viewBox="0 0 300 80" className="w-full h-auto">
                      <line x1="8" y1={zeroY} x2="292" y2={zeroY} stroke="#e5e5e5" strokeWidth="0.7" strokeDasharray="3 3" />
                      <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      {chart6.map((x, i) => (
                        <circle key={x.ym} cx={px(i)} cy={py(x.net)} r={x.ym === currentYM() ? 2.6 : 2} fill={x.net >= 0 ? '#34d399' : '#FF696C'} stroke="#fff" strokeWidth="1" />
                      ))}
                    </svg>
                    <div className="flex justify-between mt-1 px-1">
                      {chart6.map(x => (
                        <span key={x.ym} className={`text-[9px] ${x.ym === currentYM() ? 'text-neutral-600 font-semibold' : 'text-neutral-400'}`}>{Number(x.ym.split('-')[1])}월</span>
                      ))}
                    </div>
                  </>
                );
              })()}
            </section>

            {/* 2. 수익 / 비용 카테고리 (좌우 2단) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 수익 카테고리 */}
              <section className="bg-white border border-neutral-200 rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">수익 카테고리</p>
                <div className="flex flex-wrap gap-1.5">
                  {incomeCats.map(s => {
                    const open = editCat?.type === 'income' && editCat.name === s;
                    return (
                      <div key={s} className="relative" ref={open ? catPopRef : undefined}>
                        <button onClick={() => setEditCat(open ? null : { type: 'income', name: s })} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors" style={{ backgroundColor: `${catColor(s, 'income')}1a`, color: catColor(s, 'income') }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(s, 'income') }} />
                          {s}
                        </button>
                        {open && (
                          <div className="absolute z-20 top-full left-0 mt-1 w-44 bg-white border border-neutral-200 rounded-xl shadow-lg p-2 space-y-1.5">
                            {businesses.length > 0 && (
                              <select value={bizMap[s] ?? ''} onChange={e => store.setRevenueSourceBiz(s, e.target.value)} className="w-full text-[11px] bg-neutral-50 border border-neutral-200 rounded-lg px-1.5 py-1.5 text-neutral-600 outline-none focus:border-neutral-400">
                                <option value="">비즈니스 미지정</option>
                                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            )}
                            <button onClick={() => { store.deleteRevenueSource(s); setEditCat(null); }} className="w-full text-left text-[11px] text-red-500 hover:bg-red-50 rounded-lg px-1.5 py-1 transition-colors">삭제 (기록은 유지)</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => setAddOpen(addOpen === 'income' ? null : 'income')} className="text-[11px] text-neutral-500 border border-dashed border-neutral-300 hover:border-neutral-400 hover:text-neutral-700 rounded-full px-2.5 py-1 transition-colors">추가 +</button>
                </div>
                {addOpen === 'income' && (
                  <>
                    <div className="flex gap-2 mt-3">
                      <input autoFocus className="flex-1 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-400 transition-colors placeholder-neutral-400" placeholder="새 수익 카테고리" value={newIncomeCat} onChange={e => setNewIncomeCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && newIncomeCat.trim()) { store.addRevenueSource(newIncomeCat.trim()); setNewIncomeCat(''); } }} />
                      <button onClick={() => { if (newIncomeCat.trim()) { store.addRevenueSource(newIncomeCat.trim()); setNewIncomeCat(''); } }} disabled={!newIncomeCat.trim()} className="px-3 py-2 bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 rounded-lg text-sm text-white transition-colors flex-shrink-0">추가</button>
                    </div>
                    {sourceSuggestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] text-neutral-400">Plan에서:</span>
                        {sourceSuggestions.map(s => (
                          <button key={s} onClick={() => store.addRevenueSource(s)} className="text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-200 hover:border-violet-300 hover:bg-violet-50 rounded-full px-2.5 py-1 transition-colors">+ {s}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* 비용 카테고리 */}
              <section className="bg-white border border-neutral-200 rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">비용 카테고리</p>
                <div className="flex flex-wrap gap-1.5">
                  {/* 구독료 = 내장 카테고리(삭제 불가) — 클릭 시 편집/삭제 없음 */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: '#EAF7DD', color: '#3E6B1F' }} title="매월 반복 비용(구독)이 집계되는 내장 카테고리예요.">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3E6B1F' }} />
                    {RECURRING_CAT} · 매월
                  </span>
                  {expenseCats.filter(c => c !== RECURRING_CAT).map(s => {
                    const open = editCat?.type === 'expense' && editCat.name === s;
                    return (
                      <div key={s} className="relative" ref={open ? catPopRef : undefined}>
                        <button onClick={() => setEditCat(open ? null : { type: 'expense', name: s })} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors" style={{ backgroundColor: `${catColor(s, 'expense')}1a`, color: catColor(s, 'expense') }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(s, 'expense') }} />
                          {s}
                        </button>
                        {open && (
                          <div className="absolute z-20 top-full left-0 mt-1 w-40 bg-white border border-neutral-200 rounded-xl shadow-lg p-2">
                            <button onClick={() => { store.deleteExpenseCategory(s); setEditCat(null); }} className="w-full text-left text-[11px] text-red-500 hover:bg-red-50 rounded-lg px-1.5 py-1 transition-colors">삭제 (기록은 유지)</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => setAddOpen(addOpen === 'expense' ? null : 'expense')} className="text-[11px] text-neutral-500 border border-dashed border-neutral-300 hover:border-neutral-400 hover:text-neutral-700 rounded-full px-2.5 py-1 transition-colors">추가 +</button>
                </div>
                {addOpen === 'expense' && (
                  <div className="flex gap-2 mt-3">
                    <input autoFocus className="flex-1 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-400 transition-colors placeholder-neutral-400" placeholder="새 비용 카테고리" value={newExpenseCat} onChange={e => setNewExpenseCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && newExpenseCat.trim()) { store.addExpenseCategory(newExpenseCat.trim()); setNewExpenseCat(''); } }} />
                    <button onClick={() => { if (newExpenseCat.trim()) { store.addExpenseCategory(newExpenseCat.trim()); setNewExpenseCat(''); } }} disabled={!newExpenseCat.trim()} className="px-3 py-2 bg-neutral-900 hover:bg-neutral-700 disabled:opacity-30 rounded-lg text-sm text-white transition-colors flex-shrink-0">추가</button>
                  </div>
                )}
              </section>
            </div>

            {/* 3. 수익/비용 비율 (도넛) */}
            <section className="bg-white border border-neutral-200 rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">수익/비용 비율 <span className="ml-1 font-normal normal-case tracking-normal text-neutral-300">{fmtYM(month)}</span></p>
              <div className="grid grid-cols-2 gap-6">
                {[{ data: incShares, type: 'income' as const, title: '수익 비율' }, { data: expShares, type: 'expense' as const, title: '비용 비율' }].map(cfg => {
                  const total = cfg.data.reduce((s, d) => s + d.amt, 0);
                  const r = 40, C = 2 * Math.PI * r;
                  let acc = 0;
                  return (
                    <div key={cfg.title}>
                      <p className="text-xs font-medium text-neutral-500 mb-3 text-center">{cfg.title}</p>
                      {total === 0 ? (
                        <div className="flex items-center justify-center h-28 text-xs text-neutral-300">내역 없음</div>
                      ) : (
                        <>
                          <div className="relative w-28 h-28 mx-auto">
                            <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                              <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f1f1" strokeWidth="14" />
                              {cfg.data.map(d => {
                                const frac = d.amt / total;
                                const seg = <circle key={d.name} cx="50" cy="50" r={r} fill="none" stroke={catColor(d.name, cfg.type)} strokeWidth="14" strokeDasharray={`${frac * C} ${C - frac * C}`} strokeDashoffset={-acc * C} />;
                                acc += frac;
                                return seg;
                              })}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-[9px] text-neutral-400">합계</span>
                              <span className="text-xs font-bold text-neutral-700 tabular-nums">{total >= 10000 ? `${Math.round(total / 10000)}만` : fmt(total)}</span>
                            </div>
                          </div>
                          <ul className="mt-3 space-y-1">
                            {cfg.data.map(d => (
                              <li key={d.name} className="flex items-center gap-1.5 text-[11px]">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(d.name, cfg.type) }} />
                                <span className="text-neutral-600 truncate flex-1 min-w-0">{d.name}</span>
                                <span className="text-neutral-400 tabular-nums flex-shrink-0">{d.actual}%</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 4. 다음달 자산 목표 */}
            <section className="bg-white border border-neutral-200 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">다음달 자산 목표</p>
                <button onClick={handleAiSuggest} title="AI에게 조정 방법 물어보기" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105" style={{ backgroundColor: '#5FD93A', boxShadow: 'var(--spira-glow-fab)' }}>
                  <img src="/sparky.svg" alt="Sparky" className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 mb-4">카테고리를 선택하고 목표 비중(%)을 입력하세요. AI 버튼을 누르면 목표에 맞춰 다음 달에 수익/비용을 얼마씩 조정하면 좋을지 알려줘요.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-emerald-600 font-bold mb-2">수익</p>
                  <div className="flex flex-wrap gap-1.5">
                    {incomeCats.length === 0 ? <span className="text-[11px] text-neutral-300">카테고리 없음</span> : incomeCats.map(s => {
                      const sel = selGoalCat?.type === 'income' && selGoalCat.name === s;
                      return (
                        <button key={s} onClick={() => selectGoalCat('income', s)} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${sel ? 'ring-2 ring-emerald-400' : ''}`} style={{ backgroundColor: `${catColor(s, 'income')}1a`, color: catColor(s, 'income') }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(s, 'income') }} />
                          {s}
                          {incomeTargets[s] != null && <span className="opacity-70">{incomeTargets[s]}%</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-rose-500 font-bold mb-2">비용</p>
                  <div className="flex flex-wrap gap-1.5">
                    {expenseCatsRep.map(s => {
                      const sel = selGoalCat?.type === 'expense' && selGoalCat.name === s;
                      return (
                        <button key={s} onClick={() => selectGoalCat('expense', s)} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${sel ? 'ring-2 ring-rose-400' : ''}`} style={{ backgroundColor: `${catColor(s, 'expense')}1a`, color: catColor(s, 'expense') }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor(s, 'expense') }} />
                          {s}
                          {expenseTargets[s] != null && <span className="opacity-70">{expenseTargets[s]}%</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${selGoalCat?.type === 'income' ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-neutral-50'}`}>
                  <span className="text-emerald-500 font-bold">+</span>
                  <input type="number" min={0} max={100} disabled={selGoalCat?.type !== 'income'} value={selGoalCat?.type === 'income' ? goalPct : ''} onChange={e => setGoalPct(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitGoal(); }} onBlur={commitGoal} placeholder={selGoalCat?.type === 'income' ? selGoalCat.name : '수익 선택'} className="flex-1 min-w-0 bg-transparent text-sm outline-none text-right placeholder-neutral-400 disabled:placeholder-neutral-300" />
                  <span className="text-neutral-400 text-sm">%</span>
                </div>
                <div className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${selGoalCat?.type === 'expense' ? 'border-rose-300 bg-rose-50' : 'border-neutral-200 bg-neutral-50'}`}>
                  <span className="text-rose-500 font-bold">−</span>
                  <input type="number" min={0} max={100} disabled={selGoalCat?.type !== 'expense'} value={selGoalCat?.type === 'expense' ? goalPct : ''} onChange={e => setGoalPct(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitGoal(); }} onBlur={commitGoal} placeholder={selGoalCat?.type === 'expense' ? selGoalCat.name : '비용 선택'} className="flex-1 min-w-0 bg-transparent text-sm outline-none text-right placeholder-neutral-400 disabled:placeholder-neutral-300" />
                  <span className="text-neutral-400 text-sm">%</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── 오른쪽: 대시보드 ── */}
      <aside className="hidden lg:block space-y-4 lg:sticky lg:top-8">
        {/* 이번 달 수익/지출 */}
        <div className="bg-white rounded-[24px] border p-6" style={{ boxShadow: 'var(--spira-shadow-lg)', borderColor: 'var(--spira-border-subtle)' }}>
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-[26px] h-[26px] rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF7E4', color: '#44543C' }}>
              <svg viewBox="0 0 19 10" className="w-[15px] h-auto" fill="currentColor"><path d="M16.8229 0H2.17708C0.976675 0 0 1.09021 0 2.44091V7.55909C0 8.90497 0.972372 10 2.17708 10H16.8229C18.0233 10 19 8.90979 19 7.55909V2.44091C19 1.09503 18.0276 0 16.8229 0ZM6.55275 4.99759C6.55275 3.50699 7.43047 2.24795 8.63949 1.83309V8.15726C7.43047 7.7424 6.55275 6.48336 6.55275 4.99277V4.99759ZM10.3605 8.16208V1.83792C11.5695 2.25277 12.4472 3.51182 12.4472 5.00241C12.4472 6.49301 11.5695 7.75205 10.3605 8.16691V8.16208Z" /></svg>
            </span>
            <span className="text-[16px] font-bold" style={{ color: '#16211E' }}>이번 달 수익/지출</span>
          </div>
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[14px]" style={{ color: '#5B6560' }}>수익</span>
            <span className="font-mono text-[20px] font-semibold tabular-nums" style={{ color: '#16211E' }}>+{fmt(monthIncome)}</span>
          </div>
          <div className="flex items-center justify-between mb-5">
            <span className="text-[14px]" style={{ color: '#5B6560' }}>비용</span>
            <span className="font-mono text-[20px] font-semibold tabular-nums" style={{ color: '#16211E' }}>-{fmt(totalCost)}</span>
          </div>
          <div className="h-px mb-4" style={{ backgroundColor: 'var(--spira-border)' }} />
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold" style={{ color: '#16211E' }}>순이익</span>
            <span className="font-mono text-[32px] font-bold tabular-nums tracking-[-0.01em]" style={{ color: netProfit >= 0 ? '#16211E' : '#FF696C' }}>
              {netProfit >= 0 ? '+' : ''}{fmt(netProfit)}
            </span>
          </div>
        </div>

        {changeCard('income', '수익 변화')}
        {changeCard('expense', '비용 변화')}
      </aside>
    </div>
  );
}
