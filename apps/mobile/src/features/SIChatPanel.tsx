import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { ArrowUp, CircleAlert, Maximize2 } from 'lucide-react-native';
import { greetingFor } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useAsk, useSI } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { webInputReset } from '@/ui/controls';
import { ErrorState, Skeleton, useSoftShadow } from '@/ui/layout';
import { Press, Row, T } from '@/ui/primitives';
import { SIOrb } from '@/ui/SIOrb';
import { PromptPills } from './PromptPills';
import { BriefLine, Message, ThinkingRow, UPDATE_NUMBERS, useFreshMessages, UserBubble } from './SIMessages';

/** Height of the conversation area; longer chats scroll inside it. */
const CHAT_H = 210;

/**
 * Desktop Home, Super Intelligence column: chat without leaving Home. It continues the
 * same conversation as the Super Intelligence tab, so "Open full chat" picks up where you are.
 * `question` lets Home ask something for you (a card's "See why"); `n` makes repeats count.
 */
export function SIChatPanel({ question }: { question?: { q: string; n: number } }) {
  const { c } = useTheme();
  const { me } = useSession();
  const si = useSI();
  const fresh = useFreshMessages(si.data?.conversationId, si.data?.messages);
  const ask = useAsk();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const shadow = useSoftShadow();
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
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: space.lg, gap: space.lg }, shadow]} role="region" aria-label="Super Intelligence chat">
      <Row gap={space.md}>
        <SIOrb size={40} active={!!pending} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="subtitle" accessibilityRole="header" numberOfLines={1}>
            Super Intelligence
          </T>
          <T v="small" tone="secondary" accessibilityLiveRegion="polite" numberOfLines={1}>
            {pending ? 'Thinking…' : 'Ask anything about your money'}
          </T>
        </View>
        {/* Opens the full chat; an icon so the subtitle keeps its room in a narrow column. */}
        <Press
          onPress={() => router.navigate('/(tabs)/si')}
          accessibilityRole="link"
          accessibilityLabel="Open the full Super Intelligence chat"
          hitSlop={8}
          style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Maximize2 size={14} color={c.textSecondary} />
        </Press>
      </Row>

      {/* The conversation, suggested questions and the question box sit together in one bordered block. */}
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: space.md, gap: space.md }}>
        {si.error && !si.data ? (
          <ErrorState error={si.error} onRetry={() => si.refetch()} />
        ) : !si.data ? (
          <View style={{ height: CHAT_H, gap: space.md }} accessibilityLabel="Loading Super Intelligence">
            <Skeleton height={16} width="70%" />
            <Skeleton height={16} width="90%" />
            <Skeleton height={16} width="60%" />
          </View>
        ) : (
          <ScrollView
            ref={scroll}
            style={{ height: CHAT_H }}
            contentContainerStyle={{ gap: space.lg, paddingBottom: space.xs }}
            // While an answer types out, keep the newest words in view (unless you've scrolled up to read).
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
            }}
            scrollEventThrottle={32}
            onContentSizeChange={() => {
              if (nearBottom.current) scroll.current?.scrollToEnd({ animated: false });
            }}
          >
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
              messages.map((m) => <Message key={m.id} m={m} typing={fresh.isFresh(m.id)} onTyped={() => fresh.markSeen(m.id)} />)
            )}
            {pending ? (
              <>
                <UserBubble text={pending} />
                <ThinkingRow question={pending} />
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
        {si.data && !pending && !fresh.typing && prompts.length ? (
          <PromptPills key={prompts.join('|')} items={prompts} onPick={send} fade={c.surface} padX={space.md} style={{ marginHorizontal: -space.md }} />
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
