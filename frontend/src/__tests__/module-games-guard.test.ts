/**
 * ЛАБОРАТОРНАЯ ИГРА НЕ ПРИЕЗЖАЕТ БЕЗ ПАУЗЫ И БЕЗ ВОПРОСА ПРИ ВЫХОДЕ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Семь игр приняли из отдельной лаборатории за два дня, и
 * шесть из них (`dots-connect`, `one-line`, `faces-names`, `object-tracker`,
 * `navigator`, `rhythm-pitch`) собрали СВОЮ рамку вместо общего каркаса:
 * `SafeAreaView` и модуль внутри. Замер 20.08.2026 по этим шести: ноль
 * обращений к общей паузе на уровне экрана и ноль защит выхода. Из этого
 * следовало ровно две беды, и обе человеку видны:
 *
 *   1. ПАРТИЯ НЕ ВСТАЁТ, ПОКА ПИШЕШЬ ОТЗЫВ. Репорт тестировщицы 18.08.2026
 *      дословно: «писала отзыв, пауза не наступила, и теперь не понимаю, что за
 *      игра». Механизм починили в `GameShell`, но игра, которая на каркасе не
 *      стоит, его не получает — и беда вернулась вместе с новыми играми.
 *      Дороже всего это в «Трекере объектов»: суть игры — вести глазами
 *      движущиеся шары, и окно отзыва посреди раунда означало проигранную
 *      партию.
 *   2. ВЫХОД БЕЗ ВОПРОСА. Промах по «назад» стирал партию молча.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ, А НЕ «ПРОСТО ПЕРЕСЕЛИЛИ». Игры приезжают из лаборатории
 * пачками и принимаются по одной, параллельными заходами. Модуль там
 * самодостаточен — рисует экран целиком, — и соблазн повесить его в голую
 * рамку возникает у КАЖДОЙ следующей приёмки заново. Шесть раз подряд он и
 * возник. Поэтому список экранов-обёрток берётся С ДИСКА, а не из этого файла:
 * седьмая игра, приехавшая завтра, попадёт под проверку без правки гейта.
 *
 * ⚠️ ЧТО ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ. Флаг «есть что терять» — самое
 * лёгкое место, чтобы соврать: передать `confirmExit={true}` (вопрос на пустом
 * месте, человек привыкает жать «выйти» не читая) или `confirmExit={false}`
 * (вопроса нет вовсе, а проп написан). Поэтому предикат каждой игры здесь
 * ГОНЯЕТСЯ по-настоящему: свежая партия обязана давать «нечего», партия после
 * действия — «есть».
 *
 * ⚠️ КОММЕНТАРИИ СРЕЗАЕМ ПЕРЕД ПОИСКОМ. За два дня слово в комментарии держало
 * проверку зелёной шесть раз: рассказ о механизме считался механизмом. Здесь
 * это особенно легко — обоснования пропов пишутся прямо внутри разметки.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

import {
  createDotsSession,
  startRound as startDotsRound,
  beginPath as beginDotsPath,
  extendPath as extendDotsPath,
  startTraining as startDotsTraining,
} from '@/src/games/dots-connect/core';
import { hasSomethingToLose as dotsArmed } from '@/src/games/dots-connect/DotsConnectGame';

import {
  createOneLineSession,
  getCurrentOneLinePuzzle,
  startOneLineTraining,
  advanceFromOneLineTraining,
  selectOneLineVertex,
} from '@/src/games/one-line/core/index';
import type { OneLineSession } from '@/src/games/one-line/core/index';
import { hasSomethingToLose as oneLineArmed } from '@/src/games/one-line/OneLineGame';

import {
  createFacesNamesSession,
  startFacesNamesRound,
  advanceFacesNamesStudy,
} from '@/src/games/faces-names/core';
import { hasSomethingToLose as facesArmed } from '@/src/games/faces-names/FacesNamesGame';

import {
  createObjectTrackerSession,
  startObjectTrackerRound,
  startTrackerMovement,
  pauseObjectTrackerSession,
} from '@/src/games/object-tracker/core';
import { hasSomethingToLose as trackerArmed } from '@/src/games/object-tracker/ObjectTrackerGame';

import {
  createNavigatorSession,
  startNavigatorRound,
} from '@/src/games/navigator/core';
import { hasSomethingToLose as navigatorArmed } from '@/src/games/navigator/NavigatorGame';

import {
  createRhythmPitchSession,
  startRhythmPitchRound,
  startCalibrationPlayback,
  recordCalibrationTap,
} from '@/src/games/rhythm-pitch/core';
import { hasSomethingToLose as rhythmArmed } from '@/src/games/rhythm-pitch/RhythmPitchGame';

const ROOT = join(__dirname, '../..');
const GAMES_DIR = join(ROOT, 'app/games');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8') as string;
const game = (f: string): string => readFileSync(join(GAMES_DIR, f), 'utf8') as string;

/** Комментарии — не код. См. шапку файла. */
const code = (src: string): string =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ИГРОВОЙ РЕНДЕР: то, что показывается во время партии. Берём куски между
 * `<GameShell` и `</GameShell>`, потому что вопрос всегда один и тот же —
 * нарисовано ли это ТАМ, где человек сейчас играет, а не в ветке настройки.
 */
