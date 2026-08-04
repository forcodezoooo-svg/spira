'use client';
import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

type ToastType = 'error' | 'success' | 'info';
interface ToastItem { id: number; message: string; type: ToastType; }

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
  dismiss: (key: string) => void;
  /** 같은 key의 토스트가 이미 떠 있으면 중복 표시하지 않음 (예: 저장 실패 반복) */
  toastOnce: (key: string, message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);
let nextId = 1;

const VARIANT: Record<ToastType, { bg: string; color: string; icon: ReactNode }> = {
  error:   { bg: '#FF696C', color: '#fff', icon: <path d="M8 4.5v4.2M8 11.2v.05" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
  success: { bg: '#9DFE3B', color: '#16211E', icon: <path d="M4 8.2l2.6 2.6L12 5.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /> },
  info:    { bg: '#16211E', color: '#EDFF9F', icon: <path d="M8 7.5v4M8 4.7v.05" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const activeKeys = useRef<Map<string, number>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
    for (const [k, v] of activeKeys.current) if (v === id) activeKeys.current.delete(k);
  }, []);

  const push = useCallback((message: string, type: ToastType, key?: string) => {
    const id = nextId++;
    if (key) activeKeys.current.set(key, id);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => remove(id), type === 'error' ? 5200 : 3000);
    return id;
  }, [remove]);

  const toast = useCallback((message: string, type: ToastType = 'info') => { push(message, type); }, [push]);
  const toastOnce = useCallback((key: string, message: string, type: ToastType = 'info') => {
    if (activeKeys.current.has(key)) return;
    push(message, type, key);
  }, [push]);
  const dismiss = useCallback((key: string) => {
    const id = activeKeys.current.get(key);
    if (id != null) remove(id);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast, toastOnce, dismiss }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => {
          const v = VARIANT[t.type];
          return (
            <div key={t.id} onClick={() => remove(t.id)}
              className="pointer-events-auto flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full shadow-lg cursor-pointer max-w-[90vw]"
              style={{ backgroundColor: v.bg, color: v.color, boxShadow: '0 10px 30px rgba(0,0,0,0.18)' }}>
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 flex-shrink-0">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
                {v.icon}
              </svg>
              <span className="text-[13px] font-semibold leading-snug">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
