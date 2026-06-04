import { useEffect } from 'react';
import { ToastMessage } from '@/entrypoints/types/ui';
import { IconCheck, IconX, IconInfo } from './icons/Icons';

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  let IconComponent = IconInfo;
  let toastClass = 'ln-toast-info';

  if (toast.type === 'success') {
    IconComponent = IconCheck;
    toastClass = 'ln-toast-success';
  } else if (toast.type === 'error') {
    IconComponent = IconX;
    toastClass = 'ln-toast-error';
  }

  return (
    <div className={`ln-toast ${toastClass}`} role="alert" aria-live="polite">
      <span className="ln-toast-icon">
        <IconComponent size={16} />
      </span>
      <div className="ln-toast-message">{toast.message}</div>
      <button className="ln-toast-close" onClick={onDismiss} aria-label="Close notification">
        <IconX size={14} />
      </button>
    </div>
  );
}

export default Toast;
