import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, CircleCheck, CircleAlert, Info, Mic, SquarePen } from 'lucide-react-native';
import { greetingFor, type BriefItem, type SIMessageDTO } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useAsk, useClearSI, useSI } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { ErrorState, FadeIn, LoadingState, MAX_WIDTH, PAGE_X, useTabBarInset, useWide, WIDE_MAX_WIDTH } from '@/ui/layout';
import { IconButton, webInputReset } from '@/ui/controls';
import { GlassSurface } from '@/ui/glass';
import { SIOrb } from '@/ui/SIOrb';
import { Card, Press, Row, T } from '@/ui/primitives';

/** SI: ask and receive financial intelligence (Blueprint §12). Answers come from Finance Engine tools. */
export default function SIScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const params = useLocalSearchParams<{ q?: string }>();
  const si = useSI();
  const ask = useAsk();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const handledQ = useRef<string | null>(null);
  const clear = useClearSI();
  const wide = useWide();
  const tabInset = useTabBarInset();
  const width = wide ? WIDE_MAX_WIDTH : MAX_WIDTH;
  const keyboard = useKeyboardVisible();

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    setText('');
    setError(null);
    setPending(question);
    try {
      await ask.mutateAsync(question);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  useEffect(() => {
    if (params.q && si.data && handledQ.current !== params.q) {
      handledQ.current = params.q;
      void send(params.q);
      router.setParams({ q: undefined });
    }
  }, [params.q, si.data]);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [si.data?.messages.length, pending]);

  const greeting = greetingFor(new Date().toISOString());
  const first = me?.name?.split(' ')[0];

  // Speech input: on the web use the browser's speech recognition; on phones the keyboard's dictation key.
  const input = useRef<TextInput>(null);
  const dictate = () => {
    const W = globalThis as unknown as { webkitSpeechRecognition?: new () => SpeechRec; SpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (Platform.OS === 'web' && Rec) {
      const r = new Rec();
      r.lang = 'en-IN';
      r.onresult = (e) => setText(e.results[0]?.[0]?.transcript ?? '');
      r.start();
    } else input.current?.focus();
  };

  const header = HEADER_H + insets.top;
  // Quick prompts sit in a row above the input until the conversation starts (like ChatGPT).
  const showSuggestions = !!si.data && !si.data.messages.length && !pending && !keyboard;
  const inputBottom = keyboard ? space.sm : wide ? space.lg : tabInset;
  const clearChat = () => {
    setError(null);
    clear.mutate();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1 }}>
        {si.error && !si.data ? (
          <View style={{ flex: 1, paddingTop: header }}>
            <ErrorState error={si.error} onRetry={() => si.refetch()} />
          </View>
        ) : !si.data ? (
          <View style={{ flex: 1, paddingTop: header }}>
            <LoadingState label="SI is reading your latest numbers…" />
          </View>
        ) : (
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ width: '100%', maxWidth: width, alignSelf: 'center', paddingHorizontal: PAGE_X, paddingTop: header + space.lg, paddingBottom: inputBottom + INPUT_H + (showSuggestions ? SUGGEST_H : 0) + space.xl }}
          >
            {/* Proactive brief */}
            <FadeIn>
              <Card style={{ gap: space.sm }}>
                <T v="bodySemibold">{`${greeting}${first ? `, ${first}` : ''}!`}</T>
                {si.data.brief.enoughData ? (
                  <>
                    <T v="body">Here’s what I noticed this week:</T>
                    {si.data.brief.items.map((i) => (
                      <BriefLine key={i.id} item={i} />
                    ))}
                  </>
                ) : (
                  <T v="body" tone="secondary">
                    I don’t have enough history yet to summarise your week. I’ll share observations once your data shows a clear pattern.
                  </T>
                )}
              </Card>
            </FadeIn>

            {/* Conversation */}
            <View style={{ marginTop: space.xl, gap: space.lg }}>
              {si.data.messages.map((m) => (
                <Message key={m.id} m={m} onFollowUp={send} />
              ))}
              {pending ? (
                <>
                  <UserBubble text={pending} />
                  <Row gap={space.sm} accessibilityLabel="SI is working on your answer" accessibilityLiveRegion="polite">
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
                  <T v="small" tone="negative">
                    {error}
                  </T>
                </Row>
              ) : null}
            </View>
          </ScrollView>
        )}

        {/* Sticky header: stays on top while the conversation scrolls underneath */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <GlassSurface radius={0} flat style={{ paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <Row gap={space.md} style={{ height: HEADER_H, width: '100%', maxWidth: width, alignSelf: 'center', paddingHorizontal: PAGE_X }}>
              <SIOrb size={38} />
              <View style={{ flex: 1 }}>
                <T v="bodySemibold" accessibilityRole="header">
                  Super Intelligence
                </T>
                <T v="caption" tone="secondary">
                  {pending ? 'Thinking…' : 'Answers from your own numbers'}
                </T>
              </View>
              {si.data?.messages.length ? <IconButton icon={SquarePen} label="New chat" onPress={clearChat} /> : null}
            </Row>
          </GlassSurface>
        </View>

        {/* Input: floats above the tab bar */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: inputBottom, paddingHorizontal: PAGE_X }} pointerEvents="box-none">
          {showSuggestions ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              accessibilityLabel="Suggested questions"
              style={{ marginHorizontal: -PAGE_X, marginBottom: space.sm, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: PAGE_X, gap: space.sm, minWidth: '100%', justifyContent: wide ? 'center' : 'flex-start' }}
            >
              {si.data!.suggestions.map((q) => (
                <Press
                  key={q}
                  onPress={() => send(q)}
                  accessibilityRole="button"
                  style={{ height: SUGGEST_H - space.sm, borderRadius: (SUGGEST_H - space.sm) / 2, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}
                >
                  <T v="small" numberOfLines={1}>
                    {q}
                  </T>
                </Press>
              ))}
            </ScrollView>
          ) : null}
          <GlassSurface radius={INPUT_H / 2} style={{ width: '100%', maxWidth: width - PAGE_X * 2, alignSelf: 'center', height: INPUT_H, flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: 6, gap: space.sm }}>
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              placeholder="Ask anything about your money…"
              placeholderTextColor={c.textSecondary}
              accessibilityLabel="Ask SI a question"
              returnKeyType="send"
              onSubmitEditing={() => send(text)}
              maxLength={500}
              autoComplete="off"
              style={[{ flex: 1, fontFamily: fonts.regular, fontSize: 15, color: c.text }, webInputReset]}
            />
            <Press
              onPress={() => (text.trim() ? send(text) : dictate())}
              accessibilityRole="button"
              accessibilityLabel={text.trim() ? 'Send' : 'Speak your question'}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              {text.trim() ? <ArrowUp size={18} color={c.primaryText} /> : <Mic size={18} color={c.primaryText} />}
            </Press>
          </GlassSurface>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const HEADER_H = 60;
const INPUT_H = 52;
const SUGGEST_H = 46;

interface SpeechRec {
  lang: string;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  start: () => void;
}

function BriefLine({ item }: { item: BriefItem }) {
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

function UserBubble({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: c.primary, borderRadius: radius.lg, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
      <T v="body" color={c.primaryText}>
        {text}
      </T>
    </View>
  );
}

function Message({ m, onFollowUp }: { m: SIMessageDTO; onFollowUp: (q: string) => void }) {
  const { c } = useTheme();
  if (m.role === 'user') return <UserBubble text={m.text} />;
  return (
    <FadeIn>
      <View style={{ gap: space.sm }}>
        <T v="body">{m.text}</T>
        {m.bullets.map((b, i) => (
          <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.textSecondary, marginTop: 9 }} />
            <T v="body" style={{ flex: 1 }}>
              {b}
            </T>
          </Row>
        ))}
        <Row gap={space.sm} style={{ flexWrap: 'wrap', marginTop: 2 }}>
          {m.followUps.slice(0, 2).map((f) => (
            <Press key={f} onPress={() => onFollowUp(f)} accessibilityRole="button" style={{ borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
              <T v="small">{f}</T>
            </Press>
          ))}
        </Row>
        <T v="caption" tone="tertiary">
          {m.insufficient ? 'Based on the data available so far.' : 'Calculated from your connected accounts.'}
        </T>
      </View>
    </FadeIn>
  );
}

/** Whether the on-screen keyboard is showing (phones). */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
