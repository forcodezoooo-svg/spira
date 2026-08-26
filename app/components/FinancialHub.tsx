'use client';
import { useState } from 'react';
import { useStore } from '../lib/useStore';
import CategoryPicker from './CategoryPicker';

const won = (n: number) => `${n < 0 ? '−' : ''}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`;
const currentYM = () => new Date().toISOString().slice(0, 7);
const RECURRING_CAT = '구독료';
const ACCENT = '#9DFE3B'; // 활성 버튼 강조색 (브랜드 라임)

type Section = 'income' | 'fixed' | 'invest' | 'reserve';
const dateFor = (month: string) => (month === currentYM() ? new Date().toISOString().slice(0, 10) : `${month}-01`);

// 통합 재무 페이지 — 도식(순이익 − 고정비용 − 프로젝트투자비 − 비상금% = 개인순이익) + 항목별 입력
export default function FinancialHub({ month }: { month: string }) {
  const store = useStore();
  const [section, setSection] = useState<Section | null>('income');

  const entries = (store.data.resources ?? []).filter(e => e.date.startsWith(month));
  const incomeEntries = entries.filter(e => e.type === 'income');
  const expenseEntries = entries.filter(e => e.type === 'expense');
  const subs = (store.data.subscriptions ?? []).filter(s => !s.startMonth || s.startMonth <= month);

  const income = incomeEntries.reduce((s, e) => s + e.amount, 0);
  const subTotal = subs.reduce((s, x) => s + x.amount, 0);
  const projInvest = expenseEntries.filter(e => e.projectId).reduce((s, e) => s + e.amount, 0);
  const fixed = expenseEntries.filter(e => !e.projectId).reduce((s, e) => s + e.amount, 0) + subTotal;
  const pct = store.emergencyFundPct;
  const reserve = Math.round(income * pct / 100);
  const personal = income - fixed - projInvest - reserve;

  const projSpent = (pid: string) => expenseEntries.filter(e => e.projectId === pid).reduce((s, e) => s + e.amount, 0);

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
      {section === 'invest' && <InvestSection month={month} projSpent={projSpent} />}
      {section === 'reserve' && <ReserveSection />}
    </div>
  );
}

// ── 순이익(수익) 입력 — 카테고리 선택 포함 ──
function IncomeSection({ month }: { month: string }) {
  const store = useStore();
  const [name, setName] = useState(''); const [amt, setAmt] = useState(''); const [cat, setCat] = useState('');
  const cats = store.data.revenueSources ?? [];
  const list = (store.data.resources ?? []).filter(e => e.type === 'income' && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const add = () => { const n = Number(amt.replace(/,/g, '')); if (!n || !name.trim()) return; store.addResource({ type: 'income', amount: n, description: name.trim(), date: dateFor(month), ...(cat.trim() ? { source: cat.trim() } : {}) }); setName(''); setAmt(''); };
  return (
    <Card title="수익 입력">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="+ 수익 이름" className="flex-1 min-w-0 text-[14px] bg-white border rounded-xl px-3 py-2 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <input value={amt} onChange={e => setAmt(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="금액" className="w-24 text-[14px] tabular-nums text-right bg-white border rounded-xl px-3 py-2 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
        <CategoryPicker value={cat} onChange={setCat} categories={cats} onAdd={n => store.addRevenueSource(n)} />
        <button onClick={add} disabled={!amt || !name.trim()} className="px-4 py-2 rounded-xl text-[14px] font-bold disabled:opacity-30 flex-shrink-0" style={{ backgroundColor: ACCENT, color: '#16211E' }}>수익 추가</button>
      </div>
      <EntryList list={list} onDel={id => store.deleteResource(id)} sign="+" />
    </Card>
  );
}

// ── 고정 비용 입력 — 카테고리 선택 + '구독료'=매월 반복 ──
function FixedSection({ month }: { month: string }) {
  const store = useStore();
  const [name, setName] = useState(''); const [amt, setAmt] = useState(''); const [cat, setCat] = useState('');
  const cats = (store.data.expenseCategories ?? []).filter(c => c !== RECURRING_CAT);
  const list = (store.data.resources ?? []).filter(e => e.type === 'expense' && !e.projectId && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const subs = (store.data.subscriptions ?? []).filter(s => !s.startMonth || s.startMonth <= month);
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
        <div key={s.id} className="flex items-center justify-between text-[13px] rounded-lg px-3 py-2" style={{ backgroundColor: '#FAFAF7' }}>
          <span style={{ color: '#5B6560' }}>{s.name} <span className="text-[10px]" style={{ color: '#C4A24A' }}>매월</span></span>
          <span className="tabular-nums font-semibold" style={{ color: '#16211E' }}>−{won(s.amount)}</span>
        </div>
      ))}</div>}
      <EntryList list={list} onDel={id => store.deleteResource(id)} sign="−" />
    </Card>
  );
}

