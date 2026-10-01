/**
 * Design tokens (Blueprint §17). Light and dark share one semantic token set so every component
 * works in both themes. Colour is used for financial state, not decoration.
 */
export interface Palette {
  bg: string;
  surface: string;
  surfaceMuted: string;
  surfacePressed: string;
  border: string;
  divider: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  inverseText: string;
  /** The black "Total Balance" card and primary buttons. */
  hero: string;
  heroText: string;
  heroTextSecondary: string;
  heroButton: string;
  primary: string;
  primaryText: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  loan: string;
  loanSoft: string;
  info: string;
  infoSoft: string;
  siCard: string;
  siCardBorder: string;
  /** Translucent fills for small controls on the ambient backdrop (chips, fields). */
  glassFill: string;
  glassFillStrong: string;
  glassEdge: string;
  /** Stained-glass tint for SI's cards. */
  siTint: string;
  tabBar: string;
  overlay: string;
  skeleton: string;
}

export const light: Palette = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F5F6',
  surfacePressed: '#EFEFF1',
  border: '#ECECEE',
  divider: '#F1F1F3',
  text: '#0A0A0B',
  textSecondary: '#6B6B73',
  textTertiary: '#9C9CA3',
  inverseText: '#FFFFFF',
  hero: '#0B0B0C',
  heroText: '#FFFFFF',
  heroTextSecondary: '#A1A1A8',
  heroButton: '#2A2A2D',
  primary: '#0A0A0B',
  primaryText: '#FFFFFF',
  positive: '#16A34A',
  positiveSoft: '#EAF7EE',
  negative: '#E5484D',
  negativeSoft: '#FDEEEE',
  warning: '#D97706',
  warningSoft: '#FEF4E6',
  loan: '#7C5CFC',
  loanSoft: '#F2EFFF',
  info: '#2F6BFF',
  infoSoft: '#ECF2FF',
  siCard: '#F4F1FF',
  siCardBorder: '#ECE7FF',
  glassFill: 'rgba(255,255,255,0.55)',
  glassFillStrong: 'rgba(255,255,255,0.78)',
  glassEdge: 'rgba(255,255,255,0.85)',
  siTint: 'rgba(237,233,255,0.62)',
  tabBar: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
  skeleton: '#F0F0F2',
};

export const dark: Palette = {
  bg: '#000000',
  surface: '#0F0F11',
  surfaceMuted: '#17171A',
  surfacePressed: '#1E1E22',
  border: '#1F1F23',
  divider: '#18181B',
  text: '#FFFFFF',
  textSecondary: '#9A9AA2',
  textTertiary: '#66666D',
  inverseText: '#0A0A0B',
  hero: '#141416',
  heroText: '#FFFFFF',
  heroTextSecondary: '#A1A1A8',
  heroButton: '#26262A',
  primary: '#FFFFFF',
  primaryText: '#0A0A0B',
  positive: '#22C55E',
  positiveSoft: '#0E2417',
  negative: '#F2555A',
  negativeSoft: '#2A1213',
  warning: '#F59E0B',
  warningSoft: '#2A1D08',
  loan: '#9B85FF',
  loanSoft: '#1D1830',
  info: '#5B8CFF',
  infoSoft: '#111C33',
  siCard: '#121117',
  siCardBorder: '#1F1C2B',
  glassFill: 'rgba(255,255,255,0.07)',
  glassFillStrong: 'rgba(255,255,255,0.11)',
  glassEdge: 'rgba(255,255,255,0.12)',
  siTint: 'rgba(76,60,140,0.30)',
  tabBar: '#000000',
  overlay: 'rgba(0,0,0,0.6)',
  skeleton: '#1A1A1D',
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Type scale. Large numerals for money (Blueprint §18). */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  amount: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  headline: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 33, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  section: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  bodySemibold: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  captionMedium: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  tab: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 13 },
} as const;

export type TypeVariant = keyof typeof type;

/** Motion (Blueprint §19): 150–300 ms for interaction transitions. */
export const motion = { fast: 150, base: 220, slow: 300 } as const;
