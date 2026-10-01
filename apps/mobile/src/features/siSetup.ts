import { useRef, useState } from 'react';
import { formatINR, parseRupeeInput, type PlanDTO } from '@finance-buddy/core';

/**
 * SI's money-profile setup: a short conversation that confirms the numbers every plan and forecast
 * uses (income, everyday spending, emergency buffer, fund return). Answers are pre-filled from the
 * person's bank data where possible; they can tap a quick reply or type their own amount.
 */
export interface SetupLine {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  bullets?: string[];
}

type Step = 'income' | 'incomeAmount' | 'other' | 'otherAmount' | 'spend' | 'spendAmount' | 'buffer' | 'bufferAmount' | 'returns' | 'saving' | 'done';
interface Answers {
  income?: number;
  other?: number;
  spend?: number;
  buffer?: number;
  returnPct?: number;
}

const inr = (paise: number) => formatINR(paise, { decimals: 0 });
const YES = /^(yes|yeah|yep|right|correct|ok|okay|sure|y)\b/i;
const NO = /^(no|nope|none|nothing|n)\b/i;
const SKIP = /^skip\b/i;
const DIFFERENT = /different|change|other amount|not right|wrong/i;
const AMOUNT_HINT = 'Type an amount, like 65,000 or 1.2L';

/** A rupee amount typed or tapped ("₹25,000", "1.2L", "65000"), in paise, or null. */
function amountFrom(text: string): number | null {
  const v = parseRupeeInput(text.replace(/\(.*\)/, '').trim());
  return v != null && v > 0 && v < 1e12 ? v : null;
}

