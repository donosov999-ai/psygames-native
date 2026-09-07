/**
 * ПРОГРАММА НЕ ВЫДАЁТ ЗАДАНИЕ ВЫШЕ ДОСТИГНУТОГО УРОВНЯ.
 *
 * 🔴 ЗАЧЕМ. Денис 30.08.2026 из зарядки: «запускается на большом уровне, который
 * ещё не освоен — сразу для запоминания 20 слов». Так и было: в программах
 * профилей у мнемоники стоит `itemCount: 20`, и пресет применялся как есть,
 * мимо лесенки уровней (L1 = 5 слов, L11 = 15). Новичок получал стену вместо
 * упражнения — и «пропустить» при этом не работало (см. `alert-visible`).
 *
 * ⚠️ Проверяем ИСХОДНИК: собрать экран в jsdom и прогнать зарядку дороже, чем
 * вся правка. Зато ловится тот способ сломать, который реально случается —
 * «уберу ограничение, программа же знает лучше».
 */
declare const __dirname: string;
declare function require(m: string): any;

import { levelParams as mnemoParams } from '@/app/games/mnemonics';

const fs = require('fs');
const path = require('path');
const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('шаг программы по силам игроку', () => {
  it('есть что проверять: в программах профилей действительно стоят большие числа', () => {
    const profiles = src('src/constants/profiles.ts');
    // Двадцать слов мнемоники — то самое задание со скриншота.
    expect(/mnemonics[\s\S]{0,200}itemCount: 20/.test(profiles)).toBe(true);
  });

  it('🔴 мнемоника ограничивает пресет достигнутым уровнем', () => {
    const s = strip(src('app/games/mnemonics.tsx'));
    // Ограничение есть и опирается на лесенку уровней, а не на своё число.
    expect(/isPreset && lvl\.loaded/.test(s)).toBe(true);
    expect(/levelParams\(lvl\.level\)\.itemCount \+ 2/.test(s)).toBe(true);
    expect(/Math\.min\(ic, cap\)/.test(s)).toBe(true);
  });

  /**
   * ⚠️ ПОЧЕМУ ЭТА ПРОБА БОЛЬШЕ НЕ ЧИТАЕТ ИСХОДНИК. 07.09.2026 она покраснела на
   * ПЕРЕИМЕНОВАНИИ: искала `Math.max(1, level)`, а раздел «Память и слух» ввёл
   * промежуточную `const l = …` и стало `Math.max(1, l)`. Числа не менялись,
   * лестница осталась той же — гейт обвинил исправный код и остановил выпуск.
   * Теперь величины берутся ВЫЗОВОМ `levelParams`, а не разбором текста.
   */
  it('лесенка уровней осталась пологой: L1 не даёт больше шести слов', () => {
    // L1 — стена или упражнение. Пять-шесть слов новичок берёт, двадцать — нет.
    expect(mnemoParams(1).itemCount).toBeLessThanOrEqual(6);
    // Объём НЕ растёт бесконечно намеренно: список из двадцати слов не труднее,
    // а дольше — человек дробит его на куски, и меряется усидчивость.
    const counts = Array.from({ length: 30 }, (_, i) => mnemoParams(i + 1).itemCount);
    expect(Math.max(...counts)).toBeLessThanOrEqual(15);
    // …но монотонность не должна нарушаться: короче предыдущего быть не может.
    counts.forEach((c, i) => { if (i) expect(c).toBeGreaterThanOrEqual(counts[i - 1]); });
  });

  /**
   * 🔴 ПОТОЛОК ОБЪЁМА ОБЯЗАН БЫТЬ ОПЛАЧЕН ДРУГОЙ ОСЬЮ. Правило Дениса
   * 06.09.2026: «потолков нет нигде». Ограничение `itemCount` законно ровно
   * потому, что после него трудность растёт задержкой и помехой; убери их — и
   * потолок превратится в плато, а проба этого не заметит.
   */
  it('🔴 там, где объём встал, растёт другая ось — плато не образуется', () => {
    const rows = Array.from({ length: 15 }, (_, i) => mnemoParams(i + 1));
    const plateauFrom = rows.findIndex((r, i) => i > 0 && r.itemCount === rows[i - 1].itemCount);
    expect(plateauFrom).toBeGreaterThan(0);            // плато объёма и правда наступает
    const after = rows.slice(plateauFrom);
    const grows = (pick: (r: typeof rows[0]) => number) =>
      after.some((r, i) => i > 0 && pick(r) > pick(after[i - 1]));
    // Хоть одна из оставшихся осей обязана расти на этом участке.
    expect(grows((r) => r.gapMs) || grows((r) => r.mathTrials)).toBe(true);
  });
});
