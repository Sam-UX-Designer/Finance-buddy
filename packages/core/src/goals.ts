import { addMonthsISO, istParts } from './dates';
import type { Paise } from './money';
import type { Goal } from './types';

export interface GoalProjection {
  goalId: string;
  progressPct: number;
  remaining: Paise;
  /** Months until the goal is reached at the current contribution. Null if it never will be. */
  monthsToComplete: number | null;
  projectedCompletionDate: string | null;
  monthsUntilTarget: number;
  /** Monthly amount needed to reach the target by the target date. */
  requiredMonthly: Paise;
  onTrack: boolean;
  status: 'COMPLETED' | 'ON_TRACK' | 'BEHIND' | 'NO_CONTRIBUTION';
  returnPct: number;
}

const MAX_MONTHS = 600;

export function monthsBetween(fromISO: string, toISO: string): number {
  const a = istParts(fromISO);
  const b = istParts(toISO);
  let months = (b.year - a.year) * 12 + (b.month - a.month);
  if (b.day < a.day) months -= 1;
  return Math.max(0, months);
}

/** Future value after `n` months of contributions `c` at monthly rate `i`. */
export function futureValue(current: Paise, c: Paise, i: number, n: number): Paise {
  if (i === 0) return current + c * n;
  const g = Math.pow(1 + i, n);
  return Math.round(current * g + c * ((g - 1) / i));
}

export function projectGoal(
  goal: Pick<Goal, 'id' | 'targetAmount' | 'targetDate' | 'currentAmount' | 'monthlyContribution'>,
  nowISO: string,
  returnPct = 0,
): GoalProjection {
  const i = returnPct / 100 / 12;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const progressPct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 1000) / 10) : 0;
  const monthsUntilTarget = monthsBetween(nowISO, goal.targetDate);

  let monthsToComplete: number | null = null;
  if (remaining === 0) monthsToComplete = 0;
  else if (goal.monthlyContribution > 0 || (i > 0 && goal.currentAmount > 0)) {
    let v = goal.currentAmount;
    for (let m = 1; m <= MAX_MONTHS; m++) {
      v = Math.round(v * (1 + i)) + goal.monthlyContribution;
      if (v >= goal.targetAmount) {
        monthsToComplete = m;
        break;
      }
    }
  }

  let requiredMonthly: Paise;
  if (remaining === 0) requiredMonthly = 0;
  else if (monthsUntilTarget <= 0) requiredMonthly = remaining;
  else if (i === 0) requiredMonthly = Math.ceil(remaining / monthsUntilTarget);
  else {
    const g = Math.pow(1 + i, monthsUntilTarget);
    requiredMonthly = Math.max(0, Math.ceil(((goal.targetAmount - goal.currentAmount * g) * i) / (g - 1)));
  }
  // Round up to the next ₹100 so the suggestion is practical.
  requiredMonthly = Math.ceil(requiredMonthly / 10000) * 10000;

  const projectedCompletionDate = monthsToComplete == null ? null : addMonthsISO(nowISO, monthsToComplete);
  const onTrack = monthsToComplete != null && monthsToComplete <= monthsUntilTarget;
  const status: GoalProjection['status'] =
    remaining === 0 ? 'COMPLETED' : monthsToComplete == null ? 'NO_CONTRIBUTION' : onTrack ? 'ON_TRACK' : 'BEHIND';
  return {
    goalId: goal.id,
    progressPct,
    remaining,
    monthsToComplete,
    projectedCompletionDate,
    monthsUntilTarget,
    requiredMonthly,
    onTrack: remaining === 0 || onTrack,
    status,
    returnPct,
  };
}
