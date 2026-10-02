import { NotificationList } from '@/features/Notifications';
import { useNotifications } from '@/lib/queries';
import { BackHeader, Screen } from '@/ui/layout';

/** Phones (and a direct link on desktop). On desktop the sidebar opens the same list as a panel. */
export default function NotificationsScreen() {
  const q = useNotifications();
  return (
    <Screen edges={['top', 'bottom']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Notifications" />
      <NotificationList />
    </Screen>
  );
}