function shellSpans(src: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const s = src.indexOf('<GameShell', from);
    if (s < 0) break;
    const e = src.indexOf('</GameShell>', s);
    if (e < 0) break;
    out += src.slice(s, e) + '\n';
    from = e + 12;
  }
  return out;
}

/** Значение пропа `<имя>={ … }` со сбалансированными скобками. */
function propSpan(src: string, name: string): string | null {
  const at = src.search(new RegExp(`(^|[\\s{])${name}=\\{`));
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

/**
 * ЭКРАН-ОБЁРТКА ЛАБОРАТОРНОГО МОДУЛЯ — берётся С ДИСКА.
 *
 * Признак: экран монтирует компонент `<ЧтоТоGame`, живущий в `src/games/*`.
 * Именно такой экран и есть та развилка, на которой шесть раз подряд выбрали
 * свою рамку вместо каркаса. Список из файла тут был бы бесполезен: новая игра
 * в него просто не попала бы, а гейт остался бы зелёным.
 */
const WRAPPERS: string[] = readdirSync(GAMES_DIR)
  .filter((f: string) => f.endsWith('.tsx'))
  .filter((f: string) => /<[A-Z]\w*Game\b/.test(code(game(f))))
  .sort();


/**
 * ДОВЕСТИ «ОДНУ ЛИНИЮ» ДО НАСТОЯЩЕЙ ПАРТИИ.
 *
 * ⚠️ КОРОТКОГО ПУТИ ТУТ НЕТ, И ЭТО ВАЖНО ДЛЯ ЧЕСТНОСТИ СЦЕНАРИЯ. В ядро дверь
 * «сразу в партию» не заводили: путь один — правила → тренировочный круг →
 * партия, и в `playing` попадаешь, только ПРОЙДЯ тренировку целиком. Первая
 * редакция этого сценария звала `advanceFromOneLineTraining` сразу после
 * `startOneLineTraining` — ядро молча вернуло ту же сессию в фазе `training`,
 * предикат честно ответил «нечего», и проверка покраснела. Красная она была
 * права: сценарий не доводил до партии.
 */
function walkOneLineGraph(session: OneLineSession, limit = 200): OneLineSession {
  const puzzle = getCurrentOneLinePuzzle(session);
  let live = session;
  // Стартовая вершина не любая: на графе с двумя нечётными вершинами ядро
  // принимает ход только с одной из них.
  for (const vertex of puzzle.vertices) {
    const started = selectOneLineVertex(live, vertex.id, 1_000);
    if (started.vertexTrail.length > 0) { live = started; break; }
  }
  for (let step = 0; step < limit; step++) {
    const from = live.vertexTrail[live.vertexTrail.length - 1];
    const used = new Set(live.edgeTrail);
    const edge = puzzle.edges.find((e) => !used.has(e.id) && (e.a === from || e.b === from));
    if (!edge) break;
    const next = selectOneLineVertex(live, edge.a === from ? edge.b : edge.a, 1_001 + step);
    if (next.edgeTrail.length === live.edgeTrail.length) break;   // ход отвергнут
    live = next;
  }
  return live;
}

/** Настоящая партия, в которой ещё не сделано ни одного хода. */
function freshOneLineRound(): OneLineSession {
  const trained = walkOneLineGraph(startOneLineTraining(createOneLineSession({ seed: 'guard', level: 5 })));
  const round = advanceFromOneLineTraining(trained, 2_000);
  // Сценарий обязан ДОВЕСТИ до партии — иначе проверка ниже зелена вслепую.
  if (round.phase !== 'playing') throw new Error(`сценарий не довёл до партии: фаза ${round.phase}`);
  return round;
}

/** Та же партия, но с одним пройденным ребром. */
function walkOneLineEdge(round: OneLineSession): OneLineSession {
  const puzzle = getCurrentOneLinePuzzle(round);
  for (const edge of puzzle.edges) {
    for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
      const started = selectOneLineVertex(round, from, 2_100);
      if (started.vertexTrail.length === 0) continue;
      const walked = selectOneLineVertex(started, to, 2_200);
      if (walked.edgeTrail.length > 0) return walked;
    }
  }
  throw new Error('сценарий не смог пройти ни одного ребра');
}

