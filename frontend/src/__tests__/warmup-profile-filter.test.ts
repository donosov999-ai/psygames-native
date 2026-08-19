/* psygames-warmup-profile-filter · VER 1 · 19.08.2026 */
/**
 * СОСТАВ НАБОРА ОБЯЗАН СЧИТАТЬСЯ С ПРОФИЛЕМ.
 *
 * 🔴 ЧТО БЫЛО. Утренний, вечерний и фиксированный наборы фильтруют состав по
 * профилю (`allow`) с самого начала. Дневной перерыв — НЕ фильтровал: в нём
 * стоят `flanker` и `eye_gym`, которых в профиле «Стандарт» (девять упражнений)
 * нет, и человек получал два из трёх упражнений мимо своего набора. Молча и
 * всем. Нашлось это не проверкой, а тем, что заход, вносивший новую игру, не
 * решился добавить её в дневной перерыв — «там фильтра нет, платное утечёт».
 *
 * ⚠️ ПОЧЕМУ ПРОВЕРКА ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА. «В функции есть слово
 * keepAllowed» — не проверка: фильтр можно позвать и выбросить результат, можно
 * переименовать, можно написать в комментарии. Здесь каждый сборщик ЗОВЁТСЯ с
 * фильтром «нельзя ничего», и от него требуется пустой состав. Соврать таким
 * способом нельзя.
 *
 * ⚠️ ПОЧЕМУ ЕСТЬ СПИСОК ИСКЛЮЧЕНИЙ. Три набора фильтровать НЕ надо, и у каждого
 * причина записана рядом. Но список закрыт проверкой полноты: новый сборщик
 * обязан попасть либо под фильтр, либо в исключения с объяснением — «просто не
 * попал ни туда, ни сюда» гейт не пропустит. Именно так дневной перерыв и жил
 * четыре месяца.
 */
import * as warmup from '@/src/services/warmup';
import { PlaylistMeta, isTrainingSlot } from '@/src/services/warmup';

/** Фильтр «нельзя ничего»: любой честный сборщик обязан вернуть пустой состав. */
const denyAll = () => false;

/** Как позвать каждый сборщик с фильтром. Ключ — имя экспорта. */
const FILTERED: Record<string, (allow: (g: string) => boolean) => PlaylistMeta> = {
  buildFixedPlaylist: (allow) => warmup.buildFixedPlaylist(
    [{ game_id: 'schulte_table', game_route: '/games/schulte', difficulty: 'easy', est_duration_sec: 60 }],
    'morning', 1, allow,
  ),
  buildDayPlaylist: (allow) => warmup.buildDayPlaylist(1, allow),
  buildMorningWarmupPlaylist: (allow) => warmup.buildMorningWarmupPlaylist({ duration: 5, weekday: 1, allow }),
  buildEveningWarmupPlaylist: (allow) => warmup.buildEveningWarmupPlaylist({ weekday: 1, allow }),
};

/**
 * Наборы, которые профилем НЕ режутся. Каждому — причина, а не отметка.
 * Проверки ниже требуют, чтобы причина ещё и подтверждалась поведением.
 */
const NO_FILTER: Record<string, string> = {
  buildNightPlaylist:
    'ночь выведена из тренировочной механики нарочно: человек открывает «не спится» не ради прогресса, а чтобы заснуть. '
    + 'Состав — одно дыхание 4-7-8; отфильтровать его значит показать в три часа ночи пустой экран и сделать из помощи со сном повод для покупки',
  buildFinancialBatteryPlaylist:
    'мерная батарея: состав обязан быть одинаковым годами, иначе замеры разных лет несравнимы. '
    + 'Урезать её по профилю — то же, что менять линейку между двумя измерениями',
  buildAssessmentPlaylist:
    'входной замер навыков: тот же довод, что у финансовой батареи — состав фиксирован ради сравнимости, а не ради доступа',
};

describe('состав набора считается с профилем', () => {
  const builders = Object.keys(warmup).filter((k) => /^build\w*Playlist$/.test(k));

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(builders.length).toBeGreaterThanOrEqual(7);
  });

  it('🔴 каждый сборщик либо фильтруется, либо объяснён — третьего нет', () => {
    const unregistered = builders.filter((b) => !(b in FILTERED) && !(b in NO_FILTER));
    expect(unregistered).toEqual([]);
  });

  it('в списках нет записей про исчезнувшие сборщики', () => {
    const ghosts = [...Object.keys(FILTERED), ...Object.keys(NO_FILTER)].filter((b) => !builders.includes(b));
    expect(ghosts).toEqual([]);
  });

  it('никакой сборщик не записан в оба списка сразу', () => {
    const both = Object.keys(FILTERED).filter((b) => b in NO_FILTER);
    expect(both).toEqual([]);
  });

  it('🔴 сборщик с фильтром «нельзя ничего» отдаёт пустой состав', () => {
    const leaking: string[] = [];
    for (const [name, call] of Object.entries(FILTERED)) {
      const meta = call(denyAll);
      if (meta.steps.length > 0) {
        leaking.push(`${name}: ${meta.steps.length} шагов мимо профиля — ${meta.steps.map((s) => s.game_id).join(', ')}`);
      }
    }
    expect(leaking).toEqual([]);
  });

  /**
   * Тот самый случай, ради которого всё писалось: «Стандарт» разрешает
   * `schulte_table` и не разрешает `flanker` с `eye_gym`.
   */
  it('🔴 дневной перерыв в «Стандарте» отдаёт только разрешённое', () => {
    const free = new Set(['picture_pairs', 'schulte_table', 'hanoi', 'math_sprint', 'n_back',
      'find_differences', 'anagrams', 'counter', 'targets']);
    const meta = warmup.buildDayPlaylist(1, (g: string) => free.has(g));
    const ids = meta.steps.map((s) => s.game_id);
    expect(ids).toEqual(['schulte_table']);
    expect(meta.est_total_sec).toBe(60);
    expect(meta.duration_min).toBe(1);
  });

  it('без фильтра состав дневного перерыва прежний — зовущие без профиля не сломаны', () => {
    expect(warmup.buildDayPlaylist(1).steps.map((s) => s.game_id)).toEqual(['schulte_table', 'flanker', 'eye_gym']);
  });

  it('каждое исключение объяснено, а не просто вписано', () => {
    for (const [name, why] of Object.entries(NO_FILTER)) {
      expect(`${name}: ${why.length}`).toBe(`${name}: ${why.length}`);
      expect(why.length).toBeGreaterThan(80);
    }
  });

  /**
   * 🔴 Причина исключения обязана подтверждаться поведением. Ночь названа
   * «вне тренировки» — значит `isTrainingSlot` для её слота обязан быть ложью.
   * Сделают ночь тренировкой (стрик, счётчик дней) — довод рассыпется, и гейт
   * потребует объясниться заново.
   */
  it('🔴 ночь и правда вне тренировочной механики, иначе довод исключения ложный', () => {
    const night = warmup.buildNightPlaylist(1);
    expect(isTrainingSlot(night.slot!)).toBe(false);
    expect(night.steps.map((s) => s.game_id)).toEqual(['breathing']);
  });

  /** Батареи названы мерными — значит и дорожка у них мерная, а не тренировочная. */
  it('🔴 мерные батареи и правда мерные, а не тренировка под другим именем', () => {
    expect(warmup.buildFinancialBatteryPlaylist().track).toBe('financial-battery');
    expect(warmup.buildAssessmentPlaylist().track).toBe('assessment');
  });
});
