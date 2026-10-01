import { DAY_MS, istMonthKey, monthEndISO, monthStartISO } from './dates';
import type { PeriodSummary } from './summary';
import type { Paise } from './money';
import type { Budget, CategoryId } from './types';

export interface BudgetStatus {
  budgetId: string;
  categoryId: CategoryId;
  limit: Paise;
  spent: Paise;
  remaining: Paise;
  pct: number;
  status: 'OK' | 'NEAR' | 'OVER';
  /** Spend at month end if the current daily pace continues. */
  projectedSpend: Paise;
}

export function budgetStatuses(budgets: readonly Budget[], month: PeriodSummary, nowISO: string): BudgetStatus[] {
  const key = istMonthKey(nowISO);
  const start = Date.parse(monthStartISO(key));
  const end = Date.parse(monthEndISO(key));
  const elapsedDays = Math.max(1, (Date.parse(nowISO) - start) / DAY_MS);
  const totalDays = (end - start) / DAY_MS;
  return budgets.map((b) => {
    const spent = month.byCategory.find((c) => c.categoryId === b.categoryId)?.spent ?? 0;
    const pct = b.monthlyLimit > 0 ? Math.round((spent / b.monthlyLimit) * 1000) / 10 : 0;
    return {
      budgetId: b.id,
      categoryId: b.categoryId,
      limit: b.monthlyLimit,
      spent,
      remaining: b.monthlyLimit - spent,
      pct,
      status: pct >= 100 ? 'OVER' : pct >= 80 ? 'NEAR' : 'OK',
      projectedSpend: Math.round((spent / elapsedDays) * totalDays),
    };
  });
}
