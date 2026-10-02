import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Building, ChartLine, HandCoins, Info, Landmark, LayoutGrid, Shapes, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { formatDate, formatINR, type AssetKind, type HoldingDTO } from '@finance-buddy/core';
import { useWealth } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Donut, LineChart } from '@/charts/Charts';
import { ChipRow, IconButton, type ChipOption } from '@/ui/controls';
import { Icon3D, Section } from '@/ui/section';
import { GainText, IconTile, ListRow, Pill } from '@/ui/display';
import { Banner, ErrorState, FadeIn, LoadingState, Screen, Sheet, useContentWidth, useWide, WIDE_PAGE_X } from '@/ui/layout';
import { Card, Divider, Row, SectionTitle, T } from '@/ui/primitives';
import type { Palette } from '@/theme/tokens';

type Group = 'ALL' | 'INVESTMENTS' | 'BANK' | 'OTHER';
const GROUPS: ChipOption<Group>[] = [
  { key: 'ALL', label: 'All', icon: LayoutGrid },
  { key: 'INVESTMENTS', label: 'Investments', icon: ChartLine, color: '#3B82F6' },
  { key: 'BANK', label: 'Bank', icon: Landmark, color: '#6366F1' },
  { key: 'OTHER', label: 'Other', icon: Shapes, color: '#F59E0B' },
];

function kindStyle(c: Palette, kind: AssetKind): { icon: LucideIcon; color: string; bg: string } {
  switch (kind) {
    case 'MUTUAL_FUNDS':
      return { icon: ChartLine, color: c.loan, bg: c.loanSoft };
    case 'TERM_DEPOSIT':
      return { icon: Building, color: c.info, bg: c.infoSoft };
    case 'SAVINGS':
      return { icon: Landmark, color: c.info, bg: c.infoSoft };
    case 'EPF':
      return { icon: ShieldCheck, color: c.positive, bg: c.positiveSoft };
    case 'RECEIVABLES':
      return { icon: HandCoins, color: c.loan, bg: c.loanSoft };
  }
}

/** Small 3D icon for each kind of asset (desktop section headers). */
const HOLDING_ICON: Record<AssetKind, string> = { MUTUAL_FUNDS: '📊', TERM_DEPOSIT: '🏦', SAVINGS: '💰', EPF: '🛡', RECEIVABLES: '🤝' };

const HOLDING_KIND: Record<AssetKind, HoldingDTO['kind']> = {
  MUTUAL_FUNDS: 'MUTUAL_FUND',
  TERM_DEPOSIT: 'TERM_DEPOSIT',
  SAVINGS: 'SAVINGS',
  EPF: 'EPF',
  RECEIVABLES: 'RECEIVABLE',
};

/**
 * Wealth: net worth = assets − liabilities; principal vs market movement always labelled (Blueprint §16).
 * Desktop: net worth and the asset list on the left; allocation and the picked asset's holdings on the right.
 */
