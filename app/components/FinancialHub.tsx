'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';
import CategoryPicker from './CategoryPicker';
import type { ResourceEntry, Subscription, Project } from '../lib/types';

const won = (n: number) => `${n < 0 ? '−' : ''}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`;
const currentYM = () => new Date().toISOString().slice(0, 7);
const RECURRING_CAT = '구독료';
const ACCENT = '#9DFE3B'; // 활성 버튼 강조색 (브랜드 라임)

type Section = 'income' | 'fixed' | 'invest' | 'reserve';
type Store = ReturnType<typeof useStore>;
type Res = ResourceEntry & { wsId: string };
type Proj = Project & { wsId: string };
const dateFor = (month: string) => (month === currentYM() ? new Date().toISOString().slice(0, 10) : `${month}-01`);
const prevYM = (ym: string) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const subActive = (s: Subscription, month: string) => (!s.startMonth || s.startMonth <= month) && (!s.endMonth || month <= s.endMonth);

// 전 비즈니스(워크스페이스) 합산 — 기존 Resources와 동일하게 모든 사업의 거래를 함께 본다
const allRes = (store: Store): Res[] => store.allWorkspacesEntries.flatMap(e => (e.resources ?? []).map(r => ({ ...r, wsId: e.workspace.id })));
const allSubs = (store: Store): (Subscription & { wsId: string })[] => store.allWorkspacesEntries.flatMap(e => (e.subscriptions ?? []).map(s => ({ ...s, wsId: e.workspace.id })));
const allProjects = (store: Store): Proj[] => store.allWorkspacesEntries.flatMap(e => (e.plan?.projects ?? []).map(p => ({ ...p, wsId: e.workspace.id })));
const mergedInvest = (store: Store): Record<string, number> => Object.assign({}, ...store.allWorkspacesEntries.map(e => e.projectInvestPlan ?? {}));

// 카테고리 보드에서 '진행중'인 데드라인(프로젝트) 아래 완료 안 된 산출물만
type Category = { wsId: string; wsName: string; todoId: string; name: string; projectName: string; projectId?: string };
const allCategories = (store: Store): Category[] => {
  const out: Category[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const e of store.allWorkspacesEntries) {
    const projs = e.plan?.projects ?? [];
    for (const prog of e.programs ?? []) {
      for (const dl of prog.deadlines ?? []) {
        if (dl.enabled === false || dl.done) continue;
        const proj = dl.projectId ? projs.find(p => p.id === dl.projectId) : undefined;
        const status = proj?.status;
        if (status === 'done' || status === 'onhold') continue;
        // 진행중 = status가 active로 명시됐거나, '현재 진행 기간 안'(시작일 지남 + 마감일 안 지남)
        const todoDates = (dl.todos ?? []).map(t => t.date).filter((x): x is string => !!x).sort();
        const start = dl.startDate || todoDates[0] || dl.date;
        const end = dl.date || dl.startDate;
        const inWindow = !!start && start <= today && (!end || end >= today);
        if (!(status === 'active' || inWindow)) continue;
        for (const t of dl.todos ?? []) {
          if (t.done) continue;
          out.push({ wsId: e.workspace.id, wsName: e.workspace.name, todoId: t.id, name: t.name, projectName: proj?.name || dl.name, projectId: dl.projectId });
        }
      }
    }
  }
  return out;
};

