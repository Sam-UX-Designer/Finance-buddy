import { View } from 'react-native';

export function Logo({ size = 64, dark = true }: { size?: number; dark?: boolean }) {
  const r = size * 0.36;
  return (
    <View style={{ width: size * 1.45, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Finance Buddy logo">
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: dark ? 'rgba(255,255,255,0.92)' : '#0A0A0B' }} />
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, marginLeft: -r * 0.85, backgroundColor: dark ? 'rgba(200,200,205,0.7)' : 'rgba(10,10,11,0.45)' }} />
    </View>
  );
}