export default function WealthScreen() {
  const { c } = useTheme();
  const w = useWealth();
  const [group, setGroup] = useState<Group>('ALL');
  const [info, setInfo] = useState(false);
  const [detail, setDetail] = useState<AssetKind | null>(null);
  const d = w.data;
  const lines = useMemo(() => (d?.lines ?? []).filter((l) => group === 'ALL' || l.group === group), [d, group]);
  const colors: Record<string, string> = { MUTUAL_FUNDS: c.info, TERM_DEPOSIT: c.negative, SAVINGS: c.positive, EPF: c.loan, RECEIVABLES: c.warning };
  const wide = useWide();
  const pageWidth = useContentWidth();
  // Desktop always shows one asset's holdings: the one picked, else the first in the list.
  const shownKind = detail && lines.some((l) => l.kind === detail) ? detail : lines[0]?.kind;
  const holdings = (kind: AssetKind | null | undefined) =>
    (d?.holdings ?? [])
      .filter((h) => kind && h.kind === HOLDING_KIND[kind])
      .map((h, i) => (
        <View key={h.id}>
          {i > 0 ? <Divider /> : null}
          <ListRow
            title={h.name}
            subtitle={h.invested != null ? `${h.subtitle} · invested ${formatINR(h.invested, { decimals: 0 })}` : h.subtitle}
            right={<T v="bodySemibold">{formatINR(h.value, { decimals: 0 })}</T>}
            rightSub={
              h.gain != null ? (
                <T v="caption" tone={h.gain >= 0 ? 'positive' : 'negative'}>{`${formatINR(h.gain, { decimals: 0, signed: true })} ${kind === 'MUTUAL_FUNDS' ? 'market' : 'interest'}`}</T>
              ) : undefined
            }
          />
        </View>
      ));

  return (
    <Screen
      refreshing={w.isRefetching}
      onRefresh={() => w.refetch()}
      title="Wealth"
      titleRight={<IconButton icon={Info} label="How net worth is calculated" onPress={() => setInfo(true)} />}
      maxWidth={wide ? pageWidth : undefined}
      contentStyle={wide ? { paddingHorizontal: WIDE_PAGE_X } : undefined}
    >
      {w.error && !d ? (
        <ErrorState error={w.error} onRetry={() => w.refetch()} />
      ) : !d ? (
        <LoadingState label="Adding up your assets…" />
      ) : d.lines.length === 0 ? (
        <Banner tone="info" title="Nothing to add up yet" body="Connect bank or investment accounts to see your net worth." />
      ) : (
        <FadeIn>
          {wide ? (
            <>
              {d.partial ? (
                <View style={{ marginBottom: space.md }}>
                  <Banner tone="warning" title="Partial data" body="Some accounts didn't sync, so your net worth may be understated." />
                </View>
              ) : null}
              {/* Desktop: the same section cards as Home. Net worth and assets on the left; how it's split and what's inside on the right. */}
              <Row gap={space.xl} style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1.25, minWidth: 0, gap: space.xl }}>
                  <Section icon={<Icon3D emoji="📈" size={40} />} title="Net worth" subtitle="What you own minus what you owe">
                    <View>
                      <Row style={{ alignItems: 'flex-start', gap: space.md }}>
                        <View style={{ flex: 1 }}>
                          <T v="body" tone="secondary">
                            Total Net Worth
                          </T>
                          <T v="display" style={{ marginTop: 6 }} adjustsFontSizeToFit numberOfLines={1}>
                            {formatINR(d.netWorth, { decimals: 0 })}
                          </T>
                          {d.change.changePct != null ? (
                            <View style={{ marginTop: space.sm }}>
                              <Pill tone={d.change.change >= 0 ? 'positive' : 'negative'}>{`${d.change.change >= 0 ? '↑' : '↓'} ${Math.abs(d.change.changePct).toFixed(1)}% this year`}</Pill>
                            </View>
                          ) : null}
                        </View>
                        <View style={{ width: wide ? 240 : 120, marginTop: space.md }}>
                          <LineChart values={d.trend.map((p) => p.value / 100)} height={wide ? 96 : 70} accessibilityLabel={`Net worth trend over ${d.trend.length} months`} />
                        </View>
                      </Row>
                      <T v="caption" tone="tertiary" style={{ marginTop: space.md }}>
                        {`Since ${formatDate(d.change.sinceDate)}: ${formatINR(d.change.fromMarketAndInterest, { decimals: 0, signed: true })} market & interest · ${formatINR(d.change.fromSavings, { decimals: 0, signed: true })} from your savings`}
                      </T>
                    </View>
                  </Section>
                  <Section icon={<Icon3D emoji="🏦" size={40} />} title="Assets" subtitle="Where your money is">
                    <ChipRow options={GROUPS} value={group} onChange={setGroup} />
                    <View>
                      {lines.map((l, i) => {
                        const s = kindStyle(c, l.kind);
                        return (
                          <View key={l.kind}>
                            {i > 0 ? <Divider inset={52} /> : null}
                            <ListRow
                              left={<IconTile icon={s.icon} color={s.color} bg={s.bg} />}
                              title={l.label}
                              subtitle={
                                l.kind === 'RECEIVABLES'
                                  ? 'Owed to you'
                                  : l.invested != null
                                    ? `Invested ${formatINR(l.invested, { decimals: 0 })}`
                                    : `${l.accountCount} account${l.accountCount === 1 ? '' : 's'}`
                              }
                              right={<T v="bodySemibold">{formatINR(l.value, { decimals: 0 })}</T>}
                              rightSub={<GainText pct={l.gainPct} />}
                              onPress={() => setDetail(l.kind)}
                              selected={wide ? l.kind === shownKind : undefined}
                              accessibilityLabel={`${l.label}, ${formatINR(l.value, { decimals: 0 })}${l.gainPct != null ? `, return ${l.gainPct}%` : ''}`}
                            />
                          </View>
                        );
                      })}
                      {group === 'ALL' || group === 'OTHER' ? (
                        <T v="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                          No loans or credit cards connected, so liabilities are ₹0.
                        </T>
                      ) : null}
                    </View>
                  </Section>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: space.xl }}>
                  <Section icon={<Icon3D emoji="📊" size={40} />} title="Asset Allocation" subtitle="How your money is split">
                    <Row gap={space.xl}>
                      <Donut
                        segments={d.allocation.map((a) => ({ value: a.value, color: colors[a.kind] ?? c.textTertiary }))}
                        accessibilityLabel={d.allocation.map((a) => `${a.label} ${a.pct}%`).join(', ')}
                      />
                      <View style={{ flex: 1, gap: space.sm }}>
                        {d.allocation.map((a) => (
                          <Row key={a.kind} gap={space.sm}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[a.kind] ?? c.textTertiary }} />
                            <T v="small" tone="secondary" style={{ flex: 1 }}>
                              {a.label}
                            </T>
                            <T v="smallMedium">{`${Math.round(a.pct)}%`}</T>
                          </Row>
                        ))}
                      </View>
                    </Row>
                  </Section>
                  {shownKind ? (
                    <Section icon={<Icon3D emoji={HOLDING_ICON[shownKind] ?? '💰'} size={40} />} title={lines.find((l) => l.kind === shownKind)?.label ?? 'Holdings'} subtitle="What's inside">
                      <View>{holdings(shownKind)}</View>
                    </Section>
                  ) : null}
                </View>
              </Row>
            </>
          ) : (
            <>
              {d.partial ? (
                <View style={{ marginBottom: space.md }}>
                  <Banner tone="warning" title="Partial data" body="Some accounts didn't sync, so your net worth may be understated." />
                </View>
              ) : null}
              <Card style={{ borderRadius: radius.xl, padding: space.xl }}>
                <Row style={{ alignItems: 'flex-start', gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <T v="body" tone="secondary">
                      Total Net Worth
                    </T>
                    <T v="display" style={{ marginTop: 6 }} adjustsFontSizeToFit numberOfLines={1}>
                      {formatINR(d.netWorth, { decimals: 0 })}
                    </T>
                    {d.change.changePct != null ? (
                      <View style={{ marginTop: space.sm }}>
                        <Pill tone={d.change.change >= 0 ? 'positive' : 'negative'}>{`${d.change.change >= 0 ? '↑' : '↓'} ${Math.abs(d.change.changePct).toFixed(1)}% this year`}</Pill>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ width: wide ? 240 : 120, marginTop: space.md }}>
                    <LineChart values={d.trend.map((p) => p.value / 100)} height={wide ? 96 : 70} accessibilityLabel={`Net worth trend over ${d.trend.length} months`} />
                  </View>
                </Row>
                <T v="caption" tone="tertiary" style={{ marginTop: space.md }}>
                  {`Since ${formatDate(d.change.sinceDate)}: ${formatINR(d.change.fromMarketAndInterest, { decimals: 0, signed: true })} market & interest · ${formatINR(d.change.fromSavings, { decimals: 0, signed: true })} from your savings`}
                </T>
              </Card>

              <View style={{ marginTop: space.xl }}>
                <ChipRow options={GROUPS} value={group} onChange={setGroup} />
              </View>
              <View style={{ marginTop: space.sm }}>
                {lines.map((l, i) => {
                  const s = kindStyle(c, l.kind);
                  return (
                    <View key={l.kind}>
                      {i > 0 ? <Divider inset={52} /> : null}
                      <ListRow
                        left={<IconTile icon={s.icon} color={s.color} bg={s.bg} />}
                        title={l.label}
                        subtitle={
                          l.kind === 'RECEIVABLES'
                            ? 'Owed to you'
                            : l.invested != null
                              ? `Invested ${formatINR(l.invested, { decimals: 0 })}`
                              : `${l.accountCount} account${l.accountCount === 1 ? '' : 's'}`
                        }
                        right={<T v="bodySemibold">{formatINR(l.value, { decimals: 0 })}</T>}
                        rightSub={<GainText pct={l.gainPct} />}
                        onPress={() => setDetail(l.kind)}
                        selected={wide ? l.kind === shownKind : undefined}
                        accessibilityLabel={`${l.label}, ${formatINR(l.value, { decimals: 0 })}${l.gainPct != null ? `, return ${l.gainPct}%` : ''}`}
                      />
                    </View>
                  );
                })}
                {group === 'ALL' || group === 'OTHER' ? (
                  <T v="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                    No loans or credit cards connected, so liabilities are ₹0.
                  </T>
                ) : null}
              </View>

              <View style={{ marginTop: space.xxl }}>
                <SectionTitle>Asset Allocation</SectionTitle>
                <Row gap={space.xl}>
                  <Donut
                    segments={d.allocation.map((a) => ({ value: a.value, color: colors[a.kind] ?? c.textTertiary }))}
                    accessibilityLabel={d.allocation.map((a) => `${a.label} ${a.pct}%`).join(', ')}
                  />
                  <View style={{ flex: 1, gap: space.sm }}>
                    {d.allocation.map((a) => (
                      <Row key={a.kind} gap={space.sm}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[a.kind] ?? c.textTertiary }} />
                        <T v="small" tone="secondary" style={{ flex: 1 }}>
                          {a.label}
                        </T>
                        <T v="smallMedium">{`${Math.round(a.pct)}%`}</T>
                      </Row>
                    ))}
                  </View>
                </Row>
              </View>
            </>
          )}
        </FadeIn>
      )}

      <Sheet visible={info} onClose={() => setInfo(false)} title="How we calculate net worth">
        <View style={{ gap: space.md }}>
          <T v="body">Net worth = what you own − what you owe.</T>
          <T v="small" tone="secondary">
            What you own: savings account balances reported by your banks, fixed deposit values with interest earned so far, mutual fund units × latest NAV, your EPF balance, and money others owe you.
          </T>
          <T v="small" tone="secondary">
            What you owe: no loan or credit card accounts are connected yet, so this is ₹0.
          </T>
          {d ? (
            <Card muted>
              <T v="smallMedium">{`Change since ${formatDate(d.change.sinceDate)}`}</T>
              <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
                <T v="small" tone="secondary">
                  Market movement & interest
                </T>
                <T v="smallMedium">{formatINR(d.change.fromMarketAndInterest, { decimals: 0, signed: true })}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <T v="small" tone="secondary">
                  Money you saved or spent
                </T>
                <T v="smallMedium">{formatINR(d.change.fromSavings, { decimals: 0, signed: true })}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <T v="small" tone="secondary">
                  Total change
                </T>
                <T v="smallMedium">{formatINR(d.change.change, { decimals: 0, signed: true })}</T>
              </Row>
            </Card>
          ) : null}
        </View>
      </Sheet>

      <Sheet visible={!!detail && !wide} onClose={() => setDetail(null)} title={d?.lines.find((l) => l.kind === detail)?.label}>
        {holdings(detail)}
      </Sheet>
    </Screen>
  );
}