// 통합 재무 페이지 — 도식(순이익 − 고정비용 − 프로젝트투자비 − 비상금% = 개인순이익) + 항목별 입력
export default function FinancialHub({ month }: { month: string }) {
  const store = useStore();
  const [section, setSection] = useState<Section | null>('income');

  const entries = allRes(store).filter(e => e.date.startsWith(month));
  const incomeEntries = entries.filter(e => e.type === 'income');
  const expenseEntries = entries.filter(e => e.type === 'expense');
  const subs = allSubs(store).filter(s => subActive(s, month));

  const income = incomeEntries.reduce((s, e) => s + e.amount, 0);
  const subTotal = subs.reduce((s, x) => s + x.amount, 0);
  const isInvest = (e: Res) => !!(e.todoId || e.projectId); // 산출물/프로젝트에 연결된 지출 = 투자비
  const projInvest = expenseEntries.filter(isInvest).reduce((s, e) => s + e.amount, 0);
  const fixed = expenseEntries.filter(e => !isInvest(e)).reduce((s, e) => s + e.amount, 0) + subTotal;
  const pct = store.emergencyFundPct;
  const reserve = Math.round(income * pct / 100);
  const personal = income - fixed - projInvest - reserve;

  const catSpent = (todoId: string) => expenseEntries.filter(e => e.todoId === todoId).reduce((s, e) => s + e.amount, 0);

  const Box = ({ id, label, value }: { id: Section; label: string; value: number }) => {
    const on = section === id;
    return (
      <button onClick={() => setSection(s => s === id ? null : id)}
        className="flex flex-col items-center rounded-2xl px-3 py-2.5 transition-all flex-1 min-w-[92px]"
        style={{ backgroundColor: on ? ACCENT : '#fff', border: `1.5px solid ${on ? ACCENT : '#E7E7E1'}`, boxShadow: on ? '0 3px 10px rgba(157,254,59,0.35)' : 'none' }}>
        <span className="text-[11px] font-bold" style={{ color: on ? '#16211E' : '#9AA39D' }}>{label}</span>
        <span className="text-[15px] font-black tabular-nums mt-0.5" style={{ color: '#16211E' }}>{won(value)}</span>
      </button>
    );
  };
  const Op = ({ ch }: { ch: string }) => <span className="text-[16px] font-black flex-shrink-0" style={{ color: '#C4CCC4' }}>{ch}</span>;

  return (
    <div className="space-y-5">
      {/* 재무 도식 */}
      <div className="rounded-[22px] border p-4" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#FBFBF9', boxShadow: 'var(--spira-shadow)' }}>
        <div className="flex items-stretch gap-1.5 flex-wrap">
          <Box id="income" label="순이익" value={income} />
          <div className="flex items-center"><Op ch="−" /></div>
          <Box id="fixed" label="고정 비용" value={fixed} />
          <div className="flex items-center"><Op ch="−" /></div>
          <Box id="invest" label="프로젝트 투자비" value={projInvest} />
          <div className="flex items-center"><Op ch="−" /></div>
          <Box id="reserve" label={`비상금 ${pct}%`} value={reserve} />
          <div className="flex items-center"><Op ch="=" /></div>
          <div className="flex flex-col items-center rounded-2xl px-3 py-2.5 flex-1 min-w-[92px]" style={{ backgroundColor: '#16211E' }}>
            <span className="text-[11px] font-bold" style={{ color: '#B9C4B4' }}>개인순이익</span>
            <span className="text-[15px] font-black tabular-nums mt-0.5" style={{ color: personal < 0 ? '#FF8B8E' : ACCENT }}>{won(personal)}</span>
          </div>
        </div>
        <p className="text-[11px] mt-2.5" style={{ color: '#9AA39D' }}>각 항목을 눌러 아래에서 값을 입력·조정하세요.</p>
      </div>

      {section === 'income' && <IncomeSection month={month} />}
      {section === 'fixed' && <FixedSection month={month} />}
      {section === 'invest' && <InvestSection month={month} catSpent={catSpent} />}
      {section === 'reserve' && <ReserveSection />}
    </div>
  );
}

