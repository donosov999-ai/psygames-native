/**
 * ВРЕМЯ ПОД ПРОЙДЕННЫМ УЗЛОМ — ЛУЧШЕЕ, ЧЕСТНОЕ И НЕ ВЕЗДЕ.
 *
 * 🔴 ЗАЧЕМ. Узел на тропинке знал «пройден / текущий / закрыт» и звёзды. Сколько
 * человек потратил на уровень, не было видно нигде — а это главный повод
 * вернуться: «в прошлый раз 2:40, попробую быстрее». Звёзды такого не дают: три
 * штуки собираются один раз и дальше не растут.
 *
 * ⚠️ ГЕЙТ ПРОВЕРЯЕТ РАБОТУ, А НЕ СЛОВА В ИСХОДНИКЕ. В этом проекте уже обжигались:
 * в SET бейдж отсчёта был написан, переведён на 12 языков и покрыт гейтом — и не
 * показывался ни разу, потому что состояние, от которого висел показ, нигде не
 * присваивалось. Поэтому здесь карта РИСУЕТСЯ настоящим рендером с подложенной
 * историей партий, а выводы делаются по тому, что оказалось на экране: сама
 * подпись, её координаты, высота полотна.
 *
 * ⚠️ ТРИ МЕСТА, ГДЕ ОШИБИТЬСЯ ЛЕГЧЕ ВСЕГО, И ПОТОМУ ОНИ ПРОВЕРЯЮТСЯ ОТДЕЛЬНО.
 *   1. «Лучшее» вместо «последнего»: переиграл хуже — цифра не должна портиться.
 *   2. Показ там, где время не цель: у методик, у партий заданной длины и у игр
 *      на успокоение секундомер — не ориентир, а давление (репорт тестировщицы
 *      18.08.2026: «НЕЛЬЗЯ таймер, но в этом и был смысл вечерней зарядки»).
 *   3. Пустая полоса: высоту полотна поднимает только РЕАЛЬНО видимое время.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');
import React from 'react';

/**
 * История партий подкладывается прямо здесь: гейт проверяет карту, а не
 * AsyncStorage. Имя обязано начинаться на `mock` — иначе jest не пускает
 * переменную во фабрику мока.
 */
let mockHistory: any[] = [];
jest.mock('@/src/services/api', () => ({ getSessions: async () => mockHistory }));
let mockStars: Record<number, number> = {};
jest.mock('@/src/services/levelStars', () => ({ getLevelStars: async () => mockStars }));
jest.mock('@/src/services/pet', () => ({
  getPetSkin: async () => 'cat',
  getPetAccessory: async () => null,
}));
jest.mock('@/src/components/pet/PetSprite', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'p1' } }) }));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'ru' }),
}));

import LevelProgressMap, { mapHeight, timeTop } from '@/src/components/LevelProgressMap';
import {
  TIMED_GAMES,
  bestTimesFrom,
  formatBestTime,
  showsBestTime,
} from '@/src/services/levelTimes';

const TestRenderer = require('react-test-renderer');
const ROOT = join(__dirname, '../..');
const GAMES_DIR = join(ROOT, 'app/games');

const COLORS = {
  surface: '#fff', text: '#000', textSecondary: '#888', primary: '#4a7', border: '#ddd',
};

