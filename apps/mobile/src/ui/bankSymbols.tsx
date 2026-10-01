import type { ReactNode } from 'react';
import { Path, Rect } from 'react-native-svg';
import { BRAND_LOGOS } from './brands';

/**
 * Bank symbols in their real colours, as SVG shapes on a 24×24 grid. HDFC, Axis and SBI match the
 * logos the product owner supplied (symbol only: the wordmark is too small to read at icon size);
 * other banks use their Simple Icons mark in its brand colour.
 */
const CUSTOM: Record<string, () => ReactNode> = {
  hdfc: () => (
    <>
      <Path d={BRAND_LOGOS.hdfc!.path} fill="#ED232A" />
      <Rect x={8.345} y={8.53} width={6.963} height={6.938} fill="#004C8F" />
    </>
  ),
  axis: () => <Path d={BRAND_LOGOS.axis!.path} fill="#97144D" />,
  sbi: () => <Path d={BRAND_LOGOS.sbi!.path} fill="#00AEEF" />,
};

/** Banks drawn from the supplied logos (these always use the vector symbol, never a photo). */
export const hasSuppliedSymbol = (id: string) => id in CUSTOM;

/** The bank's symbol in colour, or null when there is no vector mark for it. */
export function bankSymbolShapes(id: string): ReactNode | null {
  if (CUSTOM[id]) return CUSTOM[id]!();
  const logo = BRAND_LOGOS[id];
  return logo ? <Path d={logo.path} fill={logo.hex} /> : null;
}
