/* psygames-use-record-benchmark · VER 1 · 28.08.2026 */
/**
 * РЕКОРД-СТРОКА НА ИТОГЕ — ОДИН ХУК ВМЕСТО ШЕСТИ КОПИЙ (§7а-бис п.13, этап 2).
 *
 * Идея Дениса 10.08: «рекорд максимальный от других пишется, соревновательный» —
 * строкой на экране итога, не модалкой. Первая реализация жила ад-хоком внутри
 * schulte.tsx и n-back.tsx (~25 строк на экран), остальные четыре игры лидерборда
 * слали рекорды и НЕ показывали ничего — данные копились там, где их не видно.
 *
 * Устройство честности — как у первоисточника (schulte):
 *   · мгновенный офлайн-фолбэк: строка сразу показывает «свой = личный рекорд»,
 *     сеть уточняет её асинхронно и не задерживает экран итога;
 *   · подпись «лучший среди игроков», НЕ «мировой рекорд»: в таблице Шульте
 *     7 игроков (замер 10.08) — новичка нельзя обманывать выдуманным масштабом;
 *   · сети нет / таблица пуста → личный рекорд с подписью «личный рекорд».
 *
 * ⚠️ ЛИЧНЫЙ ЛУЧШИЙ СЧИТАЕТСЯ ПО НАПРАВЛЕНИЮ ИГРЫ. У времени лучший — минимум,
 * у длины ряда — максимум; направление уже записано в LEADERBOARD_GAMES.better,
 * и вторая копия знания тут не заводится.
 */
import { useCallback, useState } from 'react';
import {
  LEADERBOARD_GAMES, LeaderboardGameId,
  fetchBest, getPersonalBest, submitScore,
} from '@/src/services/leaderboard';

export interface RecordBenchmark {
  own: number;
  best: number;
  source: 'players' | 'personal';
}

/** Лучший из двух по направлению игры (у less лучший меньше, у more — больше). */
export function betterOf(gameId: LeaderboardGameId, a: number, b: number): number {
  return LEADERBOARD_GAMES[gameId].better === 'less' ? Math.min(a, b) : Math.max(a, b);
}

/**
 * Числа в строке — единицами игры. Таблица здесь, а не в LEADERBOARD_GAMES:
 * это забота показа, а не сравнимости (metric там — проза для человека).
 */
const FORMAT: Record<LeaderboardGameId, (v: number, t: (k: string) => string) => string> = {
  schulte_table_5x5: (v, t) => `${v.toFixed(1)} ${t('seconds')}`,
  trail_making: (v, t) => `${v.toFixed(1)} ${t('seconds')}`,
  choice_rt: (v, t) => `${Math.round(v)} ${t('msShort')}`,
  n_back: (v) => `N=${Math.round(v)}`,
  digit_span: (v) => String(Math.round(v)),
  corsi: (v) => String(Math.round(v)),
  go_no_go: (v, t) => `${Math.round(v)} ${t('msShort')}`,
  hanoi: (v, t) => `${v.toFixed(1)} ${t('seconds')}`,
  counter: (v, t) => `${v.toFixed(1)} ${t('seconds')}`,
};

/** Готовая строка под счёт: «свой · лучший среди игроков: … / личный рекорд: …». */
export function recordLineFor(
  gameId: LeaderboardGameId, b: RecordBenchmark, t: (k: string) => string,
): string {
  const fmt = FORMAT[gameId];
  return `${fmt(b.own, t)} · ${t(b.source === 'players' ? 'bestAmongPlayers' : 'personalBest')}: ${fmt(b.best, t)}`;
}

export function useRecordBenchmark(gameId: LeaderboardGameId) {
  const [benchmark, setBenchmark] = useState<RecordBenchmark | null>(null);

  /**
   * Партия сыграна в зачётной конфигурации — отправить и уточнить строку.
   * Звать ПОСЛЕ countsForRecord: незачётная конфигурация не рисует ничего
   * (человек играл ради игры, ругаться на 4×4 не за что).
   */
  const report = useCallback((score: number) => {
    setBenchmark({ own: score, best: score, source: 'personal' });
    const submit = submitScore(gameId, score);
    Promise.all([
      submit.then(() => fetchBest(gameId)).catch(() => null),
      getPersonalBest(gameId),
    ]).then(([playersBest, stored]) => {
      const personal = stored === null ? score : betterOf(gameId, score, stored);
      setBenchmark({
        own: score,
        best: playersBest ?? personal,
        source: playersBest === null ? 'personal' : 'players',
      });
    }).catch(() => {});
  }, [gameId]);

  /** Новая партия — прошлой строке на экране не место. */
  const reset = useCallback(() => setBenchmark(null), []);

  return { benchmark, report, reset };
}
