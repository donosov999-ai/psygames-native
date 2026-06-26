/**
 * eyeRestTracker — счётчик уровней, пройденных ПОДРЯД в авто-потоке (любая игра).
 * Каждые REST_EVERY уровней без выхода в меню → передышка для глаз (по выбору Дениса,
 * формат C: авто-разрядка внутри игр). Сбрасывается при выходе в config (серия прервана).
 *
 * Считается в LevelCleared (единая точка авто-потока) — значит работает во ВСЕХ
 * 16 раундовых играх сразу, без правки каждой.
 */
let streak = 0;
const REST_EVERY = 10;   // после 10 уровней подряд — разрядка глаз от азарта

/** Вызывается при показе LevelCleared (= пройден уровень). true → пора передышка. */
export function tickLevelStreak(): boolean {
  streak += 1;
  return streak % REST_EVERY === 0;
}

/** Серия прервана (вышел в меню / закончил) — обнулить. */
export function resetLevelStreak(): void {
  streak = 0;
}

/** Сколько уровней подряд пройдено (для отладки/статистики). */
export function getLevelStreak(): number {
  return streak;
}