/**
 * Модули, у которых предикат «есть что терять» гоняется ниже по-настоящему.
 * Ключ — файл экрана, значение — как довести партию до состояния «есть что
 * терять» и как выглядит свежая.
 */
const LIVE_PREDICATES: Record<string, { fresh: () => boolean; busy: () => boolean; why: string }> = {
  'dots-connect.tsx': {
    why: 'первый проложенный сегмент пути',
    fresh: () => dotsArmed(startDotsRound(createDotsSession({ seed: 'guard', level: 6 }), 1_000)),
    busy: () => {
      const started = startDotsRound(createDotsSession({ seed: 'guard', level: 6 }), 1_000);
      const puzzle = started.puzzle;
      const pair = puzzle.pairs[0];
      const begun = beginDotsPath(started, pair.endpoints[0]);
      // Соседняя клетка по вертикали или по горизонтали — куда получится шагнуть.
      const from = pair.endpoints[0];
      const around = [
        { row: from.row + 1, col: from.col },
        { row: from.row - 1, col: from.col },
        { row: from.row, col: from.col + 1 },
        { row: from.row, col: from.col - 1 },
      ];
      for (const cell of around) {
        const next = extendDotsPath(begun, cell, 1_100);
        if (dotsArmed(next)) return true;
      }
      return false;
    },
  },
  'one-line.tsx': {
    why: 'первое пройденное ребро графа',
    fresh: () => oneLineArmed(freshOneLineRound()),
    busy: () => oneLineArmed(walkOneLineEdge(freshOneLineRound())),
  },
  'faces-names.tsx': {
    why: 'первое заученное лицо',
    fresh: () => facesArmed(startFacesNamesRound(createFacesNamesSession({ seed: 'guard', level: 3 }), 1_000)),
    busy: () => facesArmed(advanceFacesNamesStudy(
      startFacesNamesRound(createFacesNamesSession({ seed: 'guard', level: 3 }), 1_000),
    )),
  },
  'object-tracker.tsx': {
    why: 'начавшееся движение — слежение глазами повтором не вернуть',
    fresh: () => trackerArmed(startObjectTrackerRound(
      createObjectTrackerSession({ seed: 'guard', level: 4 }), 1_000,
    )),
    busy: () => trackerArmed(startTrackerMovement(startObjectTrackerRound(
      createObjectTrackerSession({ seed: 'guard', level: 4 }), 1_000,
    ))),
  },
  'navigator.tsx': {
    why: 'начавшийся показ маршрута',
    fresh: () => navigatorArmed(createNavigatorSession({ seed: 'guard', level: 4 })),
    busy: () => navigatorArmed(startNavigatorRound(
      createNavigatorSession({ seed: 'guard', level: 4 }), 1_000,
    )),
  },
  'rhythm-pitch.tsx': {
    why: 'первый удар подстройки задержки',
    fresh: () => rhythmArmed(startCalibrationPlayback(
      startRhythmPitchRound(createRhythmPitchSession({ seed: 'guard', level: 2 }), 1_000),
      [1_100, 1_600, 2_100],
    )),
    /** Удар засчитывается только во время проигрывания метронома — отсюда порядок. */
    busy: () => rhythmArmed(recordCalibrationTap(
      startCalibrationPlayback(
        startRhythmPitchRound(createRhythmPitchSession({ seed: 'guard', level: 2 }), 1_000),
        [1_100, 1_600, 2_100],
      ),
      1_100,
    )),
  },
};

