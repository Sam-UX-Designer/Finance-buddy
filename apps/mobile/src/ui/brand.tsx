import { Image } from 'react-native';
import { APP_LOGO } from './SIOrb';

/** The Finance Buddy mascot, used as the app logo. */
export function Logo({ size = 88 }: { size?: number }) {
  return <Image source={APP_LOGO} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Finance Buddy logo" accessibilityIgnoresInvertColors />;
}
