import type { ImageSourcePropType } from 'react-native';

/**
 * 3D icons from Microsoft Fluent Emoji (https://github.com/microsoft/fluentui-emoji, MIT licence).
 * Keyed by the emoji the API sends, so categories and goals pick them up automatically.
 * Anything not listed falls back to the plain emoji.
 */
const ICONS: Record<string, ImageSourcePropType> = {
  '🍲': require('../../assets/icons3d/food.png'),
  '🛒': require('../../assets/icons3d/groceries.png'),
  '🛍': require('../../assets/icons3d/shopping.png'),
  '🚕': require('../../assets/icons3d/transport.png'),
  '⛽': require('../../assets/icons3d/fuel.png'),
  '🧾': require('../../assets/icons3d/bills.png'),
  '🏠': require('../../assets/icons3d/rent.png'),
  '🔁': require('../../assets/icons3d/subscriptions.png'),
  '🎬': require('../../assets/icons3d/entertainment.png'),
  '💊': require('../../assets/icons3d/health.png'),
  '👪': require('../../assets/icons3d/family.png'),
  '🙋': require('../../assets/icons3d/people.png'),
  '✈': require('../../assets/icons3d/travel.png'),
  '📚': require('../../assets/icons3d/education.png'),
  '🛡': require('../../assets/icons3d/insurance.png'),
  '💵': require('../../assets/icons3d/cash.png'),
  '💇': require('../../assets/icons3d/personal.png'),
  '🏦': require('../../assets/icons3d/fees.png'),
  '💼': require('../../assets/icons3d/salary.png'),
  '📈': require('../../assets/icons3d/interest.png'),
  '🎁': require('../../assets/icons3d/cashback.png'),
  '💰': require('../../assets/icons3d/other_income.png'),
  '📊': require('../../assets/icons3d/investments.png'),
  '🤝': require('../../assets/icons3d/loans.png'),
  '🔄': require('../../assets/icons3d/transfers.png'),
  '↩': require('../../assets/icons3d/refunds.png'),
  '🧩': require('../../assets/icons3d/other.png'),
  '🛟': require('../../assets/icons3d/lifebuoy.png'),
  '💻': require('../../assets/icons3d/laptop.png'),
  '🎓': require('../../assets/icons3d/graduation.png'),
  '🚗': require('../../assets/icons3d/car.png'),
  '💍': require('../../assets/icons3d/ring.png'),
  '🎯': require('../../assets/icons3d/target.png'),
  '✨': require('../../assets/icons3d/sparkles.png'),
  '💡': require('../../assets/icons3d/lightbulb.png'),
  '🔔': require('../../assets/icons3d/bell.png'),
  '🔒': require('../../assets/icons3d/lock.png'),
};

/** 3D icon for an emoji, ignoring the emoji presentation selector (U+FE0F). */
export function icon3d(emoji: string): ImageSourcePropType | null {
  return ICONS[emoji.replace(/️/g, '')] ?? null;
}
