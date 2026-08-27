/* psygames-record-line-gate · VER 1 · 28.08.2026 */
/**
 * РЕКОРД-СТРОКА НА ИТОГЕ (§7а-бис п.13, этап 2 ТЗ ade9a298).
 *
 * 🔴 ГЛАВНОЕ, ЧТО СТОРОЖИТСЯ: у КАЖДОЙ игры лидерборда данные ПОКАЗЫВАЮТСЯ
 * там же, где собираются. Инверсия 10.08 («Шульте шлёт и не показывает,
 * n-back показывает и не шлёт») чинилась дважды и оба раза частично: к 28.08
 * рекорды слали шесть игр, а строку на итоге рисовали две. Гейт держит полноту
 * пары «шлёт → показывает» по живому списку LEADERBOARD_GAMES: добавил игру
 * в лидерборд — она обязана показать строку, иначе красный.
 */
import { LEADERBOARD_GAMES } from '@/src/services/leaderboard';
import { betterOf, recordLineFor } from '@/src/hooks/useRecordBenchmark';

declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

/** Экран каждой игры лидерборда (живая пара id → файл). */
const SCREEN_OF: Record<string, string> = {
  schulte_table_5x5: 'schulte.tsx',
  n_back: 'n-back.tsx',
  digit_span: 'digit-span.tsx',
  corsi: 'corsi.tsx',
  trail_making: 'trail-making.tsx',
  choice_rt: 'choice-rt.tsx',
  go_no_go: 'go-no-go.tsx',
  hanoi: 'hanoi.tsx',
  counter: 'counter.tsx',
};

const t = (k: string) => ({ seconds: 'с', msShort: 'мс', bestAmongPlayers: 'Лучший среди игроков', personalBest: 'Личный рекорд' }[k] ?? k);

describe('рекорд-строка на итоге', () => {
  it('карта экранов покрывает ровно живой список игр лидерборда', () => {
    expect(Object.keys(SCREEN_OF).sort()).toEqual(Object.keys(LEADERBOARD_GAMES).sort());
  });

  it('🔴 каждая игра лидерборда ПОКАЗЫВАЕТ рекорд, а не только шлёт', () => {
    for (const [gameId, file] of Object.entries(SCREEN_OF)) {
      const src = readFileSync(join(__dirname, '..', '..', 'app', 'games', file), 'utf8');
      // Два законных пути: общий хук (recordLineFor) или прижившаяся ад-хок
      // обвязка первоисточников (resultBenchmark в schulte/n-back).
      const shows = src.includes(`recordLineFor('${gameId}'`) || src.includes('resultBenchmark');
      expect(`${gameId} (${file}): показывает=${shows}`).toBe(`${gameId} (${file}): показывает=true`);
    }
  });

  it('личный лучший считается по направлению игры, а не всегда максимумом', () => {
    expect(betterOf('schulte_table_5x5', 20.5, 13.6)).toBe(13.6);   // время: лучший меньше
    expect(betterOf('trail_making', 44, 61)).toBe(44);
    expect(betterOf('choice_rt', 480, 390)).toBe(390);
    expect(betterOf('digit_span', 6, 8)).toBe(8);                    // длина: лучший больше
    expect(betterOf('corsi', 5, 4)).toBe(5);
    expect(betterOf('n_back', 2, 3)).toBe(3);
  });

  it('строка честная: единицы игры и подпись источника, без «мирового рекорда»', () => {
    expect(recordLineFor('schulte_table_5x5', { own: 22.44, best: 13.637, source: 'players' }, t))
      .toBe('22.4 с · Лучший среди игроков: 13.6 с');
    expect(recordLineFor('choice_rt', { own: 412.6, best: 390.2, source: 'personal' }, t))
      .toBe('413 мс · Личный рекорд: 390 мс');
    expect(recordLineFor('digit_span', { own: 7, best: 9, source: 'players' }, t))
      .toBe('7 · Лучший среди игроков: 9');
    expect(recordLineFor('n_back', { own: 2, best: 3, source: 'personal' }, t))
      .toBe('N=2 · Личный рекорд: N=3');
    // Слова «мировой» в строке нет и не будет: в таблице Шульте 7 игроков (замер 10.08).
  });
});
