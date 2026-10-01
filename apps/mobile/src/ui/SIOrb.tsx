import { Image } from 'react-native';

const AVATAR = require('../../assets/images/si-avatar.png');

/** SI's avatar (the Finance Buddy mascot): the same face wherever SI speaks. */
export function SIOrb({ size = 38 }: { size?: number }) {
  return <Image source={AVATAR} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Super Intelligence" accessibilityIgnoresInvertColors />;
}

/** The app logo (same mascot). */
export const APP_LOGO = AVATAR;
