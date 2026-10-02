import { forwardRef, useState } from 'react';
import { Platform, Text, TextInput, View, type NativeSyntheticEvent, type StyleProp, type TextInputKeyPressEventData, type TextInputProps, type TextStyle } from 'react-native';
import { MAX_QUESTION_LENGTH } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { webInputReset } from '@/ui/controls';
import { T } from '@/ui/primitives';

/** Type size and line height of the question box. */
const FONT = 15;
export const INPUT_LINE = 22;

type Props = Omit<TextInputProps, 'multiline' | 'onSubmitEditing' | 'style'> & {
  value: string;
  onSubmit: () => void;
  color: string;
  /** Grows up to this many lines, then scrolls. */
  maxLines?: number;
  style?: StyleProp<TextStyle>;
};

/**
 * The question box: grows a line at a time as you type (like ChatGPT) up to `maxLines`, then
 * scrolls. Return sends; on the web Shift+Return starts a new line. Questions can be up to
 * MAX_QUESTION_LENGTH characters; a counter appears near the limit so typing never just stops.
 */
export const GrowingInput = forwardRef<TextInput, Props>(function GrowingInput({ value, onSubmit, color, maxLines = 6, style, ...rest }, ref) {
  const { c } = useTheme();
  const [contentH, setContentH] = useState(INPUT_LINE);
  const maxH = INPUT_LINE * maxLines;
  const height = Math.min(Math.max(contentH, INPUT_LINE), maxH);

  // Web: Enter sends (and keeps the cursor in the box); Shift+Enter falls through as a new line.
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== 'web') return;
    const k = e as unknown as { shiftKey?: boolean; nativeEvent: { key: string; isComposing?: boolean }; preventDefault: () => void };
    if (k.nativeEvent.key === 'Enter' && !k.shiftKey && !k.nativeEvent.isComposing) {
      k.preventDefault();
      onSubmit();
    }
  };

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {/* An invisible copy of the text at the same width tells the box how tall to be (a text box can
          only report growing, never shrinking, so it can't measure itself). */}
      <Text
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0, pointerEvents: 'none', fontFamily: fonts.regular, fontSize: FONT, lineHeight: INPUT_LINE }}
        onLayout={(e) => setContentH(Math.round(e.nativeEvent.layout.height))}
      >
        {`${value}​`}
      </Text>
      <TextInput
        ref={ref}
        {...rest}
        value={value}
        multiline
        submitBehavior="submit"
        onSubmitEditing={onSubmit}
        onKeyPress={onKeyPress}
        scrollEnabled={contentH > maxH}
        maxLength={MAX_QUESTION_LENGTH}
        style={[{ height, fontFamily: fonts.regular, fontSize: FONT, lineHeight: INPUT_LINE, color, padding: 0, textAlignVertical: 'top' }, webInputReset, style]}
      />
      {value.length >= MAX_QUESTION_LENGTH * 0.9 ? (
        <T v="caption" color={value.length >= MAX_QUESTION_LENGTH ? c.warning : c.textSecondary} accessibilityLiveRegion="polite" style={{ marginTop: -4, marginBottom: 6 }}>
          {value.length >= MAX_QUESTION_LENGTH
            ? `Limit reached: ${MAX_QUESTION_LENGTH.toLocaleString('en-IN')} characters`
            : `${value.length.toLocaleString('en-IN')} / ${MAX_QUESTION_LENGTH.toLocaleString('en-IN')} characters`}
        </T>
      ) : null}
    </View>
  );
});
