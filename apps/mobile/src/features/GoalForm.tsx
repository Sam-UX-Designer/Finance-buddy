import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { formatDate, formatINR, formatINRCompact, istParts, istToISO, monthName, parseRupeeInput, projectGoal, type GoalBody } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Chip, IconButton, TextField } from '@/ui/controls';
import { Card, Row, T } from '@/ui/primitives';

const EMOJIS = ['🛟', '💻', '🏠', '✈️', '🎓', '🚗', '💍', '📈', '🎯'];
const PRESETS = ['Emergency Fund', 'MacBook', 'House', 'Travel', 'Education', 'Wealth target'];
/** Quick target amounts, in rupees. */
const AMOUNTS = [50_000, 1_00_000, 2_00_000, 5_00_000, 10_00_000, 25_00_000];

/** "5,00,000" style text for an amount field. */
const asInput = (paise: number) => formatINR(paise, { decimals: 0 }).replace('₹', '');

/** What's still needed before the goal can be saved (null when ready). */
export function missingFor(d: GoalDraft): string | null {
  if (!d.name.trim()) return 'Add a goal name';
  const target = parseRupeeInput(d.target);
  if (target == null) return d.target.trim() ? 'Enter the target as a number, like 5,00,000 or 5L' : 'Add a target amount';
  if (target < 100) return 'Target must be at least ₹1';
  if (parseRupeeInput(d.current || '0') == null) return 'Check the “Saved so far” amount';
  if (parseRupeeInput(d.monthly || '0') == null) return 'Check the monthly amount';
  return null;
}

export interface GoalDraft {
  name: string;
  emoji: string;
  target: string;
  current: string;
  monthly: string;
  year: number;
  month: number;
}

export function draftFrom(g?: Partial<GoalBody>): GoalDraft {
  const date = g?.targetDate ?? istToISO(istParts(new Date().toISOString()).year + 1, istParts(new Date().toISOString()).month, 1);
  const p = istParts(date);
  return {
    name: g?.name ?? '',
    emoji: g?.emoji ?? '🎯',
    target: g?.targetAmount ? String(g.targetAmount / 100) : '',
    current: g?.currentAmount != null ? String(g.currentAmount / 100) : '0',
    monthly: g?.monthlyContribution != null ? String(g.monthlyContribution / 100) : '',
    year: p.year,
    month: p.month,
  };
}

export function bodyFrom(d: GoalDraft): GoalBody | null {
  const target = parseRupeeInput(d.target);
  const current = parseRupeeInput(d.current || '0');
  const monthly = parseRupeeInput(d.monthly || '0');
  if (!d.name.trim() || target == null || target < 100 || current == null || monthly == null) return null;
  return { name: d.name.trim(), emoji: d.emoji, targetAmount: target, currentAmount: current, monthlyContribution: monthly, targetDate: istToISO(d.year, d.month, 1) };
}

