/* psygames-unwatched-thresholds · VER 1 · 22.08.2026 */
/**
 * ПОРОГИ, КОТОРЫЕ НЕ СТЕРЁГ НИКТО.
 *
 * 🔴 КАК НАШЛИСЬ. 22.08.2026 прошёлся по всем экспортируемым константам сервисов
 * и выбрал те, чьё имя не встречается ни в одной проверке. Кандидатов вышло 23;
 * семь из них сломались мутацией НЕЗАМЕТНО — ни один набор не покраснел. Отсутствие
 * имени в проверках само по себе ничего не доказывает (`SEASON_DAYS` в том же
 * списке, а мутация его ловится поведением), поэтому каждый кандидат проверялся
 * поломкой, а не рассуждением.
 *
 * ⚠️ ЗДЕСЬ НЕ «КОНСТАНТА РАВНА ЧИСЛУ». Такая проверка не стережёт ничего: она
 * краснеет на любой правке, включая осмысленную, и приучает править её вместе с
 * кодом не глядя. Стережётся СМЫСЛ: ход коня остаётся ходом коня, кормление
 * питомца остаётся платным, потолок техники не пускает перебор.
 */
import { KNIGHT, KING, ORTHO, HYPER_BOXES } from '@/src/services/sudoku-core';
import { MAX_TIER } from '@/src/services/fractal-sudoku';
import { TECHNIQUE_TIER } from '@/src/services/sudoku-grade';
import { PET_FEED_COST } from '@/src/services/pet';
import { TOKEN_DELTA_CAP } from '@/src/services/tokens';
import { FRESH_MS, freshEarn } from '@/src/services/earn';
import { FINANCIAL_COOLDOWN_DAYS } from '@/src/services/warmup';
import { MIC_GRANT_WAIT_MS } from '@/src/services/voiceNote';

const pairs = (o: readonly (readonly number[])[]) => o.map((p) => `${p[0]},${p[1]}`);

describe('геометрия правил судоку — фигура ходит так, как называется', () => {
  /**
   * Анти-конь: правило игры целиком держится на этих восьми смещениях. Подмени их
   * королевскими — доска останется «правильной» на вид, генератор продолжит выдавать
   * задачи, а правило под названием «конь» будет уже другим. Ни одна проверка на
   * решаемость этого не увидит: задача-то решаемая, просто не та.
   */
  it('конь — восемь разных прыжков «два и один»', () => {
    expect(KNIGHT).toHaveLength(8);
    expect(new Set(pairs(KNIGHT)).size).toBe(8);
    for (const [dr, dc] of KNIGHT) {
      expect([Math.abs(dr), Math.abs(dc)].sort()).toEqual([1, 2]);
    }
  });

  it('анти-король — четыре диагональных соседа, ортогональные не дублируются', () => {
    expect(KING).toHaveLength(4);
    expect(new Set(pairs(KING)).size).toBe(4);
    // Ортогональные закрыты самой строкой и столбцом — дублировать их значит
    // ужесточить правило молча.
    for (const [dr, dc] of KING) expect([Math.abs(dr), Math.abs(dc)]).toEqual([1, 1]);
  });

  it('ортогональные соседи — ровно четыре, ровно на одну клетку', () => {
    expect(ORTHO).toHaveLength(4);
    expect(new Set(pairs(ORTHO)).size).toBe(4);
    for (const [dr, dc] of ORTHO) expect(Math.abs(dr) + Math.abs(dc)).toBe(1);
  });

  it('Windoku — четыре зоны 3×3, которые не задевают друг друга и влезают в доску', () => {
    expect(HYPER_BOXES).toHaveLength(4);
    for (const [r, c] of HYPER_BOXES) {
      expect(r + 3).toBeLessThanOrEqual(9);
      expect(c + 3).toBeLessThanOrEqual(9);
    }
    for (const [r1, c1] of HYPER_BOXES) {
      for (const [r2, c2] of HYPER_BOXES) {
        if (r1 === r2 && c1 === c2) continue;
        const overlap = Math.abs(r1 - r2) < 3 && Math.abs(c1 - c2) < 3;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('потолок техники фрактала', () => {
  /**
   * Седьмой ступенью в лестнице техник идёт `guess` — перебор. Доска, которая
   * логикой не берётся, это не «посложнее», а сломанная задача: человек упирается
   * и не понимает, чего от него хотят.
   */
  it('не пускает перебор', () => {
    expect(MAX_TIER).toBeLessThan(TECHNIQUE_TIER.guess);
    expect(MAX_TIER).toBe(TECHNIQUE_TIER.x_wing);
  });
});

describe('кормление питомца остаётся платным', () => {
  /**
   * Бесплатное кормление убивает единственное, ради чего очки вообще копятся у
   * тех, кто не покупает способности. Дорогое — превращает питомца в витрину.
   */
  it('стоит больше нуля и меньше одной хорошей партии', () => {
    expect(PET_FEED_COST).toBeGreaterThan(0);
    expect(PET_FEED_COST).toBeLessThanOrEqual(TOKEN_DELTA_CAP);
  });
});

describe('окно свежести начисления', () => {
  /**
   * Экран итога монтируется РЯДОМ с записью партии, поэтому читает последнее
   * начисление. Растяни окно — и карточка следующего уровня покажет начисление за
   * предыдущий; схлопни в ноль — не покажет никогда.
   */
  it('своё начисление показывается, вчерашнее — нет', () => {
    expect(FRESH_MS).toBeGreaterThan(0);
    expect(FRESH_MS).toBeLessThan(60 * 60 * 1000);   // час — уже точно чужая партия
    // Ничего не начислено — показывать нечего, и это не ошибка.
    expect(freshEarn(Date.now())).toBeNull();
  });
});

describe('перерыв денежного набора', () => {
  /**
   * Денежный набор — про деньги человека, а не про тренировку: гонять его каждый
   * день бессмысленно и назойливо. Ноль дней означает «каждый день».
   */
  it('измеряется неделями, а не часами и не годами', () => {
    expect(FINANCIAL_COOLDOWN_DAYS).toBeGreaterThanOrEqual(7);
    expect(FINANCIAL_COOLDOWN_DAYS).toBeLessThanOrEqual(60);
  });
});

describe('ожидание разрешения на микрофон', () => {
  /**
   * Системное окно человек читает и жмёт руками. Ноль означает «не дождались
   * никогда», и запись молча не начнётся; минуты — экран висит после отказа.
   */
  it('хватает прочитать окно, но не заставляет ждать вечность', () => {
    expect(MIC_GRANT_WAIT_MS).toBeGreaterThanOrEqual(5_000);
    expect(MIC_GRANT_WAIT_MS).toBeLessThanOrEqual(60_000);
  });
});
