import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastOptions {
  /** A button in the message, e.g. "Undo"; the message then stays longer. */
  action?: { label: string; onClick: () => void };
}
type Toast = { msg: string; action?: ToastOptions['action']; id: number };

const ToastContext = createContext<(msg: string, opts?: ToastOptions) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((msg: string, opts?: ToastOptions) => {
    setToast({ msg, action: opts?.action, id: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), opts?.action ? 5000 : 2200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-36 z-50 flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="toast-in flex items-center gap-3 rounded-full bg-ink py-2 pl-4 pr-2 text-sm font-semibold text-paper shadow-lg dark:bg-paper dark:text-ink">
            <span className={toast.action ? '' : 'pr-2'}>{toast.msg}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  setToast(null);
                }}
                className="pointer-events-auto rounded-full bg-white/15 px-3 py-1 font-bold text-sky-300 hover:bg-white/25 dark:bg-ink/10 dark:text-sky"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
