/* psygames-gate-sudoku-buckets · VER 1 · 20.08.2026 */
/**
 * КОРЗИНЫ СУДОКУ РАЗВЕДЕНЫ — ВКЛЮЧАЯ ПАРТИИ, КОТОРЫЕ УЖЕ ЛЕЖАТ НА УСТРОЙСТВАХ.
 *
 * 🔴 ЧТО БЫЛО. Самурай — поле 21×21 из пяти сеток, своя лестница из девяти уровней,
 * своя формула очков (база 4000 против 1500) — писал партии в корзину `sudoku`,
 * то есть в корзину классической 9×9. Со СВОИМ номером уровня. Уровни двух разных
 * игр лежали вперемешку, и всё, что считает партии по имени игры, считало их вместе.
 *
 * Ломалось от этого пять вещей, и ни одна не видна ни глазами, ни типами:
 *
 *   1. ЛУЧШЕЕ ВРЕМЯ УРОВНЯ. Партия самурая на пятом уровне идёт под час, партия
 *      классической — минуты. Рекорд собирался бы из обеих, и «цель» под узлом
 *      оказалась бы либо чужой, либо недостижимой навсегда: рекорд не вытесняется
 *      новыми партиями, он только улучшается. Из-за одного этого ОБЕ игры вообще не
 *      попали в список игр с показом времени (`services/levelTimes`) — показывать
 *      было нельзя, а разводить было некому.
 *   2. СВОДКА. `getStats('sudoku')` мешала партии на 81 клетке с партиями на 369:
 *      число партий, среднее и лучшее время, сумма очков — всё пополам с чужой игрой.
 *   3. РЕЗЕРВ УРОВНЯ САМУРАЯ БЫЛ МЁРТВ. Ключ уровня у него свой
 *      (`psygames_sudoku_samurai_level_…`), и потеряв ключ (переустановка, сброс
 *      профиля), хук поднимает достигнутое из истории — `getMaxLevelFromSessions('sudoku_samurai')`.
 *      Партий под таким именем не было ни одной: человек с девятого уровня открывал
 *      самурая на первом, молча.
 *   4. ПОДПИСЬ В ИСТОРИИ ВРАЛА. Партия самурая показывалась строкой «Судоку, уровень 5».
 *   5. ДОСТИЖЕНИЕ «ВЕСЬ КАТАЛОГ» ЗАСЧИТЫВАЛО САМУРАЯ ТОМУ, КТО В НЕГО НЕ ЗАХОДИЛ:
 *      условие спрашивает `sessionTypeOf(карточка)`, а он у самурая был `sudoku`.
 *
 * ⚠️ А ВОТ ЧЕГО НЕ ЛОМАЛОСЬ — ЧТОБЫ НЕ ПРИПИСЫВАТЬ ПРАВКЕ ЛИШНЕГО. Нагрузка ветки
 * считалась ВЕРНО: обе доски лежат в `logic`, и в какую бы из двух корзин ни попала
 * партия, ветка получала свою единицу. И ключ задачи (`taskKey`) партии всё-таки
 * различал — но не по игре, а по случайному совпадению: самурай пишет
 * `mode: 'samurai-level-5'`, классическая — `mode: 'level-5'`. Это формат одной
 * строки, а не решение; выровняй кто-нибудь эти строки — и уровень 5 на 81 клетке
 * стал бы «тем же уровнем», что уровень 5 на 369. Проба на это ниже отдельная.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ГЛАВНОЕ РЕШЕНИЕ ЭТОЙ ПРАВКИ — ЧТО ДЕЛАТЬ С УЖЕ ЗАПИСАННЫМ.
 *
 * Партии лежат на устройствах людей под именем `sudoku` вперемешку. Вариантов было
 * три: оставить как есть (история классической навсегда с примесью), пометить их
 * «до разделения» и не считать в сравнениях (человек теряет свои же месяцы), либо
 * разобрать — если есть чем.
 *
 * ЕСТЬ ЧЕМ. Экран самурая пишет `details.samurai: true` с ПЕРВОГО СВОЕГО КОММИТА
 * (d7a703c2, «feat(sudoku): Samurai mode» — там `game_type: 'sudoku'` и
 * `samurai: true` появились одной строкой). Версии экрана без этого поля не
 * существовало ни дня, значит неразличимых партий самурая нет ни одной. Списывать
 * нечего: старые записи просто возвращаются владельцу.
 *
 * Поэтому выбран разбор, и он стоит НА ГРАНИЦЕ ЧТЕНИЯ (`migrateSession` в api) —
 * там же, где уже разбираются переименованные `word_mnemonics`/`number_mnemonics`.
 * Не разовой переписью хранилища: разовая не пережила бы ни отката версии, ни
 * восстановления из бэкапа. Правило одно, живёт в каталоге (`sessionGameType`).
 *
 * ⚠️ ЧЕГО ЭТА ПРАВКА НЕ ЧИНИТ И НЕ МОЖЕТ. Партии, уже улетевшие в облако, лежат там
 * под `game_type: 'sudoku'`. Приложение сессии в облако только пишет и никогда не
 * читает (`profile-level-isolation.test.ts` держит это отдельно), поэтому на экраны
 * это не влияет; но в самой таблице примесь останется, пока её не разберут там же.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GAMES, GameConfig, isHubGame, sessionTypeOf, sessionGameType,
} from '@/src/constants/games';
import { getSessions, getStats, getMaxLevelFromSessions } from '@/src/services/api';
import { TIMED_GAMES, bestTimesFrom, showsBestTime } from '@/src/services/levelTimes';
import {
  buildTrainingHistory, entryGame, taskKey, type HistorySession,
} from '@/src/services/trainingHistory';
import { sudokuLevelKey, SUDOKU_ROADS } from '@/src/services/sudoku-roads';

const ROOT = path.join(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Комментарии срезаем ВСЕГДА: в этом проекте гейт уже семь раз держался зелёным на
 *  русском слове в объяснении. Здесь особенно: оба экрана судоку объясняют разведение
 *  корзин словами и цитируют старое имя. */