// ── 순이익(수익) 입력 — 카테고리 선택 포함 ──
function IncomeSection({ month }: { month: string }) {
  const store = useStore();
  const [name, setName] = useState(''); const [amt, setAmt] = useState(''); const [cat, setCat] = useState('');
  const cats = Array.from(new Set(store.allWorkspacesEntries.flatMap(e => e.revenueSources ?? [])));
  const list = allRes(store).filter(e => e.type === 'income' && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const add = () => { const n = Number(amt.replace(/,/g, '')); if (!n || !name.trim()) return; store.addResource({ type: 'income', amount: n, description: name.trim(), date: dateFor(month), ...(cat.trim() ? { source: cat.trim() } : {}) }); setName(''); setAmt(''); };
  return (
    <Card title="수익 입력">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="+ 수익 이름" className="flex-1 min-w-0 text-[14px] bg-white border rounded-xl px-3 py-2 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <input value={amt} onChange={e => setAmt(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="금액" className="w-24 text-[14px] tabular-nums text-right bg-white border rounded-xl px-3 py-2 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <CategoryPicker value={cat} onChange={setCat} categories={cats} onAdd={n => store.addRevenueSource(n)} />
        <button onClick={add} disabled={!amt || !name.trim()} className="px-4 py-2 rounded-xl text-[14px] font-bold disabled:opacity-30 flex-shrink-0" style={{ backgroundColor: ACCENT, color: '#16211E' }}>수익 추가</button>
      </div>
      <EntryList list={list} onDel={r => store.deleteResourceInWs(r.wsId, r.id)} sign="+" />
    </Card>
  );
}

// ── 고정 비용 입력 — 카테고리 선택 + '구독료'=매월 반복 ──
function FixedSection({ month }: { month: string }) {
  const store = useStore();
  const [name, setName] = useState(''); const [amt, setAmt] = useState(''); const [cat, setCat] = useState('');
  const [subMenu, setSubMenu] = useState<string | null>(null);
  // 구독 취소: 이번 달부터(이번 달도 미반영) → endMonth=지난달 / 다음 달부터(이번 달까지 반영) → endMonth=이번 달
  const cancelSub = (s: Subscription & { wsId: string }, when: 'now' | 'next') => {
    const cm = currentYM();
    store.updateSubscriptionInWs(s.wsId, { id: s.id, name: s.name, amount: s.amount, startMonth: s.startMonth, endMonth: when === 'now' ? prevYM(cm) : cm });
  };
  const cats = Array.from(new Set(store.allWorkspacesEntries.flatMap(e => e.expenseCategories ?? []))).filter(c => c !== RECURRING_CAT);
  const list = allRes(store).filter(e => e.type === 'expense' && !e.projectId && !e.todoId && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const subs = allSubs(store).filter(s => subActive(s, month));
  const add = () => {
    const n = Number(amt.replace(/,/g, '')); if (!n || !name.trim()) return;
    if (cat.trim() === RECURRING_CAT) store.addSubscription({ name: name.trim(), amount: n, startMonth: month });
    else store.addResource({ type: 'expense', amount: n, description: name.trim(), date: dateFor(month), ...(cat.trim() ? { source: cat.trim() } : {}) });
    setName(''); setAmt('');
  };
  return (
    <Card title="고정 비용 입력">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="+ 비용 이름" className="flex-1 min-w-0 text-[14px] bg-white border rounded-xl px-3 py-2 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <input value={amt} onChange={e => setAmt(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="금액" className="w-24 text-[14px] tabular-nums text-right bg-white border rounded-xl px-3 py-2 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <CategoryPicker value={cat} onChange={setCat} categories={cats} recurring={{ value: RECURRING_CAT, label: `${RECURRING_CAT} (매월 반복)` }} onAdd={n => store.addExpenseCategory(n)} />
        <button onClick={add} disabled={!amt || !name.trim()} className="px-4 py-2 rounded-xl text-[14px] font-bold disabled:opacity-30 flex-shrink-0" style={{ backgroundColor: ACCENT, color: '#16211E' }}>비용 추가</button>
      </div>
      <p className="text-[11px] mt-2" style={{ color: '#9AA39D' }}>카테고리를 <b style={{ color: '#5B6560' }}>{RECURRING_CAT}</b>로 고르면 매월 반복 고정비(구독)로 등록돼요.</p>
      {subs.length > 0 && <div className="mt-2 space-y-1">{subs.map(s => (
        <div key={s.id} className="group flex items-center justify-between gap-2 text-[13px] rounded-lg px-3 py-2" style={{ backgroundColor: '#FAFAF7' }}>
          <span className="truncate min-w-0" style={{ color: '#5B6560' }}>{s.name} <span className="text-[10px]" style={{ color: '#C4A24A' }}>매월</span></span>
          {subMenu === s.id ? (
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px]" style={{ color: '#9AA39D' }}>취소:</span>
              <button onClick={() => { cancelSub(s, 'now'); setSubMenu(null); }} title="이번 달부터 미반영" className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: '#FFF1F1', color: '#C0392B' }}>이번 달부터</button>
              <button onClick={() => { cancelSub(s, 'next'); setSubMenu(null); }} title="이번 달까지 반영, 다음 달부터 미반영" className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>다음 달부터</button>
              <button onClick={() => setSubMenu(null)} className="text-neutral-400 text-[11px]">닫기</button>
            </span>
          ) : (
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className="tabular-nums font-semibold" style={{ color: '#16211E' }}>−{won(s.amount)}</span>
              <button onClick={() => setSubMenu(s.id)} title="구독 취소" className="text-neutral-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100">×</button>
            </span>
          )}
        </div>
      ))}</div>}
      <EntryList list={list} onDel={r => store.deleteResourceInWs(r.wsId, r.id)} sign="−" />
    </Card>
  );
}

