import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Bell, CalendarClock, ShieldCheck, Sparkles, RefreshCw, Link } from 'lucide-react-native';
import { formatDate, formatTime, type NotificationDTO } from '@moneymate/core';
import { api } from '@/lib/api';
import { useNotifications, useInvalidateFinance } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { IconTile } from '@/ui/display';
import { BackHeader, EmptyState, ErrorState, LoadingState, Screen } from '@/ui/layout';
import { Divider, Press, Row, T } from '@/ui/primitives';

export default function NotificationsScreen() {
  const { c } = useTheme();
  const q = useNotifications();
  const invalidate = useInvalidateFinance();
  useEffect(() => {
    if (q.data?.notifications.some((n) => !n.readAt)) {
      void api('/v1/notifications/read', { method: 'POST', body: {} }).then(() => invalidate());
    }
  }, [q.data]);
  const style = (n: NotificationDTO) =>
    ({
      UPCOMING_PAYMENT: { icon: CalendarClock, color: c.warning, bg: c.warningSoft },
      INSIGHT: { icon: Sparkles, color: c.loan, bg: c.loanSoft },
      SECURITY: { icon: ShieldCheck, color: c.negative, bg: c.negativeSoft },
      SYNC: { icon: RefreshCw, color: c.info, bg: c.infoSoft },
      CONSENT: { icon: Link, color: c.positive, bg: c.positiveSoft },
    })[n.kind] ?? { icon: Bell, color: c.textSecondary, bg: c.surfaceMuted };

  return (
    <Screen edges={['top', 'bottom']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Notifications" />
      {q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingState />
      ) : q.data.notifications.length === 0 ? (
        <EmptyState title="You're all caught up" body="Upcoming payments, sync updates and SI observations will show up here." />
      ) : (
        q.data.notifications.map((n, i) => {
          const s = style(n);
          return (
            <View key={n.id}>
              {i > 0 ? <Divider inset={52} /> : null}
              <Press
                onPress={() => n.link && router.push((n.link === '/si' ? '/(tabs)/si' : n.link) as never)}
                disabled={!n.link}
                accessibilityRole="button"
                scaleTo={0.99}
              >
                <Row gap={space.md} style={{ paddingVertical: space.md, alignItems: 'flex-start' }}>
                  <IconTile icon={s.icon} color={s.color} bg={s.bg} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T v="bodySemibold" style={{ flex: 1 }}>
                        {n.title}
                      </T>
                      {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.info }} accessibilityLabel="Unread" /> : null}
                    </Row>
                    <T v="small" tone="secondary">
                      {n.body}
                    </T>
                    <T v="caption" tone="tertiary">{`${formatDate(n.createdAt)}, ${formatTime(n.createdAt)}`}</T>
                  </View>
                </Row>
              </Press>
            </View>
          );
        })
      )}
    </Screen>
  );
}
