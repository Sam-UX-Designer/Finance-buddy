import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, CircleAlert, History, Mic, PanelLeftClose, PanelLeftOpen, Square, SquarePen, X } from 'lucide-react-native';
import { greetingFor } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useAsk, useNewChat, usePlan, useSetAssumptions, useSI } from '@/lib/queries';
import { storage } from '@/lib/storage';
import { ChatHistoryList, ChatHistorySheet } from '@/features/ChatHistory';
import { BriefLine, Message, ThinkingRow, UPDATE_NUMBERS, useFreshMessages, UserBubble } from '@/features/SIMessages';
import { GrowingInput, INPUT_LINE } from '@/features/GrowingInput';
import { PromptPills } from '@/features/PromptPills';
import { useSISetup, type SetupLine } from '@/features/siSetup';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { ErrorState, FadeIn, LoadingState, MAX_WIDTH, PAGE_X, useRememberedFlag, useSoftShadow, useTabBarInset, useWide, WIDE_MAX_WIDTH, WIDE_PAGE_X } from '@/ui/layout';
import { Icon3D, Section } from '@/ui/section';
import { Button, IconButton } from '@/ui/controls';
import { GlassSurface } from '@/ui/glass';
import { ThinkingOrb } from '@/ui/orbs/ThinkingOrb';
import { SIOrb } from '@/ui/SIOrb';
import { Card, InSection, Press, Row, T } from '@/ui/primitives';

