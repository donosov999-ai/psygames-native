/* psygames-mahjong-hidden-gate · VER 1 · 27.08.2026 */
/**
 * СКРЫТАЯ ИНФОРМАЦИЯ В МАДЖОНГЕ (ec15d176, §20) — гейт режима.
 *
 * Что сторожится и почему именно это:
 *   · расписание скрытых уровней — каждый третий с десятого (шестая разность
 *     §18.8 «цена неопределённости» сравнивает полные и скрытые уровни рядом);
 *   · `coveredFromAbove` совпадает с пунктом (а) правила свободы: разойдутся —
 *     «?» встанет на нажимаемой плитке или лицо откроется у запертой;
 *   · решаемость скрытым режимом НЕ трогается: раздача та же, прячется только
 *     отображение — доска, решаемая при полном знании, решаема и при вскрытии;
 *   · «ходов сверх минимума» нет ни в одном режиме маджонга: минимума при
 *     неполной информации не существует, а полный режим его и раньше не считал.
 */
import { coveredFromAbove, isFree, type Tile } from '@/src/games/mahjong/board';
import { MAHJONG_HIDDEN_FROM, mahjongHidden } from '@/src/services/mahjongLevels';
import { generateDeal } from '@/app/games/mahjong';
// Файлы читаем через require — как соседние гейты: node-типов в tsconfig нет,
// и import 'fs' валит tsc --noEmit (TS2591).
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

/** Детерминированный генератор — тот же приём, что в mahjong-solvable. */
function seededRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('маджонг: скрытая информация', () => {
  it('расписание: каждый третий уровень с десятого, раньше — никогда', () => {
    expect(MAHJONG_HIDDEN_FROM).toBe(10);
    const hidden = Array.from({ length: 30 }, (_, i) => i + 1).filter(mahjongHidden);
    expect(hidden).toEqual([10, 13, 16, 19, 22, 25, 28]);
    for (let l = 1; l < 10; l++) expect(mahjongHidden(l)).toBe(false);
  });

  it('🔴 coveredFromAbove = пункт (а) правила свободы — сверено на живой раздаче', () => {
    const deal = generateDeal(4, 27, 10, 'turtle', undefined, seededRnd(7));
    const tiles = deal.tiles;
    expect(tiles.length).toBeGreaterThan(20);
    const alive = new Array(tiles.length).fill(true);
    let coveredCount = 0;
    for (let i = 0; i < tiles.length; i++) {
      const covered = coveredFromAbove(tiles, alive, i);
      if (covered) {
        coveredCount++;
        // Накрытая не бывает свободной — иначе «?» стоял бы на нажимаемой плитке.
        expect(isFree(tiles, alive, i)).toBe(false);
      }
    }
    // На четырёхслойной доске накрытые есть всегда — иначе прятать нечего.
    expect(coveredCount).toBeGreaterThan(0);
    // И открытые тоже: доска, где всё «?», не начинается.
    expect(coveredCount).toBeLessThan(tiles.length);
  });

  it('вскрытие работает: снятие накрывающей пары открывает лицо', () => {
    const deal = generateDeal(4, 27, 10, 'turtle', undefined, seededRnd(7));
    const tiles = deal.tiles;
    const alive = new Array(tiles.length).fill(true);
    // Возьмём первую накрытую плитку и «снимем» всех её накрывателей.
    const idx = tiles.findIndex((_, i) => coveredFromAbove(tiles, alive, i));
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = [...alive];
    for (let j = 0; j < tiles.length; j++) {
      if (j !== idx && (tiles[j] as Tile).layer > (tiles[idx] as Tile).layer) after[j] = false;
    }
    expect(coveredFromAbove(tiles, after, idx)).toBe(false);
  });

  it('🔴 экран: скрытый уровень пишет три метрики §20.4 и нигде нет «ходов сверх минимума»', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'mahjong.tsx'), 'utf8');
    for (const needle of ['hidden_info: true', 'time_to_first_move_ms', 'plan_revisions', 'moves_before_first_reveal']) {
      expect(`${needle}: ${src.includes(needle)}`).toBe(`${needle}: true`);
    }
    // Минимума при неполной информации не существует — и в полном режиме маджонг
    // его не считал; появление этого ключа означает, что режим начал врать.
    expect(src.includes('moves_over_min')).toBe(false);
    // «?» рисуется только в скрытом режиме и только на накрытой плитке.
    expect(src).toMatch(/mahjongHidden\(levelRef\.current\) && coveredFromAbove/);
  });

  it('правило режима объявлено на первом скрытом уровне и живёт в словаре', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'mahjong.tsx'), 'utf8');
    expect(src).toMatch(/key: 'hidden', fromLevel: 10, toLevel: 10/);
    const dict = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    for (const k of ['lr_mahjong_hidden_title', 'lr_mahjong_hidden_rule', 'lr_mahjong_hidden_example']) {
      expect(`${k}: ${dict.includes(k)}`).toBe(`${k}: true`);
    }
  });
});
