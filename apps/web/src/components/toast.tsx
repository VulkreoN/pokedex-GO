import { createContext, useCallback, useContext, useRef, useState, type PointerEvent, type ReactNode } from 'react';

export interface ToastOptions {
  /** A button in the message, e.g. "Undo"; the message then stays longer. */
  action?: { label: string; onClick: () => void };
}
type Toast = { msg: string; action?: ToastOptions['action']; id: number };

const ToastContext = createContext<(msg: string, opts?: ToastOptions) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);
  const dragRef = useRef(0);
  const resetDrag = () => {
    startX.current = null;
    dragRef.current = 0;
    setDrag(0);
  };
  const show = useCallback((msg: string, opts?: ToastOptions) => {
    setToast({ msg, action: opts?.action, id: Date.now() });
    resetDrag();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), opts?.action ? 5000 : 2200);
  }, []);
  // A swipe sideways sends the message away before its time; capture keeps release clean outside the pill.
  const swipe = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return;
      startX.current = e.clientX;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (startX.current === null) return;
      const dx = e.clientX - startX.current;
      dragRef.current = dx;
      setDrag(dx);
    },
    onPointerUp: () => {
      if (startX.current === null) return;
      const dismiss = Math.abs(dragRef.current) > 70;
      resetDrag();
      if (dismiss) { window.clearTimeout(timer.current); setToast(null); }
    },
    onPointerCancel: resetDrag,
    onLostPointerCapture: resetDrag,
  };
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-36 z-50 flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            {...swipe}
            className="toast-in pointer-events-auto relative flex touch-none items-center gap-3 overflow-hidden rounded-full bg-ink py-2 pl-4 pr-2 text-sm font-semibold text-paper shadow-lg"
            style={{ transform: drag ? `translateX(${drag}px) rotate(${drag / 30}deg)` : undefined, opacity: drag ? Math.max(0.2, 1 - Math.abs(drag) / 160) : undefined, ['--toast-ms' as string]: toast.action ? '5s' : '2.2s' }}
          >
            {/* The fuse: what is left of its time. */}
            <span aria-hidden="true" className="toast-fuse absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-toast-accent/80" />
            <span className={toast.action ? '' : 'pr-2'}>{toast.msg}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  setToast(null);
                }}
                className="pointer-events-auto min-h-8 rounded-full bg-paper/15 px-3 py-1 font-bold text-toast-accent hover:bg-paper/25"
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
