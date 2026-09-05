#!/usr/bin/env node
/**
 * Собрать таблицу шаров из assets/images/games/balls.
 *
 * ЗАЧЕМ. Денис 05.09.2026: «трекер объектов и ещё куча упражнений с плохими
 * шариками и кубиками — отрисуй сеткой их, разные по стилю, чтобы заменить и
 * дать выбор; не просто разные цвета, а разные текстуры: стекло, пушистые, как
 * капля воды». Нарисовано 9 фактур × 10 цветов; 90 строк `require` руками не
 * поддерживают, а Metro требует литеральный путь.
 *
 * ЗАПУСК: node scripts/build-ball-styles.mjs
 * ПИШЕТ:  src/games/balls/ballAssets.generated.ts
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const ШАРЫ = join(FRONT, 'assets/images/games/balls');

const по = new Map();
for (const f of readdirSync(ШАРЫ)) {
  const m = /^([a-z]+)-([a-z]+)\.webp$/.exec(f);
  if (!m) throw new Error(`лишний файл в папке шаров: ${f} (ждём <стиль>-<цвет>.webp)`);
  const [, стиль, цвет] = m;
  if (!по.has(стиль)) по.set(стиль, new Map());
  по.get(стиль).set(цвет, f);
}

const стили = [...по.keys()].sort();
const цвета = [...new Set([...по.values()].flatMap((m) => [...m.keys()]))].sort();

// Каждый стиль обязан иметь ВСЕ цвета: в трекере объекты должны быть
// неразличимы, и дыра в наборе означала бы, что один объект другого цвета.
for (const с of стили) {
  const нет = цвета.filter((цв) => !по.get(с).has(цв));
  if (нет.length) throw new Error(`${с}: нет цветов ${нет.join(', ')}`);
}

const тело = стили.map((с) => {
  const строки = цвета.map((цв) =>
    `    ${цв}: require('@/assets/images/games/balls/${по.get(с).get(цв)}'),`).join('\n');
  return `  ${с}: {\n${строки}\n  },`;
}).join('\n');

const текст = `/* psygames-balls-assets · VER 1 · 05.09.2026 */
/**
 * СОБРАНО СКРИПТОМ — руками не править: node scripts/build-ball-styles.mjs
 *
 * ${стили.length} фактур × ${цвета.length} цветов. Лист нарисован Nano Banana
 * (10×9 на нейтральном сером), нарезан с РАЗНЫМ методом по рядам: у стекла и
 * мыльного пузыря мягкий ключ по расстоянию до фона (они обязаны просвечивать),
 * у остальных — заливка от края (хромовый шар сам серый, «по цвету» его бы съело).
 */
export const BALL_STYLES = ${JSON.stringify(стили)} as const;
export const BALL_COLORS = ${JSON.stringify(цвета)} as const;
export type BallStyle = (typeof BALL_STYLES)[number];
export type BallColor = (typeof BALL_COLORS)[number];

export const BALL_IMG: Record<BallStyle, Record<BallColor, any>> = {
${тело}
};
`;

mkdirSync(join(FRONT, 'src/games/balls'), { recursive: true });
const куда = join(FRONT, 'src/games/balls/ballAssets.generated.ts');
writeFileSync(куда, текст);
console.log(`записано: ${куда}`);
console.log(`стилей ${стили.length}: ${стили.join(', ')}`);
console.log(`цветов ${цвета.length}: ${цвета.join(', ')} — всего ${стили.length * цвета.length} картинок`);
