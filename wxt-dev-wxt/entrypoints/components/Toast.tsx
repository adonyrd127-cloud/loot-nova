import { useEffect } from 'react';
import { ToastMessage } from '@/entrypoints/types/ui';

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const ICON_MAP: Record<string, { icon: string; cls: string }> = {
  success: { icon: '✓', cls: 'ln-toast-success' },
  error:   { icon: '✕', cls: 'ln-toast-error' },
  info:    { icon: 'ℹ', cls: 'ln-toast-info' },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const { icon, cls } = ICON_MAP[toast.type] ?? ICON_MAP.info;

  return (
    <div className="ln-toast-wrapper">
      <div className="ln-toast">
        <span className={`ln-toast-icon ${cls}`}>{icon}</span>
        {toast.message}
      </div>
    </div>
  );
}