/** Партия в истории — ровно те поля, что пишет saveSession. */
function run(over: any = {}) {
  return {
    game_type: 'schulte_table',
    profile_id: 'p1',
    passed: true,
    time_seconds: 160,
    details: { level: 3 },
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Разбор нарисованного дерева
// ─────────────────────────────────────────────────────────────────────────────

function nodes(json: any, acc: any[] = []): any[] {
  if (!json || typeof json !== 'object') return acc;
  acc.push(json);
  for (const c of json.children || []) nodes(c, acc);
  return acc;
}

/** Все строки, реально попавшие на экран. */
function strings(json: any, acc: string[] = []): string[] {
  if (typeof json === 'string') { acc.push(json); return acc; }
  if (!json || typeof json !== 'object') return acc;
  for (const c of json.children || []) strings(c, acc);
  return acc;
}

/** Подписи со стилем-массивом (ступень и время рисуются абсолютом). */
function placed(json: any): { text: string; top: number; left: number }[] {
  const out: { text: string; top: number; left: number }[] = [];
  for (const n of nodes(json)) {
    const st = n.props?.style;
    const flat = Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st;
    if (!flat || typeof flat.top !== 'number' || typeof flat.left !== 'number') continue;
    // Пустые строки тоже берём: «нарисована пустая подпись» — это тоже поломка.
    const text = (n.children || []).filter((c: any) => typeof c === 'string').join('');
    out.push({ text, top: flat.top, left: flat.left });
  }
  return out;
}

/** Высота полотна: внутренний View, которому заданы и ширина, и высота. */
function canvasHeight(json: any): number | undefined {
  for (const n of nodes(json)) {
    const st = n.props?.style;
    const flat = Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st;
    if (flat && typeof flat.height === 'number' && typeof flat.width === 'number') return flat.height;
  }
  return undefined;
}

/**
 * Самая нижняя точка нарисованных звёзд.
 *
 * ⚠️ react-native-svg превращает `Polygon` в тот же `RNSVGPath`, что и аксон, —
 * искать по имени элемента бесполезно. Отличаем по форме пути: звезда это
 * ломаная из голых пар координат, аксон — кривая с сегментами `C`.
 */
function starsBottom(json: any): number {
  let low = -Infinity;
  for (const n of nodes(json)) {
    const d = n.props?.d;
    if (typeof d !== 'string' || d.includes('C')) continue;
    const nums = d.replace(/[MZ]/g, ' ').trim().split(/\s+/).map(Number);
    for (let k = 1; k < nums.length; k += 2) {
      if (Number.isFinite(nums[k]) && nums[k] > low) low = nums[k];
    }
  }
  return low;
}

/**
 * Всё, что нарисовано в ПОЛОСЕ ВРЕМЕНИ — по координате строки, а не по виду текста.
 *
 * ⚠️ Первая редакция отбирала строки регуляркой «похоже на время» — и пропустила
 * поломку, при которой узлы без рекорда рисовали «NaN:NaN»: под регулярку такой
 * мусор не подходил, счётчик оставался равен единице, гейт был зелёным. Полоса
 * ловит ЛЮБУЮ лишнюю строку, включая пустую.
 */
function timeRows(json: any, hasLabel: boolean, maxLevel: number): string[] {
  const tops = Array.from({ length: maxLevel }, (_, i) => timeTop(i, hasLabel));
  return placed(json)
    .filter((p) => tops.some((t) => Math.abs(t - p.top) < 0.001))
    .map((p) => p.text);
}

function labelsOf(json: any): string[] {
  return nodes(json)
    .map((n) => n.props?.accessibilityLabel)
    .filter((v: any) => typeof v === 'string');
}

async function drawMap(props: any = {}) {
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(LevelProgressMap, {
        gameId: 'schulte_table',
        currentLevel: 5,
        maxLevel: 8,
        colors: COLORS,
        language: 'ru',
        ...props,
      } as any),
    );
  });
  return r.toJSON();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('лучшее время уровня', () => {
  it('из нескольких попыток берётся лучшая, а не последняя', () => {
    const best = bestTimesFrom(
      [
        run({ time_seconds: 200 }),
        run({ time_seconds: 160 }),
        run({ time_seconds: 245 }),   // переиграл хуже — рекорд портиться не должен
      ],
      'schulte_table',
      'p1',
    );
    expect(best[3]).toBe(160);
  });

  it('одна попытка — она и есть лучшая', () => {
    expect(bestTimesFrom([run({ time_seconds: 97 })], 'schulte_table', 'p1')[3]).toBe(97);
  });

  it('ни одной попытки — уровня в ответе нет вовсе (не ноль и не бесконечность)', () => {
    const best = bestTimesFrom([], 'schulte_table', 'p1');
    expect(best[3]).toBeUndefined();
    expect(Object.keys(best)).toEqual([]);
  });

  it('уровни считаются порознь', () => {
    const best = bestTimesFrom(
      [run({ details: { level: 1 }, time_seconds: 40 }), run({ details: { level: 2 }, time_seconds: 300 })],
      'schulte_table',
      'p1',
    );
    expect(best).toEqual({ 1: 40, 2: 300 });
  });

  /**
   * `passed !== true` отсекает разом и провал, и свободную партию, и шаг зарядки:
   * признак ставят только партии по лесенке уровней. Без этого быстрый прогон
   * Шульте 4×4 из свободного режима стал бы недостижимым «рекордом» уровня.
   */
  it('чужое в рекорд не попадает', () => {
    const noise = [
      run({ profile_id: 'p2', time_seconds: 5 }),                    // другой профиль
      run({ game_type: 'mahjong', time_seconds: 6 }),                // другая игра
      run({ passed: false, time_seconds: 7 }),                        // не прошёл / свободная / зарядка
      run({ passed: undefined, time_seconds: 8 }),                    // исход неизвестен
      run({ time_seconds: 1780000000 }),                              // мусор от старого бага с нулевым стартом
      run({ time_seconds: 0 }),
      run({ time_seconds: -30 }),
      run({ time_seconds: Number.NaN }),
      run({ time_seconds: 0.2 }),                                     // партия короче секунды невозможна
      run({ details: {} }),                                           // партия без уровня
      run({ details: { level: 0 } }),
    ];
    expect(bestTimesFrom(noise, 'schulte_table', 'p1')).toEqual({});
    // и при этом настоящая партия среди того же шума находится
    expect(bestTimesFrom([...noise, run({ time_seconds: 111 })], 'schulte_table', 'p1')).toEqual({ 3: 111 });
  });

  it('без профиля чужие рекорды не подставляются', () => {
    expect(bestTimesFrom([run()], 'schulte_table', '')).toEqual({});
  });
});

