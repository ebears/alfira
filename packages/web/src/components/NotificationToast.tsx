import { type Notification } from '../hooks/useNotification';
import { SpringUp } from './ui/SpringUp';

interface NotificationToastProps {
  notification: Notification;
  lift?: boolean;
}

export default function NotificationToast({ notification, lift }: NotificationToastProps) {
  return (
    <SpringUp
      className={`fixed ${lift ? 'bottom-48 md:bottom-40' : 'bottom-24'} glass-toast left-1/2 z-50 -translate-x-1/2 px-4 py-3 font-mono text-xs ${
        notification.type === 'success'
          ? 'bg-accent/15 border-accent/40 text-accent'
          : 'bg-danger/15 border-danger/40 text-danger'
      }`}
    >
      {notification.message}
    </SpringUp>
  );
}
