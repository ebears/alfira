import type React from 'react';
import { Backdrop } from './Backdrop';
import { Button } from './ui/Button';

interface ConfirmModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Backdrop onClose={onCancel}>
      <div className='p-5 md:p-6 w-full max-w-sm mx-4 glass-modal animate-fade-up'>
        <h2 className='font-display text-2xl md:text-3xl text-fg tracking-wider mb-1'>{title}</h2>
        <p className='font-body text-sm text-muted mb-4 md:mb-6'>{message}</p>
        <div className='flex gap-2 justify-end'>
          <Button variant='inherit' onClick={onCancel} surface='surface'>
            Cancel
          </Button>
          <Button variant='danger' onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Backdrop>
  );
}
