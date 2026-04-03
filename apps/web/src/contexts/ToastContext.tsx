"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { ToastContainer, type ToastData, type ToastType } from "@/components/common/Toast";

interface ToastContextValue {
  success: (message: string, action?: ToastData["action"]) => void;
  error: (message: string, action?: ToastData["action"]) => void;
  info: (message: string, action?: ToastData["action"]) => void;
  warning: (message: string, action?: ToastData["action"]) => void;
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
});

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, action?: ToastData["action"]) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, message, action }]);
    },
    []
  );

  const value: ToastContextValue = {
    success: useCallback(
      (msg: string, action?: ToastData["action"]) => addToast("success", msg, action),
      [addToast]
    ),
    error: useCallback(
      (msg: string, action?: ToastData["action"]) => addToast("error", msg, action),
      [addToast]
    ),
    info: useCallback(
      (msg: string, action?: ToastData["action"]) => addToast("info", msg, action),
      [addToast]
    ),
    warning: useCallback(
      (msg: string, action?: ToastData["action"]) => addToast("warning", msg, action),
      [addToast]
    ),
  };

  return (
    <ToastContext value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
