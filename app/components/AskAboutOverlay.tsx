'use client';
import { useEffect, useState, useCallback } from 'react';
import { useChatContext } from '../lib/ChatContext';

// AI 채팅이 열려 있을 때, [data-ask] 속성이 붙은 항목에 마우스를 올리면
// 스트로크(외곽선)와 '이 내용에 대해 묻기' 버튼이 떠서, 그 항목 내용을 채팅에 넣어 상의할 수 있게 한다.
// 항목 쪽은 data-ask + data-ask-label + data-ask-content 만 붙이면 된다(저침습).
type Hover = { rect: DOMRect; label: string; content: string };

export default function AskAboutOverlay() {
  const chat = useChatContext();
  const open = !!chat?.open;
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    if (!open) { setHover(null); return; }
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-ask-ui]')) return; // 오버레이 UI(버튼) 위에서는 유지
      const el = t?.closest?.('[data-ask]') as HTMLElement | null;
      if (!el) { setHover(null); return; }
      const content = el.getAttribute('data-ask-content') || '';
      const label = el.getAttribute('data-ask-label') || '이 항목';
      setHover({ rect: el.getBoundingClientRect(), label, content });
    };
    const hide = () => setHover(null);
    document.addEventListener('mouseover', onOver);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mouseover', onOver);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);

  const ask = useCallback(() => {
    if (!hover || !chat) return;
    chat.openWithContext(hover.label, hover.content);
    setHover(null);
  }, [hover, chat]);

  if (!open || !hover) return null;
  const r = hover.rect;
  if (r.width === 0 && r.height === 0) return null;
  const pad = 3;
  return (
    <div className="fixed inset-0 z-[45] pointer-events-none">
      {/* 스트로크 */}
      <div className="absolute rounded-lg" style={{ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, border: '2px solid #7C3AED', boxShadow: '0 0 0 3px rgba(124,58,237,0.12)' }} />
      {/* '이 내용에 대해 묻기' 버튼 — 항목 오른쪽 위 모서리 안쪽 */}
      <button
        data-ask-ui
        onClick={ask}
        className="absolute pointer-events-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 whitespace-nowrap"
        style={{ left: Math.max(6, r.right - 6), top: Math.max(6, r.top + 4), backgroundColor: '#7C3AED', transform: 'translateX(-100%)' }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" /></svg>
        이 내용에 대해 묻기
      </button>
    </div>
  );
}