// ── 프로젝트 투자비 입력 — 카테고리 보드의 각 산출물(카테고리) 단위 ──
function InvestSection({ month, catSpent }: { month: string; catSpent: (todoId: string) => number }) {
  const store = useStore();
  const cats = allCategories(store);
  const investPlan = mergedInvest(store); // todoId -> 투자 예정액
  const [spendFor, setSpendFor] = useState<string | null>(null);
  const [spName, setSpName] = useState(''); const [spAmt, setSpAmt] = useState('');
  const addSpend = (c: Category) => { const n = Number(spAmt.replace(/,/g, '')); if (!n || !spName.trim()) return; store.addResourceInWs(c.wsId, { type: 'expense', amount: n, description: spName.trim(), date: dateFor(month), todoId: c.todoId, ...(c.projectId ? { projectId: c.projectId } : {}) }); setSpName(''); setSpAmt(''); setSpendFor(null); };
  // 비즈니스 · 프로젝트 단위로 묶어서 표시
  const groups: { key: string; wsName: string; projectName: string; items: Category[] }[] = [];
  for (const c of cats) {
    const key = `${c.wsId}::${c.projectName}`;
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, wsName: c.wsName, projectName: c.projectName, items: [] }; groups.push(g); }
    g.items.push(c);
  }
  const catRow = (c: Category) => {
    const spent = catSpent(c.todoId);
    const planned = investPlan[c.todoId] ?? 0;
    return (
      <div key={c.todoId} className="rounded-xl border p-3" style={{ borderColor: 'var(--spira-border-subtle)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold truncate min-w-0" style={{ color: '#16211E' }}>{c.name}</span>
          <button onClick={() => { setSpendFor(spendFor === c.todoId ? null : c.todoId); setSpName(''); setSpAmt(''); }} className="text-[11px] font-bold rounded-full px-2.5 py-1 flex-shrink-0" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>지출 추가</button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: '#9AA39D' }}>투자 예정</span>
            <input type="number" value={planned || ''} onChange={e => store.setProjectInvestInWs(c.wsId, c.todoId, Number(e.target.value) || 0)} placeholder="0" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
          </div>
          <span className="text-[11px] ml-auto" style={{ color: spent > planned && planned > 0 ? '#C0392B' : '#9AA39D' }}>사용 <b className="tabular-nums">{won(spent)}</b></span>
        </div>
        {spendFor === c.todoId && (
          <div className="flex items-center gap-1.5 mt-2">
            <input value={spName} onChange={e => setSpName(e.target.value)} placeholder="지출 내용" className="flex-1 min-w-0 text-[12px] bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
            <input type="number" value={spAmt} onChange={e => setSpAmt(e.target.value)} placeholder="금액" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
            <button onClick={() => addSpend(c)} className="text-[12px] font-bold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ backgroundColor: '#16211E', color: '#fff' }}>추가</button>
          </div>
        )}
      </div>
    );
  };
  return (
    <Card title="프로젝트 투자비">
      {groups.length === 0 ? <p className="text-[13px]" style={{ color: '#9AA39D' }}>진행 중인 카테고리가 없어요. Goals 카테고리 보드에서 진행 중인 프로젝트·산출물을 만들어보세요.</p> : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.key}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>{g.wsName}</span>
                <span className="text-[13px] font-black truncate" style={{ color: '#16211E' }}>{g.projectName}</span>
              </div>
              <div className="space-y-2">{g.items.map(catRow)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── 비상금(%) + 미래 프로젝트 배정 ──
function ReserveSection() {
  const store = useStore();
  const projects = allProjects(store);
  const marks = store.reserveEarmarks;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const setMark = (id: string, p: Partial<{ projectId: string; amount: number }>) => store.setReserveEarmarks(marks.map(m => m.id === id ? { ...m, ...p } : m));
  return (
    <Card title="비상금 설정">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px]" style={{ color: '#5B6560' }}>순이익의</span>
        <input type="number" min={0} max={100} value={store.emergencyFundPct || ''} onChange={e => store.setEmergencyFundPct(Number(e.target.value) || 0)} placeholder="0" className="w-16 text-[14px] tabular-nums text-center bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <span className="text-[13px]" style={{ color: '#5B6560' }}>%를 비상금으로 남겨둡니다.</span>
      </div>
      <p className="text-[12px] font-semibold mb-1.5" style={{ color: '#5B6560' }}>이 비상금을 쓸 미래 프로젝트/방향</p>
      <div className="space-y-1.5">
        {marks.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <select value={m.projectId} onChange={e => setMark(m.id, { projectId: e.target.value })} className="flex-1 min-w-0 text-[12px] rounded-lg border px-2 py-1.5 outline-none" style={{ borderColor: 'var(--spira-border)', color: '#5B6560' }}>
              <option value="">프로젝트 선택</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" value={m.amount || ''} onChange={e => setMark(m.id, { amount: Number(e.target.value) || 0 })} placeholder="필요액" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
            <button onClick={() => store.setReserveEarmarks(marks.filter(x => x.id !== m.id))} className="w-5 text-neutral-300 hover:text-red-500 text-sm">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => store.setReserveEarmarks([...marks, { id: uid(), projectId: '', amount: 0 }])} className="mt-2 text-[11px] font-semibold" style={{ color: '#5B6560' }}>+ 미래 프로젝트 추가</button>
    </Card>
  );
}

// ── 공용 소컴포넌트 (그레이 톤) ──
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border p-4" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
      <p className="text-[14px] font-black mb-3" style={{ color: '#16211E' }}>{title}</p>
      {children}
    </div>
  );
}
function EntryList({ list, onDel, sign }: { list: Res[]; onDel: (r: Res) => void; sign: string }) {
  if (list.length === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      {list.map(e => (
        <div key={e.id} className="group flex items-center justify-between text-[13px] rounded-lg px-3 py-2" style={{ backgroundColor: '#FAFAF7' }}>
          <span className="truncate min-w-0" style={{ color: '#5B6560' }}>{e.description}{e.source ? <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#F0F0EA', color: '#8D9A8D' }}>{e.source}</span> : null} <span className="text-[10px]" style={{ color: '#C4CCC4' }}>{e.date.slice(5)}</span></span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="tabular-nums font-semibold" style={{ color: '#16211E' }}>{sign}{won(e.amount)}</span>
            <button onClick={() => onDel(e)} className="text-neutral-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100">×</button>
          </span>
        </div>
      ))}
    </div>
  );
}
