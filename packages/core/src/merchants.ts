import type { CategoryId, TxnType } from './types';

export interface MerchantRule {
  key: string;
  name: string;
  /** Upper-case substrings matched against payee name, VPA and narration. */
  match: string[];
  categoryId: CategoryId;
  type?: TxnType;
}

/**
 * Known merchants. Order matters: the first match wins, so put specific names before generic ones.
 * This list is product data, not logic — extend it as categorisation coverage grows.
 */
export const MERCHANT_RULES: MerchantRule[] = [
  // Food
  { key: 'swiggy', name: 'Swiggy', match: ['SWIGGY', 'BUNDL TECHNOLOGIES'], categoryId: 'food' },
  { key: 'zomato', name: 'Zomato', match: ['ZOMATO'], categoryId: 'food' },
  { key: 'a2b', name: 'A2B Restaurant', match: ['A2B', 'ADYAR ANANDA BHAVAN'], categoryId: 'food' },
  { key: 'saravana-bhavan', name: 'Saravana Bhavan', match: ['SARAVANA BHAVAN', 'SARAVANAA BHAVAN'], categoryId: 'food' },
  { key: 'starbucks', name: 'Starbucks', match: ['STARBUCKS', 'TATA STARBUCKS'], categoryId: 'food' },
  { key: 'chai-point', name: 'Chai Point', match: ['CHAI POINT', 'MOUNTAIN TRAIL FOODS'], categoryId: 'food' },
  { key: 'dominos', name: "Domino's", match: ['DOMINOS', 'JUBILANT FOODWORKS'], categoryId: 'food' },
  // Groceries
  { key: 'blinkit', name: 'Blinkit', match: ['BLINKIT', 'GROFERS'], categoryId: 'groceries' },
  { key: 'zepto', name: 'Zepto', match: ['ZEPTO', 'KIRANAKART'], categoryId: 'groceries' },
  { key: 'bigbasket', name: 'BigBasket', match: ['BIGBASKET', 'BBNOW', 'SUPERMARKET GROCERY SUPPLIES'], categoryId: 'groceries' },
  { key: 'dmart', name: 'DMart', match: ['DMART', 'AVENUE SUPERMARTS'], categoryId: 'groceries' },
  // Subscriptions (before Amazon/Google so "AMAZON PRIME" and "YOUTUBE" match here)
  { key: 'netflix', name: 'Netflix', match: ['NETFLIX'], categoryId: 'subscriptions' },
  { key: 'spotify', name: 'Spotify', match: ['SPOTIFY'], categoryId: 'subscriptions' },
  { key: 'youtube-premium', name: 'YouTube Premium', match: ['YOUTUBE'], categoryId: 'subscriptions' },
  { key: 'google-one', name: 'Google One', match: ['GOOGLE ONE', 'GOOGLE STORAGE'], categoryId: 'subscriptions' },
  { key: 'amazon-prime', name: 'Amazon Prime', match: ['AMAZON PRIME', 'PRIME VIDEO'], categoryId: 'subscriptions' },
  { key: 'hotstar', name: 'JioHotstar', match: ['HOTSTAR', 'JIOSTAR'], categoryId: 'subscriptions' },
  // Shopping
  { key: 'amazon', name: 'Amazon', match: ['AMAZON'], categoryId: 'shopping' },
  { key: 'flipkart', name: 'Flipkart', match: ['FLIPKART'], categoryId: 'shopping' },
  { key: 'myntra', name: 'Myntra', match: ['MYNTRA'], categoryId: 'shopping' },
  { key: 'croma', name: 'Croma', match: ['CROMA', 'INFINITI RETAIL'], categoryId: 'shopping' },
  { key: 'ikea', name: 'IKEA', match: ['IKEA'], categoryId: 'shopping' },
  // Transport & fuel
  { key: 'uber', name: 'Uber', match: ['UBER'], categoryId: 'transport' },
  { key: 'ola', name: 'Ola', match: ['OLA CABS', 'ANI TECHNOLOGIES', 'OLACABS'], categoryId: 'transport' },
  { key: 'rapido', name: 'Rapido', match: ['RAPIDO', 'ROPPEN'], categoryId: 'transport' },
  { key: 'metro', name: 'Namma Metro', match: ['BMRCL', 'METRO RAIL'], categoryId: 'transport' },
  { key: 'hp-petrol', name: 'HP Petrol', match: ['HPCL', 'HP PAY', 'HINDUSTAN PETROLEUM'], categoryId: 'fuel' },
  { key: 'indian-oil', name: 'Indian Oil', match: ['IOCL', 'INDIAN OIL'], categoryId: 'fuel' },
  // Bills
  { key: 'jio', name: 'Jio Recharge', match: ['JIO', 'RELIANCE JIO'], categoryId: 'bills' },
  { key: 'airtel', name: 'Airtel', match: ['AIRTEL'], categoryId: 'bills' },
  { key: 'act-fibernet', name: 'ACT Fibernet', match: ['ACT FIBERNET', 'ATRIA CONVERGENCE'], categoryId: 'bills' },
  { key: 'bescom', name: 'BESCOM Electricity', match: ['BESCOM'], categoryId: 'bills' },
  { key: 'tneb', name: 'TNEB Electricity', match: ['TNEB', 'TANGEDCO'], categoryId: 'bills' },
  // Entertainment & health
  { key: 'bookmyshow', name: 'BookMyShow', match: ['BOOKMYSHOW', 'BIGTREE ENTERTAINMENT'], categoryId: 'entertainment' },
  { key: 'pvr', name: 'PVR INOX', match: ['PVR'], categoryId: 'entertainment' },
  { key: 'apollo-pharmacy', name: 'Apollo Pharmacy', match: ['APOLLO PHARMACY', 'APOLLO PHARM'], categoryId: 'health' },
  { key: 'pharmeasy', name: 'PharmEasy', match: ['PHARMEASY'], categoryId: 'health' },
  { key: 'cult-fit', name: 'cult.fit', match: ['CULTFIT', 'CULT.FIT', 'CUREFIT'], categoryId: 'health' },
  // Travel
  { key: 'makemytrip', name: 'MakeMyTrip', match: ['MAKEMYTRIP'], categoryId: 'travel' },
  { key: 'irctc', name: 'IRCTC', match: ['IRCTC'], categoryId: 'travel' },
  { key: 'indigo', name: 'IndiGo', match: ['INDIGO', 'INTERGLOBE AVIATION'], categoryId: 'travel' },
  // Insurance
  { key: 'lic', name: 'LIC', match: ['LIFE INSURANCE CORP', 'LICI'], categoryId: 'insurance' },
  { key: 'hdfc-life', name: 'HDFC Life', match: ['HDFC LIFE', 'HDFCLIFE'], categoryId: 'insurance' },
  { key: 'star-health', name: 'Star Health', match: ['STAR HEALTH'], categoryId: 'insurance' },
  // Investments (mutual fund / broker clearing)
  { key: 'mf-sip', name: 'Mutual Fund SIP', match: ['ICCL', 'INDIAN CLEARING CORP', 'BSE LIMITED', 'NSE CLEARING', 'MF UTILITIES', 'CAMS', 'KFINTECH'], categoryId: 'investments', type: 'INVESTMENT' },
  { key: 'zerodha', name: 'Zerodha', match: ['ZERODHA'], categoryId: 'investments', type: 'INVESTMENT' },
  { key: 'groww', name: 'Groww', match: ['GROWW', 'NEXTBILLION'], categoryId: 'investments', type: 'INVESTMENT' },
];

export function findMerchant(haystack: string): MerchantRule | null {
  const upper = haystack.toUpperCase();
  for (const rule of MERCHANT_RULES) {
    for (const m of rule.match) {
      if (containsWord(upper, m)) return rule;
    }
  }
  return null;
}

/** Substring match that respects word starts so "JIO" doesn't match "RAJIOV". */
function containsWord(upper: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = upper.indexOf(needle, from);
    if (i < 0) return false;
    const before = i === 0 ? ' ' : upper[i - 1]!;
    if (!/[A-Z0-9]/.test(before)) return true;
    from = i + 1;
  }
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}
