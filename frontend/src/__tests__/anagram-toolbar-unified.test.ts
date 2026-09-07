/**
 * НИЖНИЕ ТУЛБАРЫ ВСЕХ РЕЖИМОВ АНАГРАММ — ОДНОЙ ГЕОМЕТРИИ.
 *
 * 📍 ПРОСЬБА ДЕНИСА 07.09.2026: «нижние тулбары с кнопками примерно к одной
 * геометрии и виду, пляшет всё». Повод — «Зарядка», которая мешает разные игры
 * подряд: скачущий интерфейс между ними раздражает сильнее, чем неидеальный в
 * каждой по отдельности.
 *
 * 🔴 ЗАМЕР ДО, живьём на 375×812: высоты кнопок 44, 48, 53 и 66 в одном разделе.
 * В коде — ЧЕТЫРЕ отдельных определения одного и того же стиля:
 *   AllWordsGame   — minHeight 44, minWidth 110, radius 12, border 1, padH 18;
 *   CrosswordGame  — то же, скопированное отдельно;
 *   WordSquareGame — minHeight 44, minWidth 140 (шире прочих), radius 12;
 *   экран классики — minHeight 48, radius 16, border 1.5, padH 24.
 *
 * ЗАМЕР ПОСЛЕ, там же: у всех трёх режимов высота кнопок ровно 48; полосы
 * помещаются в экран (кроссворд 54…321, «все слова» 46…329, квадрат 121…254).
 *
 * ⚠️ ВЫСОТА 48, А НЕ 44, И ЭТО ЗАМЕР: 48 — порог Material и то же число, которым
 * меряет поле общий аудит `scripts/tap-target-audit.mjs` (второй проход, порог
 * 48×48). 44 — нижняя граница Apple; она проходит ревью, но у нас уже 64
 * элемента долга по мелким целям, и добавлять к ним нечего.
 */
import { StyleSheet } from 'react-native';
import { стилиРежима, ВЫСОТА_КНОПКИ } from '@/src/games/anagrams/modeStyles';

declare const __dirname: string;
declare function require(id: string): { readFileSync: (p: string, e: string) => string };
const { readFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- путь к исходникам режимов
const { join } = require('path');
const ROOT = join(__dirname, '../..');
const читать = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const РЕЖИМЫ = [
  'src/games/anagrams/WordSquareGame.tsx',
  'src/games/anagrams/AllWordsGame.tsx',
  'src/games/anagrams/CrosswordGame.tsx',
] as const;

it('кнопка режимов ростом не ниже порога полевого аудита', () => {
  const к = StyleSheet.flatten(стилиРежима.кнопка) as Record<string, number>;
  expect(ВЫСОТА_КНОПКИ).toBe(48);
  expect(к.minHeight).toBe(ВЫСОТА_КНОПКИ);
});

it('ряд действий переносится и знает свою ширину', () => {
  const д = StyleSheet.flatten(стилиРежима.действия) as Record<string, string | number>;
  expect(д.flexWrap).toBe('wrap');
  expect(д.maxWidth).toBe('100%');
  const к = StyleSheet.flatten(стилиРежима.кнопка) as Record<string, number>;
  // Две кнопки в ряду обязаны влезать в самый узкий телефон, четыре — нет.
  expect(к.minWidth * 2 + Number(д.gap)) .toBeLessThanOrEqual(320);
  expect(к.minWidth * 4 + Number(д.gap) * 3).toBeGreaterThan(320);
});

/**
 * 🔴 ОПРЕДЕЛЕНИЕ ОДНО НА ТРИ РЕЖИМА. Три копии одного стиля расходятся молча и
 * по одной — в этом разделе я на такое наступал трижды за два дня (копия расчёта
 * лестницы, копия отбора банка, копия формулы времени). Здесь следим, чтобы
 * копия не завелась снова: свой `minHeight` у режима означает, что он отвязался.
 */
it('ни один режим не заводит собственную геометрию кнопки', () => {
  const плохо: string[] = [];
  for (const п of РЕЖИМЫ) {
    const код = читать(п);
    if (!/from '\.\/modeStyles'/.test(код)) плохо.push(`${п}: не берёт общий стиль`);
    if (/minHeight:\s*4[0-9]/.test(код)) плохо.push(`${п}: завёл свою высоту кнопки`);
  }
  expect(плохо).toEqual([]);
});
