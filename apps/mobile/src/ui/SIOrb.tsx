import { useId } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/** SI's avatar: the same orb wherever SI speaks. */
export function SIOrb({ size = 38 }: { size?: number }) {
  const id = `orb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = size / 2;
  return (
    <Svg width={size} height={size} accessibilityLabel="Super Intelligence">
      <Defs>
        <RadialGradient id={id} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#9FD3FF" />
          <Stop offset="0.45" stopColor="#3B7BFF" />
          <Stop offset="1" stopColor="#7C5CFC" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#${id})`} />
    </Svg>
  );
}
