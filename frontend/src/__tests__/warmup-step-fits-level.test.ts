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

  it('лесенка уровней осталась пологой: L1 не даёт больше шести слов', () => {
    const s = src('app/games/mnemonics.tsx');
    const m = /itemCount: Math\.min\((\d+), (\d+) \+ Math\.max\(1, level\)\)/.exec(s);
    expect(m).not.toBeNull();
    const [, ceil, base] = m!.map(Number) as unknown as number[];
    expect(Number(base) + 1).toBeLessThanOrEqual(6);   // L1
    expect(Number(ceil)).toBeLessThanOrEqual(15);      // потолок лесенки
  });
});
