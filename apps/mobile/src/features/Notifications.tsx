import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Bell, CalendarClock, Link, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react-native';
import { formatDate, formatTime, type NotificationDTO } from '@finance-buddy/core';
import { api } from '@/lib/api';
import { useInvalidateFinance, useNotifications } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { IconButton } from '@/ui/controls';
import { IconTile } from '@/ui/display';
import { EmptyState, ErrorState, LoadingState, SIDEBAR_W } from '@/ui/layout';
import { Divider, Press, Row, T } from '@/ui/primitives';

const ND = Platform.OS !== 'web';
const PANEL_W = 400;

/** The notification list (phone screen and desktop panel). Opening it marks everything as read. */
export function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
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

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingState />;
  if (q.data.notifications.length === 0) return <EmptyState title="You're all caught up" body="Upcoming payments, sync updates and SI observations will show up here." />;
  return (
    <>
      {q.data.notifications.map((n, i) => {
        const s = style(n);
        return (
          <View key={n.id}>
            {i > 0 ? <Divider inset={52} /> : null}
            <Press
              onPress={() => {
                if (!n.link) return;
                onNavigate?.();
                router.push((n.link === '/si' ? '/(tabs)/si' : n.link) as never);
              }}
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
      })}
    </>
  );
}

/**
 * Desktop web: notifications slide out from the sidebar over the current screen, so you never
 * leave what you were looking at. Click outside, press Esc or the close button to put it away.
 */
export function NotificationsPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c, scheme, reduceMotion } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduceMotion) a.setValue(1);
      else Animated.spring(a, { toValue: 1, useNativeDriver: ND, stiffness: 300, damping: 30 }).start();
    } else {
      Animated.timing(a, { toValue: 0, duration: reduceMotion ? 0 : 160, easing: Easing.in(Easing.quad), useNativeDriver: ND }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, reduceMotion]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* A light dim over the screen (not the sidebar); clicking it closes the panel. */}
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: SIDEBAR_W, backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(10,10,11,0.14)', opacity: a }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close notifications" />
      </Animated.View>
      <Animated.View
        role="dialog"
        aria-label="Notifications"
        style={{
          position: 'absolute',
          top: 12,
          bottom: 12,
          left: SIDEBAR_W - 4,
          width: PANEL_W,
          opacity: a,
          transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        }}
      >
        {/* Solid, not glass: a list of messages has to stay readable over any screen. */}
        <View
          style={[
            { flex: 1, overflow: 'hidden', borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
            Platform.OS === 'web' ? ({ boxShadow: scheme === 'dark' ? '0 24px 60px rgba(0,0,0,0.6)' : '0 24px 60px rgba(10,10,11,0.16)' } as object) : null,
          ]}
        >
          <Row style={{ justifyContent: 'space-between', paddingLeft: space.xl, paddingRight: space.sm, paddingTop: space.md, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <T v="subtitle" accessibilityRole="header">
              Notifications
            </T>
            <IconButton icon={X} label="Close notifications" onPress={onClose} size={20} />
          </Row>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.lg }}>
            <NotificationList onNavigate={onClose} />
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}
