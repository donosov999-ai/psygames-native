import { hubScreenFiles } from './_helpers/hubScreens';
import { createMoveStack, MAX_HISTORY } from '@/src/services/moveStack';
/**
 * ОТМЕНА ХОДА: ГДЕ ОНА ЧЕСТНА, ГДЕ ЕЁ НЕТ И ПОЧЕМУ.
 *
 * 🔴 ЗАЧЕМ. Хук `hooks/useMoveHistory` написан для всех пошаговых игр, а стоял
 * в трёх из 64 (замер аудита). Промахнулся пальцем — живи с этим; в маджонге на
 * пятом слое и в девятибуквенной анаграмме это стоит партии.
 *
 * Но отмена уместна НЕ ВЕЗДЕ, и это главное, что здесь стережётся. Она честна,
 * когда ход ОБРАТИМ и возврат не даёт нового знания. Она превращает игру в
 * жульничество, когда:
 *   · ход открывает скрытое (перевернул карту — увидел её);
 *   · идёт замер времени или реакции (откат делает замер бессмысленным);
 *   · ход и есть ОТВЕТ на пробу (фланкер, стоп-сигнал, воспроизведение по памяти).
 *
 * Поэтому гейт держит ДВА поимённых списка: где отмена есть и где её нет с
 * причиной. Молчаливых пропусков быть не должно — новый экран обязан попасть в
 * один из двух, иначе решение «обратим ли тут ход» никто не примет.
 *
 * ⚠️ ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Не наличие кнопки в разметке — на этом уже обжигались
 * (в SET бейдж был написан, переведён на 12 языков, покрыт гейтом и не показывался
 * ни разу). Проверяется, что откат ВОЗВРАЩАЕТ: всё, что ход записал, отмена
 * записывает обратно, и лента гаснет там, где продолжать откатывать нечестно.
 */

/** Развилки — не игры: у них нет ни партии, ни отмены, ни строки задачи. */
const РАЗВИЛКИ = hubScreenFiles();
// Записи про span/sudoku-hub/attention-conflict убраны 04.09.2026: развилки теперь
// отсекаются набором из каталога, и ручной список про них был бы вторым источником.
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const DIR = join(__dirname, '../../app/games');
const GAMES: string[] = readdirSync(DIR).filter((f: string) => f.endsWith('.tsx') && !РАЗВИЛКИ.has(f)).sort();
const src = (f: string) => readFileSync(join(DIR, f), 'utf8') as string;
/** Комментарии режем: гейт не должен ловить собственные объяснения. */
const code = (f: string) =>
  src(f).split('\n').filter((l: string) => {
    const s = l.trim();
    return !s.startsWith('*') && !s.startsWith('//') && !s.startsWith('/*');
  }).join('\n');

/**
 * ⚠️ ГЕЙТ ПРОВЕРЯЕТ СМЫСЛ, А НЕ ИМЕНА. В этом проекте уже четырежды краснели
 * проверки, требовавшие дословного вызова, — и краснели на ПРАВИЛЬНОЙ правке
 * (переименовал обработчик — гейт упал). Поэтому имя функции отмены здесь не
 * зашито: оно берётся ИЗ РАЗМЕТКИ самой кнопки, а тело ищется по этому имени.
 */

/** Кусок разметки САМОЙ кнопки отмены: подпись стоит в начале элемента (a11y-label). */
function undoButton(f: string): string {
  const s = code(f);
  const at = s.indexOf("t('btn_undo')");
  return at < 0 ? '' : s.slice(at, at + 420);
}

/** Имя обработчика, на который позвана кнопка. */
function undoHandler(f: string): string {
  return (undoButton(f).match(/onPress=\{(\w+)\}/) || [])[1] || '';
}

