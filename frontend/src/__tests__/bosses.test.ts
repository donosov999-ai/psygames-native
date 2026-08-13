/**
 * Реестр игр с боссами обязан совпадать с живым кодом игр.
 *
 * ЗАЧЕМ. Тропинка уровней рисует веху по `hasBoss(gameId)`. Список в bosses.ts —
 * это ОБЕЩАНИЕ игроку: «на третьем уровне будет битва». Если игру с боссом забыть
 * вписать, веха не нарисуется; если вписать игру без босса — нарисуется веха,
 * которой не случится. Второе хуже: человек дойдёт до узла и ничего не получит.
 *
 * Поймать это глазами нельзя — надо открыть 63 экрана конфига и досчитать до
 * третьего уровня в каждом. Поэтому сверяем списком.
 *
 * ⚠️ ЗАОДНО СТЕРЕЖЁМ ЧИСЛО. `BOSS_EVERY = 3` объявлено в 26 играх по копии. Пока
 * копии равны трём, всё сходится; разъедется одна — тропинка нарисует веху не там,
 * где она случится, и это будет тихая ложь. Тест требует, чтобы все копии были 3.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

import { BOSS_EVERY, GAMES_WITH_BOSS, hasBoss, isBossLevel } from '../constants/bosses';

const GAMES_DIR = join(__dirname, '../../app/games');

/** Файлы игр, где босс реально объявлен. */
function filesWithBoss(): string[] {
  return readdirSync(GAMES_DIR).filter((f: string) => {
    if (!f.endsWith('.tsx')) return false;
    return /const BOSS_EVERY/.test(readFileSync(join(GAMES_DIR, f), 'utf8'));
  });
}

/**
 * gameId, который игра передаёт в тропинку. Берём именно его, а не имя файла:
 * тропинка знает игру только по этому ключу (schulte.tsx → 'schulte_table').
 */
function mapGameId(file: string): string | null {
  const src: string = readFileSync(join(GAMES_DIR, file), 'utf8');
  const inline = src.match(/<LevelProgressMap[\s\S]{0,200}?gameId=(?:"([^"]+)"|\{'([^']+)'\})/);
  if (inline) return inline[1] || inline[2];
  // Игра может передавать константу: gameId={GAME_ID}
  if (/<LevelProgressMap[\s\S]{0,200}?gameId=\{GAME_ID\}/.test(src)) {
    const c = src.match(/const GAME_ID\s*=\s*'([^']+)'/);
    if (c) return c[1];
  }
  return null;
}

describe('реестр вех-боссов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(filesWithBoss().length).toBeGreaterThan(20);
    expect(GAMES_WITH_BOSS.size).toBeGreaterThan(20);
  });

  it('каждая игра с боссом отдаёт тропинке свой gameId', () => {
    const noId = filesWithBoss().filter((f) => !mapGameId(f));
    expect(noId).toEqual([]);
  });

  it('игра с боссом есть в реестре — иначе веха не нарисуется', () => {
    const missing = filesWithBoss()
      .map((f) => ({ f, id: mapGameId(f) }))
      .filter((x) => x.id && !GAMES_WITH_BOSS.has(x.id))
      .map((x) => `${x.f} → ${x.id}`);
    expect(missing).toEqual([]);
  });

  it('в реестре нет лишних — иначе обещаем битву, которой не будет', () => {
    const live = new Set(filesWithBoss().map(mapGameId).filter(Boolean));
    const extra = [...GAMES_WITH_BOSS].filter((id) => !live.has(id));
    expect(extra).toEqual([]);
  });

  it('все копии BOSS_EVERY равны общей константе', () => {
    const odd = filesWithBoss()
      .map((f) => {
        const m: string[] | null = readFileSync(join(GAMES_DIR, f), 'utf8').match(/const BOSS_EVERY\s*=\s*(\d+)/);
        return { f, n: m ? Number(m[1]) : NaN };
      })
      .filter((x) => x.n !== BOSS_EVERY)
      .map((x) => `${x.f}: ${x.n} вместо ${BOSS_EVERY}`);
    expect(odd).toEqual([]);
  });

  it('веха — каждый третий уровень, первый ею не является', () => {
    expect([1, 2, 3, 4, 5, 6, 7].filter(isBossLevel)).toEqual([3, 6]);
    expect(isBossLevel(0)).toBe(false);
  });

  it('игра без босса вех не получает', () => {
    expect(hasBoss('mahjong')).toBe(false);
    expect(hasBoss('sudoku')).toBe(true);
  });
});
