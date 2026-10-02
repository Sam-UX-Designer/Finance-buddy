import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { detectIntent, type BriefItem, type Intent, type SIMessageDTO } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { FadeIn } from '@/ui/layout';
import { ThinkingOrb, type OrbState } from '@/ui/orbs/ThinkingOrb';
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

/** Typing speed: one word every WORD_MS; long answers type several words a tick so none takes over ~2.5 s. */
const WORD_MS = 26;
const MAX_TICKS = 95;

/** Splits text into words and the spaces between them, so a partly typed line keeps its spacing. */
const tokenize = (text: string) => text.split(/(\s+)/).filter(Boolean);
const isSpace = (t: string) => /^\s+$/.test(t);

/**
 * One chat message. A new answer (`typing`) types itself out word by word, fast, like ChatGPT,
 * with a small cursor dot; `onTyped` fires once it has finished. Answers from history (and anyone
 * using Reduce Motion) see the whole answer at once.
 */
export function Message({ m, typing = false, onTyped }: { m: SIMessageDTO; typing?: boolean; onTyped?: () => void }) {
  const { c, reduceMotion } = useTheme();
  const parts = useMemo(() => [m.text, ...m.bullets].map(tokenize), [m.text, m.bullets]);
  const words = parts.map((p) => p.filter((t) => !isSpace(t)).length);
  const total = words.reduce((a, b) => a + b, 0);
  const animate = typing && !reduceMotion && m.role === 'assistant';
  const [shown, setShown] = useState(animate ? 0 : total);
  const done = useRef(!animate);

  useEffect(() => {
    if (shown >= total) {
      if (!done.current) {
        done.current = true;
        onTyped?.();
      }
      return;
    }
    const step = Math.max(1, Math.ceil(total / MAX_TICKS));
    const t = setTimeout(() => setShown((n) => Math.min(total, n + step)), WORD_MS);
    return () => clearTimeout(t);
  }, [shown, total]);

  if (m.role === 'user') return <UserBubble text={m.text} />;

  const typingNow = shown < total;
  // Words of each part (the answer, then each bullet) that are showing so far.
  let left = shown;
  const visible = parts.map((tokens, i) => {
    const n = Math.max(0, Math.min(words[i]!, left));
    left -= n;
    let count = 0;
    const out: string[] = [];
    for (const t of tokens) {
      if (!isSpace(t)) {
        if (count === n) break;
        count += 1;
      }
      out.push(t);
    }
    return { text: out.join('').trimEnd(), started: n > 0, finished: n === words[i] };
  });
  const cursorAt = typingNow ? visible.findIndex((v) => !v.finished) : -1;
  const cursor = <T v="body" color={c.textSecondary}>{' ●'}</T>;

  const body = (
    <View style={{ gap: space.sm }} accessibilityLiveRegion={animate ? 'polite' : undefined}>
      <T v="body">
        {visible[0]!.text}
        {cursorAt === 0 ? cursor : null}
      </T>
      {m.bullets.map((_, i) =>
        visible[i + 1]!.started ? (
          <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.textSecondary, marginTop: 9 }} />
            <T v="body" style={{ flex: 1 }}>
              {visible[i + 1]!.text}
              {cursorAt === i + 1 ? cursor : null}
            </T>
          </Row>
        ) : null,
      )}
      {typingNow ? null : (
        <T v="caption" tone="tertiary">
          {m.insufficient ? 'Based on the data available so far.' : 'Calculated from your connected accounts.'}
        </T>
      )}
    </View>
  );
  return animate ? body : <FadeIn>{body}</FadeIn>;
}

/**
 * Which messages arrived while the chat was open (so they type themselves out). Everything already
 * in a chat when it is first shown, or opened from history, counts as seen and appears at once.
 */
export function useFreshMessages(conversationId: string | undefined, messages: SIMessageDTO[] | undefined) {
  const seen = useRef<{ conv?: string; ids: Set<string> }>({ ids: new Set() });
  const [, redraw] = useState(0);
  if (conversationId && messages && seen.current.conv !== conversationId) {
    seen.current = { conv: conversationId, ids: new Set(messages.map((x) => x.id)) };
  }
  const isFresh = (id: string) => !seen.current.ids.has(id);
  return {
    isFresh,
    /** An answer is still typing out (suggested questions wait until it finishes). */
    typing: (messages ?? []).some((x) => x.role === 'assistant' && isFresh(x.id)),
    markSeen: (id: string) => {
      seen.current.ids.add(id);
      redraw((n) => n + 1);
    },
  };
}

/** Which orb and words show while Super Intelligence works on a question, by what the question is about. */
const THINKING: Partial<Record<Intent, [OrbState, string]>> = {
  BRIEF: ['weaving', 'Pulling your week together…'],
  EXPLAIN_SPEND: ['searching', 'Searching your spending…'],
  CATEGORY_SPEND: ['searching', 'Searching your spending…'],
  COACH: ['searching', 'Looking for ways to save…'],
  SUBSCRIPTIONS: ['searching', 'Finding your subscriptions…'],
  UPCOMING: ['searching', 'Checking your upcoming payments…'],
  AFFORD: ['solving', 'Checking if you can afford it…'],
  INVEST_CAPACITY: ['solving', 'Working out what you can invest…'],
  FORECAST: ['solving', 'Doing the maths…'],
  GOALS: ['solving', 'Checking your goals…'],
  LOANS: ['solving', 'Checking your loans…'],
  SALARY_CYCLE: ['solving', 'Doing the maths…'],
  COMPARE_MONTHS: ['weaving', 'Comparing your months…'],
  NET_WORTH: ['weaving', 'Adding up your accounts…'],
  BALANCE: ['weaving', 'Adding up your accounts…'],
};

/** Uses the same reading of the question that Super Intelligence answers from; anything else just "thinks". */
export function thinkingFor(question: string): { state: OrbState; label: string } {
  const [state, label] = THINKING[detectIntent(question, new Date().toISOString()).intent] ?? ['working', 'Thinking…'];
  return { state, label };
}

/** Shown while Super Intelligence works on an answer: an orb that matches the question, and what it's doing. */
export function ThinkingRow({ question }: { question: string }) {
  const { state, label } = useMemo(() => thinkingFor(question), [question]);
  return (
    <Row gap={space.sm} style={{ minHeight: 40 }} accessible accessibilityLabel={`Super Intelligence: ${label}`} accessibilityLiveRegion="polite">
      <ThinkingOrb state={state} size={40} />
      <T v="small" tone="secondary">
        {label}
      </T>
    </Row>
  );
}