/**
 * Экран-обёртка, которому каркас НЕ нужен, — поимённо и с причиной.
 * Пустой: сейчас таких нет. Список стоит здесь, чтобы следующее исключение
 * пришлось объяснить, а не молча дописать `if (f === ...) continue`.
 */
const NO_SHELL_OK: Record<string, string> = {};

/**
 * 🔴 ДОЛГ: лабораторные обёртки, до которых ЭТОТ заход не дотянулся.
 *
 * Строка — обязательство, а не индульгенция: проверка ниже краснеет, когда долг
 * ПОГАШЕН, но запись осталась. Протухшее исключение хуже отсутствующего — оно
 * молча гасит проверку.
 */
const DEBT: Record<string, string> = {
  'math-slider.tsx':
    '«Прикидка» — седьмая лабораторная обёртка, найденная этим гейтом, а не глазами: своя рамка, '
    + 'ни паузы, ни вопроса при выходе, модулю отдан свой onExit. Заход 20.08.2026 переселял ШЕСТЬ '
    + 'игр другой приёмки и в этот файл не лез: правка чужого экрана затёрла бы параллельную работу. '
    + 'Чинится тем же рецептом: <GameShell confirmExit={armed}> вокруг модуля, onProgress вместо onExit',
};

/**
 * Экраны, где своя кнопка выхода модуля НЕ дыра, — поимённо и с разбором.
 *
 * ⚠️ Это не лазейка, а обратная сторона правила. Кнопка модуля опасна ровно
 * тогда, когда до неё можно дотянуться, ИМЕЯ ЧТО ТЕРЯТЬ. Если она нарисована
 * только там, где терять нечего, вопрос всё равно не задался бы — и запрет был
 * бы запретом ради формы.
 */
const OWN_EXIT_OK: Record<string, string> = {
  'memory-palace.tsx':
    'модуль рисует «Выход» ровно в двух ветках, и обе безопасны: экран ПРАВИЛ (партия ещё не '
    + 'начата, терять нечего — каркас там и сам молчит) и свой экран ИТОГА, который выключен '
    + 'пропом showOwnResults={false} и возвращает null. До живой партии кнопка не доезжает',
};