// ── 프로젝트 투자비 입력 ──
function InvestSection({ month, projSpent }: { month: string; projSpent: (pid: string) => number }) {
  const store = useStore();
  const projects = (store.data.plan.projects ?? []).filter(p => p.status !== 'done');
  const [spendFor, setSpendFor] = useState<string | null>(null);
  const [spName, setSpName] = useState(''); const [spAmt, setSpAmt] = useState('');
  const plan = store.projectInvestPlan;
  const addSpend = (pid: string) => { const n = Number(spAmt.replace(/,/g, '')); if (!n || !spName.trim()) return; store.addResource({ type: 'expense', amount: n, description: spName.trim(), date: dateFor(month), projectId: pid }); setSpName(''); setSpAmt(''); setSpendFor(null); };
  return (
    <Card title="프로젝트 투자비">
      {projects.length === 0 ? <p className="text-[13px]" style={{ color: '#9AA39D' }}>진행 중인 프로젝트가 없어요. Plan/Goals에서 프로젝트를 만들어보세요.</p> : (
        <div className="space-y-2">
          {projects.map(p => {
            const spent = projSpent(p.id);
            const planned = plan[p.id] ?? 0;
            return (
              <div key={p.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--spira-border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold truncate min-w-0" style={{ color: '#16211E' }}>{p.name}</span>
                  <button onClick={() => { setSpendFor(spendFor === p.id ? null : p.id); setSpName(''); setSpAmt(''); }} className="text-[11px] font-bold rounded-full px-2.5 py-1 flex-shrink-0" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>지출 추가</button>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" style={{ color: '#9AA39D' }}>투자 예정</span>
                    <input type="number" value={planned || ''} onChange={e => store.setProjectInvest(p.id, Number(e.target.value) || 0)} placeholder="0" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
                  </div>
                  <span className="text-[11px] ml-auto" style={{ color: spent > planned && planned > 0 ? '#C0392B' : '#9AA39D' }}>사용 <b className="tabular-nums">{won(spent)}</b></span>
                </div>
                {spendFor === p.id && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <input value={spName} onChange={e => setSpName(e.target.value)} placeholder="지출 내용" className="flex-1 min-w-0 text-[12px] bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
                    <input type="number" value={spAmt} onChange={e => setSpAmt(e.target.value)} placeholder="금액" className="w-24 text-[12px] tabular-nums text-right bg-white border rounded-lg px-2 py-1.5 outline-none focus:border-neutral-400" style={{ borderColor: 'var(--spira-border)' }} />
                    <button onClick={() => addSpend(p.id)} className="text-[12px] font-bold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ backgroundColor: '#16211E', color: '#fff' }}>추가</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── 비상금(%) + 미래 프로젝트 배정 ──
function ReserveSection() {
  const store = useStore();
  const projects = store.data.plan.projects ?? [];
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
function EntryList({ list, onDel, sign }: { list: { id: string; description: string; amount: number; date: string; source?: string }[]; onDel: (id: string) => void; sign: string }) {
  if (list.length === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      {list.map(e => (
        <div key={e.id} className="group flex items-center justify-between text-[13px] rounded-lg px-3 py-2" style={{ backgroundColor: '#FAFAF7' }}>
          <span className="truncate min-w-0" style={{ color: '#5B6560' }}>{e.description}{e.source ? <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#F0F0EA', color: '#8D9A8D' }}>{e.source}</span> : null} <span className="text-[10px]" style={{ color: '#C4CCC4' }}>{e.date.slice(5)}</span></span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="tabular-nums font-semibold" style={{ color: '#16211E' }}>{sign}{won(e.amount)}</span>
            <button onClick={() => onDel(e.id)} className="text-neutral-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100">×</button>
          </span>
        </div>
      ))}
    </div>
  );
}
