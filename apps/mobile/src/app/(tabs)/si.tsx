import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { ArrowUp, CircleCheck, CircleAlert, Info, Mic, Sparkles } from 'lucide-react-native';
import { greetingFor, type BriefItem, type SIMessageDTO } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useAsk, useSI } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { ErrorState, FadeIn, LoadingState, MAX_WIDTH, PAGE_X } from '@/ui/layout';
import { webInputReset } from '@/ui/controls';
import { Press, Row, T } from '@/ui/primitives';

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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {si.error && !si.data ? (
          <ErrorState error={si.error} onRetry={() => si.refetch()} />
        ) : !si.data ? (
          <LoadingState label="SI is reading your latest numbers…" />
        ) : (
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: PAGE_X, paddingBottom: space.xl }}>
            <FadeIn style={{ alignItems: 'center', marginTop: space.xl, marginBottom: space.xl }}>
              <Orb />
              <T v="title" style={{ marginTop: space.md }} accessibilityRole="header">
                SI
              </T>
              <T v="small" tone="secondary">
                Super Intelligence
              </T>
            </FadeIn>

            {/* Proactive brief */}
            <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.positive, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
                <Sparkles size={14} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, backgroundColor: c.surfaceMuted, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
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
              </View>
            </Row>

            <View style={{ marginTop: space.xl, marginLeft: 36, gap: space.sm }}>
              <T v="small" tone="secondary">
                You can ask me things like:
              </T>
              {si.data.suggestions.map((s) => (
                <Press key={s} onPress={() => send(s)} accessibilityRole="button" style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface }}>
                  <T v="small">{s}</T>
                </Press>
              ))}
            </View>

            {/* Conversation */}
            <View style={{ marginTop: space.xl, gap: space.md }}>
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
                <Row gap={space.sm}>
                  <CircleAlert size={16} color={c.negative} />
                  <T v="small" tone="negative">
                    {error}
                  </T>
                </Row>
              ) : null}
            </View>
          </ScrollView>
        )}

        {/* Input */}
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: PAGE_X, paddingVertical: space.sm }}>
          <Row style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.pill, paddingLeft: space.lg, paddingRight: 6, height: 52, gap: space.sm }}>
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              placeholder="Ask anything about your money…"
              placeholderTextColor={c.textTertiary}
              accessibilityLabel="Ask SI a question"
              returnKeyType="send"
              onSubmitEditing={() => send(text)}
              maxLength={500}
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
          </Row>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface SpeechRec {
  lang: string;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  start: () => void;
}

function Orb() {
  return (
    <Svg width={84} height={84} accessibilityLabel="SI">
      <Defs>
        <RadialGradient id="orb" cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#9FD3FF" />
          <Stop offset="0.45" stopColor="#3B7BFF" />
          <Stop offset="1" stopColor="#7C5CFC" />
        </RadialGradient>
      </Defs>
      <Circle cx={42} cy={42} r={40} fill="url(#orb)" />
    </Svg>
  );
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
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.infoSoft, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          <Sparkles size={14} color={c.info} />
        </View>
        <View style={{ flex: 1, gap: space.sm }}>
          <View style={{ backgroundColor: c.surfaceMuted, borderRadius: radius.lg, borderTopLeftRadius: 6, padding: space.md, gap: 6 }}>
            <T v="body">{m.text}</T>
            {m.bullets.map((b, i) => (
              <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.textSecondary, marginTop: 8 }} />
                <T v="small" style={{ flex: 1 }}>
                  {b}
                </T>
              </Row>
            ))}
          </View>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {m.followUps.slice(0, 2).map((f) => (
              <Press key={f} onPress={() => onFollowUp(f)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }}>
                <T v="caption">{f}</T>
              </Press>
            ))}
          </Row>
          <T v="caption" tone="tertiary">
            {m.insufficient ? 'Based on the data available so far.' : 'Calculated from your connected accounts.'}
          </T>
        </View>
      </Row>
    </FadeIn>
  );
}
