/* psygames-evening-quiet-coverage · VER 1 · 20.08.2026 */
/**
 * ВЕЧЕРНИЙ И НОЧНОЙ НАБОР ОБЯЗАН БЫТЬ ТИХИМ У КАЖДОЙ СВОЕЙ ИГРЫ.
 *
 * 🔴 ЧТО БЫЛО. Репорт тестировщицы 19.08.2026 дословно: «это же вечерняя
 * зарядка, а зачем добавили время, когда есть время хочется сразу торопиться».
 * Мы починили его в 1.204.0 и посчитали закрытым — но починили ПОИМЁННО, у тех
 * игр, на которые она пожаловалась. Судоку, анаграммы и маджонг стоят в тех же
 * вечерних наборах и приглушения не звали вовсе: у судоку бежал секундомер, а
 * победный звук общей карточки «уровень пройден» играл у всех троих.
 *
 * ⚠️ СВОИХ ЗВУКОВ У ИГРЫ МОЖЕТ НЕ БЫТЬ — И ЭТО НЕ ЗНАЧИТ, ЧТО ОНА ТИХАЯ.
 * `LevelCleared` зовёт `sndWin()` на каждом пройденном уровне, то есть звук
 * приходит из ОБЩЕГО компонента. Глушится он глобальным флагом, который ставит
 * `useCalmHush` — и если экран его не позвал, звук будет, сколько бы своих
 * `snd*` в нём ни было (у судоку и маджонга их ноль).
 *
 * ⚠️ ПОЧЕМУ СПИСОК НЕ РУЧНОЙ. Ровно потому, что ручная починка и завела нас
 * сюда. Игры берутся из САМИХ наборов зарядки: добавят игру в вечер, забудут
 * приглушение — покраснеет здесь, а не в отзыве человека через месяц.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const GAMES_DIR = path.join(ROOT, 'app/games');

/** Исходник без комментариев: упоминание приглушения в пояснении — не приглушение. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * Игры спокойных слотов — из самих наборов, а не из списка руками.
 *
 * ⚠️ ИСТОЧНИКОВ ДВА, И ВТОРОЙ ЛЕГКО ПРОСМОТРЕТЬ. Общая ротация вечера и ночной
 * шаг лежат в `services/warmup.ts`, но у профилей бывает СВОЙ вечерний плейлист
 * (`evening_playlist` в `constants/profiles.ts`) — так в вечер попадает маджонг
 * у «Микро-релакса». Первая редакция этой проверки читала только первый
 * источник и осталась зелёной, когда я нарочно снял приглушение у маджонга:
 * поломка не покраснела, потому что игры не было в охвате.
 */
function calmSlotGameIds(): string[] {
  const ids = new Set<string>();

  const warmup = code(fs.readFileSync(path.join(ROOT, 'src/services/warmup.ts'), 'utf8') as string);
  for (const block of ['EVENING_BY_WEEKDAY', 'NIGHT_STEPS']) {
    const at = warmup.indexOf(`const ${block}`);
    if (at === -1) continue;
    const next = warmup.indexOf('\nconst ', at + 10);
    const body = next === -1 ? warmup.slice(at) : warmup.slice(at, next);
    for (const m of body.matchAll(/game_id:\s*'([a-z_0-9]+)'/g)) ids.add(m[1]);
  }

  const profiles = code(fs.readFileSync(path.join(ROOT, 'src/constants/profiles.ts'), 'utf8') as string);
  for (const m of profiles.matchAll(/evening_playlist:\s*\[([\s\S]*?)\n\s*\],/g)) {
    for (const g of m[1].matchAll(/game_id:\s*'([a-z_0-9]+)'/g)) ids.add(g[1]);
  }

  return [...ids];
}

/** id каталога → файл экрана. */
function screenFor(id: string): string | null {
  const src = code(fs.readFileSync(path.join(ROOT, 'src/constants/games.ts'), 'utf8') as string);
  for (const m of src.matchAll(/\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
    if (!new RegExp(`id:\\s*'${id}'`).test(m[1])) continue;
    const route = /route:\s*'\/games\/([\w-]+)'/.exec(m[1]);
    if (route) return `${route[1]}.tsx`;
  }
  return null;
}

const CALM_IDS = calmSlotGameIds();

describe('тихий вечер у каждой игры вечернего набора', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(CALM_IDS.length).toBeGreaterThanOrEqual(5);
  });

  it('у каждой игры набора есть экран', () => {
    const lost = CALM_IDS.filter((id) => !screenFor(id)).map((id) => `${id}: экрана нет в каталоге`);
    expect(lost).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ. Экран, попавший в вечерний или ночной набор, обязан звать
   * приглушение. Не «иметь слово в файле» — комментарии срезаны.
   */
  it('🔴 каждая игра вечернего и ночного набора глушит звук', () => {
    const loud: string[] = [];
    for (const id of CALM_IDS) {
      const file = screenFor(id);
      if (!file) continue;
      const src = code(fs.readFileSync(path.join(GAMES_DIR, file), 'utf8') as string);
      if (!/useCalmHush\s*\(/.test(src)) loud.push(`${id} (${file}): не зовёт приглушение`);
    }
    expect(loud).toEqual([]);
  });

  /**
   * Приглушение обязано получать ЖИВОЙ признак, а не константу: `useCalmHush(false)`
   * читается как выполненное правило и не делает ничего.
   */
  it('🔴 приглушению передан признак спокойного шага, а не константа', () => {
    const dead: string[] = [];
    for (const id of CALM_IDS) {
      const file = screenFor(id);
      if (!file) continue;
      const src = code(fs.readFileSync(path.join(GAMES_DIR, file), 'utf8') as string);
      const call = /useCalmHush\s*\(\s*([^)]*)\)/.exec(src);
      if (!call) continue;
      const arg = call[1].trim();
      if (arg === 'false' || arg === 'true' || arg === '') dead.push(`${id}: useCalmHush(${arg || 'пусто'})`);
    }
    expect(dead).toEqual([]);
  });

  /** Судоку — тот экран, ради которого правило и понадобилось: секундомер прячется. */
  it('🔴 судоку прячет секундомер на спокойном шаге', () => {
    const src = code(fs.readFileSync(path.join(GAMES_DIR, 'sudoku.tsx'), 'utf8') as string);
    const flat = src.replace(/\s+/g, ' ');
    const at = flat.indexOf('elapsedTime.toFixed(1)');
    expect(`секундомер найден: ${at !== -1}`).toBe('секундомер найден: true');
    expect(`спрятан на спокойном: ${flat.slice(Math.max(0, at - 120), at).includes('!isCalm')}`)
      .toBe('спрятан на спокойном: true');
  });
});