/** Goal editor with a live projection computed by the same Finance Engine function the server uses. */
export function GoalForm({ draft, onChange, returnPct = 0 }: { draft: GoalDraft; onChange: (d: GoalDraft) => void; returnPct?: number }) {
  const { c } = useTheme();
  const set = (patch: Partial<GoalDraft>) => onChange({ ...draft, ...patch });
  const body = bodyFrom(draft);
  const nowISO = new Date().toISOString();
  const projection = useMemo(() => (body ? projectGoal({ id: 'draft', ...body }, nowISO, returnPct) : null), [JSON.stringify(body), returnPct]);
  const targetPaise = parseRupeeInput(draft.target);
  // Monthly amount that reaches the target by the chosen date (rounded up to the next ₹100).
  const needed = projection && projection.status !== 'COMPLETED' ? Math.ceil(projection.requiredMonthly / 10000) * 10000 : 0;
  const shiftMonth = (delta: number) => {
    const idx = draft.year * 12 + (draft.month - 1) + delta;
    const now = istParts(nowISO);
    if (idx <= now.year * 12 + (now.month - 1)) return;
    set({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  };
  return (
    <View style={{ gap: space.lg }}>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <Chip key={p} label={p} selected={draft.name === p} onPress={() => set({ name: p })} />
        ))}
      </Row>
      <TextField label="Goal name" value={draft.name} onChangeText={(name) => set({ name })} placeholder="e.g. Emergency Fund" maxLength={40} />
      <View style={{ gap: 6 }}>
        <T v="smallMedium" tone="secondary">
          Icon
        </T>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {EMOJIS.map((e) => (
            <Chip key={e} label={e} selected={draft.emoji === e} onPress={() => set({ emoji: e })} />
          ))}
        </Row>
      </View>
      <View style={{ gap: space.sm }}>
        <TextField
          label="Target amount"
          value={draft.target}
          onChangeText={(target) => set({ target })}
          placeholder="5,00,000 or 5L"
          error={draft.target.trim() && targetPaise == null ? 'Enter a number, like 5,00,000 or 5L' : null}
          prefix={<T v="bodyMedium" tone="secondary">₹</T>}
        />
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {AMOUNTS.map((r) => (
            <Chip key={r} label={formatINRCompact(r * 100)} selected={targetPaise === r * 100} onPress={() => set({ target: asInput(r * 100) })} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <T v="smallMedium" tone="secondary">
          Target date
        </T>
        <Row style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, height: 52, paddingHorizontal: space.sm, justifyContent: 'space-between' }}>
          <IconButton icon={Minus} label="Earlier month" onPress={() => shiftMonth(-1)} />
          <T v="bodySemibold">{`${monthName(draft.month, 'long')} ${draft.year}`}</T>
          <IconButton icon={Plus} label="Later month" onPress={() => shiftMonth(1)} />
        </Row>
        <Row gap={space.sm}>
          {[6, 12, 24, 36, 60].map((m) => (
            <Chip
              key={m}
              label={m < 12 ? `${m} mo` : `${m / 12} yr`}
              onPress={() => {
                const now = istParts(nowISO);
                const idx = now.year * 12 + (now.month - 1) + m;
                set({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
              }}
            />
          ))}
        </Row>
      </View>
      <TextField label="Saved so far" value={draft.current} onChangeText={(current) => set({ current })} keyboardType="decimal-pad" prefix={<T v="bodyMedium" tone="secondary">₹</T>} />
      <View style={{ gap: space.sm }}>
        <TextField label="Monthly contribution" value={draft.monthly} onChangeText={(monthly) => set({ monthly })} keyboardType="decimal-pad" placeholder="0" hint="Optional" prefix={<T v="bodyMedium" tone="secondary">₹</T>} />
        {needed > 0 && needed !== parseRupeeInput(draft.monthly || '0') ? (
          <Row>
            <Chip label={`${formatINR(needed, { decimals: 0 })}/mo reaches it on time`} onPress={() => set({ monthly: asInput(needed) })} />
          </Row>
        ) : null}
      </View>
      {projection && body ? (
        <Card muted>
          <T v="smallMedium" tone="secondary">
            Projection
          </T>
          <T v="bodySemibold" style={{ marginTop: 4 }} tone={projection.onTrack ? 'positive' : 'warning'}>
            {projection.status === 'COMPLETED'
              ? 'Already reached 🎉'
              : projection.status === 'NO_CONTRIBUTION'
                ? 'Add a monthly amount to see when you’ll get there'
                : `Reached by ${formatDate(projection.projectedCompletionDate!)}`}
          </T>
          {projection.status !== 'COMPLETED' ? (
            <T v="small" tone="secondary" style={{ marginTop: 4 }}>
              {projection.onTrack ? 'On track for your target date.' : `To reach it by ${monthName(draft.month)} ${draft.year}, save ${formatINR(projection.requiredMonthly, { decimals: 0 })}/month.`}
            </T>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}
