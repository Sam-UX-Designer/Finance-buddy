import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  ArrowLeftRight,
  CalendarClock,
  Car,
  ChartLine,
  ChartPie,
  HandCoins,
  Landmark,
  Lightbulb,
  PiggyBank,
  Receipt,
  Repeat,
  Scissors,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Press, T } from '@/ui/primitives';

/** Each kind of question gets its own icon and colour, so the row is easy to scan. First match wins. */
const ICONS: [RegExp, LucideIcon, string][] = [
  [/subscription|recurring/i, Repeat, '#A855F7'],
  [/upcoming|due|bills?\b/i, CalendarClock, '#F59E0B'],
  [/invest|\bsip\b|mutual fund/i, ChartLine, '#22C55E'],
  [/goal|on track/i, Target, '#F97316'],
  [/reduce|cut back|cut down/i, Scissors, '#EC4899'],
  [/compare|last month|vs\.?\b/i, ArrowLeftRight, '#3B82F6'],
  [/afford/i, HandCoins, '#10B981'],
  [/net worth/i, ChartPie, '#14B8A6'],
  [/will i have|end of the month|forecast|next year/i, Wallet, '#0EA5E9'],
  [/know|this week|insight/i, Lightbulb, '#EAB308'],
  [/food|restaurant|swiggy|zomato/i, UtensilsCrossed, '#F59E0B'],
  [/grocer/i, ShoppingCart, '#84CC16'],
  [/transport|travel|fuel|uber|cab/i, Car, '#06B6D4'],
  [/balance|account|bank/i, Landmark, '#6366F1'],
  [/sav(e|ing)/i, PiggyBank, '#EC4899'],
  [/spen[dt]|expense/i, TrendingUp, '#F43F5E'],
  [/receipt|payment|paid/i, Receipt, '#F43F5E'],
];
const iconFor = (text: string): [LucideIcon, string] => {
  const hit = ICONS.find(([re]) => re.test(text));
  return hit ? [hit[1], hit[2]] : [Sparkles, '#8B5CF6'];
};

/**
 * Suggested questions as pills in one line that scrolls sideways, each with a coloured icon.
 * Desktop: the mouse wheel scrolls the row sideways and the edges fade where more pills are hidden.
 * `fade` is the colour behind the row (the fade blends into it); `padX` is the inset at both ends.
 */
export function PromptPills({
  items,
  onPick,
  icons = true,
  fade,
  padX = 0,
  style,
  accessibilityLabel = 'Suggested questions',
}: {
  items: string[];
  onPick: (q: string) => void;
  /** Off for plain answer choices (e.g. amounts while setting up), which don't need icons. */
  icons?: boolean;
  fade: string;
  padX?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const ref = useRef<ScrollView>(null);
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const [x, setX] = useState(0);
  const web = Platform.OS === 'web';

  // Web: a mouse wheel moves the row sideways (trackpads already can).
  useEffect(() => {
    if (!web) return;
    const node = (ref.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || node.scrollWidth <= node.clientWidth) return;
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [web]);

  const overflow = content > box + 1;
  const edge = (side: 'left' | 'right') =>
    web ? (
      <View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, bottom: 0, width: 36, [side]: 0 },
          { backgroundImage: `linear-gradient(to ${side === 'left' ? 'left' : 'right'}, transparent, ${fade})` } as unknown as ViewStyle,
        ]}
      />
    ) : null;

  return (
    <View style={style}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={accessibilityLabel}
        onLayout={(e) => setBox(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: padX, gap: space.sm }}
      >
        {items.map((q) => {
          const [Icon, color] = iconFor(q);
          return (
            <Press
              key={q}
              onPress={() => onPick(q)}
              accessibilityRole="button"
              style={{ height: 36, borderRadius: 18, paddingLeft: icons ? 12 : 16, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}
            >
              {icons ? <Icon size={16} color={color} strokeWidth={2.2} /> : null}
              <T v="small" numberOfLines={1}>
                {q}
              </T>
            </Press>
          );
        })}
      </ScrollView>
      {overflow && x > 4 ? edge('left') : null}
      {overflow && x + box < content - 4 ? edge('right') : null}
    </View>
  );
}
