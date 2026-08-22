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
import { mahjongLevel, canShuffle, shufflesLeft, FULL_SET_PAIRS } from '../services/mahjongLevels';

describe('уровни маджонга', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(mahjongLevel(1).pairs).toBeGreaterThan(0);
  });

  /**
   * 🔴 ПЛОСКИХ РАСКЛАДОК НЕ БЫВАЕТ. Второй уровень выдавал один слой и десять плиток
   * прямоугольником: ни одного перекрытия, то есть нет ровно того, из чего маджонг
   * состоит. Свободна там любая плитка, и «выбери свободную» превращается в «тапни
   * две одинаковые» — другая игра под тем же именем.
   */
  it('🔴 маджонг начинается с горки, а не с плоской выкладки', () => {
    for (let n = 1; n <= 40; n++) {
      expect(`ур.${n}: слоёв ${mahjongLevel(n).layers} ≥ 2`).toBe(`ур.${n}: слоёв ${Math.max(2, mahjongLevel(n).layers)} ≥ 2`);
    }
  });

  it('слои растут вверх — не только количество плиток', () => {
    expect(mahjongLevel(2).layers).toBe(2);
    expect(mahjongLevel(6).layers).toBe(3);
    expect(mahjongLevel(12).layers).toBe(4);
    expect(mahjongLevel(20).layers).toBe(5);
    expect(mahjongLevel(30).layers).toBe(5);
  });

  /**
   * Плотность — вторая половина того же: настоящий набор маджонга это 144 плитки,
   * то есть 72 пары. Игра не обязана начинать с полного набора, но и десятью
   * плитками маджонг не бывает.
   */
  it('🔴 плиток столько, что это маджонг, а не разминка', () => {
    expect(`первый уровень: пар ${mahjongLevel(1).pairs} ≥ 10`).toBe(`первый уровень: пар ${Math.max(10, mahjongLevel(1).pairs)} ≥ 10`);
    expect(`двадцатый: пар ${mahjongLevel(20).pairs} ≥ 60`).toBe(`двадцатый: пар ${Math.max(60, mahjongLevel(20).pairs)} ≥ 60`);
  });

  /**
   * ⚠️ РОСТ ДО НАБОРА, А НЕ БЕСКОНЕЧНО. Прежняя редакция требовала строгого роста на
   * всех уровнях подряд — то есть обязывала однажды выложить больше плиток, чем их
   * есть в маджонге. Потолок — классический набор в 144 плитки; после него сложность
   * несут слои и теснота. Просадка по-прежнему запрещена.
   */
  it('пары не проседают ни на одном стыке и растут до полного набора', () => {
    const drops: string[] = [];
    for (let n = 2; n <= 60; n++) {
      const prev = mahjongLevel(n - 1).pairs, cur = mahjongLevel(n).pairs;
      if (cur < prev) drops.push(`уровень ${n}: ${prev} → ${cur}`);
      if (cur > FULL_SET_PAIRS) drops.push(`уровень ${n}: ${cur} пар — больше классического набора`);
    }
    expect(drops).toEqual([]);
    // и до набора действительно доходим
    expect(mahjongLevel(40).pairs).toBe(FULL_SET_PAIRS);
    // а до этого растём на каждом уровне
    for (let n = 2; n <= 25; n++) {
      expect(`ур.${n}: ${mahjongLevel(n).pairs} > ${mahjongLevel(n - 1).pairs}`)
        .toBe(`ур.${n}: ${mahjongLevel(n).pairs} > ${Math.min(mahjongLevel(n - 1).pairs, mahjongLevel(n).pairs - 1)}`);
    }
  });

  it('первые уровни — перетасовка без лимита (человек учит правило)', () => {
    for (let n = 1; n <= 3; n++) expect(mahjongLevel(n).shuffles).toBe(-1);
    expect(canShuffle(mahjongLevel(1).shuffles, 99)).toBe(true);
    expect(shufflesLeft(mahjongLevel(1).shuffles, 99)).toBe(-1);
  });

  it('дальше перетасовка — ресурс, и он ужимается', () => {
    expect(mahjongLevel(4).shuffles).toBe(3);
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
    for (let n = 5; n <= 40; n++) {
      const prev = mahjongLevel(n - 1).shuffles, cur = mahjongLevel(n).shuffles;
      if (prev >= 0 && cur > prev) grows.push(`уровень ${n}: ${prev} → ${cur}`);
    }
    expect(grows).toEqual([]);
  });

  it('мусор на входе не роняет', () => {
    expect(mahjongLevel(0).layers).toBe(2);
    expect(mahjongLevel(-5).layers).toBe(2);
    expect(mahjongLevel(NaN).layers).toBe(2);
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
