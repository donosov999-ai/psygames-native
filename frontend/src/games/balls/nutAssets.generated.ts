/* psygames-nut-assets · VER 1 · 06.09.2026 */
/**
 * СОБРАНО СКРИПТОМ — руками не править: node scripts/build-nut-styles.mjs
 *
 * Десять гаек нарисованы листом 5×2 (Nano Banana, ровный серый фон) и вырезаны
 * скиллом `bg-cutout` методом заливки от края.
 *
 * ⚠️ ЛИСТ ПЕРЕРИСОВАН ВТОРОЙ РАЗ, И ВОТ ПОЧЕМУ. Первый нёс мягкую падающую
 * тень: заливка от края её не берёт (тень темнее фона), а снятие тени
 * `--strip-offset-shadow` объедало нижнюю кромку самой гайки. Дешевле оказалось
 * попросить рисовать БЕЗ теней, чем чинить матту — в промпте это отдельным
 * красным пунктом, иначе модель добавляет контактное пятно сама.
 *
 * ⚠️ И ВТОРАЯ ГРАБЛЯ, ТОЖЕ ИЗ ПЕРВОГО ЛИСТА: у мятной и белой гаек цвет близок к
 * серому фону, и заливка с допуском 34 съедала им низ (39% площади против 47% у
 * остальных). Скилл с тем же методом справился — у него допуск считается от
 * самого изображения, а не задан числом.
 *
 * Цвета совпадают с `BALL_COLORS` намеренно: обе игры берут ближайший цвет через
 * `nearestPieceColor`, и разные наборы цветов дали бы разное сопоставление.
 */
export const NUT_COLORS = ['blue', 'cyan', 'green', 'mint', 'orange', 'pink', 'purple', 'red', 'white', 'yellow'] as const;
export type NutColor = (typeof NUT_COLORS)[number];

export const NUT_IMG: Record<NutColor, any> = {
  blue: require('@/assets/images/games/nuts/nut-blue.webp'),
  cyan: require('@/assets/images/games/nuts/nut-cyan.webp'),
  green: require('@/assets/images/games/nuts/nut-green.webp'),
  mint: require('@/assets/images/games/nuts/nut-mint.webp'),
  orange: require('@/assets/images/games/nuts/nut-orange.webp'),
  pink: require('@/assets/images/games/nuts/nut-pink.webp'),
  purple: require('@/assets/images/games/nuts/nut-purple.webp'),
  red: require('@/assets/images/games/nuts/nut-red.webp'),
  white: require('@/assets/images/games/nuts/nut-white.webp'),
  yellow: require('@/assets/images/games/nuts/nut-yellow.webp'),
};
