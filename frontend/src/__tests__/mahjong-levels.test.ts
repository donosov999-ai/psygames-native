/**
 * Маджонг обязан усложняться ТЕМ, что делает его сложным, и перетасовка обязана
 * быть ресурсом.
 *
 * ЗАЧЕМ. Отзыв тестера: «А можно чуть сложнее?))». Разбор нашёл две дыры:
 *
 * 1. Кнопка «Перемешать» была бесконечной. Любая раскладка пробивалась тасованием
 *    до удобной пары — то есть сложность раскладки не значила ничего.
 * 2. Выше 15 уровня росло только количество пар при тех же трёх слоях. Больше
 *    плиток на том же числе слоёв — это ДОЛЬШЕ, а не сложнее: доля заблокированных
 *    плиток не меняется, а именно она и есть трудность маджонга.
 *
 * ⚠️ ТЕСТ СТЕРЕЖЁТ ИМЕННО ЭТО, а не «числа побольше». Легко «усложнить» игру,
 * навалив пар: счётчик вырастет, ощущение — нет.
 */
import { mahjongLevel, canShuffle, shufflesLeft } from '../services/mahjongLevels';

describe('уровни маджонга', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(mahjongLevel(1).pairs).toBeGreaterThan(0);
  });

  it('слои растут вверх — не только количество плиток', () => {
    expect(mahjongLevel(3).layers).toBe(1);
    expect(mahjongLevel(8).layers).toBe(2);
    expect(mahjongLevel(13).layers).toBe(3);
    expect(mahjongLevel(18).layers).toBe(4);   // раньше здесь оставалось 3
    expect(mahjongLevel(25).layers).toBe(5);
  });

  it('пары не проседают ни на одном стыке диапазонов', () => {
    const drops: string[] = [];
    for (let n = 2; n <= 40; n++) {
      const prev = mahjongLevel(n - 1).pairs, cur = mahjongLevel(n).pairs;
      if (cur <= prev) drops.push(`уровень ${n}: ${prev} → ${cur}`);
    }
    expect(drops).toEqual([]);
  });

  it('первые пять уровней — перетасовка без лимита (человек учит правило)', () => {
    for (let n = 1; n <= 5; n++) expect(mahjongLevel(n).shuffles).toBe(-1);
    expect(canShuffle(mahjongLevel(1).shuffles, 99)).toBe(true);
    expect(shufflesLeft(mahjongLevel(1).shuffles, 99)).toBe(-1);
  });

  it('дальше перетасовка — ресурс, и он ужимается', () => {
    expect(mahjongLevel(6).shuffles).toBe(3);
    expect(mahjongLevel(12).shuffles).toBe(2);
    expect(mahjongLevel(20).shuffles).toBe(1);
    // и он действительно кончается
    expect(canShuffle(3, 2)).toBe(true);
    expect(canShuffle(3, 3)).toBe(false);
    expect(shufflesLeft(3, 3)).toBe(0);
    expect(shufflesLeft(3, 5)).toBe(0);   // ушли в минус — показываем ноль, не «-2»
  });

  it('лимит нигде не растёт с уровнем — иначе выше становится ЛЕГЧЕ', () => {
    const grows: string[] = [];
    for (let n = 7; n <= 40; n++) {
      const prev = mahjongLevel(n - 1).shuffles, cur = mahjongLevel(n).shuffles;
      if (prev >= 0 && cur > prev) grows.push(`уровень ${n}: ${prev} → ${cur}`);
    }
    expect(grows).toEqual([]);
  });

  it('мусор на входе не роняет', () => {
    expect(mahjongLevel(0).layers).toBe(1);
    expect(mahjongLevel(-5).layers).toBe(1);
    expect(mahjongLevel(NaN).layers).toBe(1);
  });
});

/**
 * Текст правила обязан совпадать с реальным числом слоёв.
 *
 * ЗАЧЕМ. Поймано глазами на 18 уровне: игра выкладывала ЧЕТЫРЕ слоя, а модалка
 * правила объясняла три — «Три слоя» стояло без верхней границы. Это ровно та
 * молчаливая механика, ради которой правила-по-уровням и заведены: человеку
 * объясняют не то, во что он играет.
 *
 * Сверяем ключи правил (layersN) с диапазонами уровней из mahjongLevels.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

describe('правила маджонга не расходятся со слоями', () => {
  const src: string = readFileSync(join(__dirname, '../../app/games/mahjong.tsx'), 'utf8');

  it('есть что проверять — правила объявлены', () => {
    expect(src).toContain('MAHJONG_RULES');
    expect(/key: 'layers\d'/.test(src)).toBe(true);
  });

  it('каждое правило про слои описывает то число слоёв, что и выкладывается', () => {
    const re = /key:\s*'layers(\d)',\s*fromLevel:\s*(\d+)(?:,\s*toLevel:\s*(\d+))?/g;
    const wrong: string[] = [];
    let m: RegExpExecArray | null;
    let found = 0;
    while ((m = re.exec(src))) {
      found++;
      const layers = Number(m[1]), from = Number(m[2]), to = m[3] ? Number(m[3]) : 40;
      for (let L = from; L <= to; L++) {
        const real = mahjongLevel(L).layers;
        if (real !== layers) { wrong.push(`правило layers${layers} на уровне ${L}, а слоёв ${real}`); break; }
      }
    }
    expect(found).toBeGreaterThanOrEqual(3);
    expect(wrong).toEqual([]);
  });

  it('каждая ступень слоёв объяснена — молчаливых механик нет', () => {
    const explained = new Set<number>();
    const re = /key:\s*'layers(\d)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) explained.add(Number(m[1]));
    const needed = new Set<number>();
    for (let L = 2; L <= 30; L++) if (mahjongLevel(L).layers > 1) needed.add(mahjongLevel(L).layers);
    const missing = [...needed].filter((n) => !explained.has(n));
    expect(missing).toEqual([]);
  });
});
