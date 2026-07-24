'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useChatContext, ChatSession } from '../lib/ChatContext';
import { useUI } from '../lib/UIContext';
import { AI_COPY, RECOMMENDED } from '../lib/ai/messages';

// AI 응답에서 마크다운 기호를 제거해 깔끔한 평문으로 표시 (별표·제목·코드·목록 기호 등)
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')    // **굵게**
    .replace(/__([\s\S]+?)__/g, '$1')        // __강조__
    .replace(/`([^`]+)`/g, '$1')             // `코드`
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')       // # 제목
    .replace(/^\s*[-*+]\s+/gm, '• ')          // - 목록 → •
    .replace(/[*`]/g, '')                      // 남은 별표/백틱 제거
    .replace(/[ \t]+\n/g, '\n');              // 줄끝 공백 정리
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function AIChatButton() {
  const chat = useChatContext();
  const { chatOpen, toggleChat, chatDocked } = useUI();
  const pathname = usePathname();
  const router = useRouter();
  const chips = RECOMMENDED[pathname] ?? RECOMMENDED.default;
  const [input, setInput] = useState('');
  const [isDesktop, setIsDesktop] = useState(true);
  const [view, setView] = useState<'chat' | 'archive'>('chat');
  const [entered, setEntered] = useState(false); // 등장 bouncy 애니메이션 트리거
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = chat?.messages ?? [];
  const loading = chat?.loading ?? false;
  const sessions = chat?.sessions ?? [];

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (view === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, view]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !chat) return;
    setInput('');
    await chat.sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleLoadSession = (session: ChatSession) => {
    chat?.loadSession(session);
    setView('chat');
  };

  const handleNewChat = () => {
    chat?.newChat();
    setView('chat');
  };

  // 데스크탑에서는 도킹된 경우 항상 표시, 도킹 해제(Home)면 열었을 때만 표시.
  const panelVisible = (isDesktop && chatDocked) || chatOpen;
  // 오버레이 모드: 모바일이거나, 데스크탑에서 도킹이 해제된 상태로 열렸을 때
  const overlayMode = !isDesktop || !chatDocked;

  // 패널이 보이기 시작하면 다음 프레임에 entered=true로 전환 → bouncy 스프링 애니메이션 재생
  useEffect(() => {
    if (!panelVisible) { setEntered(false); return; }
    setEntered(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [panelVisible]);

  const panelClasses = isDesktop
    ? `fixed right-4 top-4 bottom-4 w-96 rounded-3xl flex flex-col ${overlayMode ? 'z-50' : 'z-10'} overflow-hidden shadow-2xl`
    : 'fixed right-4 top-16 bottom-4 w-[calc(100vw-2rem)] max-w-sm rounded-3xl flex flex-col z-50 overflow-hidden shadow-2xl';

  return (
    <>
      {/* 나의 여정 지도 — 채팅 아이콘 바로 위 스티키 FAB */}
      {isDesktop && !panelVisible && (
        <button
          onClick={() => router.push('/journey')}
          className="fixed bottom-[86px] right-6 z-40 w-[50px] h-[50px] rounded-full flex items-center justify-center transition-transform hover:scale-105"
          style={{ backgroundColor: '#16211E', color: '#EDFF9F', boxShadow: 'var(--spira-glow-fab)' }}
          aria-label="나의 여정 지도"
          title="나의 여정 지도"
        >
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5l4-2 4 2 4-2v9l-4 2-4-2-4 2v-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M6 2.5v9M10 4.5v9" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      )}

      {/* 우측 하단 플로팅 버튼 (데스크탑에서 채팅이 닫혀 있을 때 — 모바일은 헤더 버튼 사용) */}
      {isDesktop && !panelVisible && (
        <button
          onClick={toggleChat}
          className="fixed bottom-6 right-6 z-40 w-[50px] h-[50px] rounded-full flex items-center justify-center transition-transform hover:scale-105"
          style={{ backgroundColor: '#5FD93A', color: '#16211E', boxShadow: 'var(--spira-glow-fab)' }}
          aria-label="AI 어시스턴트 열기"
          title="AI 어시스턴트"
        >
          <svg viewBox="0 0 37 34" style={{ width: 35, height: 32 }} fill="currentColor">
            <path d="M24.2739 8.23248C31.1271 8.23248 36.7056 13.811 36.7056 20.6642H32.3406C32.3406 16.2162 28.7219 12.5976 24.2739 12.5976V8.23248Z" />
            <path d="M11.1655 6.10352e-05C15.7008 6.10352e-05 19.3937 3.69291 19.3937 8.22822H16.504C16.504 5.28616 14.1076 2.88974 11.1655 2.88974V6.10352e-05Z" />
            <path d="M25.588 6.10352e-05C21.0527 6.10352e-05 17.3599 3.69291 17.3599 8.22822H20.2495C20.2495 5.28616 22.646 2.88974 25.588 2.88974V6.10352e-05Z" />
            <path d="M12.4317 8.73444C5.57856 8.73444 0 14.313 0 21.1662H4.36507C4.36507 16.7182 7.98372 13.0995 12.4317 13.0995V8.73444Z" />
            <path d="M20.5376 13.3572H16.2206C16.2206 17.7572 12.6412 21.3365 8.24121 21.3365V25.6536C12.6412 25.6536 16.2206 29.2329 16.2206 33.6329H20.5376C20.5376 29.2329 24.117 25.6536 28.517 25.6536V21.3365C24.117 21.3365 20.5376 17.7572 20.5376 13.3572ZM18.3769 26.6837C17.517 25.4353 16.4344 24.3528 15.1904 23.4972C16.4388 22.6373 17.5214 21.5548 18.3769 20.3107C19.2368 21.5591 20.3194 22.6417 21.5634 23.4972C20.315 24.3572 19.2325 25.4397 18.3769 26.6837Z" />
            <path d="M18.3764 10.1924C20.2616 10.1924 21.7899 8.66418 21.7899 6.77896C21.7899 4.89375 20.2616 3.36548 18.3764 3.36548C16.4912 3.36548 14.9629 4.89375 14.9629 6.77896C14.9629 8.66418 16.4912 10.1924 18.3764 10.1924Z" />
          </svg>
        </button>
      )}

      {/* dim 배경 없이, 채팅 패널만 그림자와 함께 페이지 위에 떠 있게 한다 */}
      {panelVisible && (
        <aside
          className={panelClasses}
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            transformOrigin: 'bottom right',
            opacity: entered ? 1 : 0,
            transform: entered ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.9)',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-out',
            willChange: 'transform, opacity',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--spira-border)' }}>
            {view === 'archive' ? (
              <span className="flex-1 text-[15px] font-bold" style={{ color: '#16211E' }}>대화 보관함</span>
            ) : (
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF7E4' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/sparky.svg" alt="Sparky" className="w-4 h-4" />
                </span>
                <span className="text-[15px] font-bold" style={{ color: '#16211E' }}>Sparky</span>
              </div>
            )}

            {/* 보관함 토글 */}
            <button
              onClick={() => setView(v => v === 'archive' ? 'chat' : 'archive')}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={view === 'archive' ? { backgroundColor: '#DFF9C4', color: '#3E6B1F' } : { color: '#9AA39D' }}
              title="보관함"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="1.5" width="13" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="1.5" y="7" width="13" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.5 10.5h5M5.5 12.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>

            {/* 새 대화 */}
            {view === 'chat' && (
              <button
                onClick={handleNewChat}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/5"
                style={{ color: '#9AA39D' }}
                title="새 대화 시작"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* 닫기 (오버레이 모드) */}
            {overlayMode && (
              <button
                onClick={toggleChat}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/5"
                style={{ color: '#9AA39D' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* ── 보관함 뷰 ── */}
          {view === 'archive' && (
            <div className="flex-1 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-6">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" style={{ color: '#C4CCC4' }}>
                    <rect x="3" y="3" width="18" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="3" y="10" width="18" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 15h8M8 18h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <p className="text-[14px] font-semibold" style={{ color: '#5B6560' }}>보관된 대화가 없어요</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#9AA39D' }}>
                    새로고침하거나 새 대화를 시작하면<br />이전 대화가 여기에 보관됩니다.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--spira-border)]">
                  {sessions.map(session => (
                    <li key={session.id} className="group relative">
                      <button
                        onClick={() => handleLoadSession(session)}
                        className="w-full text-left px-4 py-3.5 hover:bg-black/[0.03] transition-colors pr-10"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[13px] font-semibold line-clamp-2 leading-relaxed" style={{ color: '#16211E' }}>
                            {session.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]" style={{ color: '#9AA39D' }}>
                            {formatDate(session.createdAt)}
                          </span>
                          <span className="text-[10px]" style={{ color: '#C4CCC4' }}>·</span>
                          <span className="text-[10px]" style={{ color: '#9AA39D' }}>
                            {session.messages.length}개 메시지
                          </span>
                        </div>
                        {/* 메시지 미리보기 */}
                        {session.messages.length > 0 && (
                          <p className="text-[11px] mt-1 line-clamp-1" style={{ color: '#9AA39D' }}>
                            {session.messages[session.messages.length - 1].content}
                          </p>
                        )}
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={e => { e.stopPropagation(); chat?.deleteSession(session.id); }}
                        className="absolute right-3 top-3.5 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center transition-all"
                        style={{ color: '#9AA39D' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#FF696C'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#9AA39D'; }}
                        title="삭제"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                          <path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── 채팅 뷰 ── */}
          {view === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#EEF7E4' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/sparky.svg" alt="Sparky" className="w-6 h-6" />
                    </span>
                    <p className="text-[15px] font-bold" style={{ color: '#16211E' }}>{AI_COPY.emptyTitle}</p>
                    <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: '#9AA39D' }}>
                      {AI_COPY.emptyBody}
                    </p>
                    {/* 화면별 추천 메시지 */}
                    <div className="flex flex-col gap-2 w-full mt-1">
                      {chips.map(c => (
                        <button
                          key={c.label}
                          onClick={() => { if (!loading && chat) chat.sendMessage(c.message); }}
                          className="text-[13px] font-medium rounded-full px-4 py-2 transition-colors"
                          style={{ backgroundColor: '#F1F1EB', color: '#5B6560' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#DFF9C4'; e.currentTarget.style.color = '#3E6B1F'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#F1F1EB'; e.currentTarget.style.color = '#5B6560'; }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {sessions.length > 0 && (
                      <button
                        onClick={() => setView('archive')}
                        className="mt-1 text-[12px] underline underline-offset-2 transition-colors hover:opacity-70"
                        style={{ color: '#9AA39D' }}
                      >
                        이전 대화 {sessions.length}개 보기
                      </button>
                    )}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl"
                      style={msg.role === 'user'
                        ? { backgroundColor: '#9DFE3B', color: '#16211E', fontWeight: 500, borderBottomRightRadius: 6 }
                        : { backgroundColor: '#F1F1EB', color: '#16211E', borderBottomLeftRadius: 6 }}
                    >
                      {(msg.role === 'assistant' ? stripMarkdown(msg.content) : msg.content) || (
                        <span className="flex gap-1 items-center py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#9AA39D', animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#9AA39D', animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#9AA39D', animationDelay: '300ms' }} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {/* AI가 생각 중 — 아직 답변 버블이 스트리밍되기 전 대기 상태 */}
                {loading && (messages.length === 0 || messages[messages.length - 1].role === 'user') && (
                  <div className="flex justify-start">
                    <div className="px-3.5 py-3 rounded-2xl" style={{ backgroundColor: '#F1F1EB', borderBottomLeftRadius: 6 }}>
                      <span className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#9AA39D', animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#9AA39D', animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#9AA39D', animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="px-3 py-3 border-t flex gap-2 items-end flex-shrink-0" style={{ borderColor: 'var(--spira-border)' }}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="flex-1 resize-none bg-white border rounded-2xl px-4 py-2.5 text-sm placeholder-neutral-400 outline-none transition-colors max-h-28"
                  style={{ borderColor: 'var(--spira-border-strong)', color: '#16211E' }}
                  placeholder={AI_COPY.placeholder}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-full flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-transform hover:-translate-y-0.5 disabled:translate-y-0"
                  style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </aside>
      )}
    </>
  );
}
