/**
 * Уровни пересказа: меньше времени на чтение и дольше отвлечение.
 *
 * ЗАЧЕМ ИМЕННО ЭТИ ДВА ПАРАМЕТРА. Упражнение проверяет, сколько деталей текста
 * человек удержал и сколько из них пережило помеху. Сложность здесь — не длина
 * текста (её задают сами рассказы), а два условия вокруг него:
 *
 *   сколько времени дали ПРОЧИТАТЬ — меньше времени, слабее запись;
 *   сколько длится ПОМЕХА до пересказа — дольше помеха, сильнее распад следа.
 *
 * Оба честно усложняют задачу и оба обратимы: текст не портится, портится только
 * условие. Поэтому результат внутри одного уровня сравним сам с собой — уровень
 * пишется в сессию.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ. Мы не сокращаем и не удлиняем рассказы: ключевые слова, по
 * которым считается попадание, привязаны к тексту. Тронуть текст — сломать счёт.
 */

export const STORY_MAX_LEVEL = 15;

/** Границы. Первый уровень = нынешние условия, последний — потолок. */
const READ_MUL_MIN = 1.0;    // первый уровень: сколько сейчас
const READ_MUL_MAX = 0.6;    // последний: на 40% меньше времени на чтение
const DIST_MUL_MIN = 1.0;    // помеха как сейчас
const DIST_MUL_MAX = 2.0;    // вдвое дольше помеха

export interface StoryLevelCfg {
  /** Множитель времени на чтение (уменьшается с уровнем). */
  readMul: number;
  /** Множитель длительности помехи (растёт с уровнем). */
  distractorMul: number;
}

export function clampStoryLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(STORY_MAX_LEVEL, Math.floor(level)));
}

export function storyLevel(level: number): StoryLevelCfg {
  const n = clampStoryLevel(level);
  const k = (n - 1) / (STORY_MAX_LEVEL - 1);
  return {
    readMul: Math.round((READ_MUL_MIN + k * (READ_MUL_MAX - READ_MUL_MIN)) * 100) / 100,
    distractorMul: Math.round((DIST_MUL_MIN + k * (DIST_MUL_MAX - DIST_MUL_MIN)) * 100) / 100,
  };
}

/**
 * Секунды на чтение с учётом уровня.
 *
 * ⚠️ НИЖНЯЯ ГРАНИЦА ОБЯЗАТЕЛЬНА. Без неё короткий рассказ на верхних уровнях
 * получил бы 18 секунд на 60 слов — это уже не «трудно», а «невозможно прочитать».
 * Упражнение должно оставаться выполнимым: сложность в удержании, не в спешке.
 */
export function readSecondsFor(baseSeconds: number, level: number): number {
  return Math.max(15, Math.round(baseSeconds * storyLevel(level).readMul));
}

/** Секунды помехи с учётом уровня. */
export function distractorSecondsFor(baseSeconds: number, level: number): number {
  return Math.round(baseSeconds * storyLevel(level).distractorMul);
}