export function useSISetup({ plan, save }: { plan?: PlanDTO; save: (body: Record<string, number>) => Promise<unknown> }) {
  const [step, setStep] = useState<Step | null>(null);
  const [lines, setLines] = useState<SetupLine[]>([]);
  const answers = useRef<Answers>({});
  const seq = useRef(0);

  const value = (key: string) => plan?.assumptions.find((a) => a.key === key)?.value ?? 0;
  const income = value('monthlyIncome');
  const spend = value('monthlyVariableSpend');
  const buffer = value('safetyBuffer');

  const line = (role: SetupLine['role'], text: string, bullets?: string[]): SetupLine => ({ id: `s${seq.current++}`, role, text, bullets });

  /** The question for a step, and the quick replies shown under it. */
  const question = (s: Step): { text: string; replies: string[] } => {
    switch (s) {
      case 'income':
        return plan?.salaryFrom
          ? { text: `Your salary from ${plan.salaryFrom} comes to about ${inr(income)} a month. Is that your take-home pay?`, replies: ['Yes, that’s right', 'It’s different', 'Skip'] }
          : { text: `About ${inr(income)} comes into your accounts each month. Is that your usual monthly income?`, replies: ['Yes, that’s right', 'It’s different', 'Skip'] };
      case 'incomeAmount':
        return { text: 'How much do you take home each month? Type it, like 65,000 or 1.2L.', replies: [] };
      case 'other':
        return { text: 'Any other regular income each month, like rent or freelance work?', replies: ['No', 'Yes'] };
      case 'otherAmount':
        return { text: 'About how much does that add each month?', replies: [] };
      case 'spend':
        return { text: `Leaving out rent, bills and SIPs, you spend about ${inr(spend)} a month on everyday things. Does that sound right?`, replies: ['Yes, that’s right', 'It’s different', 'Skip'] };
      case 'spendAmount':
        return { text: 'Roughly how much do you spend a month on everyday things like food, shopping and travel? Leave out rent, bills and SIPs.', replies: [] };
      case 'buffer':
        return {
          text: 'How much should I always keep aside for emergencies? I won’t count it as money you can spend.',
          replies: [`${inr(buffer)} (suggested)`, '₹25,000', '₹50,000', 'Other amount'],
        };
      case 'bufferAmount':
        return { text: 'How much? Type it, like 30,000.', replies: [] };
      case 'returns':
        return { text: 'Last one. What yearly return should I assume for your mutual funds? It’s for planning, not a promise.', replies: ['8% · careful', '10% · balanced', '12% · hopeful'] };
      case 'saving':
        return { text: '', replies: [] };
      case 'done':
        return { text: '', replies: ['See my plan', 'Done'] };
    }
  };

  const goTo = (s: Step, extra: SetupLine[] = []) => {
    setStep(s);
    setLines((l) => [...l, ...extra, line('assistant', question(s).text)]);
  };

  const start = () => {
    answers.current = {};
    seq.current = 0;
    const intro = line('assistant', 'Let’s make your plan fit you. Five quick questions, and I’ve filled in what I could from your bank.');
    const first: Step = income > 0 ? 'income' : 'incomeAmount';
    setStep(first);
    setLines([intro, line('assistant', question(first).text)]);
  };

  const finish = async () => {
    const a = answers.current;
    const body: Record<string, number> = {};
    if (a.income != null || a.other) body.monthlyIncome = (a.income ?? income) + (a.other ?? 0);
    if (a.spend != null) body.monthlyVariableSpend = a.spend;
    if (a.buffer != null) body.safetyBuffer = a.buffer;
    if (a.returnPct != null) body.mfReturnPct = a.returnPct;
    setStep('saving');
    setLines((l) => [...l, line('assistant', 'Saving your numbers…')]);
    try {
      if (Object.keys(body).length) await save(body);
      const summary = [
        `Monthly income: ${inr(body.monthlyIncome ?? income)}`,
        `Everyday spending: ${inr(body.monthlyVariableSpend ?? spend)} a month`,
        `Emergency buffer: ${inr(body.safetyBuffer ?? buffer)}`,
        `Mutual fund return: ${body.mfReturnPct ?? value('mfReturnPct')}% a year`,
      ];
      setStep('done');
      setLines((l) => [
        ...l.slice(0, -1),
        line('assistant', 'Done. Your plan and forecasts now use your numbers:', summary),
        line('assistant', 'You can change them any time. Just tell me “update my numbers”.'),
      ]);
    } catch {
      setStep('returns');
      setLines((l) => [...l.slice(0, -1), line('assistant', 'I couldn’t save that just now. Please pick an answer again to retry.')]);
    }
  };

  /** Handles a reply while setup is running. Returns false when setup isn't active. */
  const answer = (raw: string): boolean => {
    if (!step) return false;
    const text = raw.trim();
    if (!text || step === 'saving') return true;
    const said = line('user', text);
    const retry = (hint: string) => setLines((l) => [...l, said, line('assistant', hint)]);
    const a = answers.current;
    const typed = amountFrom(text);

    switch (step) {
      case 'income':
      case 'spend': {
        const key = step === 'income' ? 'income' : 'spend';
        const current = step === 'income' ? income : spend;
        const next: Step = step === 'income' ? 'other' : 'buffer';
        if (typed != null) a[key] = typed;
        else if (YES.test(text)) a[key] = current;
        else if (DIFFERENT.test(text)) {
          goTo(step === 'income' ? 'incomeAmount' : 'spendAmount', [said]);
          return true;
        } else if (!SKIP.test(text)) {
          retry('Tap an answer below, or type the amount.');
          return true;
        }
        goTo(next, [said]);
        return true;
      }
      case 'incomeAmount':
      case 'spendAmount':
      case 'otherAmount':
      case 'bufferAmount': {
        if (typed == null) {
          retry(`I didn’t catch that amount. ${AMOUNT_HINT}.`);
          return true;
        }
        const map = { incomeAmount: ['income', 'other'], spendAmount: ['spend', 'buffer'], otherAmount: ['other', 'spend'], bufferAmount: ['buffer', 'returns'] } as const;
        const [key, next] = map[step];
        a[key] = typed;
        goTo(spend > 0 || next !== 'spend' ? next : 'spendAmount', [said]);
        return true;
      }
      case 'other': {
        if (typed != null) a.other = typed;
        else if (YES.test(text)) {
          goTo('otherAmount', [said]);
          return true;
        } else if (NO.test(text) || SKIP.test(text)) a.other = 0;
        else {
          retry('Tap Yes or No, or type the amount.');
          return true;
        }
        goTo(spend > 0 ? 'spend' : 'spendAmount', [said]);
        return true;
      }
      case 'buffer': {
        if (/suggested/i.test(text)) a.buffer = buffer;
        else if (DIFFERENT.test(text)) {
          goTo('bufferAmount', [said]);
          return true;
        } else if (typed != null) a.buffer = typed;
        else if (!SKIP.test(text)) {
          retry(`Pick an amount below, or type one. ${AMOUNT_HINT}.`);
          return true;
        }
        goTo('returns', [said]);
        return true;
      }
      case 'returns': {
        const pct = Number(text.match(/\d+(\.\d+)?/)?.[0]);
        if (!Number.isFinite(pct) || pct < 0 || pct > 30) {
          retry('Pick one of the options, or type a percentage between 0 and 30.');
          return true;
        }
        a.returnPct = pct;
        setLines((l) => [...l, said]);
        void finish();
        return true;
      }
      case 'done':
        setLines((l) => [...l, said]);
        return true;
    }
    return true;
  };

  const current = step ? question(step) : null;
  return {
    active: step !== null,
    step,
    lines,
    replies: current?.replies ?? [],
    /** Placeholder for the input box while a typed amount is expected. */
    placeholder: step && /Amount$/.test(step) ? AMOUNT_HINT : step === 'returns' ? 'Or type a percentage, like 9' : null,
    start,
    answer,
    exit: () => {
      setStep(null);
      setLines([]);
    },
  };
}