/** Тело функции по имени — от объявления до следующего объявления того же уровня. */
function fnBody(s: string, name: string): string {
  if (!name) return '';
  const at = s.indexOf(`const ${name} = `);
  if (at < 0) return '';
  const rest = s.slice(at);
  const end = rest.slice(1).search(/\n {2}(?:const |function |useEffect\(|\/\*\*|if \()/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// РЕЕСТР. Обе половины поимённо: и «есть», и «нет с причиной».
// ─────────────────────────────────────────────────────────────────────────────

/** Игры с отменой: ход обратим, и возврат не открывает ничего нового. */
const WITH_UNDO: Record<string, string> = {
  'hanoi.tsx': 'перекладывание диска обратимо, все стопки на виду',
  'water-sort.tsx': 'перелив обратим, всё содержимое пробирок на виду — разведывать перебором нечего; счётчик ходов при отмене НЕ уменьшается',
  'tower-london.tsx': 'то же самое: шарики на штырьках, скрытого нет',
  'sudoku.tsx': 'цифра в клетке обратима, доска открыта целиком',
  'sudoku-samurai.tsx': 'партия на час — одно касание не должно её стоить',
  'goods-sort.tsx': 'полная информация: перебором ничего не разведаешь',
  'mahjong.tsx': 'снятие пары обратимо; ПЛАТНО — под снятой парой видно нижний слой',
  'anagrams.tsx': 'буквы на виду, до полного набора игра ничего не проверяет',
  'sudoku-fractal.tsx': 'самая длинная партия приложения; отмена откатывает и открытие дочерней, и цифру, ушедшую в корень',
  'sudoku-fractal-deep.tsx': 'отмена своя поверх дерева: один список ходов по всем узлам, откат возвращает экран в узел хода; всплывшие цифры не хранятся — уходят сами, когда ребёнок падает ниже порога',
};

/**
 * 🔴 ДОЛГ. Экран, где отмена честна и НУЖНА, но её нет.
 *
 * ⚠️ СЕЙЧАС ПУСТ, И ЭТО РЕЗУЛЬТАТ, А НЕ ЗАБЫВЧИВОСТЬ. Единственной записью здесь была
 * фрактальная судоку: замер 19.08.2026 показал, что `useMoveHistory` не упоминается в
 * её экране ни разу, хотя это самая длинная партия приложения. Отмена там появилась в
 * тот же день (агент, за которым закреплён файл), и строчка ушла в WITH_UNDO — ровно
 * так, как этот реестр и задуман: проверка «долг протух» покраснела и попросила
 * перенести.
 *
 * Список открыт: сюда пишут игру, где отмена честна и нужна, но руки до неё не дошли
 * или файл занят параллельным заходом.
 */
const DEBT: Record<string, string> = {};

/**
 * Игры БЕЗ отмены — поимённо и с причиной. Список так же важен, как первый:
 * каждая строка означает, что человек посмотрел и решил, а не забыл.
 *
 * Категории причин:
 *   reveal — ход открывает скрытое, откат = «подсматривай и откатывай»;
 *   probe  — ход и есть ответ на пробу, проверка идёт в тот же тик;
 *   timing — замер времени/реакции, откат делает замер бессмысленным;
 *   already— обратимость уже есть своими средствами (toggle / сброс / TextInput);
 *   n/a    — ходов нет вовсе (хаб-страница, упражнение).
 */
const WITHOUT_UNDO: Record<string, string> = {
  'scholars-mate.tsx': 'timing + probe: ход и есть ответ, и он засекается секундомером — предмет упражнения именно ВРЕМЯ узнавания узора. Откат обнулил бы замер: можно было бы тыкать наугад и отменять до попадания, а медиана времени осталась бы красивой',
  'pause.tsx': 'n/a: ходов нет вовсе — человек дышит и тянется по таймеру, отменять нечего; практика идёт по времени, а не по ответам',
  'dots-connect.tsx': 'already: отмена есть внутри модуля (кнопка «Отменить» и клавиша U возвращают предыдущий снимок путей), но она ПЛАТНАЯ — каждый откат растит errors и режет accuracy, а общий useMoveHistory бесплатен и обесценил бы планирование',
  // reveal — откат вернул бы доску, но не забрал бы увиденное
  'picture-pairs.tsx': 'reveal: перевернул карту — увидел её; отмена = подсматривай и откатывай',
  'find-differences.tsx': 'reveal: тап отмечает найденное отличие, отменять находку незачем',
  'chess-blind.tsx': 'reveal: после ответа доска показывается явно (setRevealSq/setRevealOpt)',

  // probe — ход и есть ответ, правильность считается в тот же тик
  'spatial-span.tsx': 'probe: каждый тап сверяется с ожидаемой клеткой немедленно',
  'memory-matrix.tsx': 'probe: тап сразу даёт попадание/промах',
  'corsi.tsx': 'probe: тап сверяется с последовательностью немедленно',
  'listening-span.tsx': 'probe: тап сверяется с услышанным словом немедленно',
  'mnemonics.tsx': 'probe: неверный тап сразу пишет ошибку и штраф 15 с',
  'pattern.tsx': 'probe: handleAnswer — выбор варианта и есть ответ',
  'set-game.tsx': 'probe: третья карта — ответ; плюс лимит времени с 11 уровня',
  'semantic-sort.tsx': 'probe + timing: handlePick пишет RT в mean_rt_ms',
  'cloze.tsx': 'probe + timing: mean_rt_ms, вариант выбирается один раз',
  'mental-rotation.tsx': 'timing: биомаркер — наклон RT по углу, откат его уничтожит',
  'rmet.tsx': 'probe: выбор эмоции — ответ на пробу',
  'wcst.tsx': 'probe: обратная связь после сортировки И ЕСТЬ обучающий сигнал',
  'prl.tsx': 'probe: вероятностное обучение живёт на обратной связи',
  'iowa.tsx': 'probe: выбор колоды — решение под риском, откат ломает парадигму',
  'bart.tsx': 'probe: накачка шара необратима по замыслу',
  'vocab-srs.tsx': 'probe: gradeCard() пишет грейд в БД повторений до всякого UI',
  'phoneme-pairs.tsx': 'probe: «одинаково/разно» — ответ на пробу',
  'dictation.tsx': 'probe: каждый символ сверяется немедленно, backspace даёт сам движок печати',
  'chinese-tones.tsx': 'probe: услышанный тон — ответ на пробу, отменять нечего',
  'pseudoword-echo.tsx': 'probe: воспроизведение услышанного — ответ',
  'story-recall.tsx': 'probe: пересказ, правка текста и так своя (TextInput)',
  'memory-palace.tsx': 'already: до начала проверки расстановку можно двигать и меняться местами сколько угодно — обратимость встроена в саму фазу; в проверке ответ и есть проба (probe), а лишние предметы делают откат подглядыванием',
  'digit-span.tsx': 'already: ввод в TextInput, системный backspace уже есть',
  'reading-span.tsx': 'already: recall — TextInput с системным backspace',
  'ospan.tsx': 'already: recall — TextInput с системным backspace',
  'word-pairs.tsx': 'probe: пары запоминались заранее, тап по правой карточке — ответ',
  'faces-names.tsx': 'probe + reveal: выбор лица, имени и факта И ЕСТЬ ответ на пробу — он сверяется в тот же тик; а откат к фазе изучения дал бы посмотреть карточки заново, то есть отменил бы саму задачу «вспомни»',
  'n-back.tsx': 'timing: поток стимулов, окно ответа закрывается само',
  'simon.tsx': 'timing: RT в интерференционном эффекте',
  'stroop.tsx': 'timing: interference_effect_ms',
  'stroop-emotional.tsx': 'timing: interference_effect_ms',
  'flanker.tsx': 'timing: interference_effect_ms',
  'posner.tsx': 'timing: эффект подсказки в миллисекундах',
  'ant.tsx': 'timing: три сети внимания считаются по RT',
  'cpt.tsx': 'timing: пропуски и ложные тревоги по времени',
  'go-no-go.tsx': 'timing: торможение измеряется временем ответа',
  'stop-signal.tsx': 'timing: SSRT — весь смысл игры',
  'choice-rt.tsx': 'timing: игра и есть замер времени выбора',
  'switching-task.tsx': 'timing: цена переключения в миллисекундах',
  'inhibition.tsx': 'timing: торможение по времени ответа',
  'lexical-decision.tsx': 'timing: RT на слово/не-слово',
  'sdmt.tsx': 'timing: сколько символов за минуту',
  'math-sprint.tsx': 'timing: скорость счёта и есть предмет',
  'quick-count.tsx': 'timing: субитизация, стимул живёт миллисекунды',
  'visual-search.tsx': 'timing: mean_rt по размеру набора',
  'targets.tsx': 'timing: очки считаются от разницы дедлайна и RT',
  'schulte.tsx': 'timing: таблица Шульте — замер скорости поиска',
  'trail-making.tsx': 'timing: TMT — время прохождения маршрута',
  'proofreading.tsx': 'timing: лимит на корректуру + мгновенная проверка тапа',
  'math-slider.tsx': 'already: ползунок свободно ходит до confirmEstimate',
  'object-tracker.tsx': 'already: выбор цели — переключатель, повторный тап снимает отметку; проверка идёт только по кнопке «Проверить выбор», так что отменять до неё нечего',
  'navigator.tsx': 'probe: нажатое направление сверяется с маршрутом в тот же тик — промах уже записан лишним шагом, а откат стёр бы саму ошибку вместе с метрикой',
  'one-line.tsx': 'already: отмена есть внутри модуля (кнопка «Отменить» и клавиша U снимают последнее ребро), но она ПЛАТНАЯ — каждая отмена режет accuracy, поэтому в общий хук useMoveHistory её не заводили',
  'counter.tsx': 'already: клетка переключается повторным тапом',
  'number-bonds.tsx': 'already: togglePick снимает выбор, проверка по кнопке',
  'phonemic-fluency.tsx': 'timing: интервалы между словами кормят биомаркер',
  'eye-gym.tsx': 'n/a: ходов нет, это упражнение для глаз',
  'breathing.tsx': 'n/a: ходов нет, это дыхательная практика',
  'rhythm-pitch.tsx': 'already + timing: в «пути высоты» отмена есть внутри модуля — «Отменить последний» снимает ступень до отправки ответа; в «эхе ритма» отменять нечего, тап И ЕСТЬ отметка времени, и откат сдвинул бы сам замер',
};

describe('реестр отмены', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(GAMES.length).toBeGreaterThan(50);
  });

  /**
   * Новый экран обязан попасть в один из двух списков. Иначе решение «обратим ли
   * тут ход» никто не примет, и отмена снова окажется в трёх играх из шестидесяти.
   */
  it('каждая игра решена: либо отмена есть, либо записана причина', () => {
    const unclassified = GAMES.filter((f) => !(f in WITH_UNDO) && !(f in WITHOUT_UNDO) && !(f in DEBT));
    expect(unclassified).toEqual([]);
  });

  it('игра не числится в обоих списках сразу', () => {
    const both = GAMES.filter((f) => f in WITH_UNDO && f in WITHOUT_UNDO);
    expect(both).toEqual([]);
  });

  /** Реестр не должен ссылаться на удалённые экраны. */
  it('в реестре нет призраков', () => {
    const all = [...Object.keys(WITH_UNDO), ...Object.keys(WITHOUT_UNDO), ...Object.keys(DEBT)];
    const ghosts = all.filter((f) => !GAMES.includes(f));
    expect(ghosts).toEqual([]);
  });

  /**
   * Протухший долг: отмену в файл добавили, а строчка в DEBT осталась. Тогда долг
   * копился бы вечно и перестал бы что-либо значить.
   */
  it('долг не протух — как появится отмена, строчку убирают', () => {
    const done = Object.keys(DEBT).filter((f) => code(f).includes('useMoveHistory'));
    expect(done).toEqual([]);   // не пусто → перенеси файл из DEBT в WITH_UNDO
  });

  it('у каждой игры без отмены записана ПРИЧИНА, а не отговорка', () => {
    const weak = Object.entries(WITHOUT_UNDO)
      .filter(([, why]) => !/^(reveal|probe|timing|already|n\/a)( \+ (reveal|probe|timing|already))*:/.test(why) || why.length < 25)
      .map(([f]) => f);
    expect(weak).toEqual([]);
  });

  it('игры из списка «есть» действительно берут общий хук, а не свой велосипед', () => {
    const missing = Object.keys(WITH_UNDO).filter((f) => !code(f).includes('useMoveHistory'));
    expect(missing).toEqual([]);
  });

  /**
   * Протухание в обратную сторону: экран завёл ленту отмены, а в реестре он в
   * списке «нет». Значит либо реестр устарел, либо отмену поставили туда, где
   * она нечестна, — и то и другое надо увидеть.
   */
  it('никто не завёл отмену тайком от реестра', () => {
    const sneaky = Object.keys(WITHOUT_UNDO).filter((f) => code(f).includes('useMoveHistory'));
    expect(sneaky).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЯДРО ЛЕНТЫ. Настоящее поведение, без React — так и задумано в moveStack.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe('лента ходов возвращает то, что положили', () => {
  it('снимки выдаются в обратном порядке — это и есть откат', () => {
    const st = createMoveStack<string>();
    st.push('a'); st.push('b'); st.push('c');
    expect(st.undo()).toBe('c');
    expect(st.undo()).toBe('b');
    expect(st.undo()).toBe('a');
    expect(st.undo()).toBeNull();
    expect(st.canUndo()).toBe(false);
  });

  it('новый ход обрывает ветку возврата — иначе redo вернул бы чужую доску', () => {
    const st = createMoveStack<number>();
    st.push(1); st.push(2);
    st.undo();
    expect(st.canRedo()).toBe(true);
    st.push(3);
    expect(st.canRedo()).toBe(false);
  });

  /** Переполнение режем с ХВОСТА: иначе отмена умирала бы на длинной партии. */
  it('на переполнении теряется самый старый ход, а не самый свежий', () => {
    const st = createMoveStack<number>(3);
    st.push(1); st.push(2); st.push(3); st.push(4);
    expect(st.undo()).toBe(4);
    expect(st.undo()).toBe(3);
    expect(st.undo()).toBe(2);
    expect(st.undo()).toBeNull();
  });

  it('потолок ленты заведомо длиннее любой партии', () => {
    expect(MAX_HISTORY).toBeGreaterThanOrEqual(100);
  });

  /**
   * 🔴 СНИМОК ЦЕЛОГО СОСТОЯНИЯ — ровно то, на чём держится откат в сортировке,
   * маджонге и анаграммах. Проверяем, что лента не мутирует положенное: иначе
   * «откат» вернул бы уже изменённый объект, то есть ничего не вернул бы.
   */
  it('снимок состояния возвращается неизменным', () => {
    const st = createMoveStack<{ board: number[] }>();
    const before = { board: [1, 2, 3] };
    st.push(before);
    const after = st.undo();
    expect(after).toEqual({ board: [1, 2, 3] });
    expect(after).toBe(before);
  });

  it('пустая лента ничего не отдаёт — кнопке нечего отменять', () => {
    const st = createMoveStack<number>();
    expect(st.canUndo()).toBe(false);
    expect(st.undo()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ОТКАТ ПОЛНЫЙ, А НЕ ЧАСТИЧНЫЙ.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Что записывает кусок кода: имена состояний (`setX(` → X) и рефов (`xRef.current =`).
 * Смотрим НА СМЫСЛ — какие ячейки состояния тронуты, — а не на дословный вызов:
 * гейт на точную строчку уже четырежды краснел в этом проекте на правильной правке.
 */
function writes(block: string): string[] {
  const out = new Set<string>();
  for (const [, name] of block.matchAll(/\bset([A-Z]\w*)\s*\(/g)) out.add(name);
  for (const [, name] of block.matchAll(/\b(\w+Ref)\.current\s*(?:\[[^\]]*\]\s*)?[+-]?=[^=]/g)) out.add(name);
  return [...out];
}

describe('маджонг: отмена возвращает ВСЁ, что снятие пары изменило', () => {
  const s = code('mahjong.tsx');
  /** Кусок «пара сошлась» — от снимка до проверки «уровень собран». */
  const move = s.slice(s.indexOf('history.push({'), s.indexOf('if (m >= pairsTotal)'));
  const undo = fnBody(s, undoHandler('mahjong.tsx'));

  it('разбор кода нашёл оба куска — иначе проверки ниже зелены вслепую', () => {
    expect(move.length).toBeGreaterThan(100);
    expect(undo.length).toBeGreaterThan(100);
    expect(writes(move).length).toBeGreaterThan(2);
  });

  /**
   * 🔴 ГЛАВНОЕ. Частичный откат хуже отсутствия отката: он оставит доску в
   * состоянии, которого в игре никогда не было. Например вернёт плитки, но
   * оставит начисленные за них очки — и выйдет фарм «снял — отменил — снял».
   */
  it('каждая ячейка, тронутая ходом, тронута и откатом', () => {
    const missed = writes(move).filter((w) => !writes(undo).includes(w));
    expect(missed).toEqual([]);
  });

  it('снимок несёт доску, счётчик пар и очки', () => {
    const shape = s.slice(s.indexOf('interface MahjongSnapshot'), s.indexOf('const UNDOS_PER_LEVEL'));
    for (const field of ['tiles', 'matched', 'score']) expect(shape).toMatch(new RegExp(`\\b${field}:`));
  });

  /**
   * ⚠️ А ПОТРАЧЕННОЙ ПЕРЕТАСОВКИ В СНИМКЕ БЫТЬ НЕ ДОЛЖНО — тот же урок, что в
   * сортировке товаров: верни её отмена, и выйдет бесконечная перетасовка в
   * обход лимита.
   */
  it('потраченную перетасовку отмена не возвращает', () => {
    expect(undo).not.toMatch(/setShufflesUsed/);
  });
});

describe('анаграммы: отмена возвращает набранное слово', () => {
  const s = code('anagrams.tsx');
  const move = s.slice(s.indexOf('const handleLetterPress'), s.indexOf('if (newPicked.length === target.length)'));
  const undo = fnBody(s, undoHandler('anagrams.tsx'));

  it('разбор кода нашёл оба куска', () => {
    expect(move.length).toBeGreaterThan(50);
    expect(undo.length).toBeGreaterThan(50);
  });

  it('каждая ячейка, тронутая ходом, тронута и откатом', () => {
    const missed = writes(move).filter((w) => !writes(undo).includes(w));
    expect(missed).toEqual([]);
  });

  /**
   * 🔴 ВОЗВРАЩАЕТСЯ СНИМОК ЦЕЛИКОМ, А НЕ «минус последняя буква». Срез после
   * «Сброса» оставил бы пустое слово и живую кнопку — состояние, которого в
   * игре не бывает.
   */
  it('откат ставит снимок, а не режет хвост', () => {
    expect(undo).toMatch(/setPicked\(prev\)/);
    expect(undo).not.toMatch(/slice\(0,\s*-1\)/);
  });

  /** «Сброс» тоже кладёт снимок — иначе он был бы единственным необратимым действием. */
  it('«Сброс» откатывается наравне с буквой', () => {
    const at = s.indexOf("t('clear')");
    const name = (s.slice(Math.max(0, at - 300), at).match(/onPress=\{(\w+)\}(?![\s\S]*onPress=)/) || [])[1] || '';
    expect(name).toBeTruthy();                     // «Сброс» позван на функцию, а не на инлайн
    expect(fnBody(s, name)).toMatch(/\.push\(/);   // и она кладёт снимок в ленту
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЦЕНА ОТМЕНЫ.
// ─────────────────────────────────────────────────────────────────────────────

describe('цена отмены назначена по смыслу игры', () => {
  /**
   * 🔴 В маджонге отмена ПЛАТНАЯ, и это не жадность. Плитка верхнего слоя
   * закрывает нижнюю: снял пару — увидел, что под ней. Отмена вернёт плитки, но
   * увиденное не заберёт. Бесплатная отмена = «вскрыл пирамиду, посмотрел,
   * откатил», а вся сложность верхних уровней держится на том, что низа не видно.
   */
  const m = code('mahjong.tsx');

  it('у маджонга есть конечный бюджет отмен на уровень', () => {
    const budget = Number((m.match(/const UNDOS_PER_LEVEL = (\d+)/) || [])[1]);
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThanOrEqual(5);   // больше — уже просвечивание пирамиды
  });

  it('бюджет действительно тратится на каждой отмене', () => {
    const undo = fnBody(m, undoHandler('mahjong.tsx'));
    expect(undo).toMatch(/setUndosUsed/);
    expect(undo).toMatch(/undosUsed >= UNDOS_PER_LEVEL/);   // и кончается
  });

  it('бюджет обновляется на новом уровне, а не на партии', () => {
    const load = m.slice(m.indexOf('const loadLevel ='), m.indexOf('const startGame ='));
    expect(load).toMatch(/setUndosUsed\(0\)/);
  });

  /** Иначе «выйти и зайти» стало бы бесплатной дозаправкой бюджета. */
  it('потраченный бюджет переживает выход из партии', () => {
    // 27.08.2026: паттерн требовал undosUsed ПОСЛЕДНИМ полем снимка и покраснел,
    // когда за ним встал hiddenStats (метрики скрытого режима). Смысл гейта —
    // «поле уезжает в снимок», а не «стоит в конце»: ловим его в литерале
    // snapshot(), позиция — дело вкуса.
    expect(m).toMatch(/score: scoreRef\.current, shufflesUsed, elapsed, undosUsed,/);   // уезжает в снимок партии
    expect(m).toMatch(/setUndosUsed\(r\.undosUsed/);   // и поднимается обратно
  });

  /**
   * 🔴 А в анаграммах отмена БЕСПЛАТНА, и это тоже осознанно: буквы на виду с
   * первого кадра, проверки до полного набора нет — снятая буква не открывает
   * ни одного нового факта. Счётчика тут быть не должно.
   */
  it('у анаграмм счётчика отмен нет — там разведывать нечего', () => {
    const a = code('anagrams.tsx');
    expect(a).not.toMatch(/UNDOS_PER|undosUsed|undoLeft/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ЛЕНТА ГАСНЕТ ТАМ, ГДЕ ОТКАТЫВАТЬ НЕЧЕСТНО ИЛИ НЕЧЕГО.
// ─────────────────────────────────────────────────────────────────────────────

describe('лента обнуляется на границах, где откат перестаёт быть честным', () => {
  const m = code('mahjong.tsx');
  const a = code('anagrams.tsx');

  it('маджонг: новый уровень — чужая раскладка в ленту не годится', () => {
    const load = m.slice(m.indexOf('const loadLevel ='), m.indexOf('const startGame ='));
    expect(load).toMatch(/history\.reset\(\)/);
  });

  /**
   * После перетасовки это ДРУГАЯ доска: символы назначены заново, у плиток новые
   * id. Снимок из старой ленты вернул бы раскладку, которой в партии уже нет.
   */
  it('маджонг: перетасовка обнуляет ленту', () => {
    const sh = m.slice(m.indexOf('const reshuffle ='), m.indexOf('const maxHalfX'));
    expect(sh).toMatch(/history\.reset\(\)/);
  });

  it('маджонг: собранный уровень обнуляет ленту — выигрыш не отменяют', () => {
    const win = m.slice(m.indexOf('if (m >= pairsTotal)'), m.indexOf('} else {', m.indexOf('if (m >= pairsTotal)')));
    expect(win).toMatch(/history\.reset\(\)/);
  });

  it('маджонг: поднятая партия начинает с чистой ленты', () => {
    const ar = m.slice(m.indexOf('const applyResume ='), m.indexOf('const bootRef'));
    expect(ar).toMatch(/history\.reset\(\)/);
  });

  it('анаграммы: новое слово обнуляет ленту', () => {
    const nr = m === a ? '' : a.slice(a.indexOf('setLetters(arr);'), a.indexOf('const advance ='));
    expect(nr).toMatch(/hist\.reset\(\)/);
  });

  /**
   * 🔴 САМОЕ ВАЖНОЕ В АНАГРАММАХ. Последняя буква — это КОММИТ: игра сверяет
   * набранное со словарём и показывает «верно/неверно». Останься отмена живой
   * после коммита — вышло бы «собрал, посмотрел ответ, откатил, собрал заново»:
   * единственный момент, когда ход выдаёт новое знание, стал бы бесплатным.
   */
  it('анаграммы: слово закрыто — лента гаснет (и по набору, и по таймауту)', () => {
    const commit = a.slice(a.indexOf('if (newPicked.length === target.length)'), a.indexOf('const renderConfig'));
    expect(commit).toMatch(/hist\.reset\(\)/);
    const deadline = a.slice(a.indexOf('deadlineTimerRef.current = setTimeout'), a.indexOf('const advance ='));
    expect(deadline).toMatch(/hist\.reset\(\)/);
  });

  it('анаграммы: после закрытия слова отмена не срабатывает', () => {
    expect(fnBody(a, undoHandler('anagrams.tsx'))).toMatch(/wordDoneRef\.current/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// КНОПКА ЖИВАЯ: ГАСНЕТ КОГДА НАДО И НЕ ВИСИТ НА МЁРТВОМ СОСТОЯНИИ.
// ─────────────────────────────────────────────────────────────────────────────

describe('кнопка отмены не декорация', () => {
  const targets = ['mahjong.tsx', 'anagrams.tsx'];

  it('подпись берётся из словаря, а не зашита строкой', () => {
    const dict = readFileSync(join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8') as string;
    expect(dict).toMatch(/\bbtn_undo:/);
    for (const f of targets) expect(code(f)).toMatch(/t\('btn_undo'\)/);
  });

  it('кнопка гаснет, когда откатывать нечего', () => {
    for (const f of targets) expect(undoButton(f)).toMatch(/disabled=\{[^}]*[Cc]anUndo/);
  });

  /**
   * 🔴 ЛОВУШКА SET: разметка есть, переводы есть, гейт зелен — а элемент мёртв,
   * потому что состояние, от которого он зависит, нигде не присваивается.
   * Здесь: кнопка маджонга гаснет по бюджету, значит бюджет обязан двигаться.
   */
  it('состояние, от которого кнопка зависит, где-то присваивается', () => {
    const m = code('mahjong.tsx');
    expect(m).toMatch(/const canUndo = history\.canUndo/);
    expect((m.match(/setUndosUsed\s*\(/g) || []).length).toBeGreaterThanOrEqual(3);   // сброс уровня, подъём партии, сама отмена
    const a = code('anagrams.tsx');
    expect((a.match(/hist\.push\s*\(/g) || []).length).toBeGreaterThanOrEqual(2);     // буква и «Сброс»
  });

  /**
   * ⚠️ ПРОВЕРЯЕМ СМЫСЛ, А НЕ ИМЯ. Гейт на дословное `onPress={undoMove}` покраснел бы
   * от переименования обработчика — то есть от ПРАВИЛЬНОЙ правки; в этом проекте на
   * таком обжигались четырежды. Поэтому берём имя прямо из разметки кнопки и требуем
   * от него одного: чтобы функция с этим именем существовала и звала ленту.
   */
  it('кнопка позвана на функцию, которая действительно снимает ход с ленты', () => {
    for (const f of targets) {
      expect(undoHandler(f)).toBeTruthy();
      expect(fnBody(code(f), undoHandler(f))).toMatch(/\.undo\(\)/);
    }
  });
});
