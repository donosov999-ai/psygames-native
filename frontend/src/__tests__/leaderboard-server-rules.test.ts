/**
 * ГЕЙТ ПРАВИЛ РЕКОРДОВ НЕ ИМЕЕТ ПРАВА ОСЛЕПНУТЬ.
 *
 * 🔴 ЗАЧЕМ. Направление «лучше» и границы правдоподобия записаны в двух местах:
 * `LEADERBOARD_GAMES` здесь и ветки RPC `psygames_submit_score` в Supabase, где из
 * направления считается `rank_score`. Сверяет их `scripts/leaderboard-rules-gate.mjs` —
 * он один ходит в базу. Но у него две беды, от которых сеть не спасает, и обе тихие:
 *
 *   · он читает таблицу из кода ТЕКСТОМ (обычный .mjs, а таблица — TypeScript). Стоит
 *     переформатировать объявление — и гейт перестанет находить поля. Разошедшееся
 *     направление после этого пройдёт мимо, а сборка останется зелёной;
 *   · он может просто не запускаться. В этом же репозитории так уже было: два аудита
 *     лежали в scripts/ и не были включены НИ В ОДНУ джобу — чинили руками, проверяли
 *     руками, следующая правка тихо возвращала беду.
 *
 * Поэтому здесь, без сети, на каждом прогоне: гейт запускается с `--parse-only` и
 * обязан увидеть в файле ровно то же, что видит TypeScript, — и шаг с ним обязан стоять
 * в сборке.
 */
import { LEVEL_BOARD_MIN, LEVEL_BOARD_MAX, LEADERBOARD_GAMES, LeaderboardGameId } from '@/src/services/leaderboard';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const ROOT = join(__dirname, '../../..');            // корень репозитория, не frontend
const GATE = join(ROOT, 'scripts/leaderboard-rules-gate.mjs');
const WORKFLOW = join(ROOT, '.github/workflows/build.yml');

const ALL = Object.keys(LEADERBOARD_GAMES) as LeaderboardGameId[];

describe('сверка правил рекордов с базой', () => {
  it('🔴 гейт вычитывает из файла ровно то, что видит TypeScript', () => {
    const out = execFileSync(process.execPath, [GATE, '--parse-only'], {
      encoding: 'utf8', stdio: 'pipe',
    }) as string;

    // Гейт говорит на языке базы (asc/desc) — на нём же он печатает готовый SQL.
    const expected = Object.fromEntries(ALL.map((id) => [id, {
      better: LEADERBOARD_GAMES[id].better,
      direction: LEADERBOARD_GAMES[id].better === 'less' ? 'asc' : 'desc',
      min: LEADERBOARD_GAMES[id].min,
      max: LEADERBOARD_GAMES[id].max,
    }]));
    /**
     * ⚠️ 03.09.2026 К ДОСКАМ ВЕЛИЧИНЫ ДОБАВИЛАСЬ ОБЩАЯ ДОСКА УРОВНЕЙ. Она объявлена не
     * строкой в LEADERBOARD_GAMES, а парой констант (LEVEL_BOARD_MIN/MAX) и одной
     * веткой на сервере по форме имени `<игра>_level` — иначе в таблице стояли бы
     * семьдесят три одинаковые строки. Гейт читает её отдельно и печатает под ключом
     * `*_level`; здесь ожидание дополнено тем же.
     */
    expected['*_level'] = { better: 'more', direction: 'desc', min: LEVEL_BOARD_MIN, max: LEVEL_BOARD_MAX } as never;

    expect(JSON.parse(out)).toEqual(expected);
  });

  it('гейт стоит в сборке — иначе он просто лежит в репозитории', () => {
    expect(readFileSync(WORKFLOW, 'utf8')).toMatch(/^\s+run: node scripts\/leaderboard-rules-gate\.mjs\s*$/m);
  });

  /**
   * Границы — часть того же договора с сервером, что и направление: результат вне
   * [min, max] сервер отвергает как `implausible_score`. Перевёрнутая пара молча
   * закрыла бы игру целиком — ни один результат не прошёл бы.
   */
  it.each(ALL)('%s — границы правдоподобия задают непустой диапазон', (id) => {
    const { min, max } = LEADERBOARD_GAMES[id];
    expect(`${id}: ${Number.isFinite(min) && Number.isFinite(max)}`).toBe(`${id}: true`);
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
  });
});