/** SI: ask and receive financial intelligence (Blueprint §12). Answers come from Finance Engine tools. */
export default function SIScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const params = useLocalSearchParams<{ q?: string; setup?: string }>();
  // Which chat is open: a chat picked from history, or (undefined) the latest one.
  const [openId, setOpenId] = useState<string | undefined>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const si = useSI(openId);
  // New answers type themselves out; chats already on screen or opened from history appear at once.
  const fresh = useFreshMessages(si.data?.conversationId, si.data?.messages);
  const ask = useAsk();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const handledQ = useRef<string | null>(null);
  const newChat = useNewChat();
  const wide = useWide();
  // Desktop: the past-chats panel can be hidden for a wider chat; the browser remembers the choice.
  const [chatsHidden, setChatsHidden] = useRememberedFlag('fb.chatsHidden');
  const shadow = useSoftShadow();
  const tabInset = useTabBarInset();
  // Desktop: a little wider than other pages, but lines still short enough to read comfortably.
  const width = wide ? WIDE_MAX_WIDTH + 120 : MAX_WIDTH;
  const keyboard = useKeyboardVisible();
  // Money-profile setup: SI asks for the numbers plans and forecasts use.
  const plan = usePlan();
  const setAssumptions = useSetAssumptions();
  const setup = useSISetup({ plan: plan.data, save: (body) => setAssumptions.mutateAsync(body) });
  const [setupLater, setSetupLater] = useState(true);
  useEffect(() => {
    storage
      .get(SETUP_LATER_KEY)
      .then((v) => setSetupLater(v === '1'))
      .catch(() => setSetupLater(false));
  }, []);
  const needsSetup = !!plan.data && plan.data.assumptions.find((a) => a.key === 'monthlyIncome')?.source !== 'USER';
  const startSetup = () => {
    setError(null);
    setText('');
    setup.start();
  };

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    if (setup.active) {
      if (setup.step !== 'done') {
        setText('');
        setup.answer(question);
        return;
      }
      setup.exit();
      if (/^see my plan$/i.test(question)) return router.push('/(tabs)/plan');
      if (/^done$/i.test(question)) return;
    }
    if (UPDATE_NUMBERS.test(question) && plan.data) return startSetup();
    setText('');
    setError(null);
    setPending(question);
    try {
      await ask.mutateAsync({ text: question, conversationId: si.data?.conversationId });
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
    if (params.setup && plan.data) {
      startSetup();
      router.setParams({ setup: undefined });
    }
  }, [params.setup, plan.data]);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [si.data?.messages.length, pending, setup.lines.length]);

  const greeting = greetingFor(new Date().toISOString());
  const first = me?.name?.split(' ')[0];

  // Speech input: on the web use the browser's speech recognition (a listening orb shows while it
  // hears you; tap again to stop); on phones the keyboard's dictation key.
  const input = useRef<TextInput>(null);
  const speech = useRef<SpeechRec | null>(null);
  const [listening, setListening] = useState(false);
  // The question box grows with long questions; the conversation keeps clear of it.
  const [inputH, setInputH] = useState(INPUT_H);
  const dictate = () => {
    if (speech.current) return speech.current.stop();
    const W = globalThis as unknown as { webkitSpeechRecognition?: new () => SpeechRec; SpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (Platform.OS === 'web' && Rec) {
      const r = new Rec();
      r.lang = 'en-IN';
      r.onresult = (e) => setText(e.results[0]?.[0]?.transcript ?? '');
      r.onend = () => {
        speech.current = null;
        setListening(false);
      };
      speech.current = r;
      setListening(true);
      r.start();
    } else input.current?.focus();
  };
  useEffect(() => () => speech.current?.abort(), []);

  const header = HEADER_H + insets.top;
  // Quick prompts sit in a row above the input for the whole conversation: after an answer they
  // are that answer's follow-ups, topped up with general suggestions; questions already asked are skipped.
  const messages = si.data?.messages ?? [];
  const asked = new Set(messages.filter((m) => m.role === 'user').map((m) => m.text.trim().toLowerCase()));
  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
  const prompts = [...new Set([...(lastAnswer?.followUps ?? []), ...(si.data?.suggestions ?? [])])].filter((q) => !asked.has(q.trim().toLowerCase())).slice(0, 6);
  const replies = setup.active ? setup.replies : prompts;
  const showSuggestions = !!si.data && !pending && !fresh.typing && replies.length > 0;
  const inputBottom = keyboard ? space.sm : wide ? space.lg : tabInset;
  const startNewChat = () => {
    setup.exit();
    setError(null);
    setOpenId(undefined);
    newChat.mutate();
  };
  // A chat that no longer exists (deleted from history) falls back to the latest one.
  useEffect(() => {
    if (openId && si.data && si.data.conversationId !== openId) setOpenId(undefined);
  }, [openId, si.data?.conversationId]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Desktop: past chats stay in view on the left, like a mail or chat app. */}
        {wide && !chatsHidden ? (
          <View style={{ width: HISTORY_W, paddingLeft: WIDE_PAGE_X, paddingVertical: space.lg }} role="navigation" aria-label="Chat history">
            <Section
              fill
              icon={<Icon3D emoji="💡" size={36} />}
              title="Chats"
              subtitle="Your past conversations"
              right={<IconButton icon={PanelLeftClose} label="Hide chats" size={19} tint={c.textSecondary} onPress={() => setChatsHidden(true)} style={{ width: 32, height: 32 }} />}
              style={{ paddingHorizontal: space.md }}
            >
              <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
                <ChatHistoryList
                  currentId={si.data?.conversationId}
                  onOpen={(id) => {
                    setup.exit();
                    setError(null);
                    setOpenId(id);
                  }}
                  onNew={startNewChat}
                />
              </ScrollView>
            </Section>
          </View>
        ) : null}
        {/* Desktop: the chat sits in a section card like Home; cards inside it draw a thin border. */}
        <View
          style={
            wide
              ? [
                  {
                    flex: 1,
                    marginVertical: space.lg,
                    marginLeft: chatsHidden ? WIDE_PAGE_X : space.xl,
                    marginRight: WIDE_PAGE_X,
                    backgroundColor: c.surface,
                    borderRadius: radius.xl,
                    borderWidth: 1,
                    borderColor: c.border,
                    overflow: 'hidden',
                  },
                  shadow,
                ]
              : { flex: 1 }
          }
        >
          <InSection.Provider value={wide}>
            {si.error && !si.data ? (
              <View style={{ flex: 1, paddingTop: header }}>
                <ErrorState error={si.error} onRetry={() => si.refetch()} />
              </View>
            ) : !si.data ? (
              <View style={{ flex: 1, paddingTop: header }}>
                <LoadingState label="Super Intelligence is reading your latest numbers…" />
              </View>
            ) : (
              <ScrollView
                ref={scroll}
                keyboardShouldPersistTaps="handled"
                // While an answer types out, keep the newest words in view (unless you've scrolled up to read).
                onScroll={(e) => {
                  const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                  nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 160;
                }}
                scrollEventThrottle={32}
                onContentSizeChange={() => {
                  if (nearBottom.current) scroll.current?.scrollToEnd({ animated: false });
                }}
                contentContainerStyle={{
                  width: '100%',
                  maxWidth: width,
                  alignSelf: 'center',
                  paddingHorizontal: PAGE_X,
                  paddingTop: header + space.lg,
                  paddingBottom: inputBottom + inputH + (showSuggestions ? SUGGEST_H : 0) + space.xl,
                }}
              >
                {setup.active ? (
                  <View style={{ gap: space.lg }} accessibilityLiveRegion="polite">
                    {setup.lines.map((l) => (
                      <SetupBubble key={l.id} l={l} />
                    ))}
                  </View>
                ) : (
                  <>
                    {needsSetup && !setupLater ? (
                      <FadeIn>
                        <Card style={{ marginBottom: space.lg, gap: space.md }}>
                          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                            <SIOrb size={32} />
                            <View style={{ flex: 1, gap: 4 }}>
                              <T v="bodySemibold">Let’s make your plan yours</T>
                              <T v="small" tone="secondary">
                                I’ve estimated your income and spending from your bank. Answer 5 quick questions so my advice fits you.
                              </T>
                            </View>
                          </Row>
                          <Row gap={space.sm}>
                            <Button label="Start" size="md" onPress={startSetup} style={{ flex: 1 }} />
                            <Button
                              label="Not now"
                              size="md"
                              variant="secondary"
                              style={{ flex: 1 }}
                              onPress={() => {
                                setSetupLater(true);
                                void storage.set(SETUP_LATER_KEY, '1').catch(() => undefined);
                              }}
                            />
                          </Row>
                        </Card>
                      </FadeIn>
                    ) : null}

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
                        <Message key={m.id} m={m} typing={fresh.isFresh(m.id)} onTyped={() => fresh.markSeen(m.id)} />
                      ))}
                      {pending ? (
                        <>
                          <UserBubble text={pending} />
                          <ThinkingRow question={pending} />
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
                  </>
                )}
              </ScrollView>
            )}

            {/* Sticky header: stays on top while the conversation scrolls underneath */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
              <GlassSurface radius={0} flat style={{ paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                <Row gap={space.md} style={{ height: HEADER_H, width: '100%', maxWidth: width, alignSelf: 'center', paddingHorizontal: PAGE_X }}>
                  {wide && chatsHidden ? (
                    <IconButton icon={PanelLeftOpen} label="Show chats" size={20} tint={c.textSecondary} onPress={() => setChatsHidden(false)} style={{ marginLeft: -space.sm }} />
                  ) : null}
                  <SIOrb size={38} active={!!pending} />
                  <View style={{ flex: 1 }}>
                    <T v="bodySemibold" accessibilityRole="header">
                      Super Intelligence
                    </T>
                    <T v="caption" tone="secondary">
                      {setup.active ? 'Setting up your plan' : pending ? 'Thinking…' : 'Answers from your own numbers'}
                    </T>
                  </View>
                  {wide ? null : <IconButton icon={History} label="Chat history" onPress={() => setHistoryOpen(true)} />}
                  {setup.active ? (
                    <IconButton icon={X} label="Exit setup" onPress={setup.exit} />
                  ) : si.data?.messages.length ? (
                    <IconButton icon={SquarePen} label="New chat" onPress={startNewChat} />
                  ) : null}
                </Row>
              </GlassSurface>
            </View>

            {/* Input: floats above the tab bar */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: inputBottom, paddingHorizontal: PAGE_X }} pointerEvents="box-none">
              {showSuggestions ? (
                // One line that scrolls sideways (phones swipe; desktop scrolls with the wheel or trackpad).
                <PromptPills
                  key={replies.join('|')}
                  items={replies}
                  onPick={send}
                  icons={!setup.active}
                  fade={wide ? c.surface : c.bg}
                  padX={wide ? 0 : PAGE_X}
                  accessibilityLabel={setup.active ? 'Answers' : 'Suggested questions'}
                  style={wide ? { width: '100%', maxWidth: width - PAGE_X * 2, alignSelf: 'center', marginBottom: space.sm } : { marginHorizontal: -PAGE_X, marginBottom: space.sm }}
                />
              ) : null}
              <GlassSurface
                radius={INPUT_H / 2}
                onLayout={(e) => setInputH(Math.round(e.nativeEvent.layout.height))}
                style={{
                  width: '100%',
                  maxWidth: width - PAGE_X * 2,
                  alignSelf: 'center',
                  minHeight: INPUT_H,
                  flexDirection: 'row',
                  // Long questions grow the box upwards; the buttons stay on the bottom line.
                  alignItems: 'flex-end',
                  paddingLeft: space.lg,
                  paddingRight: 6,
                  paddingVertical: (INPUT_H - 40) / 2,
                  gap: space.sm,
                }}
              >
                {listening ? (
                  <View style={{ marginBottom: 4 }}>
                    <ThinkingOrb state="listening" size={32} />
                  </View>
                ) : null}
                <GrowingInput
                  ref={input}
                  value={text}
                  onChangeText={setText}
                  onSubmit={() => send(text)}
                  color={c.text}
                  placeholder={listening ? 'Listening…' : (setup.placeholder ?? (setup.active ? 'Type your answer…' : 'Ask anything about your money…'))}
                  placeholderTextColor={c.textSecondary}
                  accessibilityLabel="Ask SI a question"
                  returnKeyType="send"
                  autoComplete="off"
                  style={{ marginVertical: (40 - INPUT_LINE) / 2 }}
                />
                <Press
                  onPress={() => (text.trim() && !listening ? send(text) : dictate())}
                  accessibilityRole="button"
                  accessibilityLabel={listening ? 'Stop listening' : text.trim() ? 'Send' : 'Speak your question'}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                  {listening ? <Square size={14} color={c.primaryText} fill={c.primaryText} /> : text.trim() ? <ArrowUp size={18} color={c.primaryText} /> : <Mic size={18} color={c.primaryText} />}
                </Press>
              </GlassSurface>
            </View>
          </InSection.Provider>
        </View>
      </View>
      <ChatHistorySheet
        visible={historyOpen && !wide}
        onClose={() => setHistoryOpen(false)}
        currentId={si.data?.conversationId}
        onOpen={(id) => {
          setup.exit();
          setError(null);
          setOpenId(id);
          setHistoryOpen(false);
        }}
        onNew={() => {
          setHistoryOpen(false);
          startNewChat();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const HEADER_H = 60;
/** Desktop chat history column width. */
const HISTORY_W = 300;
const SETUP_LATER_KEY = 'fb.si.setupLater';
const INPUT_H = 52;
const SUGGEST_H = 46;

interface SpeechRec {
  lang: string;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  /** Fires when listening ends for any reason (finished, stopped, no speech, or an error). */
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function SetupBubble({ l }: { l: SetupLine }) {
  const { c } = useTheme();
  if (l.role === 'user') return <UserBubble text={l.text} />;
  return (
    <FadeIn>
      <View style={{ gap: space.sm }}>
        <T v="body">{l.text}</T>
        {l.bullets?.map((b, i) => (
          <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.textSecondary, marginTop: 9 }} />
            <T v="body" style={{ flex: 1 }}>
              {b}
            </T>
          </Row>
        ))}
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
