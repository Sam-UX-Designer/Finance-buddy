import { View } from 'react-native';
import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import type { BriefItem, SIMessageDTO } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { FadeIn } from '@/ui/layout';
import { Row, T } from '@/ui/primitives';

/** Shared by the Super Intelligence tab and the chat panel on desktop Home. */

/** "Update my numbers", "change my income", "set up my profile"… start SI's setup questions. */
export const UPDATE_NUMBERS = /\b(update|change|edit|set ?up|redo)\b.*\b(numbers|income|salary|assumptions?|profile|spending|buffer)\b/i;

export function BriefLine({ item }: { item: BriefItem }) {
  const { c } = useTheme();
  const Icon = item.tone === 'attention' ? CircleAlert : item.tone === 'positive' ? CircleCheck : Info;
  const color = item.tone === 'attention' ? c.warning : item.tone === 'positive' ? c.positive : c.info;
  return (
    <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
      <Icon size={16} color={color} style={{ marginTop: 2 }} />
      <T v="small" style={{ flex: 1 }}>
        {item.text}
      </T>
    </Row>
  );
}

export function UserBubble({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: c.primary, borderRadius: radius.lg, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
      <T v="body" color={c.primaryText}>
        {text}
      </T>
    </View>
  );
}

export function Message({ m }: { m: SIMessageDTO }) {
  const { c } = useTheme();
  if (m.role === 'user') return <UserBubble text={m.text} />;
  return (
    <FadeIn>
      <View style={{ gap: space.sm }}>
        <T v="body">{m.text}</T>
        {m.bullets.map((b, i) => (
          <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.textSecondary, marginTop: 9 }} />
            <T v="body" style={{ flex: 1 }}>
              {b}
            </T>
          </Row>
        ))}
        <T v="caption" tone="tertiary">
          {m.insufficient ? 'Based on the data available so far.' : 'Calculated from your connected accounts.'}
        </T>
      </View>
    </FadeIn>
  );
}
