/* psygames-balls-assets · VER 1 · 05.09.2026 */
/**
 * СОБРАНО СКРИПТОМ — руками не править: node scripts/build-ball-styles.mjs
 *
 * 9 фактур × 10 цветов. Лист нарисован Nano Banana
 * (10×9 на нейтральном сером), нарезан с РАЗНЫМ методом по рядам: у стекла и
 * мыльного пузыря мягкий ключ по расстоянию до фона (они обязаны просвечивать),
 * у остальных — заливка от края (хромовый шар сам серый, «по цвету» его бы съело).
 */
export const BALL_STYLES = ["bubble","chrome","fluffy","glass","glossy","jelly","matte","neon","stone"] as const;
export const BALL_COLORS = ["blue","cyan","green","mint","orange","pink","purple","red","white","yellow"] as const;
export type BallStyle = (typeof BALL_STYLES)[number];
export type BallColor = (typeof BALL_COLORS)[number];

export const BALL_IMG: Record<BallStyle, Record<BallColor, any>> = {
  bubble: {
    blue: require('@/assets/images/games/balls/bubble-blue.webp'),
    cyan: require('@/assets/images/games/balls/bubble-cyan.webp'),
    green: require('@/assets/images/games/balls/bubble-green.webp'),
    mint: require('@/assets/images/games/balls/bubble-mint.webp'),
    orange: require('@/assets/images/games/balls/bubble-orange.webp'),
    pink: require('@/assets/images/games/balls/bubble-pink.webp'),
    purple: require('@/assets/images/games/balls/bubble-purple.webp'),
    red: require('@/assets/images/games/balls/bubble-red.webp'),
    white: require('@/assets/images/games/balls/bubble-white.webp'),
    yellow: require('@/assets/images/games/balls/bubble-yellow.webp'),
  },
  chrome: {
    blue: require('@/assets/images/games/balls/chrome-blue.webp'),
    cyan: require('@/assets/images/games/balls/chrome-cyan.webp'),
    green: require('@/assets/images/games/balls/chrome-green.webp'),
    mint: require('@/assets/images/games/balls/chrome-mint.webp'),
    orange: require('@/assets/images/games/balls/chrome-orange.webp'),
    pink: require('@/assets/images/games/balls/chrome-pink.webp'),
    purple: require('@/assets/images/games/balls/chrome-purple.webp'),
    red: require('@/assets/images/games/balls/chrome-red.webp'),
    white: require('@/assets/images/games/balls/chrome-white.webp'),
    yellow: require('@/assets/images/games/balls/chrome-yellow.webp'),
  },
  fluffy: {
    blue: require('@/assets/images/games/balls/fluffy-blue.webp'),
    cyan: require('@/assets/images/games/balls/fluffy-cyan.webp'),
    green: require('@/assets/images/games/balls/fluffy-green.webp'),
    mint: require('@/assets/images/games/balls/fluffy-mint.webp'),
    orange: require('@/assets/images/games/balls/fluffy-orange.webp'),
    pink: require('@/assets/images/games/balls/fluffy-pink.webp'),
    purple: require('@/assets/images/games/balls/fluffy-purple.webp'),
    red: require('@/assets/images/games/balls/fluffy-red.webp'),
    white: require('@/assets/images/games/balls/fluffy-white.webp'),
    yellow: require('@/assets/images/games/balls/fluffy-yellow.webp'),
  },
  glass: {
    blue: require('@/assets/images/games/balls/glass-blue.webp'),
    cyan: require('@/assets/images/games/balls/glass-cyan.webp'),
    green: require('@/assets/images/games/balls/glass-green.webp'),
    mint: require('@/assets/images/games/balls/glass-mint.webp'),
    orange: require('@/assets/images/games/balls/glass-orange.webp'),
    pink: require('@/assets/images/games/balls/glass-pink.webp'),
    purple: require('@/assets/images/games/balls/glass-purple.webp'),
    red: require('@/assets/images/games/balls/glass-red.webp'),
    white: require('@/assets/images/games/balls/glass-white.webp'),
    yellow: require('@/assets/images/games/balls/glass-yellow.webp'),
  },
  glossy: {
    blue: require('@/assets/images/games/balls/glossy-blue.webp'),
    cyan: require('@/assets/images/games/balls/glossy-cyan.webp'),
    green: require('@/assets/images/games/balls/glossy-green.webp'),
    mint: require('@/assets/images/games/balls/glossy-mint.webp'),
    orange: require('@/assets/images/games/balls/glossy-orange.webp'),
    pink: require('@/assets/images/games/balls/glossy-pink.webp'),
    purple: require('@/assets/images/games/balls/glossy-purple.webp'),
    red: require('@/assets/images/games/balls/glossy-red.webp'),
    white: require('@/assets/images/games/balls/glossy-white.webp'),
    yellow: require('@/assets/images/games/balls/glossy-yellow.webp'),
  },
  jelly: {
    blue: require('@/assets/images/games/balls/jelly-blue.webp'),
    cyan: require('@/assets/images/games/balls/jelly-cyan.webp'),
    green: require('@/assets/images/games/balls/jelly-green.webp'),
    mint: require('@/assets/images/games/balls/jelly-mint.webp'),
    orange: require('@/assets/images/games/balls/jelly-orange.webp'),
    pink: require('@/assets/images/games/balls/jelly-pink.webp'),
    purple: require('@/assets/images/games/balls/jelly-purple.webp'),
    red: require('@/assets/images/games/balls/jelly-red.webp'),
    white: require('@/assets/images/games/balls/jelly-white.webp'),
    yellow: require('@/assets/images/games/balls/jelly-yellow.webp'),
  },
  matte: {
    blue: require('@/assets/images/games/balls/matte-blue.webp'),
    cyan: require('@/assets/images/games/balls/matte-cyan.webp'),
    green: require('@/assets/images/games/balls/matte-green.webp'),
    mint: require('@/assets/images/games/balls/matte-mint.webp'),
    orange: require('@/assets/images/games/balls/matte-orange.webp'),
    pink: require('@/assets/images/games/balls/matte-pink.webp'),
    purple: require('@/assets/images/games/balls/matte-purple.webp'),
    red: require('@/assets/images/games/balls/matte-red.webp'),
    white: require('@/assets/images/games/balls/matte-white.webp'),
    yellow: require('@/assets/images/games/balls/matte-yellow.webp'),
  },
  neon: {
    blue: require('@/assets/images/games/balls/neon-blue.webp'),
    cyan: require('@/assets/images/games/balls/neon-cyan.webp'),
    green: require('@/assets/images/games/balls/neon-green.webp'),
    mint: require('@/assets/images/games/balls/neon-mint.webp'),
    orange: require('@/assets/images/games/balls/neon-orange.webp'),
    pink: require('@/assets/images/games/balls/neon-pink.webp'),
    purple: require('@/assets/images/games/balls/neon-purple.webp'),
    red: require('@/assets/images/games/balls/neon-red.webp'),
    white: require('@/assets/images/games/balls/neon-white.webp'),
    yellow: require('@/assets/images/games/balls/neon-yellow.webp'),
  },
  stone: {
    blue: require('@/assets/images/games/balls/stone-blue.webp'),
    cyan: require('@/assets/images/games/balls/stone-cyan.webp'),
    green: require('@/assets/images/games/balls/stone-green.webp'),
    mint: require('@/assets/images/games/balls/stone-mint.webp'),
    orange: require('@/assets/images/games/balls/stone-orange.webp'),
    pink: require('@/assets/images/games/balls/stone-pink.webp'),
    purple: require('@/assets/images/games/balls/stone-purple.webp'),
    red: require('@/assets/images/games/balls/stone-red.webp'),
    white: require('@/assets/images/games/balls/stone-white.webp'),
    yellow: require('@/assets/images/games/balls/stone-yellow.webp'),
  },
};
