import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatMonthKey } from '@finance-buddy/core';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { IconButton } from './controls';
import { Row, T } from './primitives';

/** Dates here are plain YYYY-MM-DD keys (India time), so no time zone can shift a day. */
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const monthShort = (y: number, m: number) => formatMonthKey(`${y}-${pad(m)}`, 'short').split(' ')[0]!;
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEK_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The day `days` before (negative) or after a date key. */
export function shiftDay(key: string, days: number): string {
  const [y, m, d] = parts(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** "1 Sep – 15 Sep" (years shown only when they differ from `today`'s year). */
export function rangeLabel(from: string, to: string | undefined, today: string): string {
  const fmt = (k: string) => {
    const [y, m, d] = parts(k);
    return `${d} ${monthShort(y, m)}${y !== parts(today)[0] ? ` ${y}` : ''}`;
  };
  return !to || to === from ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

/**
 * Month calendar for picking a date range: tap a start day, then an end day. Future days can't be
 * picked. Tapping again after a full range starts a new one.
 */
export function DateRangeCalendar({ from, to, today, onChange }: { from?: string; to?: string; today: string; onChange: (r: { from?: string; to?: string }) => void }) {
  const { c } = useTheme();
  const [view, setView] = useState(() => {
    const [y, m] = parts(to ?? from ?? today);
    return { y, m };
  });
  const [ty, tm] = parts(today);
  const atLatest = view.y > ty || (view.y === ty && view.m >= tm);
  const step = (delta: number) => setView(({ y, m }) => ({ y: m + delta > 12 ? y + 1 : m + delta < 1 ? y - 1 : y, m: ((m + delta + 11) % 12) + 1 }));

  const tap = (k: string) => {
    haptics.select();
    if (!from || to) onChange({ from: k, to: undefined });
    else if (k < from) onChange({ from: k, to: from });
    else onChange({ from, to: k });
  };

  const lead = weekday(view.y, view.m, 1);
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => keyOf(view.y, view.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const end = to ?? from;

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <IconButton icon={ChevronLeft} label="Previous month" onPress={() => step(-1)} />
        <T v="bodySemibold" accessibilityRole="header" accessibilityLiveRegion="polite">
          {formatMonthKey(`${view.y}-${pad(view.m)}`, 'long')}
        </T>
        <IconButton icon={ChevronRight} label="Next month" onPress={() => step(1)} disabled={atLatest} />
      </Row>
      <Row>
        {WEEK.map((w, i) => (
          <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }} accessibilityLabel={WEEK_LONG[i]}>
            <T v="caption" tone="tertiary">
              {w}
            </T>
          </View>
        ))}
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((k, i) => {
          if (!k) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
          const future = k > today;
          const isStart = k === from;
          const isEnd = k === end;
          const inRange = !!from && !!end && k >= from && k <= end;
          const band = inRange && from !== end;
          const d = parts(k)[2];
          return (
            <Pressable
              key={k}
              disabled={future}
              onPress={() => tap(k)}
              accessibilityRole="button"
              accessibilityLabel={`${d} ${formatMonthKey(`${view.y}-${pad(view.m)}`, 'long')}${k === today ? ', today' : ''}`}
              accessibilityState={{ selected: isStart || isEnd, disabled: future }}
              style={{ width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' }}
            >
              {band ? (
                <View
                  style={{ position: 'absolute', top: 4, bottom: 4, left: isStart ? '50%' : 0, right: isEnd ? '50%' : 0, backgroundColor: c.surfaceMuted }}
                />
              ) : null}
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isStart || isEnd ? c.primary : 'transparent',
                  borderWidth: k === today && !(isStart || isEnd) ? 1 : 0,
                  borderColor: c.border,
                }}
              >
                <T v={isStart || isEnd ? 'smallMedium' : 'small'} color={isStart || isEnd ? c.primaryText : future ? c.textTertiary : c.text}>
                  {String(d)}
                </T>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