describe('где время показывать нельзя', () => {
  it('у методик — никогда, даже если игра в списке', () => {
    expect(showsBestTime('schulte_table', true)).toBe(false);
    expect(showsBestTime('breathing', true)).toBe(false);
  });

  /**
   * Каждая строка — своя причина: заданная длина партии (проб или отсчёт),
   * «дольше = лучше» у охвата, восстановление и успокоение, разъехавшиеся
   * корзины у судоку.
   */
  it('у партий заданной длины, у охвата и у восстановления — не показываем', () => {
    for (const id of [
      'breathing', 'eye_gym',                       // восстановление, вечерний набор
      'digit_span', 'corsi', 'spatial_span', 'memory_matrix', 'n_back',   // дольше = лучше
      'flanker', 'stop_signal', 'stroop', 'cpt', 'go_no_go',              // фиксированное число проб
      'math_sprint', 'set_game', 'find_differences',                       // обратный отсчёт
      'tower_london',                                // мерка — лишние ходы, не секунды
      'sudoku', 'sudoku_samurai',                    // самурай пишет в корзину судоку
      'iowa', 'rmet', 'vocab_srs', 'phonemic_fluency',
    ]) {
      expect([id, showsBestTime(id)]).toEqual([id, false]);
    }
  });

  it('у игр, где партия кончается доделанной задачей, — показываем', () => {
    for (const id of Object.keys(TIMED_GAMES)) {
      expect([id, showsBestTime(id)]).toEqual([id, true]);
    }
    expect(Object.keys(TIMED_GAMES).length).toBeGreaterThanOrEqual(9);
  });

  it('у каждой строки списка сказано, чем кончается партия', () => {
    for (const [id, why] of Object.entries(TIMED_GAMES)) {
      expect([id, why.length > 20]).toEqual([id, true]);
    }
  });
});

/**
 * ⚠️ ОПЕЧАТКА В ИМЕНИ ИГРЫ НЕ ВИДНА НИ ГЛАЗАМИ, НИ ТИПАМИ: время просто никогда
 * не появится. И есть ловушка похуже — самурай рисует карту под именем
 * `sudoku_samurai`, а партии пишет в корзину `sudoku`. Имя карты и имя корзины
 * обязаны совпадать в ОДНОМ И ТОМ ЖЕ экране, иначе рекорд ищется не там.
 */
