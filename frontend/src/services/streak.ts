import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 🔴 ЛУЧШАЯ СЕРИЯ — САМОРЕФЕРЕНТНАЯ ЦЕЛЬ ВМЕСТО АБСОЛЮТНОГО СЧЁТА.
 *
 * Решение Дениса 30.08.2026: заменить в шапке счётчик очков и счётчик ошибок
 * на серию подряд и личный рекорд.
 *
 * ЗАЧЕМ ИМЕННО ТАК. У нас сложность подстраивается под человека, поэтому
 * абсолютный счёт почти ничего не значит: «170 очков» — это про то, какую
 * ступень тебе выдал адаптив, а не про то, как ты сыграл. А ошибки в
 * тренажёре — норма по построению (подбор держит 75–85 % успеха), и красный
 * счётчик наказывает ровно за то, чего требует обучение.
 *
 * Серия свободна от обоих изъянов: она РАСТЁТ (в отличие от ошибок), сравнивается
 * с собственным прошлым результатом (в отличие от очков), и «побить свой
 * рекорд» осмысленно на любой ступени сложности.
 *
 * ⚠️ ЭТО НЕ ВАЛЮТА. Серия — ощущение и цель, но платить за неё монетами нельзя:
 * это сделало бы награду привязанной к качеству исполнения, а при адаптивной
 * сложности такая схема — худшая из измеренных (§12.2 карты геймификации).
 * Валюта считается отдельно: явка + приращение рейтинга + норма-референс.
 *
 * Хранится локально: рекорд — вещь личная, синхронизация ему не нужна, а
 * недоступность хранилища не должна ронять партию (потому все обращения молчат).
 */

const key = (gameId: string) => `psygames.bestStreak.${gameId}`;

/**
 * 🔴 ЛИЧНЫЙ РЕКОРД ПО ЛЮБОЙ МЕРЕ, А НЕ ТОЛЬКО ПО СЕРИИ.
 *
 * Играм на размах (Корси, пространственный размах, n-back) серия подряд говорит
 * мало: там своя мера — до какой длины ряда человек дошёл. Мера у каждой игры
 * своя, а СМЫСЛ один: «побил себя». Поэтому хранилище общее, а имя меры входит
 * в ключ — `psygames.best.<мера>.<игра>`.
 *
 * ⚠️ Ключ серии (`psygames.bestStreak.<игра>`) оставлен прежним: под ним уже
 * лежат рекорды игроков, и смена имени тихо обнулила бы их достижения.
 */
const bestKey = (gameId: string, metric: string) => `psygames.best.${metric}.${gameId}`;

/** Личный рекорд по мере; null — рекорда ещё нет. */
export async function getPersonalBest(gameId: string, metric: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(bestKey(gameId, metric));
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Записать, если побит. `true` — рекорд ОБНОВЛЁН (повод отпраздновать). */
export async function bumpPersonalBest(gameId: string, metric: string, value: number): Promise<boolean> {
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    const prev = await getPersonalBest(gameId, metric);
    if (prev !== null && prev >= value) return false;
    await AsyncStorage.setItem(bestKey(gameId, metric), String(Math.floor(value)));
    return true;
  } catch {
    return false;
  }
}

/** Лучшая серия игрока в этой игре; null — рекорда ещё нет. */
export async function getBestStreak(gameId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(gameId));
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Записать серию, если она побила прежнюю. Возвращает true, когда рекорд
 * ОБНОВЛЁН — вызывающий по этому признаку празднует, а не просто перерисовывает
 * цифру: «побил себя» — единственное событие, ради которого этот счётчик есть.
 */
export async function bumpBestStreak(gameId: string, streak: number): Promise<boolean> {
  if (!Number.isFinite(streak) || streak <= 0) return false;
  try {
    const prev = await getBestStreak(gameId);
    if (prev !== null && prev >= streak) return false;
    await AsyncStorage.setItem(key(gameId), String(Math.floor(streak)));
    return true;
  } catch {
    return false;
  }
}
