'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '../lib/useStore';
import { useAuth } from './AuthProvider';
import { useUI } from '../lib/UIContext';
import { usePlan } from '../lib/usePlan';
import { useUpgrade } from '../lib/UpgradeContext';
import FeedbackModal from './FeedbackModal';

const nav = [
  { href: '/home', label: 'Home', icon: '/home_icon.svg' },
  { href: '/programs', label: 'Process', icon: '/goals_icon.svg' },
  { href: '/resources', label: 'Financial', icon: '/resources_icon.svg' },
  { href: '/plan', label: 'Plan', icon: '/plan_icon.svg' },
];

function NavIcon({ src, active }: { src: string; active: boolean }) {
  return (
    <span
      aria-hidden
      className="w-5 h-5 transition-colors"
      style={{
        backgroundColor: active ? '#002929' : '#AAAAAA',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

export default function Sidebar() {
  const path = usePathname();
  const { data, ready, allWorkspaces, switchWorkspace, addWorkspace } = useStore();
  const { plan } = usePlan();
  const { showUpgrade } = useUpgrade();
  const { user, loading, signOut } = useAuth();
  const displayName = (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || user?.email || '계정';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const { sidebarOpen, closeSidebar } = useUI();
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const wsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!wsOpen && !userOpen) return;
    const handler = (e: MouseEvent) => {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) { setWsOpen(false); setAdding(false); setNewName(''); }
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wsOpen, userOpen]);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    // 무료 플랜: 워크스페이스 1개까지 — 추가 사업은 Pro (유료 플랜 알림 팝업)
    if (plan.tier !== 'pro' && allWorkspaces.length >= 1) {
      setAdding(false);
      setWsOpen(false);
      showUpgrade('workspace');
      return;
    }
    addWorkspace(name);
    setNewName('');
    setAdding(false);
    setWsOpen(false);
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || '탈퇴 처리에 실패했어요');
      // 로컬 데이터 정리 후 랜딩으로 (전체 새로고침으로 상태 초기화)
      try { localStorage.clear(); } catch { /* ignore */ }
      await signOut().catch(() => {});
      window.location.href = '/';
    } catch (e) {
      alert(e instanceof Error ? e.message : '탈퇴 처리에 실패했어요');
      setDeleting(false);
    }
  };

  const workspaceName = ready ? data.workspace?.name : null;

  return (
    <>
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={closeSidebar} />
      )}

      <aside
        style={{ boxShadow: 'var(--spira-shadow-lg)', border: '1px solid var(--spira-border-subtle)' }}
        className={`fixed top-4 h-[calc(100dvh-2rem)] z-50 w-[72px] py-6 bg-white rounded-full flex flex-col items-center transition-[left] duration-300 ease-in-out ${sidebarOpen ? 'left-4' : 'left-[-110px]'} lg:left-4`}
      >
        {/* 로고 (클릭 → 워크스페이스 전환) */}
        <div className="relative pb-4" ref={wsRef}>
          <button
            onClick={() => { if (workspaceName) { setWsOpen(o => !o); setAdding(false); setNewName(''); } }}
            className="w-11 h-11 rounded-2xl flex items-center justify-center hover:bg-neutral-100 transition-colors"
            title={workspaceName ?? 'Spira'}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Spira" className="w-6 h-auto" />
          </button>

          {wsOpen && (
            <div className="absolute left-full top-4 ml-2 w-48 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden z-20">
              <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">워크스페이스</p>
              {allWorkspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => { switchWorkspace(ws.id); setWsOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-left hover:bg-neutral-100 transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ws.id === data.workspace?.id ? 'bg-violet-600' : 'bg-neutral-300'}`} />
                  <span className={ws.id === data.workspace?.id ? 'text-neutral-900 font-medium' : 'text-neutral-500'}>{ws.name}</span>
                </button>
              ))}
              <div className="border-t border-neutral-200">
                {adding ? (
                  <div className="px-3 py-2">
                    <input
                      ref={inputRef}
                      className="w-full bg-neutral-100 rounded-md px-2 py-1.5 text-xs text-neutral-900 outline-none focus:ring-1 focus:ring-violet-600"
                      placeholder="워크스페이스 이름"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAdd();
                        if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                      }}
                    />
                    <div className="flex gap-1.5 mt-1.5">
                      <button onClick={handleAdd} disabled={!newName.trim()} className="flex-1 py-1 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-md text-neutral-900 transition-colors">추가</button>
                      <button onClick={() => { setAdding(false); setNewName(''); }} className="flex-1 py-1 text-xs text-neutral-400 hover:text-neutral-800 transition-colors">취소</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAdding(true)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors">
                    <span>+</span><span>새 워크스페이스</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 로고 하단 헤어라인 구분선 */}
        <div className="w-8 h-px mb-5" style={{ backgroundColor: 'var(--spira-border)' }} />

        {/* 네비게이션 아이콘 (중앙 정렬) */}
        <nav className="flex-1 flex flex-col items-center justify-center gap-[22px]">
          {nav.map(({ href, label, icon }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                data-teach={href === '/programs' ? 'nav-goals' : href === '/home' ? 'nav-home' : undefined}
                onClick={closeSidebar}
                title={label}
                aria-label={label}
                style={active ? { backgroundColor: '#9DFE3B', boxShadow: 'var(--spira-glow-lime)' } : undefined}
                className={`w-11 h-11 rounded-[14px] flex items-center justify-center transition-colors ${
                  active ? '' : 'hover:bg-neutral-100'
                }`}
              >
                <NavIcon src={icon} active={active} />
              </Link>
            );
          })}
        </nav>

        {/* 유저 아바타 (최하단) */}
        <div className="relative" ref={userRef}>
          {loading ? (
            <div className="w-10 h-10 rounded-full bg-neutral-100 animate-pulse" />
          ) : user ? (
            <>
              <button onClick={() => setUserOpen(o => !o)} className="w-10 h-10 rounded-full overflow-hidden border border-neutral-200 hover:ring-2 hover:ring-neutral-200 transition-all flex items-center justify-center bg-white" title={displayName}>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-sm font-extrabold" style={{ background: 'var(--spira-grad-avatar)', color: '#16211E' }}>{displayName[0]?.toUpperCase() ?? 'S'}</span>
                )}
              </button>
              {userOpen && (
                <div className="absolute left-full bottom-0 ml-2 w-52 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden z-20">
                  <div className="px-3 py-2.5 border-b border-neutral-100">
                    <p className="text-xs font-medium text-neutral-800 truncate">{displayName}</p>
                    <p className="text-[10px] text-neutral-500 truncate">{user.email}</p>
                  </div>
                  <Link href="/pricing" onClick={() => setUserOpen(false)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-semibold hover:bg-neutral-100 transition-colors" style={{ color: '#3E6B1F' }}>
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.9 4 4.1.4-3 2.8.8 4L8 10.6 4.2 12.7l.8-4-3-2.8 4.1-.4L8 1.5z" fill="currentColor" /></svg>
                    Pro 업그레이드
                  </Link>
                  <button onClick={() => { setUserOpen(false); setFeedbackOpen(true); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-neutral-600 hover:bg-neutral-100 transition-colors border-t border-neutral-100">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M14 7.5a5.5 5.5 0 01-7.9 4.95L2.5 13.5l1.05-3.6A5.5 5.5 0 1114 7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    의견 보내기
                  </button>
                  <button onClick={() => signOut()} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-neutral-600 hover:bg-neutral-100 transition-colors border-t border-neutral-100">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    로그아웃
                  </button>
                  <button onClick={() => { setUserOpen(false); setDeleteOpen(true); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-red-50 transition-colors border-t border-neutral-100" style={{ color: '#C24B4B' }}>
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5.5 4.5l.4 8a1 1 0 001 .95h2.2a1 1 0 001-.95l.4-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    회원탈퇴
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link href="/login" title="로그인" className="w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4 text-neutral-500" viewBox="0 0 16 16" fill="none">
                <path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3M6 11l3-3-3-3M9 8H2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
        </div>
      </aside>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}

      {/* 회원탈퇴 확인 */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,41,41,0.55)' }} onClick={() => { if (!deleting) setDeleteOpen(false); }}>
          <div className="bg-white rounded-3xl w-full max-w-sm px-6 pt-6 pb-6" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#FCEBEB' }}>
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" style={{ color: '#C24B4B' }}><path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5.5 4.5l.4 8a1 1 0 001 .95h2.2a1 1 0 001-.95l.4-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="text-[18px] font-black mb-2" style={{ color: '#16211E' }}>정말 탈퇴하시겠어요?</h2>
            <p className="text-[13px] leading-relaxed mb-5" style={{ color: '#5B6560' }}>
              계정과 저장된 데이터(기획서·목표·자료 등)가 모두 삭제되며 되돌릴 수 없어요.
              구독 중이라면 자동 결제도 함께 해지됩니다.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-[14px] font-bold transition-colors disabled:opacity-40" style={{ backgroundColor: '#F0F0EA', color: '#5B6560' }}>취소</button>
              <button onClick={handleDeleteAccount} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-[14px] font-bold text-white transition-colors disabled:opacity-60" style={{ backgroundColor: '#C24B4B' }}>
                {deleting ? '처리 중…' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