describe('белый список сходится с экранами', () => {
  const FILES: string[] = readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx'));

  /**
   * `const NAME = 'value'` — чтобы понимать `gameId={GAME_ID}`.
   *
   * ⚠️ ВТОРЫМ ПРОХОДОМ РАСКРЫВАЕМ ПСЕВДОНИМЫ (`const GAME_ID = SUDOKU_GAME_ID`).
   * Без него гейт краснел бы на безобидном переименовании — а именно так 20.08.2026
   * покраснел соседний реестр вех: там разбор знал только прямой литерал.
   */
  function consts(src: string): Record<string, string> {
    const out: Record<string, string> = {};
    const lit = /const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(src))) out[m[1]] = m[2];
    const alias = /const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*([A-Za-z_$][\w$]*)\s*;/g;
    for (let pass = 0; pass < 3; pass++) {
      alias.lastIndex = 0;
      while ((m = alias.exec(src))) if (out[m[2]] && !out[m[1]]) out[m[1]] = out[m[2]];
    }
    return out;
  }
  function resolve(raw: string, c: Record<string, string>): string | null {
    const lit = /^["'](.+)["']$/.exec(raw.trim());
    if (lit) return lit[1];
    const ident = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(raw.trim());
    if (ident) return c[ident[1]] ?? null;
    return null;
  }
  /** Имена, под которыми экран рисует карту. */
  function mapIds(src: string, c: Record<string, string>): string[] {
    const out: string[] = [];
    const re = /<LevelProgressMap([\s\S]{0,600}?)\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const g = /gameId=(\{[^}]+\}|"[^"]+"|'[^']+')/.exec(m[1]);
      const id = g && resolve(g[1], c);
      if (id) out.push(id);
    }
    return out;
  }
  /** Имена корзин, в которые экран пишет партии. */
  function sessionIds(src: string, c: Record<string, string>): string[] {
    const out: string[] = [];
    const re = /game_type:\s*('[^']+'|"[^"]+"|[A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const raw = m[1];
      const lit = /^["'](.+)["']$/.exec(raw);
      const id = lit ? lit[1] : (c[raw] ?? null);
      if (id) out.push(id);
    }
    return out;
  }

  const SCREENS = FILES.map((f: string) => {
    const src = readFileSync(join(GAMES_DIR, f), 'utf8') as string;
    const c = consts(src);
    return { file: f, maps: mapIds(src, c), buckets: sessionIds(src, c) };
  });

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(SCREENS.filter((s) => s.maps.length).length).toBeGreaterThan(55);
    expect(SCREENS.some((s) => s.maps.includes('schulte_table') && s.buckets.includes('schulte_table'))).toBe(true);
    // разбор достаёт имя из константы, а не только из строки
    expect(SCREENS.some((s) => s.file === 'sudoku-fractal.tsx' && s.maps.includes('sudoku_fractal'))).toBe(true);
    // …и раскрывает псевдоним — так уже написана судоку (`const GAME_ID = SUDOKU_GAME_ID`).
    // Пример синтетический нарочно: гейт не должен краснеть от того, что соседний
    // экран переписали, — он проверяет разбор, а не чужую строчку.
    expect(consts("const A = 'schulte_table';\nconst B = A;\n").B).toBe('schulte_table');
  });

  it('каждая игра списка рисует карту под тем же именем, в какое пишет партии', () => {
    const broken = Object.keys(TIMED_GAMES).filter(
      (id) => !SCREENS.some((s) => s.maps.includes(id) && s.buckets.includes(id)),
    );
    expect(broken).toEqual([]);
  });
});

describe('формат времени', () => {
  it('часами, а не секундами и не дробью', () => {
    expect(formatBestTime(160)).toBe('2:40');
    expect(formatBestTime(48)).toBe('0:48');
    expect(formatBestTime(60)).toBe('1:00');
    expect(formatBestTime(3599)).toBe('59:59');
    expect(formatBestTime(605)).toBe('10:05');
  });

  it('доли секунды округляются, а не вылезают на экран', () => {
    expect(formatBestTime(160.4)).toBe('2:40');
    expect(formatBestTime(159.6)).toBe('2:40');
    expect(formatBestTime(96.7)).toBe('1:37');
  });

  it('форма всегда одна: минуты, двоеточие, две цифры секунд', () => {
    for (const s of [1, 9, 59, 60, 61, 599, 600, 3601, 7325]) {
      expect([s, /^\d+:[0-5]\d$/.test(formatBestTime(s))]).toEqual([s, true]);
    }
  });
});

describe('вёрстка тропинки', () => {
  it('без времён высота полотна ровно прежняя — пустой полосы не появляется', () => {
    expect(mapHeight(false, false)).toBe(128);
    expect(mapHeight(true, false)).toBe(150);
  });

  it('со временами полотно подрастает, но не раздувается', () => {
    for (const hasLabel of [false, true]) {
      const grew = mapHeight(hasLabel, true) - mapHeight(hasLabel, false);
      expect(grew).toBeGreaterThan(8);
      expect(grew).toBeLessThanOrEqual(20);
    }
  });

  it('под подписью ступени строка времени опускается ниже, чем без неё', () => {
    for (let i = 0; i < 12; i++) {
      expect(timeTop(i, true)).toBeGreaterThan(timeTop(i, false) + 10);
    }
  });

  /** Узлы идут по синусоиде: проверяем ВСЕ фазы волны, а не первый узел. */
  it('строка времени влезает в полотно на любой фазе волны', () => {
    for (let i = 0; i < 30; i++) {
      expect([i, timeTop(i, true) + 12 < mapHeight(true, true)]).toEqual([i, true]);
      expect([i, timeTop(i, false) + 12 < mapHeight(false, true)]).toEqual([i, true]);
    }
  });
});

