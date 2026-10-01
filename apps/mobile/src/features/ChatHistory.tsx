import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SquarePen, Trash2 } from 'lucide-react-native';
import { formatDate, formatTime, type SIConversationDTO } from '@finance-buddy/core';
import { haptics } from '@/lib/haptics';
import { useDeleteChat, useSIHistory } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { ErrorState, LoadingState, Sheet } from '@/ui/layout';
import { Press, Row, T } from '@/ui/primitives';

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;
/** Day number in India time, so "Today" matches the dates shown everywhere else in the app. */
const istDay = (ms: number) => Math.floor((ms + IST) / DAY);

/** Date groups like ChatGPT's history: Today, Yesterday, Previous 7 days, Previous 30 days, then by month. */
function groupLabel(iso: string, now: number): string {
  const days = istDay(now) - istDay(Date.parse(iso));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  if (days < 30) return 'Previous 30 days';
  const [, mon, year] = formatDate(iso).split(' ');
  return `${mon} ${year}`;
}

export function ChatHistorySheet({
  visible,
  onClose,
  currentId,
  onOpen,
  onNew,
}: {
  visible: boolean;
  onClose: () => void;
  currentId?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { c } = useTheme();
  const history = useSIHistory(visible);
  const del = useDeleteChat();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const now = Date.now();
    const out: { label: string; items: SIConversationDTO[] }[] = [];
    for (const conv of history.data?.conversations ?? []) {
      const label = groupLabel(conv.lastAt, now);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(conv);
      else out.push({ label, items: [conv] });
    }
    return out;
  }, [history.data]);

  const close = () => {
    setConfirmId(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title="Chat history">
      <Press
        onPress={() => {
          setConfirmId(null);
          onNew();
        }}
        accessibilityRole="button"
        style={{ backgroundColor: c.surfaceMuted, borderRadius: radius.md, paddingHorizontal: space.md, height: 48, justifyContent: 'center' }}
      >
        <Row gap={space.sm}>
          <SquarePen size={18} color={c.text} />
          <T v="bodyMedium">New chat</T>
        </Row>
      </Press>

      {history.isLoading ? (
        <LoadingState label="Loading your chats…" />
      ) : history.error ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : !groups.length ? (
        <T v="small" tone="secondary" style={{ marginTop: space.xl, textAlign: 'center' }}>
          No past chats yet. Your questions to SI will show up here.
        </T>
      ) : (
        groups.map((g) => (
          <View key={g.label} style={{ marginTop: space.lg }}>
            <T v="caption" tone="secondary" style={{ marginBottom: space.xs, marginLeft: space.xs }} accessibilityRole="header">
              {g.label}
            </T>
            {g.items.map((conv) => {
              const current = conv.id === currentId;
              const confirming = confirmId === conv.id;
              const when = g.label === 'Today' || g.label === 'Yesterday' ? formatTime(conv.lastAt) : formatDate(conv.lastAt);
              return (
                <Row key={conv.id} style={{ borderRadius: radius.md, backgroundColor: current ? c.surfaceMuted : 'transparent', paddingLeft: space.xs }}>
                  <Press
                    onPress={() => {
                      setConfirmId(null);
                      onOpen(conv.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${conv.title}, ${when}${current ? ', open now' : ''}`}
                    scaleTo={0.99}
                    style={{ flex: 1, paddingVertical: 10, paddingRight: space.sm }}
                  >
                    <T v="body" numberOfLines={1}>
                      {conv.title}
                    </T>
                    <T v="caption" tone="tertiary">
                      {when}
                    </T>
                  </Press>
                  {confirming ? (
                    <Press
                      onPress={() => {
                        haptics.warning();
                        setConfirmId(null);
                        del.mutate(conv.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete chat: ${conv.title}`}
                      style={{ backgroundColor: c.negative, borderRadius: 16, paddingHorizontal: 14, height: 32, justifyContent: 'center', marginRight: space.xs }}
                    >
                      <T v="smallMedium" color="#FFFFFF">
                        Delete
                      </T>
                    </Press>
                  ) : (
                    <Press
                      onPress={() => setConfirmId(conv.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete chat: ${conv.title}`}
                      accessibilityHint="Asks you to confirm"
                      hitSlop={6}
                      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={17} color={c.textTertiary} />
                    </Press>
                  )}
                </Row>
              );
            })}
          </View>
        ))
      )}
    </Sheet>
  );
}
