import type React from 'react';

import { Backdrop } from './Backdrop';
import { Button } from './ui/Button';
import { SpringUp } from './ui/SpringUp';

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
      <SpringUp className='glass-modal mx-4 w-full max-w-sm p-5 md:p-6'>
        <h2 className='font-display text-fg mb-1 text-2xl tracking-wider md:text-3xl'>{title}</h2>
        <p className='font-body text-muted mb-4 text-sm md:mb-6'>{message}</p>
        <div className='flex justify-end gap-2'>
          <Button variant='inherit' onClick={onCancel} surface='surface'>
            Cancel
          </Button>
          <Button variant='danger' onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </SpringUp>
    </Backdrop>
  );
}
