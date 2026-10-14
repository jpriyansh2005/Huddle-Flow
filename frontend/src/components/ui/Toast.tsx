"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

type Toast = { id: number; message: string };
type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast | null>(null);

const VISIBLE_MS = 3000;
let nextToastId = 1;

/** Short messages at the top of the screen, such as "Copied to clipboard". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast: ShowToast = (message) => {
    const id = nextToastId++;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, VISIBLE_MS);
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-pop-in rounded-lg bg-[#1f2329] px-4 py-2.5 text-sm font-medium text-white shadow-popover"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return showToast;
}
