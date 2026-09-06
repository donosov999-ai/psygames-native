#!/usr/bin/env node
/**
 * СБОРКА КАРТЫ ГАЕК — `src/games/balls/nutAssets.generated.ts`.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ. Шапка собранного файла звала
 * `node scripts/build-nut-styles.mjs`, а скрипта не существовало (замер
 * 06.09.2026: карта гаек была написана руками, а шапка обещала сборку). Такая
 * шапка хуже отсутствия: следующий заход правит «сгенерированный» файл руками,
 * веря, что перезапись его вернёт, — и однажды теряет правку.
 *
 * ⚠️ ЦВЕТА НЕ ЗАДАЮТСЯ ЗДЕСЬ, А ЧИТАЮТСЯ С ДИСКА. Иначе список в скрипте и
 * набор файлов разъедутся молча: пропавшая картинка станет `require` в никуда,
 * и падение вылезет уже в приложении.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NUTS = join(ROOT, 'assets', 'images', 'games', 'nuts');
const OUT = join(ROOT, 'src', 'games', 'balls', 'nutAssets.generated.ts');

const цвета = readdirSync(NUTS)
  .filter((f) => /^nut-[a-z]+\.webp$/.test(f))
  .map((f) => f.replace(/^nut-|\.webp$/g, ''))
  .sort();

if (цвета.length === 0) throw new Error(`гаек не найдено в ${NUTS}`);

/**
 * ⚠️ НАБОР ЦВЕТОВ ОБЯЗАН СОВПАДАТЬ С ШАРИКАМИ. Обе игры берут ближайший цвет
 * через `nearestPieceColor`; разойдутся наборы — один и тот же цвет уровня
 * сопоставится разным картинкам, и гайка перестанет отвечать своему слою.
 */
const шарики = readdirSync(join(ROOT, 'assets', 'images', 'games', 'balls'))
  .filter((f) => /\.webp$/.test(f))
  .map((f) => f.replace(/\.webp$/, '').split('-').pop())
  .filter(Boolean);
const нет = цвета.filter((c) => !шарики.includes(c));
if (нет.length) throw new Error(`у шариков нет цветов: ${нет.join(', ')} — сопоставление разъедется`);

const строки = цвета.map((c) => `  ${c}: require('@/assets/images/games/nuts/nut-${c}.webp'),`).join('\n');

writeFileSync(OUT, `/* psygames-balls-nut-assets · VER 1 · 06.09.2026 */
/**
 * СОБРАНО СКРИПТОМ — руками не править: node scripts/build-nut-styles.mjs
 *
 * ${цвета.length} гаек нарисованы листом 5×2 (Nano Banana, ровный серый фон) и
 * вырезаны скиллом \`bg-cutout\` методом заливки от края.
 *
 * ⚠️ ЛИСТ ПЕРЕРИСОВАН ВТОРОЙ РАЗ, И ВОТ ПОЧЕМУ. Первый нёс мягкую падающую
 * тень: заливка от края её не берёт (тень темнее фона), а снятие тени
 * \`--strip-offset-shadow\` объедало нижнюю кромку самой гайки. Дешевле оказалось
 * попросить рисовать БЕЗ теней, чем чинить матту — в промпте это отдельным
 * красным пунктом, иначе модель добавляет контактное пятно сама.
 *
 * ⚠️ И ВТОРАЯ ГРАБЛЯ, ТОЖЕ ИЗ ПЕРВОГО ЛИСТА: у мятной и белой гаек цвет близок к
 * серому фону, и заливка с допуском 34 съедала им низ (39% площади против 47% у
 * остальных). Скилл с тем же методом справился — у него допуск считается от
 * самого изображения, а не задан числом.
 *
 * Цвета совпадают с \`BALL_COLORS\` намеренно и проверяются при сборке: обе игры
 * берут ближайший цвет через \`nearestPieceColor\`, и разные наборы дали бы
 * разное сопоставление.
 */
export const NUT_COLORS = ${JSON.stringify(цвета)} as const;
export type NutColor = (typeof NUT_COLORS)[number];

export const NUT_IMG: Record<NutColor, any> = {
${строки}
};
`, 'utf8');

console.log(`гайки: ${цвета.length} цветов → ${OUT}`);
