#!/usr/bin/env node
/**
 * Собрать таблицу кадров облика `cat` из того, что лежит в assets.
 *
 * ЗАЧЕМ СКРИПТ, А НЕ РУКАМИ. У кота стало 32 состояния по 7 фаз плюс 8 шкал
 * внешности по 7 ступеней — 280 строк `require`. Metro требует, чтобы путь в
 * `require` был литералом: динамически собрать его нельзя, а руками такой список
 * не поддерживают — один пропущенный кадр даёт чёрный квадрат в игре и молчание
 * в сборке.
 *
 * ⚠️ ПОРЯДОК КАДРОВ = ПОРЯДОК ФАЗ. Файлы называются `<состояние><номер>.webp`,
 * номер — фаза цикла. Сортировка ЧИСЛОВАЯ, а не строковая: при строковой `10`
 * встаёт между `1` и `2`, и анимация дёргается. Пока фаз семь это незаметно, но
 * ловушка взводится молча, поэтому сортируем числом сразу.
 *
 * ЗАПУСК: node scripts/build-pet-frames.mjs
 * ПИШЕТ:  src/components/pet/catFrames.generated.ts
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const CAT = join(FRONT, 'assets/images/pet/cat');

/** Ряды листа заботы — они не анимация, а шкалы; лежат отдельной таблицей. */
const ЗАБОТА = 'care_';

function собрать() {
  const по = new Map();
  for (const f of readdirSync(CAT)) {
    const m = /^([a-z_]+?)(\d+)\.webp$/.exec(f);
    if (!m) continue;
    const [, имя, n] = m;
    if (!по.has(имя)) по.set(имя, []);
    по.get(имя).push(Number(n));
  }
  for (const [имя, ns] of по) {
    ns.sort((a, b) => a - b);
    for (let i = 0; i < ns.length; i++) {
      if (ns[i] !== i) throw new Error(`${имя}: дыра в нумерации — нет ${имя}${i}.webp`);
    }
  }
  return по;
}

const по = собрать();
const состояния = [...по.keys()].filter((k) => !k.startsWith(ЗАБОТА)).sort();
const шкалы = [...по.keys()].filter((k) => k.startsWith(ЗАБОТА)).sort();

const строки = (имена, отступ) => имена.map((имя) => {
  const кадры = по.get(имя).map((n) =>
    `${отступ}  require('@/assets/images/pet/cat/${имя}${n}.webp'),`).join('\n');
  return `${отступ}${имя.startsWith(ЗАБОТА) ? имя.slice(ЗАБОТА.length) : имя}: [\n${кадры}\n${отступ}],`;
}).join('\n');

const текст = `/**
 * СОБРАНО СКРИПТОМ — руками не править: node scripts/build-pet-frames.mjs
 *
 * Кадры облика «cat» (Синапс 2). Листы 7×8 лежат в
 * ~/dev/psygames-astro/_sync/synapse-v2/cat, нарезка — build_pack.py там же.
 *
 * CAT_FRAMES — состояния анимации: ряд = цикл, ${по.get(состояния[0])?.length ?? 0} фаз, последняя
 * смыкается с первой.
 * CAT_LOOK — шкалы внешности: ряд НЕ анимация, из него берут ОДИН кадр по
 * состоянию заботы (см. src/services/petLook.ts).
 */
export const CAT_FRAMES: Record<string, any[]> = {
${строки(состояния, '  ')}
};

export const CAT_LOOK: Record<string, any[]> = {
${строки(шкалы, '  ')}
};
`;

const куда = join(FRONT, 'src/components/pet/catFrames.generated.ts');
writeFileSync(куда, текст);
console.log(`записано: ${куда}`);
console.log(`состояний ${состояния.length} (${состояния.map((s) => `${s}×${по.get(s).length}`).join(', ')})`);
console.log(`шкал внешности ${шкалы.length}, кадров всего ${[...по.values()].reduce((a, b) => a + b.length, 0)}`);
