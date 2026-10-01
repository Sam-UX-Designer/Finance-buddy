import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CircleAlert, Inbox, RefreshCw, TriangleAlert, WifiOff, X } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius, space } from '@/theme/tokens';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { Button, IconButton } from './controls';
import { Press, Row, T } from './primitives';

export const PAGE_X = space.xl;
/** Content width cap so web/tablet layouts stay phone-like and readable. */
export const MAX_WIDTH = 560;

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
  footer,
  edges = ['top'],
  contentStyle,
  scrollProps,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  footer?: ReactNode;
  edges?: ('top' | 'bottom')[];
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? PAGE_X : 0;
  const inner = (
    <View style={[{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: pad }, contentStyle]}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: edges.includes('top') ? insets.top : 0 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            {...scrollProps}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: space.xxxl + (edges.includes('bottom') ? insets.bottom : 0) }}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.textSecondary} /> : undefined}
          >
            {inner}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{inner}</View>
        )}
        {footer ? (
          <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: PAGE_X, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.lg) }}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function BackHeader({ onBack, close, right, title }: { onBack?: () => void; close?: boolean; right?: ReactNode; title?: string }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <Row style={{ height: 52, justifyContent: 'space-between', marginHorizontal: -10 }}>
      {close ? <View style={{ width: 40 }} /> : <IconButton icon={ArrowLeft} label="Go back" onPress={back} />}
      {title ? (
        <T v="subtitle" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {title}
        </T>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {close ? <IconButton icon={X} label="Close" onPress={back} /> : (right ?? <View style={{ width: 40 }} />)}
    </Row>
  );
}

export function TabHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <Row style={{ height: 56, justifyContent: 'space-between', marginTop: space.xs }}>
      <T v="title" accessibilityRole="header">
        {title}
      </T>
      <Row style={{ marginRight: -10 }}>{right}</Row>
    </Row>
  );
}

/** Bottom sheet for secondary actions (Blueprint §18). */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const { c, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    y.setValue(reduceMotion ? 0 : 40);
    opacity.setValue(reduceMotion ? 1 : 0);
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: motion.base, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: motion.base, useNativeDriver: true }),
    ]).start();
  }, [visible, reduceMotion, y, opacity]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={{ flex: 1, backgroundColor: c.overlay, opacity }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Dismiss" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '88%',
            alignItems: 'center',
            transform: [{ translateY: y }],
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: MAX_WIDTH,
              backgroundColor: c.bg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: c.border,
              paddingBottom: Math.max(insets.bottom, space.lg),
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
            </View>
            {title ? (
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: PAGE_X, paddingTop: space.md }}>
                <T v="subtitle" accessibilityRole="header" style={{ flex: 1 }}>
                  {title}
                </T>
                <IconButton icon={X} label="Close" onPress={onClose} size={20} style={{ marginRight: -10 }} />
              </Row>
            ) : null}
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: PAGE_X, paddingTop: space.sm, paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: PAGE_X }}>{footer}</View> : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── System states (Blueprint §25) ────────────────────────────────────
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 64, alignItems: 'center', gap: space.md }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={c.textSecondary} />
      <T v="small" tone="secondary">
        {label}
      </T>
    </View>
  );
}

export function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm }}>
        <Inbox size={22} color={c.textSecondary} />
      </View>
      <T v="bodySemibold" align="center">
        {title}
      </T>
      <T v="small" tone="secondary" align="center">
        {body}
      </T>
      {action ? <Button label={action} onPress={onAction} variant="outline" size="md" style={{ marginTop: space.md, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { c } = useTheme();
  const offline = error instanceof ApiRequestError && error.isNetwork;
  const Icon = offline ? WifiOff : CircleAlert;
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg }} accessibilityLiveRegion="polite">
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: offline ? c.surfaceMuted : c.negativeSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm }}>
        <Icon size={22} color={offline ? c.textSecondary : c.negative} />
      </View>
      <T v="bodySemibold" align="center">
        {offline ? "You're offline" : "Couldn't load this"}
      </T>
      <T v="small" tone="secondary" align="center">
        {errorMessage(error)}
      </T>
      {onRetry ? <Button label="Try again" icon={RefreshCw} onPress={onRetry} variant="outline" size="md" style={{ marginTop: space.md, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function Banner({ tone = 'warning', title, body, action, onAction }: { tone?: 'warning' | 'negative' | 'info'; title: string; body?: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  const bg = tone === 'negative' ? c.negativeSoft : tone === 'info' ? c.infoSoft : c.warningSoft;
  const fg = tone === 'negative' ? c.negative : tone === 'info' ? c.info : c.warning;
  return (
    <Row style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md, gap: space.md, alignItems: 'flex-start' }} accessibilityRole="alert">
      <TriangleAlert size={18} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="smallMedium" color={fg}>
          {title}
        </T>
        {body ? (
          <T v="caption" tone="secondary">
            {body}
          </T>
        ) : null}
      </View>
      {action ? (
        <Press onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <T v="smallMedium" color={fg}>
            {action}
          </T>
        </Press>
      ) : null}
    </Row>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const { c, reduceMotion } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return <Animated.View style={[{ height, width, borderRadius: radius.sm, backgroundColor: c.skeleton, opacity }, style]} />;
}

export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useTheme();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, { toValue: 1, duration: motion.slow, delay, useNativeDriver: true }).start();
  }, [v, delay, reduceMotion]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>
  );
}
