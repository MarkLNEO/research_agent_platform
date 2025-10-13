import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type Toast = {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'info';
  durationMs?: number;
  actionText?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  addToast: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      addToast: () => {}
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const full: Toast = { id, type: 'info', durationMs: 4000, ...toast };
    setToasts(prev => [...prev, full]);
    // auto-dismiss
    const duration = full.durationMs ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-4 right-4 z-[1000] space-y-2 pointer-events-none"
        aria-live="polite"
        role="status"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto w-80 rounded-xl border shadow-sm px-4 py-3 text-sm',
              t.type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-900',
              t.type === 'error' && 'bg-red-50 border-red-200 text-red-900',
              (!t.type || t.type === 'info') && 'bg-white border-gray-200 text-gray-900',
            ].filter(Boolean).join(' ')}
          >
            <div className="font-semibold mb-0.5">{t.title}</div>
            {t.description && <div className="text-gray-600 text-xs">{t.description}</div>}
            {t.actionText && t.onAction && (
              <button
                type="button"
                onClick={t.onAction}
                className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                {t.actionText}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
