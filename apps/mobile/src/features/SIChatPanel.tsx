import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { ArrowUp, CircleAlert, Maximize2 } from 'lucide-react-native';
import { greetingFor } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useAsk, useSI } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { webInputReset } from '@/ui/controls';
import { ErrorState, Skeleton } from '@/ui/layout';
import { Press, Row, T } from '@/ui/primitives';
import { SIOrb } from '@/ui/SIOrb';
import { PromptPills } from './PromptPills';
import { BriefLine, Message, UPDATE_NUMBERS, UserBubble } from './SIMessages';

/**
 * Desktop Home, top right: chat with Super Intelligence without leaving Home. It continues the
 * same conversation as the Super Intelligence tab, so "Open full chat" picks up where you are.
 * `question` lets Home ask something for you (a card's "See why"); `n` makes repeats count.
 */
export function SIChatPanel({ question }: { question?: { q: string; n: number } }) {
  const { c } = useTheme();
  const { me } = useSession();
  const si = useSI();
  const ask = useAsk();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const messages = si.data?.messages ?? [];

  const send = async (q: string) => {
    const value = q.trim();
    if (!value || ask.isPending) return;
    // Setting up income and spending is a step-by-step conversation; it runs in the full chat.
    if (UPDATE_NUMBERS.test(value)) return router.navigate({ pathname: '/(tabs)/si', params: { setup: '1' } });
    setText('');
    setError(null);
    setPending(value);
    try {
      await ask.mutateAsync({ text: value, conversationId: si.data?.conversationId });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  const handled = useRef(0);
  useEffect(() => {
    if (question && si.data && handled.current !== question.n) {
      handled.current = question.n;
      void send(question.q);
    }
  }, [question?.n, si.data]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, pending]);

  // Follow-ups to the last answer first, then general suggestions; skip anything already asked.
  const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.text.trim().toLowerCase()));
  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
  const prompts = [...new Set([...(lastAnswer?.followUps ?? []), ...(si.data?.suggestions ?? [])])].filter((q) => !asked.has(q.trim().toLowerCase())).slice(0, 6);
  const first = me?.name?.split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden' }} role="region" aria-label="Super Intelligence chat">
      <Row gap={space.md} style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md }}>
        <SIOrb size={34} active={!!pending} />
        <View style={{ flex: 1 }}>
          <T v="subtitle" accessibilityRole="header">
            Super Intelligence
          </T>
          <T v="caption" tone="secondary" accessibilityLiveRegion="polite">
            {pending ? 'Thinking…' : 'Ask anything about your money'}
          </T>
        </View>
        <Press onPress={() => router.navigate('/(tabs)/si')} accessibilityRole="link" accessibilityLabel="Open the full Super Intelligence chat" hitSlop={8}>
          <Row gap={6}>
            <Maximize2 size={13} color={c.textSecondary} />
            <T v="smallMedium" tone="secondary">
              Open full chat
            </T>
          </Row>
        </Press>
      </Row>

      {si.error && !si.data ? (
        <View style={{ flex: 1 }}>
          <ErrorState error={si.error} onRetry={() => si.refetch()} />
        </View>
      ) : !si.data ? (
        <View style={{ flex: 1, paddingHorizontal: space.xl, gap: space.md }} accessibilityLabel="Loading Super Intelligence">
          <Skeleton height={16} width="70%" />
          <Skeleton height={16} width="90%" />
          <Skeleton height={16} width="60%" />
        </View>
      ) : (
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.lg }}>
          {messages.length === 0 ? (
            <View style={{ gap: space.sm }}>
              <T v="bodySemibold">{`${greetingFor(new Date().toISOString())}${first ? `, ${first}` : ''}!`}</T>
              {si.data.brief.enoughData ? (
                <>
                  <T v="small" tone="secondary">
                    Here’s what I noticed this week:
                  </T>
                  {si.data.brief.items.map((i) => (
                    <BriefLine key={i.id} item={i} />
                  ))}
                </>
              ) : (
                <T v="small" tone="secondary">
                  Ask me about your spending, savings or goals. I answer from your own numbers.
                </T>
              )}
            </View>
          ) : (
            messages.map((m) => <Message key={m.id} m={m} />)
          )}
          {pending ? (
            <>
              <UserBubble text={pending} />
              <Row gap={space.sm}>
                <ActivityIndicator size="small" color={c.textSecondary} />
                <T v="small" tone="secondary">
                  Checking your numbers…
                </T>
              </Row>
            </>
          ) : null}
          {error ? (
            <Row gap={space.sm} accessibilityLiveRegion="polite">
              <CircleAlert size={16} color={c.negative} />
              <T v="small" tone="negative" style={{ flex: 1 }}>
                {error}
              </T>
            </Row>
          ) : null}
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.sm, gap: space.sm, borderTopWidth: 1, borderTopColor: c.divider }}>
        {si.data && !pending && prompts.length ? (
          <PromptPills key={prompts.join('|')} items={prompts} onPick={send} fade={c.surface} padX={space.lg} style={{ marginHorizontal: -space.lg }} />
        ) : null}
        <Row gap={space.sm} style={{ height: 44, borderRadius: 22, paddingLeft: space.lg, paddingRight: 4, backgroundColor: c.surfaceMuted }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask Super Intelligence…"
            placeholderTextColor={c.textSecondary}
            accessibilityLabel="Ask Super Intelligence a question"
            returnKeyType="send"
            onSubmitEditing={() => send(text)}
            maxLength={500}
            autoComplete="off"
            style={[{ flex: 1, fontFamily: fonts.regular, fontSize: 15, color: c.text }, webInputReset]}
          />
          <Press
            onPress={() => send(text)}
            disabled={!text.trim() || !!pending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowUp size={17} color={c.primaryText} />
          </Press>
        </Row>
      </View>
    </View>
  );
}
