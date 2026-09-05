/**
 * СТЫКОВКА «СОЕДИНИ ТОЧКИ» С ПРИЛОЖЕНИЕМ — ПРОВЕРЯЕТСЯ СМЫСЛОМ, А НЕ БУКВОЙ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Игра приехала из лаборатории самодостаточным модулем:
 * своё ядро, свой словарь, свой экран правил, СВОЙ ЭКРАН ИТОГА и свои часы по
 * умолчанию. Всё это в лаборатории верно, а в приложении половина обязана быть
 * выключена или переподключена. Ошибка стыковки не видна ни в типах, ни на
 * экране: игра выглядит рабочей, просто её результаты не попадают в общую
 * бухгалтерию, а часы не замирают на паузе. Именно так когда-то выпали маджонг
 * и парные картинки — молча, на живом релизе.
 *
 * ⚠️ ДВЕ ЛОВУШКИ, ИЗ-ЗА КОТОРЫХ ГЕЙТ УСТРОЕН ИМЕННО ТАК.
 *
 * 1. «ГЕЙТ СТЕРЁГ БУКВУ». В проекте не раз краснела ПРАВИЛЬНАЯ правка, потому
 *    что гейт требовал дословный вызов конкретной функции. Такие гейты
 *    перестают читать. Поэтому здесь пропы не ищутся текстом: выражение,
 *    которое экран РЕАЛЬНО передаёт модулю, вынимается из разметки и
 *    ВЫЧИСЛЯЕТСЯ. Переименуй константу, перестрой файл, поменяй механизм —
 *    гейт останется зелёным, пока значение верное.
 *
 * 2. «РАЗМЕТКА ЕСТЬ, ЭЛЕМЕНТ МЁРТВ». В SET бейдж отсчёта был написан, переведён
 *    на 12 языков и покрыт гейтом — и не показывался ни разу, потому что
 *    состояние, от которого зависел показ, нигде не присваивалось. Поэтому всё,
 *    что можно проверить ПОВЕДЕНИЕМ, проверяется прогоном настоящего ядра:
 *    партия играется до конца, часы подставляются, метрики читаются. Ядро
 *    чистое (ни React, ни таймеров, ни хранилища), гонять его дёшево.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

import {
  LEVELS,
  beginPath,
  createDotsSession,
  extendPath,
  generateDotsPuzzle,
  getDotsStrings,
  isPassed,
  solveDotsPuzzle,
  startRound,
  startTraining,
  advanceFromTraining,
  pauseSession,
  resumeSession,
  type Cell,
  type DotsMetrics,
  type DotsSession,
} from '@/src/games/dots-connect/core';

const ROOT = join(__dirname, '../..');
const SCREEN = join(ROOT, 'app/games/dots-connect.tsx');
const MODULE_UI = join(ROOT, 'src/games/dots-connect/DotsConnectGame.tsx');
const screen = (): string => readFileSync(SCREEN, 'utf8') as string;
/**
 * ⚠️ КОММЕНТАРИИ СРЕЗАЕМ ПЕРЕД ПОИСКОМ. В этом проекте слово в комментарии
 * держало проверку зелёной шесть раз за два дня: рассказ о механизме считался
 * механизмом. Здесь это особенно легко — обоснования пропов пишутся прямо
 * внутри разметки.
 */
const stripComments = (src: string): string =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const moduleUi = (): string => readFileSync(MODULE_UI, 'utf8') as string;

// ─────────────────────────────────────────────────────────────────────────────
// Разбор разметки: вынимаем то, что экран РЕАЛЬНО передаёт модулю.
// ─────────────────────────────────────────────────────────────────────────────

/** Блок `<DotsConnectGame … />` целиком, по балансу скобок. */
function moduleTag(src: string): string {
  const start = src.indexOf('<DotsConnectGame');
  if (start < 0) throw new Error('экран не рисует <DotsConnectGame> — стыковки нет вовсе');
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    else if (src[i] === '>' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('не нашёл конец тега <DotsConnectGame>');
}

/** Выражение пропа `name={…}` по балансу фигурных скобок. */
function propExpr(tag: string, name: string): string {
  const at = tag.search(new RegExp(`(?<![\\w$])${name}\\s*=\\s*\\{`));
  if (at < 0) throw new Error(`проп ${name} модулю не передан`);
  const open = tag.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < tag.length; i++) {
    if (tag[i] === '{') depth++;
    else if (tag[i] === '}') { depth--; if (depth === 0) return tag.slice(open + 1, i); }
  }
  throw new Error(`не закрыт проп ${name}`);
}

/** `const GRADIENT = ['#…', '#…'];` — опознавательный знак игры. */
function gradient(src: string): string[] {
  const m = /const GRADIENT\s*=\s*\[([^\]]+)\]/.exec(src);
  if (!m) throw new Error('в экране нет градиента игры');
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

