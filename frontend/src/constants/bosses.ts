/**
 * Вехи-боссы: КАК ЧАСТО и В КАКИХ играх.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. `const BOSS_EVERY = 3` был объявлен 26 раз — по разу в
 * каждой игре с боссом. Пока все 26 копий равны трём, это незаметно; стоит одной
 * разъехаться, и тропинка уровней начнёт рисовать веху не там, где она случится.
 * Ровно так уже стреляла сцепка уровней: правило жило в каждой игре отдельно,
 * и мимо него прошли три (см. useGameMode).
 *
 * Тропинке (LevelProgressMap) нужно знать по gameId, рисовать ли веху вообще:
 * в 26 играх босс есть, в остальных нет, и лишний значок обещал бы небывшее.
 */

/** Каждый BOSS_EVERY-й пройденный уровень → битва с боссом (резкая смена правила). */
export const BOSS_EVERY = 3;

/** Веха ли этот уровень. */
export function isBossLevel(level: number): boolean {
  return level > 0 && level % BOSS_EVERY === 0;
}

/**
 * gameId игр, где босс реально реализован (BossRound + ветка `phase === 'boss'`).
 *
 * ⚠️ Список сверяется тестом bosses.test.ts со ЖИВЫМ кодом игр: файл с `BOSS_EVERY`
 * обязан быть здесь, и наоборот. Добавил босса в игру — тест напомнит дописать сюда,
 * иначе на её тропинке вехи не появятся и никто этого не заметит.
 */
export const GAMES_WITH_BOSS: ReadonlySet<string> = new Set([
  'ant',
  'choice_rt',
  'corsi',
  'counter',
  'cpt',
  'find_differences',
  'flanker',
  'go_no_go',
  'inhibition',
  'math_sprint',
  'n_back',
  'number_bonds',
  'posner',
  'proofreading',
  'quick_count',
  'schulte_table',
  'sdmt',
  'set_game',
  'simon',
  'stop_signal',
  'stroop',
  'stroop_emotional',
  'sudoku',
  'switching_task',
  'trail_making',
  'visual_search',
]);

/** Есть ли у игры вехи-боссы (по gameId, который игра передаёт в тропинку). */
export function hasBoss(gameId: string): boolean {
  return GAMES_WITH_BOSS.has(gameId);
}