describe('экраны-обёртки лабораторных модулей', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    // Семь принятых игр: шесть переселённых + «Дворец памяти», который стоял на
    // каркасе с самого начала и был для остальных образцом.
    expect(WRAPPERS.length).toBeGreaterThanOrEqual(7);
    expect(existsSync(join(ROOT, 'src/components/GameShell.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/services/gamePause.ts'))).toBe(true);
    // Разбор пропов действительно работает, а не отдаёт null всем подряд.
    expect(propSpan(shellSpans(code(game('object-tracker.tsx'))), 'confirmExit')).toBeTruthy();
  });

  /**
   * 🔴 ГЛАВНОЕ. Каркас — единственное место, где живут и плашка паузы, и вопрос
   * при выходе, и перехват аппаратной «назад». Экран без него не получает
   * ничего из этого, сколько бы `gameNow()` внутри ни стояло: часы партии
   * замирают, а окно и кнопки — нет.
   */
  it('🔴 партия лабораторного модуля идёт внутри каркаса', () => {
    const bad: string[] = [];
    for (const f of WRAPPERS) {
      if (NO_SHELL_OK[f] || DEBT[f]) continue;   // перечислены поимённо выше
      const play = shellSpans(code(game(f)));
      if (!play) { bad.push(`${f}: модуль смонтирован мимо GameShell — ни паузы, ни вопроса при выходе`); continue; }
      if (!/<[A-Z]\w*Game\b/.test(play)) bad.push(`${f}: каркас есть, но модуль стоит СНАРУЖИ него`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 КАРКАС НЕ СПРЯТАН ЗА ВЫКЛЮЧАТЕЛЕМ.
   *
   * ⚠️ ЭТУ ЛОВУШКУ В ПРОЕКТЕ ЛОВИЛИ ДВАЖДЫ: `{false && <блок/>}` — разметка в
   * файле есть, любой текстовый поиск её находит, а на экране её нет ни разу.
   * Проверка, довольная одним наличием тега, зелена ровно тогда, когда игра
   * сломана. Поэтому смотрим, ЧТО стоит перед каркасом: выключателя быть не
   * должно, а `return` — должен, иначе это не ветка отрисовки.
   */
  it('🔴 каркас возвращается из ветки, а не спрятан за выключателем', () => {
    const bad: string[] = [];
    for (const f of WRAPPERS) {
      if (NO_SHELL_OK[f] || DEBT[f]) continue;
      const src = code(game(f));
      const at = src.indexOf('<GameShell');
      if (at < 0) continue;                      // отсутствие каркаса ловит проверка выше
      const before = src.slice(Math.max(0, at - 200), at);
      if (/\bfalse\s*(&&|\?)/.test(before) || /&&\s*false\b/.test(before)) {
        bad.push(`${f}: каркас за выключателем — разметка есть, показа нет`);
      }
      if (!/\breturn\b/.test(before)) bad.push(`${f}: каркас не возвращается из ветки отрисовки`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 КАРКАС, НА КОТОРЫЙ ПЕРЕСЕЛИЛИ, ДЕЙСТВИТЕЛЬНО ДАЁТ ПАУЗУ.
   *
   * Весь переезд держится на одном допущении: «стоишь на каркасе — получаешь
   * плашку паузы». Пропади она из каркаса — и шесть игр молча вернутся туда,
   * откуда их вытащили, а гейт выше останется зелёным: экраны-то на каркасе.
   * Поэтому допущение проверяем, а не подразумеваем.
   */
  it('🔴 каркас действительно рисует плашку паузы', () => {
    const shell = code(read('src/components/GameShell.tsx'));
    expect(shell).toContain("from '@/src/services/gamePause'");
    const flat = shell.replace(/\s+/g, ' ');
    /**
     * ⚠️ ПРОВЕРЯЕМ СЦЕПКУ, А НЕ НАЛИЧИЕ СЛОВА. Голое `toContain('onGameHold')`
     * зеленело бы и от переменной с похожим именем, и от импорта, который никто
     * не зовёт, — поймано собственной поломкой этого гейта 20.08.2026.
     * Подписка обязана КОРМИТЬ состояние, которым рисуется плашка.
     */
    const at = flat.indexOf('onGameHold(');
    const near = at === -1 ? '' : flat.slice(Math.max(0, at - 80), at + 140);
    expect(`сцепка onGameHold→состояние: ${/set[A-Z]\w*\(/.test(near)}`).toBe('сцепка onGameHold→состояние: true');
    // Плашка именно РИСУЕТСЯ, и не поверх вопроса о выходе (иначе она съест его кнопки).
    expect(flat).toContain('{paused && !exitGuard.asking && (');
  });

  /**
   * 🔴 ВОПРОС ПРИ ВЫХОДЕ ЕСТЬ И ОН ЖИВОЙ.
   *
   * Два обмана ловятся здесь сразу:
   *   · `confirmExit` не передан вовсе — уход молча;
   *   · `confirmExit={true}` / `{false}` — константа. `true` приучает жать
   *     «выйти» не читая (вопрос там, где терять нечего), `false` — проп
   *     написан, а вопроса нет ни разу. Оба выглядят как починка.
   */
  it('🔴 у каркаса включён вопрос при выходе, и включён живым выражением', () => {
    const bad: string[] = [];
    for (const f of WRAPPERS) {
      if (NO_SHELL_OK[f] || DEBT[f]) continue;
      const play = shellSpans(code(game(f)));
      const span = propSpan(play, 'confirmExit');
      if (span === null) { bad.push(`${f}: confirmExit каркасу не передан — выход молчит`); continue; }
      const flat = span.replace(/\s+/g, '');
      if (flat === 'true') bad.push(`${f}: confirmExit={true} — вопрос там, где терять нечего, приучает жать «выйти» не читая`);
      if (flat === 'false') bad.push(`${f}: confirmExit={false} — проп написан, вопроса нет ни разу`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ВТОРОГО ВЫХОДА, МИМО ВОПРОСА, НЕТ.
   *
   * Модули везут свою кнопку «Выход» (экран правил, своя пауза, экран «звук
   * недоступен»). Под каркасом она становится дырой: уводит напрямую, минуя
   * «партия пропадёт». Половина защиты хуже отсутствующей — человек считает,
   * что вопрос есть, и жмёт ту кнопку, которая не спрашивает.
   */
  it('🔴 модулю не передан свой выход в обход вопроса', () => {
    const bad: string[] = [];
    for (const f of WRAPPERS) {
      if (NO_SHELL_OK[f] || DEBT[f] || OWN_EXIT_OK[f]) continue;
      const play = shellSpans(code(game(f)));
      if (!play) continue;                       // отсутствие каркаса ловит проверка выше
      if (propSpan(play, 'onExit') !== null) {
        bad.push(`${f}: модулю отдан onExit — его кнопка «Выход» уводит мимо вопроса при выходе`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ФЛАГ ВОПРОСА КОРМЯТ ИЗ МОДУЛЯ. Каркас про фазы раунда не знает, экран —
   * тоже: партию ведёт модуль. Не передать `onProgress` значит оставить флаг
   * навсегда в исходном `false` — то есть написать вопрос и не задать его ни
   * разу. Это тот же класс мёртвой разметки, что «строка переведена на 12
   * языков и не показана ни разу».
   */
  it('🔴 модуль отдаёт наверх «есть что терять», иначе флаг мёртв', () => {
    const bad: string[] = [];
    for (const f of WRAPPERS) {
      if (NO_SHELL_OK[f] || DEBT[f]) continue;
      const play = shellSpans(code(game(f)));
      if (!play) continue;
      const confirm = (propSpan(play, 'confirmExit') || '').replace(/\s+/g, '');
      // Флаг — имя состояния экрана. Кто-то обязан его ЗАДАВАТЬ, и задавать из модуля.
      const known = /^[a-zA-Z_$][\w$]*$/.test(confirm);
      if (!known) continue;                      // сложное выражение разбирает человек, не гейт
      if (propSpan(play, 'onProgress') === null) {
        bad.push(`${f}: confirmExit={${confirm}} есть, а onProgress модулю не передан — флаг навсегда false`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ДОЛГ НЕ ПРОТУХ: записанная обёртка ВСЁ ЕЩЁ без каркаса.
   *
   * Протухшая строка — забытая уборка, а не исключение: она молча гасит
   * проверку для игры, которая давно починена, и следующая поломка в ней
   * пройдёт незамеченной.
   */
  it('🔴 долг не протух: перечисленные обёртки всё ещё без каркаса', () => {
    const stale: string[] = [];
    for (const [f, why] of Object.entries(DEBT)) {
      expect(why.length).toBeGreaterThan(60);
      if (!WRAPPERS.includes(f)) { stale.push(`${f}: обёртки больше нет — убрать из долга`); continue; }
      if (shellSpans(code(game(f)))) stale.push(`${f}: каркас появился — перенести из DEBT под общую проверку`);
    }
    expect(stale).toEqual([]);
  });

  /** Долг не растёт: отложить «на потом» ещё одну игру строкой здесь нельзя. */
  it('🔴 долг не растёт', () => {
    expect(Object.keys(DEBT)).toEqual(['math-slider.tsx']);
  });

  /**
   * Разбор «своя кнопка выхода не дыра» не протух: если модулю перестали
   * отдавать `onExit`, запись пора убрать — иначе она прикроет будущую дыру.
   */
  it('разбор своей кнопки выхода не протух', () => {
    const stale: string[] = [];
    for (const [f, why] of Object.entries(OWN_EXIT_OK)) {
      expect(why.length).toBeGreaterThan(60);
      if (!WRAPPERS.includes(f)) { stale.push(`${f}: обёртки больше нет — убрать запись`); continue; }
      if (propSpan(shellSpans(code(game(f))), 'onExit') === null) {
        stale.push(`${f}: onExit модулю больше не отдают — убрать из OWN_EXIT_OK`);
      }
    }
    expect(stale).toEqual([]);
  });

  /** Пауза — общая на всё приложение. Своя рядом с общей — верный способ её сломать. */
  it('своей паузы рядом с общей не заведено', () => {
    const bad: string[] = [];
    for (const f of WRAPPERS) {
      const src = code(game(f));
      if (/holdGame\s*\(/.test(src) && !/from '@\/src\/services\/gamePause'/.test(src)) {
        bad.push(`${f}: пауза не из общего места`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * ⚠️ ЗДЕСЬ КОНЧАЕТСЯ ЧТЕНИЕ ИСХОДНИКОВ И НАЧИНАЕТСЯ ИСПОЛНЕНИЕ.
 *
 * Всё выше проверяет, что проп передан и не константа. Но «не константа» ещё не
 * значит «правда»: предикат мог бы отвечать `true` всегда или `false` всегда, и
 * ни один текстовый поиск этого не увидит. Поэтому предикаты гоняются на живых
 * партиях — по одному сценарию на игру.
 */
describe('«есть что терять» — предикат гоняется, а не читается', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    // Каждая переселённая игра обязана быть здесь: предикат без прогона —
    // это ровно та «написанная и мёртвая» разметка, которую мы и ловим.
    const shellWrappers = WRAPPERS.filter((f) => shellSpans(code(game(f))) !== '');
    const missing = shellWrappers.filter((f) => !LIVE_PREDICATES[f]
      && /onProgress=\{/.test(shellSpans(code(game(f)))));
    expect(missing).toEqual([]);
    expect(Object.keys(LIVE_PREDICATES).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.entries(LIVE_PREDICATES))(
    '%s: свежая партия уходит молча, начатая — спрашивает',
    (file, spec) => {
      // Свежая партия: терять нечего, вопрос был бы вопросом ни о чём.
      expect(`${file}: свежая → ${spec.fresh()}`).toBe(`${file}: свежая → false`);
      // Есть работа (${spec.why}) — молча стирать её нельзя.
      expect(`${file}: ${spec.why} → ${spec.busy()}`).toBe(`${file}: ${spec.why} → true`);
    },
  );

  /**
   * Своя пауза модуля не должна ОТМЕНЯТЬ вопрос: человек ставит партию на паузу
   * и уходит — терять ему по-прежнему есть что. Проверяем на трекере, где своя
   * пауза и общая сходятся ближе всего.
   */
  it('своя пауза модуля не гасит вопрос при выходе', () => {
    const moving = startTrackerMovement(startObjectTrackerRound(
      createObjectTrackerSession({ seed: 'guard', level: 4 }), 1_000,
    ));
    expect(trackerArmed(moving)).toBe(true);
    expect(trackerArmed(pauseObjectTrackerSession(moving, 1_500))).toBe(true);
  });

  /**
   * И обратная сторона: пауза на ПОКАЗЕ ЦЕЛЕЙ вопрос не включает. Иначе флаг
   * «есть что терять» превратился бы в «партия открыта», то есть в тот самый
   * `confirmExit={true}`, только окольным путём.
   */
  it('пауза на показе целей вопрос не включает', () => {
    const preview = startObjectTrackerRound(
      createObjectTrackerSession({ seed: 'guard', level: 4 }), 1_000,
    );
    expect(trackerArmed(pauseObjectTrackerSession(preview, 1_200))).toBe(false);
  });

  /**
   * Тренировочный круг «Соедини точки» — не партия: четыре клетки, повторяется
   * нажатием. Вопрос там был бы шумом.
   */
  it('тренировочная сетка «Соедини точки» вопроса не стоит', () => {
    const training = startDotsTraining(createDotsSession({ seed: 'guard', level: 6 }));
    expect(dotsArmed(training)).toBe(false);
  });
});

/**
 * ЧАСЫ ПАРТИИ У ЭТИХ ШЕСТИ — ИГРОВЫЕ.
 *
 * Отдельно от каркаса: каркас рисует плашку и держит вопрос, но время партии
 * модуль меряет сам, по пропу `now`. Экран, который подаст туда `Date.now`,
 * получит красивую плашку паузы поверх идущего таймера — ровно ту косметику,
 * из-за которой репорт 18.08 выглядел закрытым, оставаясь открытым.
 */
describe('часы партии идут по игровым, а не по настенным', () => {
  it('🔴 модулю подан gameNow, а не Date.now', () => {
    const bad: string[] = [];
    for (const f of Object.keys(LIVE_PREDICATES)) {
      const src = code(game(f));
      const play = shellSpans(src);
      const now = (propSpan(play, 'now') || '').replace(/\s+/g, '');
      if (!now) { bad.push(`${f}: часы модулю не переданы вовсе`); continue; }
      if (/Date\.now/.test(now)) bad.push(`${f}: now={${now}} — настенные часы, партия не встанет на паузу`);
      /**
       * ⚠️ ИМЕНОВАННАЯ ОБЁРТКА — ТОЖЕ ИГРОВЫЕ ЧАСЫ, И ЗАПРЕЩАТЬ ЕЁ НЕЛЬЗЯ.
       * «Одна линия» держит `const now = React.useCallback(() => gameNow(), [])`
       * нарочно: голое `now={gameNow}` не видит гейт дисциплины часов, и экран,
       * который время МЕРЯЕТ, оказался бы вне его проверки. Поэтому имя
       * РАЗВОРАЧИВАЕМ: объявление должно вести к `gameNow`. Просто «имя есть»
       * тут не годится — так прошёл бы и `const now = () => Date.now()`.
       */
      const named = /^[a-zA-Z_$][\w$]*$/.test(now)
        ? new RegExp(`const\\s+${now}\\s*=[^;]*gameNow`).test(src)
        : false;
      if (!/gameNow/.test(now) && !named) bad.push(`${f}: now={${now}} — не игровые часы`);
      if (!/from '@\/src\/services\/gamePause'/.test(src)) bad.push(`${f}: gameNow не из общего места`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * У «Трекера объектов» одних часов МАЛО, и это главная ловушка всей игры: мир
   * двигают дельты кадров `requestAnimationFrame`, они тикают мимо любых часов.
   * Экран, аккуратно заменивший `Date.now` на `gameNow`, продолжал бы гонять
   * шары под окном отзыва. Второй конец — в кадровом цикле.
   */
  it('🔴 у трекера пауза гасит и кадровый цикл, а не только часы', () => {
    const loop = code(read('src/games/object-tracker/useTrackerLoop.ts'));
    expect(loop).toContain("from '@/src/services/gamePause'");
    expect(loop).toContain('onGameHold');
    // Пауза читается ИМЕННО в условии выхода из эффекта, а не лежит рядом.
    const flat = loop.replace(/\s+/g, ' ');
    const guard = /if \(([^)]*)\) return undefined;/.exec(flat);
    expect(`условие цикла: ${guard?.[1] ?? 'не найдено'}`).toContain('held');
  });
});