/**
 * Вычисляем выражение в подставной области видимости. `colors` отдаёт МЕТКИ:
 * если в ответе всплыла метка профиля — значит туда уехал акцент профиля,
 * а не цвет игры, и неважно, как это было записано.
 */
function evaluate(expr: string, src: string): unknown {
  const colors = new Proxy({}, { get: (_t, k) => `ПРОФИЛЬ:${String(k)}` });
  // eslint-disable-next-line no-new-func
  return new Function('GRADIENT', 'colors', 'LEVELS', `return (${expr});`)(gradient(src), colors, LEVELS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Заготовка: играем настоящую партию через ядро, ведя путь по решению солвера.
// ─────────────────────────────────────────────────────────────────────────────

/** Проводит все пары по найденному решению. Возвращает завершённую сессию. */
function playToCompletion(start: DotsSession, clock: () => number): DotsSession {
  let session = start;
  const puzzle = session.puzzle;
  const solution = solveDotsPuzzle(puzzle);
  if (!solution) throw new Error(`уровень ${puzzle.level} не решается — сломан генератор или солвер`);
  for (const pair of puzzle.pairs) {
    const path = solution[pair.id] as Cell[];
    session = beginPath(session, path[0]);
    for (const cell of path.slice(1)) session = extendPath(session, cell, clock());
  }
  return session;
}

/** Часы, которые идут только когда им велят, — подмена `gameNow`. */
function fakeClock(startMs = 1_000_000) {
  let t = startMs;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — ядро делает то, на чём держится стыковка', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(existsSync(SCREEN)).toBe(true);
    expect(existsSync(MODULE_UI)).toBe(true);
    expect(LEVELS).toBeGreaterThanOrEqual(40);
  });

  /**
   * 🔴 ЧАСЫ ПАРТИИ — ТЕ, ЧТО ДАЛИ, А НЕ НАСТЕННЫЕ.
   *
   * Без этого проп `now` был бы украшением: модуль по умолчанию берёт
   * `Date.now`, и время партии продолжало бы идти, пока человек пишет отзыв
   * поверх игры. Репорт тестировщицы дословно: «пока я писала отзыв, игра моя
   * закончилась». Проверяем поведением: гоняем партию на подставных часах,
   * которые заведомо расходятся с настенными, и смотрим, ЧЬЁ время в метрике.
   */
  it('🔴 время партии считается по переданным часам, а не по Date.now', () => {
    const clock = fakeClock();
    let session = startRound(createDotsSession({ seed: 'clock-check', level: 3 }), clock.now());
    clock.tick(7_000);
    session = playToCompletion(session, clock.now);
    expect(session.phase).toBe('result');
    // 7 секунд — ровно столько, сколько натикали подставные часы.
    expect(session.result!.durationMs).toBe(7_000);
    // А настенные к этому моменту показали бы что-то около нуля: партия сыграна
    // мгновенно. Значит метрика взята не у них.
    expect(session.result!.durationMs).toBeGreaterThan(1_000);
  });

  /** Пауза не должна попадать в зачёт — иначе «замри» ничего не значит. */
  it('🔴 простой на паузе вычитается из времени партии', () => {
    const clock = fakeClock();
    let session = startRound(createDotsSession({ seed: 'pause-check', level: 2 }), clock.now());
    clock.tick(3_000);
    session = pauseSession(session, clock.now());
    clock.tick(60_000);                       // человек ушёл писать отзыв
    session = resumeSession(session, clock.now());
    clock.tick(2_000);
    session = playToCompletion(session, clock.now);
    expect(session.result!.durationMs).toBe(5_000);   // 3 + 2, минута паузы не в счёт
  });

  /**
   * 🔴 УРОВЕНЬ В МЕТРИКЕ. По `details.level` восстанавливается прогресс, когда
   * ключ потерян (сброс профиля, смена профиля). Игра, которая его не пишет,
   * при этом обнуляется — а заметит это человек, а не мы.
   */
  it('🔴 метрика несёт уровень партии на всей лесенке', () => {
    for (const level of [1, 7, 13, 19, 25, 31, LEVELS]) {
      const clock = fakeClock();
      let session = startRound(createDotsSession({ seed: `lvl-${level}`, level }), clock.now());
      clock.tick(1_000);
      session = playToCompletion(session, clock.now);
      expect(`L${level} → ${session.result!.details.level}`).toBe(`L${level} → ${level}`);
    }
  });

  /**
   * ПОРОГ ПРОХОЖДЕНИЯ ЖИВЁТ В МОДУЛЕ. Экран обязан читать его оттуда, а не
   * заводить вторую копию: две копии одного правила разъезжаются молча.
   */
  it('🔴 решил честно — прошёл; перебор наказывается звёздами, а не запретом', () => {
    const clock = fakeClock();
    let session = startRound(createDotsSession({ seed: 'pass-check', level: 5 }), clock.now());
    clock.tick(1_000);
    session = playToCompletion(session, clock.now);
    const clean = session.result as DotsMetrics;
    expect(clean.accuracy).toBe(1);
    expect(isPassed(clean)).toBe(true);

    /**
     * 🔴 ПЕРЕБОР ТЕПЕРЬ ПРОХОДИТ. Отчёт Дениса 05.09.2026 (e40516e3): «забрал с
     * десятой попытки — не даёт перейти в любом случае». Перебор в игре про
     * соединение точек и ЕСТЬ способ решения; доска сходится тогда, когда
     * человек разобрался. Аккуратность осталась в ЗВЁЗДАХ — там ей и место.
     */
    const sloppy: DotsMetrics = {
      ...clean,
      accuracy: clean.specific.optimalEdges / (clean.specific.optimalEdges + clean.specific.optimalEdges * 0.4),
    };
    expect(isPassed(sloppy)).toBe(true);
    // …но три звезды за такую партию не дают: порог звёзд не тронут.
    expect(sloppy.accuracy).toBeLessThan(0.9);

    // Неполное покрытие не проходит НИКОГДА, даже при идеальной точности.
    expect(isPassed({ ...clean, specific: { ...clean.specific, coverage: 0.99 } })).toBe(false);
  });

  /**
   * 🔴 ЛОВУШКА «ЭЛЕМЕНТ МЁРТВ». `skipIntro` — не украшение: он обязан РЕАЛЬНО
   * заводить партию, а не просто существовать пропом. Проверяем поведением
   * дверь, на которой он держится.
   */
  it('🔴 дверь мимо тренировки действительно открывает партию', () => {
    const clock = fakeClock();
    const fresh = createDotsSession({ seed: 'skip-check', level: 9 });
    expect(fresh.phase).toBe('rules');

    const skipped = startRound(fresh, clock.now());
    expect(skipped.phase).toBe('playing');
    expect(skipped.startedAt).toBe(clock.now());       // часы партии пошли
    expect(skipped.puzzle.level).toBe(9);              // и это НАСТОЯЩИЙ уровень, не тренировка

    // Обратное тоже важно: из тренировки этой дверью не выйти, иначе
    // тренировочная сетка засчиталась бы за партию.
    const training = startTraining(fresh);
    expect(startRound(training, clock.now()).phase).toBe('training');
  });

  /** Знакомство остаётся достижимым: путь через правила и тренировку жив. */
  it('путь через правила и тренировку никуда не делся', () => {
    const clock = fakeClock();
    let session = startTraining(createDotsSession({ seed: 'intro-check', level: 20 }));
    expect(session.phase).toBe('training');
    // Тренировка — всегда самая мелкая сетка, 4×4: она учит правилу, а не сложности.
    // На первых уровнях партия такая же по размеру, поэтому берём уровень повыше,
    // где разница видна, и заодно проверяем, что тренировка НИКОГДА не крупнее партии.
    expect(session.trainingPuzzle.size).toBe(4);
    expect(session.trainingPuzzle.size).toBeLessThan(session.puzzle.size);
    session = { ...session, phase: 'training-complete' };
    expect(advanceFromTraining(session, clock.now()).phase).toBe('playing');
  });

  /**
   * СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ, А НЕ ТАЙМЕРОМ. Проверяем обе половины:
   * поле действительно растёт, и таймера в ядре нет вовсе — то есть ускорить
   * игру вместо усложнения физически нечем.
   */
  it('🔴 сложность растёт полем и парами, а не сокращением времени', () => {
    const size = (l: number) => generateDotsPuzzle(`p-${l}`, l).size;
    const pairs = (l: number) => generateDotsPuzzle(`p-${l}`, l).pairCount;
    /**
     * ⚠️ ЧИСЛА ОБНОВЛЕНЫ ПОД ГЕНЕРАТОР v2 (22.08.2026). Было: `size(1) === 4`,
     * `size(LEVELS) === 8` и рост размера на ступенях 1→7→13→19→25. Это и было
     * замером старой болезни: стартовая доска 4×4 на три пары, потолок 8×8 на
     * восемь пар и пятнадцать одинаковых уровней в хвосте. Ступени подъёма
     * стали короче (по три уровня), поэтому и контрольные точки другие. Разбор
     * всей кривой и обратная сторона («поле не стоит на месте») — в
     * `dots-flow.test.ts`, здесь остаётся сама мысль: сложность несёт
     * СОДЕРЖАНИЕ доски, а не сокращение времени.
     */
    expect(size(1)).toBe(5);
    expect(pairs(1)).toBe(4);
    expect(Math.max(...Array.from({ length: LEVELS }, (_, i) => size(i + 1)))).toBe(10);
    expect(pairs(LEVELS)).toBe(14);
    for (const [a, b] of [[1, 4], [4, 7], [7, 10], [10, 13]]) {
      expect(`L${a}=${size(a)} < L${b}=${size(b)}`).toBe(`L${a}=${size(a)} < L${b}=${size(b + 0)}`);
      expect(size(b)).toBeGreaterThan(size(a));
    }
    expect(pairs(LEVELS)).toBeGreaterThan(pairs(1));
    // Ни секундомера, ни лимита: искать нечего ни в сессии, ни в метрике.
    const core = readFileSync(join(ROOT, 'src/games/dots-connect/core/session.ts'), 'utf8') as string;
    expect(/setTimeout|setInterval|deadline|timeLimit/.test(core)).toBe(false);
  });

  it('вся лесенка собирается и решается — недостижимых уровней нет', () => {
    const broken: string[] = [];
    for (let level = 1; level <= LEVELS; level++) {
      const puzzle = generateDotsPuzzle(`sweep-${level}`, level);
      if (!solveDotsPuzzle(puzzle)) broken.push(`L${level}`);
    }
    expect(broken).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — экран подключён так, как задумано', () => {
  /**
   * 🔴 СВОЙ ЭКРАН ИТОГА МОДУЛЯ ВЫКЛЮЧЕН.
   *
   * Это главный риск всей приёмки. У модуля есть собственный экран
   * поздравления, и в лаборатории он включён по умолчанию. Оставить его в
   * приложении значит тихо выпасть из всей бухгалтерии: звёзды по уровням,
   * серия чистых прохождений и глаз-разрядка пишутся ТОЛЬКО в LevelCleared.
   * Проверяем не текст пропа, а ЗНАЧЕНИЕ, которое до модуля доедет.
   */
  it('🔴 экран поздравления модуля выключен, итог рисует общий LevelCleared', () => {
    const src = screen();
    const value = evaluate(propExpr(moduleTag(src), 'showOwnResults'), src);
    expect(`showOwnResults → ${value}`).toBe('showOwnResults → false');
    expect(src).toContain('<LevelCleared');
  });

  /**
   * 🔴 primary В ТЕМЕ — ЦВЕТ ИГРЫ, А НЕ АКЦЕНТ ПРОФИЛЯ.
   *
   * Модуль красит им свою главную кнопку. Отдать туда `colors.primary` значит:
   * внутри игры кнопка оранжевая или синяя по профилю, а снаружи, на экране
   * настроек, — градиент игры. Один экран, две схемы. Метка «ПРОФИЛЬ:…» ловит
   * это независимо от того, как выражение записано.
   */
  it('🔴 модулю отдан цвет игры, а не акцент профиля', () => {
    const src = screen();
    const theme = propExpr(moduleTag(src), 'theme');
    const m = /(?<![\w$])primary\s*:\s*([^,\n]+)/.exec(theme);
    expect(m).toBeTruthy();
    const value = String(evaluate(m![1].trim(), src));
    expect(`primary → ${value}`).toBe(`primary → ${gradient(src)[0]}`);
    expect(value.startsWith('ПРОФИЛЬ:')).toBe(false);
  });

  /**
   * 🔴 ЧАСЫ ПРИХОДЯТ ИЗ ОБЩЕГО МЕСТА. Проп `now` не передан — модуль молча
   * берёт `Date.now`, и часы не замрут на паузе. Гейт game-clock-discipline
   * ловит только прямые `Date.now()` в экране; ЭТОТ случай он не видит, потому
   * что настенные часы тут прячутся в значении по умолчанию чужого файла.
   */
  it('🔴 модулю переданы общие игровые часы, а не умолчание', () => {
    const src = screen();
    const expr = propExpr(moduleTag(src), 'now').trim();
    expect(expr.length).toBeGreaterThan(0);
    // Имя, которое передали, обязано приезжать из общего модуля паузы.
    const imported = new RegExp(`import\\s*\\{[^}]*(?<![\\w$])${expr}(?![\\w$])[^}]*\\}\\s*from\\s*'@/src/services/gamePause'`);
    expect(`${expr} импортирован из gamePause: ${imported.test(src)}`).toBe(`${expr} импортирован из gamePause: true`);
    // И своих настенных часов в экране нет.
    expect(/[^\w.]Date\.now\(\)/.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false);
  });

  /**
   * ТРОПИНКА ПОКАЗЫВАЕТ ВСЮ ЛЕСЕНКУ. По умолчанию LevelProgressMap рисует 15
   * узлов. Уровней здесь сорок — с умолчанием две трети пути были бы не видны,
   * и человек считал бы игру пройденной на середине.
   */
  it('тропинка знает про все уровни игры, а не про 15 по умолчанию', () => {
    const src = screen();
    const m = /<LevelProgressMap[\s\S]*?maxLevel=\{([^}]+)\}/.exec(src);
    expect(m).toBeTruthy();
    expect(`maxLevel → ${evaluate(m![1], src)}`).toBe(`maxLevel → ${LEVELS}`);
  });

  /** Уровень в сессии — то, из чего восстанавливается прогресс после сброса. */
  it('🔴 уровень уходит в сессию', () => {
    const src = screen();
    const call = src.slice(src.indexOf('saveSession('));
    expect(call).toContain('game_type:');
    expect(/details:\s*\{[\s\S]{0,400}?(?<![\w$])level\s*[,:]/.test(call)).toBe(true);
  });

  /**
   * 🔴 ИТОГ ПОКАЗЫВАЕТ ПРОЙДЕННЫЙ УРОВЕНЬ, А НЕ УЖЕ ПОДНЯТЫЙ.
   *
   * Эту дыру нашли ГЛАЗАМИ в браузере 19.08.2026, гейты её не видели. `level`
   * на экране вычисляется на каждом рендере из достигнутого, а `lvl.reach()`
   * поднимает достигнутое прямо перед показом итога. Пройдя ПЕРВЫЙ уровень,
   * человек читал «Уровень 2 пройден! … Запускаем уровень 3», и звёзды за
   * первый уровень ложились в ключ второго — узел первого оставался пустым
   * на тропинке навсегда.
   *
   * Проверяем смысл: показанное число не может быть тем же выражением, которое
   * только что подняли, и обязано приходить из метрики партии — она одна не
   * зависит от порядка setState.
   */
  it('🔴 в итоге стоит номер сыгранного уровня, а не следующего', () => {
    const code = screen().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const shown = /<LevelCleared[\s\S]*?(?<![\w$])level=\{([^}]+)\}/.exec(code)?.[1].trim();
    const raised = /\.reach\(\s*([A-Za-z_$][\w$]*)\s*\+\s*1\s*\)/.exec(code)?.[1];
    expect(`показываем «${shown}», поднимаем «${raised}»`)
      .not.toBe(`показываем «${raised}», поднимаем «${raised}»`);

    // Показанное число заводится состоянием, и это состояние кормит МЕТРИКА партии.
    const decl = new RegExp(`const \\[${shown}, (set\\w+)\\]`).exec(code);
    expect(`состояние для «${shown}» найдено: ${Boolean(decl)}`).toBe(`состояние для «${shown}» найдено: true`);
    const setter = decl![1];
    const fed = new RegExp(`${setter}\\(\\s*([A-Za-z_$][\\w$.]*)\\s*\\)`).exec(code);
    expect(fed).toBeTruthy();
    const arg = fed![1];
    const fromMetric = arg.endsWith('details.level')
      || new RegExp(`(?:const|let)\\s+${arg}\\s*=\\s*[A-Za-z_$][\\w$]*\\.details\\.level`).test(code);
    expect(`«${arg}» приходит из details.level: ${fromMetric}`).toBe(`«${arg}» приходит из details.level: true`);
  });

  /**
   * ПОРОГ НЕ ДУБЛИРУЕТСЯ. Соблазн написать здесь свою константу велик — так
   * сделано в соседней «Прикидке», и там это верно, потому что порога в её
   * модуле нет. Здесь он есть, и вторая копия разъехалась бы молча.
   */
  it('порог прохождения берётся из модуля, а не переписан в экране', () => {
    const src = screen();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toContain('isPassed');
    // Своей числовой константы порога быть не должно.
    expect(/PASS_[A-Z_]*\s*=\s*0?\.\d+/.test(code)).toBe(false);
  });

  /**
   * 🔴 ЛОВУШКА «РАЗМЕТКА ЕСТЬ, ЭЛЕМЕНТ МЁРТВ». Дверь к правилам нарисована —
   * но состояние, которым она управляет, должно ПРИСВАИВАТЬСЯ, иначе кнопка
   * есть, а правила не открываются никогда. Ровно так бейдж в SET был написан,
   * переведён на 12 языков и не показался ни разу.
   */
  it('🔴 знакомство с правилами достижимо, а не только нарисовано', () => {
    const src = screen();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // Проп доезжает до модуля…
    expect(propExpr(moduleTag(src), 'skipIntro').length).toBeGreaterThan(0);
    // …его источник — состояние, и это состояние кто-то ЗАДАЁТ, а не только читает.
    const setter = /const \[(\w+), (set\w+)\] = React\.useState\((?:true|false)\)/g;
    const states = [...code.matchAll(setter)].map((m) => ({ read: m[1], write: m[2] }));
    const intro = states.find((s) => propExpr(moduleTag(src), 'skipIntro').includes(s.read));
    expect(`состояние знакомства найдено: ${Boolean(intro)}`).toBe('состояние знакомства найдено: true');
    expect(new RegExp(`${intro!.write}\\(`).test(code)).toBe(true);
    // Обе ветки живые: и «через правила», и «сразу партия».
    expect(new RegExp(`${intro!.write}\\(\\s*true\\s*\\)|start\\(\\s*true\\s*\\)`).test(code)).toBe(true);
    expect(new RegExp(`${intro!.write}\\(\\s*false\\s*\\)|start\\(\\s*false\\s*\\)`).test(code)).toBe(true);
  });

  /**
   * ВЫХОД ИЗ ПАРТИИ СУЩЕСТВУЕТ, И ОН НЕ МОЛЧАЛИВЫЙ.
   *
   * Модуль рисует свою кнопку выхода ТОЛЬКО на экране правил. Пропустив
   * правила, человек оказался бы в партии без единого способа уйти: своя пауза
   * даёт «продолжить» и «заново», а на вебе (Android у нас WebView) аппаратной
   * «назад» под рукой нет.
   *
   * ⚠️ ПРИЗНАК ПЕРЕПИСАН 20.08.2026 ВМЕСТЕ С МЕХАНИЗМОМ. Раньше выход давала
   * своя шапка экрана (`accessibilityLabel={t('back')}` + `setPhase('config')`)
   * — и уводила МОЛЧА: один промах по стрелке стирал проложенные пути. Теперь
   * партия стоит на общем каркасе, выход даёт его шапка, и он проходит через
   * вопрос «партия пропадёт». Проверяем ту же СПОСОБНОСТЬ, но по новому месту:
   * каркас есть, ему передан обработчик ухода, и вопрос при выходе включён.
   * Проверка стала строже — раньше «уводит молча» её устраивало.
   */
  it('🔴 из живой партии есть выход, и он спрашивает', () => {
    const src = screen();
    const play = src.slice(src.indexOf("if (phase === 'playing')"), src.indexOf('<DotsConnectGame'));
    const body = stripComments(play);
    expect(body).toContain('<GameShell');
    // Уход ведёт на экран настройки — тем же путём, что вёл выход модуля.
    expect(/onBack=\{/.test(body)).toBe(true);
    expect(/const leaveToConfig[^\n]*setPhase\('config'\)/.test(stripComments(src))).toBe(true);
    // И он не молчаливый: вопрос при выходе включён живым флагом, а не literal false.
    const confirm = /confirmExit=\{([^}]*)\}/.exec(body);
    expect(`confirmExit: ${confirm?.[1] ?? 'нет'}`).not.toBe('confirmExit: нет');
    expect(`confirmExit: ${confirm?.[1]}`).not.toBe('confirmExit: false');
  });

  /** Кнопка «назад» — 48×48. У соседней «Прикидки» здесь 32×34, и это её долг. */
  it('кнопка «назад» пролезает под палец', () => {
    const src = screen();
    const m = /back:\s*\{([^}]*)\}/.exec(src);
    expect(m).toBeTruthy();
    const w = /width:\s*(\d+)/.exec(m![1]);
    const h = /height:\s*(\d+)/.exec(m![1]);
    expect(`${w?.[1]}×${h?.[1]}`).toBe('48×48');
  });

  /** Главные кнопки модуля тоже под палец — их рисует он, а не экран. */
  it('кнопки модуля не мельче 48 pt', () => {
    const m = /actionButton:\s*\{([^}]*)\}/.exec(moduleUi());
    expect(m).toBeTruthy();
    const min = /minHeight:\s*(\d+)/.exec(m![1]);
    expect(Number(min?.[1] ?? 0)).toBeGreaterThanOrEqual(48);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('«Соедини точки» — что делать, написано на экране', () => {
  /**
   * ⚠️ ПРОВЕРЯЕТСЯ, ЧТО СТРОКА РИСУЕТСЯ, А НЕ ЧТО ОНА НАПИСАНА. Реестр
   * game-task-line числит этот экран обёрткой и указывает сюда: строка живёт в
   * модуле, и её сохранность стережём мы. Строка в исходнике ничего не значит —
   * она может лежать в ветке, которую во время партии не рисуют.
   */
  it('🔴 правило игры рисуется в той ветке, что видна во время партии', () => {
    const ui = moduleUi();
    // Ветка правил: что соединять и — главное — что сетку надо занять ЦЕЛИКОМ.
    /**
     * ⚠️ СРЕЗ ПО САМОЙ ВЕТКЕ, А НЕ ПО ПЕРВОМУ УПОМИНАНИЮ ФАЗЫ. Раньше границы
     * искались по голым `session.phase === 'rules'` / `'paused'` — и первая же
     * функция в файле, помянувшая `'paused'` выше веток рендера
     * (`hasSomethingToLose`), схлопнула срез в пустую строку. Пустая строка
     * ничего не содержит, и гейт покраснел на исправном модуле. Теперь якорь —
     * `if (session.phase === '…') {`, то есть сама ветка отрисовки.
     */
    const rules = ui.slice(ui.indexOf("if (session.phase === 'rules') {"), ui.indexOf("if (session.phase === 'paused') {"));
    expect(rules.length).toBeGreaterThan(0);   // срез не схлопнулся — иначе проверки ниже слепы
    expect(rules).toContain('strings.rulesBody');
    expect(rules).toContain('strings.rulesCoverage');
    // Ветка партии: подпись раунда и подсказка тренировки над самой доской.
    const play = ui.slice(ui.indexOf('const puzzle = getCurrentPuzzle(session)'));
    expect(play).toContain('roundLabel');
    expect(play).toContain('strings.trainingHint');
    expect(play).toContain('<DotsBoard');
  });

  /** Обе стороны словаря модуля целы: ни одной пустой подписи на двух языках. */
  it('свой словарь модуля полон на ru и en', () => {
    const ru = getDotsStrings('ru');
    const en = getDotsStrings('en');
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    const empty = Object.entries(ru).filter(([, v]) => !String(v).trim())
      .concat(Object.entries(en).filter(([, v]) => !String(v).trim()));
    expect(empty).toEqual([]);
    // Экран берёт название и правила ОТТУДА — значит на карточке не окажется имя ключа.
    expect(screen()).toContain('getDotsStrings');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// НАСТОЯЩИЙ РЕНДЕР МОДУЛЯ. Пальцем по доске, а не чтением исходника.
//
// 🔴 ЗАЧЕМ ЭТОТ БЛОК ПОЯВИЛСЯ. Он дописан ПОСЛЕ мутационной проверки, и это не
// украшение: мутация «модуль перестал уважать skipIntro» оставила гейт зелёным.
// То есть проп передавался, состояние жило, ядро умело открывать партию — а
// доказательства, что модуль всё это СЛУШАЕТ, не было ни одного. Ровно тот
// класс дыры, ради которого мутации и гоняют: сломай и посмотри, кто заметил.
//
// Здесь модуль монтируется по-настоящему и проходится пальцем по решению
// солвера через PanResponder — тот же путь, что у живого касания.
// ═════════════════════════════════════════════════════════════════════════════
import React from 'react';
import DotsConnectGame from '@/src/games/dots-connect/DotsConnectGame';

const TestRenderer = require('react-test-renderer');

const RENDER_THEME = {
  background: '#fff', surface: '#eee', card: '#fff', text: '#000', textSecondary: '#666',
  primary: '#2563eb', border: '#ccc', success: '#0a0', error: '#a00', warning: '#fa0',
};
const BOARD_PX = 320;

/** Синтетическое касание: PanResponder читает не только координаты, но и историю. */
let touchStamp = 0;
function touchAt(x: number, y: number) {
  touchStamp += 16;
  const bank = {
    touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 0,
    currentPageX: x, currentPageY: y, currentTimeStamp: touchStamp,
    previousPageX: x, previousPageY: y, previousTimeStamp: touchStamp - 16,
  };
  return {
    nativeEvent: {
      locationX: x, locationY: y, pageX: x, pageY: y, identifier: 1, timestamp: touchStamp,
      touches: [{ identifier: 1, pageX: x, pageY: y }],
      changedTouches: [{ identifier: 1, pageX: x, pageY: y }],
    },
    touchHistory: {
      touchBank: [undefined, bank], numberActiveTouches: 1,
      indexOfSingleActiveTouch: 1, mostRecentTimeStamp: touchStamp,
    },
    persist() {}, preventDefault() {}, stopPropagation() {},
  };
}

/** Монтирует модуль и, если просят, проходит доску пальцем до конца. */
function mountAndPlay(props: Record<string, unknown>, { solve = false } = {}) {
  const completions: DotsMetrics[] = [];
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(DotsConnectGame, {
      seed: 'render-check', level: 1, locale: 'ru', theme: RENDER_THEME,
      gameGradient: ['#2563eb', '#0f766e'], gameGradientText: '#fff',
      now: () => 1000, onComplete: (m: DotsMetrics) => completions.push(m),
      ...props,
    } as any));
  });
  const board = () => tree.root.findAll((n: any) => n.props?.accessibilityRole === 'adjustable')[0];
  const text = () => JSON.stringify(tree.toJSON());

  if (solve) {
    const puzzle = generateDotsPuzzle('render-check', Number(props.level ?? 1));
    const unit = BOARD_PX / puzzle.size;
    const at = (c: Cell) => touchAt((c.col + 0.5) * unit, (c.row + 0.5) * unit);
    TestRenderer.act(() => {
      board().props.onLayout({ nativeEvent: { layout: { width: BOARD_PX, height: BOARD_PX } } });
    });
    const solution = solveDotsPuzzle(puzzle)!;
    for (const pair of puzzle.pairs) {
      const path = solution[pair.id] as Cell[];
      if (!board()) break;                       // доска исчезла — партия уже собрана
      TestRenderer.act(() => { board().props.onResponderGrant(at(path[0])); });
      for (const cell of path.slice(1)) {
        if (!board()) break;
        TestRenderer.act(() => { board().props.onResponderMove(at(cell)); });
      }
      if (board()) TestRenderer.act(() => { board().props.onResponderRelease(at(path[path.length - 1])); });
    }
  }
  return { completions, board, text, json: () => tree.toJSON() };
}

describe('«Соедини точки» — модуль слушается пропов на живом рендере', () => {
  /**
   * 🔴 ГЛАВНЫЙ КОНТРАКТ ПРИЁМКИ, ЦЕЛИКОМ И ПОВЕДЕНИЕМ.
   *
   * Из HANDOFF дословно: «onComplete still fires once, while the module renders
   * no competing result screen». Обе половины проверяем настоящим прохождением:
   * доска собрана пальцем, и после последнего касания модуль обязан УЙТИ СО
   * СЦЕНЫ, отдав результат ровно один раз. Иначе поверх общего LevelCleared
   * висел бы второй экран поздравления, а звёзды и серия писались бы мимо кассы.
   */
  it('🔴 при showOwnResults=false модуль уходит со сцены, отдав результат ровно раз', () => {
    const run = mountAndPlay({ showOwnResults: false, skipIntro: true }, { solve: true });
    expect(run.completions).toHaveLength(1);
    expect(run.completions[0].details.level).toBe(1);
    expect(run.completions[0].specific.coverage).toBe(1);
    expect(isPassed(run.completions[0])).toBe(true);
    expect(run.json()).toBeNull();                     // на сцене НИЧЕГО — итог рисует приложение
  });

  /** Обратная сторона: в лаборатории свой экран итога есть, и он не сломан. */
  it('при showOwnResults=true свой экран итога у модуля всё-таки есть', () => {
    const run = mountAndPlay({ showOwnResults: true, skipIntro: true }, { solve: true });
    expect(run.completions).toHaveLength(1);
    expect(run.text()).toContain(getDotsStrings('ru').resultTitle);
  });

  /**
   * 🔴 ЭТО НАШЁЛА МУТАЦИЯ. Без проверки можно было выкинуть обработку skipIntro
   * из модуля, и никто бы не заметил: экран честно передаёт проп, ядро честно
   * умеет открывать партию — а человек всё равно решал бы тренировочную сетку
   * 4×4 перед каждым из сорока уровней.
   */
  it('🔴 skipIntro действительно пропускает правила и тренировку', () => {
    const s = getDotsStrings('ru');
    const skipped = mountAndPlay({ showOwnResults: false, skipIntro: true, level: 5 });
    expect(skipped.text()).not.toContain(s.startTraining);
    expect(skipped.board()).toBeTruthy();                       // сразу доска
    expect(skipped.text()).toContain('Уровень 5');              // и это НАСТОЯЩИЙ уровень

    const intro = mountAndPlay({ showOwnResults: false, skipIntro: false, level: 5 });
    expect(intro.text()).toContain(s.startTraining);            // а тут правила
    expect(intro.text()).toContain(s.rulesCoverage);            // и главное правило видно
    expect(intro.board()).toBeFalsy();                          // доски ещё нет
  });

  /**
   * Цвет игры доезжает до кнопки модуля, а надпись на ней читается. Проверяем
   * нарисованное: у кнопки заливка ровно та, что передали в primary.
   */
  it('главная кнопка модуля красится переданным цветом игры', () => {
    const run = mountAndPlay({
      showOwnResults: false, skipIntro: false,
      // Фон делаем ЗАВЕДОМО ОТЛИЧИМЫМ: в лаборатории надпись на главной кнопке
      // бралась из него, и без отличимого фона проверка ловила бы совпадение,
      // а не подмену.
      theme: { ...RENDER_THEME, background: '#010203', primary: '#123456', primaryText: '#fedcba' },
    });
    const painted = JSON.stringify(run.json());
    // Заливка — ровно то, что передали. Значит цвет игры доезжает до кнопки,
    // а не подменяется палитрой модуля по умолчанию.
    expect(painted).toContain('#123456');
    // А надпись на ней — посчитанная под контраст, а не цвет фона приложения:
    // в тёмных профилях чёрный на синем даёт 4.06 при норме AA 4.5.
    expect(painted).toContain('#fedcba');
    expect(painted).not.toContain('"color":"#010203"');
  });
});
