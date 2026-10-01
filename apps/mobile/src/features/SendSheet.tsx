import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { parseRupeeInput } from '@finance-buddy/core';
import { space } from '@/theme/tokens';
import { Button, TextField } from '@/ui/controls';
import { Banner, Sheet } from '@/ui/layout';
import { T } from '@/ui/primitives';

const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

/**
 * "Send" hands the payment to the user's own UPI app via a standard UPI link.
 * Finance Buddy never moves money and never asks for a UPI PIN.
 */
export function SendSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [vpa, setVpa] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const paise = parseRupeeInput(amount);
  const valid = VPA.test(vpa.trim()) && paise != null && paise > 0 && paise <= 10_000_000;

  const open = async () => {
    setError(null);
    const params = new URLSearchParams({ pa: vpa.trim(), cu: 'INR', am: (paise! / 100).toFixed(2) });
    if (name.trim()) params.set('pn', name.trim());
    if (note.trim()) params.set('tn', note.trim().slice(0, 50));
    const url = `upi://pay?${params.toString()}`;
    try {
      const ok = Platform.OS !== 'web' && (await Linking.canOpenURL(url));
      if (!ok) {
        setError(Platform.OS === 'web' ? 'Open Finance Buddy on your phone to pay with a UPI app.' : 'No UPI app found on this device.');
        return;
      }
      await Linking.openURL(url);
      onClose();
    } catch {
      setError('Could not open your UPI app.');
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send money"
      footer={<Button label="Pay with UPI app" onPress={open} disabled={!valid} />}
    >
      <View style={{ gap: space.lg }}>
        <T v="small" tone="secondary">
          Your UPI app completes the payment. Finance Buddy never moves money or asks for your UPI PIN.
        </T>
        <TextField label="UPI ID" value={vpa} onChangeText={setVpa} placeholder="name@bank" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" error={vpa && !VPA.test(vpa.trim()) ? 'Enter a valid UPI ID, like name@okaxis' : null} />
        <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="Who are you paying?" />
        <TextField label="Amount" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" prefix={<T v="bodyMedium" tone="secondary">₹</T>} />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="What's it for?" maxLength={50} />
        {error ? <Banner tone="info" title={error} /> : null}
      </View>
    </Sheet>
  );
}
