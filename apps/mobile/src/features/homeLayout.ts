import { useEffect, useMemo, useRef, useState } from 'react';
import type { HomeDTO } from '@finance-buddy/core';
import { storage } from '@/lib/storage';

/**
 * Home's cards below the balance: their order, which are hidden, and whether cards that changed
 * since the last visit move to the top. Saved on this device.
 */
export type WidgetId = 'today' | 'month' | 'si' | 'investments' | 'upcoming' | 'networth';

export const WIDGET_TITLES: Record<WidgetId, string> = {
  today: 'Spending',
  month: 'This Month',
  si: 'SI noticed',
  investments: 'Investments',
  upcoming: 'Upcoming Payments',
  networth: 'Net worth',
};

export interface HomeLayout {
  order: WidgetId[];
  hidden: WidgetId[];
  /** Cards that changed since the last visit go first. */
  smart: boolean;
}

export const DEFAULT_LAYOUT: HomeLayout = { order: ['today', 'month', 'si', 'investments', 'upcoming', 'networth'], hidden: [], smart: true };

const LAYOUT_KEY = 'fb.home.layout';
const SEEN_KEY = 'fb.home.seen';
const ALL = DEFAULT_LAYOUT.order;
const isWidget = (v: unknown): v is WidgetId => typeof v === 'string' && (ALL as string[]).includes(v);

export function useHomeLayout() {
  const [layout, setLayout] = useState<HomeLayout>(DEFAULT_LAYOUT);
  useEffect(() => {
    storage
      .get(LAYOUT_KEY)
      .then((raw) => {
        if (!raw) return;
        const v = JSON.parse(raw) as Partial<HomeLayout>;
        // Keep known cards in the saved order and append any card added in a newer version.
        const order = (v.order ?? []).filter(isWidget);
        setLayout({ order: [...order, ...ALL.filter((w) => !order.includes(w))], hidden: (v.hidden ?? []).filter(isWidget), smart: v.smart ?? true });
      })
      .catch(() => undefined);
  }, []);
  const save = (next: HomeLayout) => {
    setLayout(next);
    void storage.set(LAYOUT_KEY, JSON.stringify(next)).catch(() => undefined);
  };
  return {
    layout,
    /** Moves a card one step up (-1) or down (+1) among the visible cards. */
    move(id: WidgetId, dir: -1 | 1, visible: WidgetId[]) {
      const i = visible.indexOf(id);
      const other = visible[i + dir];
      if (i < 0 || !other) return;
      const order = [...layout.order];
      const a = order.indexOf(id);
      const b = order.indexOf(other);
      [order[a], order[b]] = [order[b]!, order[a]!];
      save({ ...layout, order });
    },
    setHidden(id: WidgetId, hide: boolean) {
      save({ ...layout, hidden: hide ? [...layout.hidden, id] : layout.hidden.filter((h) => h !== id) });
    },
    setSmart(smart: boolean) {
      save({ ...layout, smart });
    },
    reset() {
      save(DEFAULT_LAYOUT);
    },
  };
}

/** A short fingerprint of what each card shows; a different fingerprint means the card changed. */
function fingerprints(d: HomeDTO): Record<WidgetId, string> {
  const rupees100 = (p: number) => Math.round(p / 10000);
  return {
    today: `${d.today.spent}|${d.today.recent.map((t) => t.id).join(',')}`,
    month: `${d.month.key}|${rupees100(d.month.income)}|${rupees100(d.month.spent)}|${rupees100(d.month.invested)}`,
    si: d.insight?.id ?? 'none',
    // Whole-percent moves in returns, so daily price noise doesn't count as news.
    investments: d.investments ? `${Math.round(d.investments.gainPct ?? 0)}|${d.investments.lines.length}` : 'none',
    upcoming: `${d.upcoming.count}|${d.upcoming.items.map((i) => `${i.seriesKey}@${i.dueDateKey}`).join(',')}`,
    // Net worth in ₹1 lakh steps.
    networth: d.wealth ? String(Math.round(d.wealth.netWorth / 10000000)) : 'none',
  };
}

/**
 * Cards whose content changed since the person last opened Home. The comparison point is what they
 * saw on their previous visit, so changes stay marked for this whole visit.
 */
export function useUpdatedWidgets(d: HomeDTO | undefined): Set<WidgetId> {
  const [baseline, setBaseline] = useState<Record<string, string> | null | undefined>(undefined);
  const prints = useMemo(() => (d ? fingerprints(d) : null), [d]);
  const loaded = useRef(false);
  useEffect(() => {
    if (!prints || loaded.current) return;
    loaded.current = true;
    storage
      .get(SEEN_KEY)
      .then((raw) => setBaseline(raw ? (JSON.parse(raw) as Record<string, string>) : prints))
      .catch(() => setBaseline(prints));
  }, [prints]);
  useEffect(() => {
    if (prints && baseline !== undefined) void storage.set(SEEN_KEY, JSON.stringify(prints)).catch(() => undefined);
  }, [prints, baseline]);
  return useMemo(() => {
    if (!prints || !baseline) return new Set<WidgetId>();
    return new Set(ALL.filter((w) => baseline[w] !== undefined && baseline[w] !== prints[w]));
  }, [prints, baseline]);
}
