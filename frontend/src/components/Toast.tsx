import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type ToastVariant = 'info' | 'success' | 'error';

interface ToastInput {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const duration = toast.durationMs ?? (toast.variant === 'error' ? 6000 : 4000);

  useEffect(() => {
    if (duration <= 0) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [duration, onDismiss]);

  const styles: Record<ToastVariant, string> = {
    info: 'bg-white border-gray-200 text-gray-900',
    success: 'bg-green-50 border-green-200 text-green-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto border rounded-md shadow-sm p-3 text-sm flex items-start gap-3 ${styles[toast.variant ?? 'info']}`}
    >
      <div className="flex-1">{toast.message}</div>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="text-blue-600 hover:underline font-medium whitespace-nowrap"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-gray-400 hover:text-gray-600"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
