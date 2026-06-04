import React from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const cancel = cancelLabel || browser.i18n.getMessage('confirm_cancel');
  const confirm = confirmLabel || browser.i18n.getMessage('confirm_delete');

  return (
    <div className="ln-confirm-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ln-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="ln-confirm-title">{title}</div>
        <div className="ln-confirm-message">{message}</div>
        <div className="ln-confirm-actions">
          <button className="ln-btn ln-btn-ghost" onClick={onCancel}>{cancel}</button>
          <button className="ln-btn ln-btn-danger" onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  );
};
