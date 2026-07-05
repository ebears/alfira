import type { Notification } from '../hooks/useNotification';

interface NotificationToastProps {
  notification: Notification;
  lift?: boolean;
}

export default function NotificationToast({ notification, lift }: NotificationToastProps) {
  return (
    <div
      className={`fixed ${lift ? 'bottom-36 md:bottom-32' : 'bottom-24'} left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg modal-clay font-mono text-xs animate-fade-up ${
        notification.type === 'success'
          ? 'bg-accent/20 border border-accent/40 text-accent'
          : 'bg-danger/20 border border-danger/40 text-danger'
      }`}
    >
      {notification.message}
    </div>
  );
}