describe('карта показывает время', () => {
  beforeEach(() => { mockHistory = []; mockStars = {}; });

  it('у игры из списка время видно, и это лучшее из попыток', async () => {
    mockHistory = [run({ time_seconds: 245 }), run({ time_seconds: 160 })];
    const tree = await drawMap();
    expect(strings(tree)).toContain('2:40');
    expect(strings(tree)).not.toContain('4:05');
  });

  it('у игры не из списка того же времени нет', async () => {
    mockHistory = [run({ game_type: 'n_back' })];
    const tree = await drawMap({ gameId: 'n_back' });
    expect(strings(tree)).not.toContain('2:40');
  });

  it('у методики времени нет, даже если партии записаны', async () => {
    mockHistory = [run()];
    const tree = await drawMap({ countsRuns: true });
    expect(strings(tree)).not.toContain('2:40');
  });

  it('узел без времени не рисует ни подписи, ни пустой строки', async () => {
    mockHistory = [run({ details: { level: 3 } })];
    const tree = await drawMap();
    // восемь узлов, рекорд у одного — в полосе времени ровно одна строка и никакого мусора
    expect(timeRows(tree, true, 8)).toEqual(['2:40']);
  });

  it('пока пройденного нет, полотно той же высоты, что и раньше', async () => {
    const empty = await drawMap();
    mockHistory = [run()];
    const withTime = await drawMap();
    expect(canvasHeight(empty)).toBe(mapHeight(true, false));
    expect(canvasHeight(withTime)).toBe(mapHeight(true, true));
  });

  /**
   * Игра могла ужать число уровней, а история осталась. Рекорд с уровня 99 на
   * карте из восьми узлов рисовать негде — и поднимать под него полотно нельзя:
   * получится пустая полоса без единой подписи.
   */
  it('рекорд с уровня, которого на карте нет, полотно не поднимает', async () => {
    mockHistory = [run({ details: { level: 99 } })];
    const tree = await drawMap();
    expect(timeRows(tree, true, 8)).toEqual([]);
    expect(canvasHeight(tree)).toBe(mapHeight(true, false));
  });

  it('время стоит под подписью ступени того же узла, а не поверх неё', async () => {
    mockHistory = [run()];
    const tree = await drawMap();
    const items = placed(tree);
    const time = items.find((p) => p.text === '2:40');
    expect(time).toBeDefined();
    const tier = items.find((p) => p.left === time!.left && p.text.length > 0 && p.text !== '2:40');
    expect(tier).toBeDefined();                       // подпись ступени на месте
    expect(time!.top).toBeGreaterThan(tier!.top + 10); // и время ниже неё
  });

  /**
   * У Шульте есть вехи-боссы, и третий уровень — как раз веха: узел там крупнее
   * (R_BOSS), звёзды уезжают ниже. Проверяем оба случая — веху и обычный узел.
   */
  it('время не наезжает на звёзды — ни у обычного узла, ни у вехи', async () => {
    for (const level of [3, 4]) {
      mockStars = { [level]: 3 };
      mockHistory = [run({ details: { level } })];
      const tree = await drawMap();
      const time = placed(tree).find((p) => p.text === '2:40');
      expect([level, !!time]).toEqual([level, true]);
      expect([level, starsBottom(tree) > 0]).toEqual([level, true]);   // звёзды нарисованы
      expect([level, time!.top > starsBottom(tree)]).toEqual([level, true]);
    }
  });

  it('подпись ступени и питомец на месте — время их не вытеснило', async () => {
    mockHistory = [run()];
    const tree = await drawMap();
    expect(strings(tree)).toContain('sudokuTierBeginner');
    expect(canvasHeight(tree)).toBeGreaterThan(0);
  });

  it('скринридер слышит слово, а не голую цифру', async () => {
    mockHistory = [run()];
    const tree = await drawMap({ onPickLevel: () => {} });
    expect(labelsOf(tree).some((l: string) => l.includes('bestTime') && l.includes('2:40'))).toBe(true);
    expect(labelsOf(tree).some((l: string) => l.includes('level 5') && !l.includes('bestTime'))).toBe(true);
  });
});
