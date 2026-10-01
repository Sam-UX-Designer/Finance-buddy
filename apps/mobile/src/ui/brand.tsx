import { SIOrb } from './SIOrb';

/** The Finance Buddy mascot, used as the app logo (animated). */
export function Logo({ size = 88 }: { size?: number }) {
  return <SIOrb size={size} />;
}