const strip = (s: string): string =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const SAMURAI = strip(read('app/games/sudoku-samurai.tsx'));
const CLASSIC = strip(read('app/games/sudoku.tsx'));
const FRACTAL = strip(read('app/games/sudoku-fractal.tsx'));

const byId = new Map<string, GameConfig>(GAMES.map((g) => [g.id, g]));
const PID = 'p1';
const DAY = 86400000;
const T0 = Date.UTC(2026, 7, 1);

/** Партия самурая ДО разведения — ровно в том виде, в каком она лежит на устройстве. */
function oldSamurai(over: Partial<HistorySession> & { level?: number } = {}): any {
  const { level = 5, ...rest } = over;
  return {
    game_type: 'sudoku', profile_id: PID, passed: true,
    score: 4200, time_seconds: 2400, difficulty: `Level ${level}`, mode: `samurai-level-${level}`,
    timestamp: new Date(T0).toISOString(),
    details: { errors: 0, completed: true, samurai: true, level, hint_uses: 0 },
    ...rest,
  };
}

/** Партия классической 9×9 по лестнице уровней. */
function classic(over: Partial<HistorySession> & { level?: number; road?: string } = {}): any {
  const { level = 5, road = 'normal', ...rest } = over;
  return {
    game_type: 'sudoku', profile_id: PID, passed: true,
    score: 1600, time_seconds: 300, difficulty: 'medium', mode: `level-${level}`,
    timestamp: new Date(T0 + DAY).toISOString(),
    details: { errors: 0, completed: true, level, variant: 'none', road, hint_uses: 0 },
    ...rest,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('срез комментариев работает — иначе всё ниже зелено вслепую', () => {
  it('слово из объяснения не считается кодом', () => {
    expect(strip("/* было game_type: 'sudoku' */")).not.toContain('game_type');
    expect(strip('  // const GAME_ID = \'sudoku\';\n')).not.toContain('GAME_ID');
  });

  it('исходники прочитаны, а не пусты', () => {
    for (const [name, src] of [['самурай', SAMURAI], ['классическая', CLASSIC], ['фрактальная', FRACTAL]] as const) {
      expect(`${name}: ${src.length > 5000}`).toBe(`${name}: true`);
    }
  });
});

describe('каждый экран судоку пишет в СВОЮ корзину', () => {
  /** Имя корзины из экрана: литерал либо константа, объявленная в том же файле. */
  function buckets(src: string): string[] {
    const consts: Record<string, string> = {};
    const lit = /const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(src))) consts[m[1]] = m[2];
    const out = new Set<string>();
    for (const g of src.matchAll(/game_type:\s*('[^']+'|[A-Za-z_$][\w$]*)/g)) {
      const raw = g[1];
      const s = /^'(.+)'$/.exec(raw);
      const id = s ? s[1] : consts[raw];
      if (id) out.add(id);
    }
    return [...out];
  }

  it('разбор корзин из исходника работает — проверено на классической', () => {
    expect(buckets(CLASSIC)).toEqual(['sudoku']);
  });

  it('самурай пишет sudoku_samurai, и это тот же ключ, что у его уровня и недоигранной партии', () => {
    expect(buckets(SAMURAI)).toEqual(['sudoku_samurai']);
    expect(SAMURAI).toContain("const GAME_ID = 'sudoku_samurai'");
    expect(SAMURAI).toContain("usePersistentLevel('sudoku_samurai')");
    expect(SAMURAI).toContain('gameId="sudoku_samurai"');
  });

  it('фрактальная осталась при своей корзине — правку соседа она не заметила', () => {
    expect(buckets(FRACTAL)).toEqual(['sudoku_fractal']);
  });

  /**
   * 🔴 ПРОБА, КОТОРОЙ НЕ ХВАТАЛО. Самурай делил корзину с судоку не по опечатке, а
   * потому что за этим никто не следил: две карточки каталога отдавали одно и то же
   * имя, и ни один тип, ни один прогон этого не замечал. Теперь любое повторение —
   * красное, независимо от того, какие две игры совпали.
   */
  it('ни одна карточка каталога не прячется в чужой корзине', () => {
    const seen = new Map<string, string[]>();
    for (const g of GAMES) {
      if (isHubGame(g.id)) continue;
      const b = sessionTypeOf(g);
      const list = seen.get(b);
      if (list) list.push(g.id); else seen.set(b, [g.id]);
    }
    const shared = [...seen.entries()].filter(([, ids]) => ids.length > 1)
      .map(([b, ids]) => `${b}: ${ids.join(' + ')}`);
    expect(`общих корзин: ${shared.join(' · ') || '—'}`).toBe('общих корзин: —');
    expect(seen.size).toBeGreaterThan(60);   // есть что проверять
  });

  it('каталог обещает ровно то, что пишет экран', () => {
    expect(sessionTypeOf(byId.get('sudoku-samurai') as GameConfig)).toBe('sudoku_samurai');
    expect(sessionTypeOf(byId.get('sudoku') as GameConfig)).toBe('sudoku');
    expect(sessionTypeOf(byId.get('sudoku-fractal') as GameConfig)).toBe('sudoku_fractal');
  });
});

describe('ключ к старым записям — признак, а не догадка', () => {
  /**
   * 🔴 БЕЗ ЭТОГО ПОЛЯ РАЗБОР СТАРЫХ ЗАПИСЕЙ УМИРАЕТ МОЛЧА. Новым записям
   * `details.samurai` уже не нужен — у них своя корзина, — и убрать его как «мусор»
   * будет соблазнительно. Тогда через релиз партии, лежащие под именем `sudoku`,
   * станут неразличимы навсегда.
   */
  it('экран самурая по-прежнему пишет details.samurai', () => {
    expect(SAMURAI).toMatch(/details:\s*\{[^}]*samurai:\s*true/);
  });

  /** Признак обязан быть только у самурая — иначе правило утащит чужую партию. */
  it('никакой другой экран этого признака не пишет', () => {
    const dir = path.join(ROOT, 'app/games');
    const guilty = fs.readdirSync(dir)
      .filter((f: string) => f.endsWith('.tsx') && f !== 'sudoku-samurai.tsx')
      .filter((f: string) => /samurai:\s*true/.test(strip(fs.readFileSync(path.join(dir, f), 'utf8'))));
    expect(guilty).toEqual([]);
  });

  it('старая запись самурая опознаётся, классическая — нет', () => {
    expect(sessionGameType(oldSamurai())).toBe('sudoku_samurai');
    expect(sessionGameType(classic())).toBe('sudoku');
  });

  it('разбор можно применять сколько угодно раз подряд', () => {
    const once = sessionGameType(oldSamurai());
    expect(sessionGameType({ game_type: once, details: { samurai: true } })).toBe(once);
    expect(sessionGameType({ game_type: 'sudoku_samurai', details: {} })).toBe('sudoku_samurai');
  });

  it('чужих игр правило не трогает', () => {
    expect(sessionGameType({ game_type: 'schulte_table', details: { samurai: true } })).toBe('schulte_table');
    expect(sessionGameType({ game_type: 'sudoku_fractal', details: { level: 3 } })).toBe('sudoku_fractal');
    expect(sessionGameType({ game_type: 'sudoku' })).toBe('sudoku');
    expect(sessionGameType({ game_type: 'sudoku', details: { samurai: false } })).toBe('sudoku');
    expect(sessionGameType({})).toBe('');
  });
});

describe('граница чтения разбирает то, что уже лежит на устройстве', () => {
  beforeEach(async () => {
    (globalThis as any).__psygames_active_profile_id = PID;
    await AsyncStorage.setItem('psygames_sessions', JSON.stringify([
      oldSamurai({ level: 9 }),
      oldSamurai({ level: 5, timestamp: new Date(T0 + DAY).toISOString() }),
      classic({ level: 3, timestamp: new Date(T0 + 2 * DAY).toISOString() }),
    ]));
  });

  it('старые партии самурая уходят в его корзину, классическая остаётся своей', async () => {
    const all = await getSessions();
    expect(all.map((s) => s.game_type)).toEqual(['sudoku_samurai', 'sudoku_samurai', 'sudoku']);
  });

  /** Сводка на экране статистики: 81 клетка больше не мешается с 369. */
  it('сводка классической судоку считает только её партии', async () => {
    const cls = await getStats('sudoku');
    const sam = await getStats('sudoku_samurai');
    expect(`классическая: ${cls.total_sessions}, самурай: ${sam.total_sessions}`)
      .toBe('классическая: 1, самурай: 2');
    expect(cls.average_time).toBe(300);      // час самурая в среднее не попал
    expect(sam.average_time).toBe(2400);
  });

  /**
   * 🔴 РЕЗЕРВ УРОВНЯ. Потеряв ключ уровня, хук поднимает достигнутое из истории.
   * У самурая совпадений не было ни одного (он спрашивал `sudoku_samurai`, а партии
   * лежали под `sudoku`), а классическая, спроси она историю, получила бы чужую
   * девятку. Теперь каждая поднимает своё.
   */
  it('каждая игра поднимает из истории СВОЙ уровень', async () => {
    expect(await getMaxLevelFromSessions('sudoku_samurai')).toBe(9);
    expect(await getMaxLevelFromSessions('sudoku')).toBe(3);
  });

  it('чужой профиль по-прежнему не считается', async () => {
    (globalThis as any).__psygames_active_profile_id = 'p2';
    expect(await getMaxLevelFromSessions('sudoku_samurai')).toBe(1);
  });
});

describe('лучшее время уровня стало возможным — и оно своё у каждой доски', () => {
  it('обе доски теперь в белом списке, и у каждой сказано, чем кончается партия', () => {
    for (const id of ['sudoku', 'sudoku_samurai', 'sudoku_fractal']) {
      expect(`${id}: ${showsBestTime(id)}`).toBe(`${id}: true`);
      expect(`${id}: ${(TIMED_GAMES[id] ?? '').length > 20}`).toBe(`${id}: true`);
    }
  });

  /**
   * 🔴 РАДИ ЧЕГО ВСЁ ЗАТЕВАЛОСЬ. Час самурая на пятом уровне не имеет права стать
   * «рекордом пятого уровня» классической — и наоборот, пять минут классической не
   * имеют права стать недостижимой целью под узлом самурая.
   */
  it('рекорд уровня 5 у каждой доски свой, даже когда обе партии записаны как sudoku', () => {
    const mixed = [oldSamurai({ level: 5 }), classic({ level: 5 })];
    expect(bestTimesFrom(mixed, 'sudoku', PID)).toEqual({ 5: 300 });
    expect(bestTimesFrom(mixed, 'sudoku_samurai', PID)).toEqual({ 5: 2400 });
  });

  it('новая запись самурая попадает туда же, куда старая', () => {
    const fresh = oldSamurai({ level: 5, game_type: 'sudoku_samurai', time_seconds: 1800 });
    expect(bestTimesFrom([oldSamurai({ level: 5 }), fresh], 'sudoku_samurai', PID)).toEqual({ 5: 1800 });
    expect(bestTimesFrom([oldSamurai({ level: 5 }), fresh], 'sudoku', PID)).toEqual({});
  });
});

describe('в ключе задачи игра стоит своим полем — там же, где дорога', () => {
  /**
   * ⚠️ ЧТО ИМЕННО ЗДЕСЬ ДОКАЗЫВАЕТСЯ. Раньше ключ различал эти партии по `mode`
   * (`samurai-level-5` против `level-5`) — то есть по формату одной строки, а не по
   * тому, что это разные игры. Ниже у обеих партий ВСЁ одинаково, кроме признака
   * игры: тот же уровень, та же дорога, та же сложность, тот же `mode`. Старый ключ
   * (первым полем — сырой `game_type`) на таких партиях совпадал бы полностью.
   */
  const same = { level: 5, road: 'normal' as const, difficulty: 'medium', mode: 'level-5' };
  const asClassic: HistorySession = {
    game_type: 'sudoku', difficulty: same.difficulty, mode: same.mode,
    details: { level: same.level, road: same.road },
  };
  const asSamurai: HistorySession = {
    game_type: 'sudoku', difficulty: same.difficulty, mode: same.mode,
    details: { level: same.level, road: same.road, samurai: true },
  };

  it('старый ключ на этих партиях совпадал — иначе доказывать нечего', () => {
    const oldKey = (s: HistorySession) =>
      [s.game_type ?? '', s.details?.level ?? '', '', s.difficulty ?? '', s.mode ?? ''].join('|');
    expect(oldKey(asClassic)).toBe(oldKey(asSamurai));
  });

  it('новый ключ их различает, и различает ИМЕННО в поле игры', () => {
    expect(taskKey(asClassic)).not.toBe(taskKey(asSamurai));
    expect(taskKey(asClassic).split('|')[0]).toBe('sudoku');
    expect(taskKey(asSamurai).split('|')[0]).toBe('sudoku_samurai');
    // Остальные поля не тронуты: признак встал в поле игры, а не рядом шестым.
    expect(taskKey(asClassic).split('|').slice(1)).toEqual(taskKey(asSamurai).split('|').slice(1));
  });

  it('частей ключа по-прежнему пять — шестого поля не появилось', () => {
    expect(taskKey(asSamurai).split('|').length).toBe(5);
  });

  /** Дорога стоит на своём месте и от разведения корзин не съехала. */
  it('дорога различает партии так же, как и раньше', () => {
    const hard = { ...asClassic, details: { level: 5, road: 'hard' } };
    expect(taskKey(hard).split('|')[2]).toBe('hard');
    expect(taskKey(asClassic).split('|')[2]).toBe('');   // обычная схлопывается в пусто
    expect(taskKey(hard)).not.toBe(taskKey(asClassic));
    // …и обе оси работают вместе: лёгкая классическая ≠ лёгкий самурай.
    const easyClassic = { ...asClassic, details: { level: 5, road: 'easy' } };
    const easySamurai = { ...asSamurai, details: { level: 5, road: 'easy', samurai: true } };
    expect(taskKey(easyClassic)).not.toBe(taskKey(easySamurai));
    expect(SUDOKU_ROADS).toContain('easy');
  });
});

describe('история подписывает строку той игрой, в которую играли', () => {
  it('старая партия самурая больше не выдаёт себя за классическую судоку', () => {
    expect(entryGame(oldSamurai())).toBe('sudoku_samurai');
    const days = buildTrainingHistory([oldSamurai({ level: 5 }), classic({ level: 3 })], { maxDays: 0 });
    const games = days.flatMap((d) => d.entries.map((e) => `${e.gameType}#${e.level}`)).sort();
    expect(games).toEqual(['sudoku#3', 'sudoku_samurai#5']);
  });

  /**
   * Вердикт «первый раз» тоже держится на имени игры: до разведения первая партия
   * классической после самурая объявлялась «новой сложностью» знакомого упражнения,
   * хотя человек в классическую не заходил ни разу.
   */
  it('первая партия классической после самурая — не «новая сложность», а первый раз', () => {
    const days = buildTrainingHistory([
      oldSamurai({ level: 5 }),
      classic({ level: 3, timestamp: new Date(T0 + DAY).toISOString() }),
    ], { maxDays: 0 });
    const cls = days.flatMap((d) => d.entries).find((e) => e.gameType === 'sudoku');
    expect(`${cls?.verdict}`).toBe('null');
  });

  /** А между собой партии самурая сравниваются как раньше — разведение их не разлучило. */
  it('две партии самурая на одном уровне сравниваются между собой', () => {
    const days = buildTrainingHistory([
      oldSamurai({ level: 5, score: 4000 }),
      oldSamurai({ level: 5, score: 4300, timestamp: new Date(T0 + DAY).toISOString() }),
    ], { maxDays: 0 });
    const last = days[0].entries[0];
    expect(`${last.gameType}: ${last.verdict} (${last.prev} → ${last.value})`)
      .toBe('sudoku_samurai: better (4000 → 4300)');
  });

  /** Старая запись и новая — одна и та же игра: разведение не рвёт цепочку прошлого раза. */
  it('новая запись самурая сравнивается со старой, а не начинает с нуля', () => {
    const days = buildTrainingHistory([
      oldSamurai({ level: 5, score: 4000 }),
      oldSamurai({ level: 5, score: 4300, game_type: 'sudoku_samurai', timestamp: new Date(T0 + DAY).toISOString() }),
    ], { maxDays: 0 });
    const last = days[0].entries[0];
    expect(`${last.verdict} (${last.prev} → ${last.value})`).toBe('better (4000 → 4300)');
  });
});

describe('достижение «весь каталог» перестало засчитывать чужую игру', () => {
  const samuraiCard = sessionTypeOf(byId.get('sudoku-samurai') as GameConfig);

  it('партия классической судоку больше не закрывает самурая', () => {
    const played = new Set([sessionGameType(classic())]);
    expect(played.has(samuraiCard)).toBe(false);
  });

  /** …и при этом у того, кто самурая ПРОШЁЛ до разведения, достижение не отбирают. */
  it('старая партия самурая закрывает самурая', () => {
    const played = new Set([sessionGameType(oldSamurai())]);
    expect(played.has(samuraiCard)).toBe(true);
  });
});

describe('лестницы уровней лежат в разных ключах хранилища', () => {
  it('ключ самурая не пересекается ни с одной дорогой классической', () => {
    const samurai = `psygames_sudoku_samurai_level_${PID}`;
    expect(SAMURAI).toContain("usePersistentLevel('sudoku_samurai')");
    const roads = SUDOKU_ROADS.map((r) => sudokuLevelKey(PID, r));
    expect(roads).not.toContain(samurai);
    expect(new Set(roads).size).toBe(SUDOKU_ROADS.length);
  });
});
