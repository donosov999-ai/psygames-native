/**
 * ЧТО ДЕЛАТЬ — НАПИСАНО НА ЭКРАНЕ, А НЕ ТОЛЬКО В СПРАВКЕ.
 *
 * 🔴 ЗАЧЕМ. Правило игры лежало в справке «?», а в справку посреди раунда никто
 * не ходит: там счёт идёт на секунды, и уход в модалку = проваленная проба.
 * В 47 играх строка-правило на поле была, и её никто не замечал именно потому,
 * что она работала. В остальных её не было, и правило человек добывал из
 * последствий: нажал не туда — «ошибка», нажал туда — «верно». Хуже всего это
 * в парадигмах, где дистрактор ВРЁТ намеренно (ANT, «Фланкер»): без строки
 * человек честно отвечает по боковым стрелкам и не понимает, за что наказан.
 *
 * ⚠️ ПРОВЕРЯЕТСЯ РИСУЕТСЯ ЛИ, А НЕ НАПИСАНА ЛИ. Строка в исходнике ничего не
 * значит: она может лежать в ветке конфига, которую во время партии не рисуют.
 * Ровно так 16.08 окно правил считалось показанным и не появлялось ни разу.
 * Поэтому ниже собирается ИГРОВОЙ рендер — блоки <GameShell>…</GameShell> плюс
 * тела render-хелперов, которые эти блоки зовут (у «Торможения» поле рисует
 * renderGngField(), и текстовый поиск «внутри GameShell» его не видит).
 *
 * ⚠️ РЕЕСТР ПОИМЁННЫЙ И ЗАКРЫТЫЙ. У каждой из 64 игр здесь либо строка, либо
 * причина, почему её нет. Молчаливых пропусков быть не может: новая игра без
 * записи роняет прогон, а запись, потерявшая свою строку, роняет его тоже.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const GAMES = path.join(ROOT, 'app/games');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const files: string[] = fs.readdirSync(GAMES).filter((f: string) => f.endsWith('.tsx')).sort();

/**
 * Всё, что рисуется во время партии: каркасы игровых экранов + подставленные
 * тела render-хелперов, которые они вызывают.
 */
function playRender(src: string): string {
  const helpers = new Map<string, string>();
  for (const m of src.matchAll(/const (render[A-Za-z0-9_]*) = \(\) => \(?/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const endParen = src.indexOf('\n  );', start);
    const endBrace = src.indexOf('\n  };', start);
    const end = Math.min(endParen < 0 ? Infinity : endParen, endBrace < 0 ? Infinity : endBrace);
    helpers.set(m[1], Number.isFinite(end) ? src.slice(start, end as number) : '');
  }
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
  for (const [name, body] of helpers) {
    if (new RegExp(`\\b${name}\\(\\)`).test(out)) out += '\n' + body;
  }
  return out;
}

/**
 * ЗАВЕДЕНО ЭТИМ ЗАХОДОМ (аудит 19.08.2026, п. 37). Ключ обязан быть переведён на
 * все 12 языков — строку читают в бою, английская заглушка тут бесполезна.
 *
 * `hint_center_arrow` ОДИН на две игры: правило про центральную стрелку у ANT и
 * «Фланкера» дословно совпадает, а два ключа с одним текстом — ровно тот дубль,
 * который схлопывали 19.08 (см. dictionary-duplicates).
 */
const ADDED: Record<string, string> = {
  'ant.tsx': 'hint_center_arrow',
  'choice-rt.tsx': 'choiceRtHint',
  'counter.tsx': 'counterHint',
  'flanker.tsx': 'hint_center_arrow',
  'picture-pairs.tsx': 'picturePairsHint',
  'schulte.tsx': 'schulteHint',
  'sdmt.tsx': 'sdmtHint',
  'vocab-srs.tsx': 'vocabSrsHint',
};

/**
 * УЖЕ БЫЛО — и это проверено глазами по каждой игре, а не по имени стиля.
 * Значение — кусок игрового рендера, которым строка держится: пропал он —
 * пропала и строка, и гейт краснеет.
 *
 * ⚠️ Здесь НЕ обязательно `t('ключ')`: у «Соедини цепочку» это «Дальше: 7»,
 * у гимнастики глаз ключ вычисляется из шага, у «Визуального поиска» текст
 * лежит локальной картой языков. Требовать одинаковой формы значило бы
 * переписывать девять живых экранов ради красоты гейта.
 */
const ALREADY: Record<string, string> = {
  'anagrams.tsx': "t('anagramHint')",
  'bart.tsx': "t('bartHint')",
  'breathing.tsx': 'phaseLabel(curPhase.type)',
  'chess-blind.tsx': "t('chessHintWhereIs')",
  'cloze.tsx': "t('clozeHint')",
  'corsi.tsx': "t('watchSequence')",
  'cpt.tsx': "'cptTapAX' : 'cptTapX'",
  'digit-span.tsx': "t('typeAsShown')",
  'eye-gym.tsx': 't(step.instrKey)',
  'find-differences.tsx': "t('findHint')",
  'go-no-go.tsx': "t('goNoGoHint')",
  'goods-sort.tsx': "t('goodsSortHint')",
  'hanoi.tsx': "t('hanoiHint')",
  'inhibition.tsx': "t('goNoGoHint')",
  'iowa.tsx': "t('iowaHint')",
  'lexical-decision.tsx': "t('ldHint')",
  'listening-span.tsx': "t('lspanMemorizeHint')",
  'mahjong.tsx': "t('mahjongHint')",
  'math-sprint.tsx': "t('mathHint')",
  'memory-matrix.tsx': "t('matrixRecall')",
  'mental-rotation.tsx': "t('mentalRotationHint')",
  'mnemonics.tsx': "t('label_restore_order')",
  'n-back.tsx': "t('nBackHint')",
  'number-bonds.tsx': "t('numberBondsHint')",
  'ospan.tsx': "t('ospanEqHint')",
  'pattern.tsx': "t('patternHint')",
  'phoneme-pairs.tsx': "t('phPairsPickHint')",
  'phonemic-fluency.tsx': "t('phonemicHint')",
  'posner.tsx': "t('posnerHint')",
  'prl.tsx': "t('prlHint')",
  'proofreading.tsx': "t('find')",
  'pseudoword-echo.tsx': "t('pwEchoPickSpelling')",
  'quick-count.tsx': "t('quickCountLookHint')",
  'reading-span.tsx': "t('readingSpanJudge')",
  'rmet.tsx': "t('rmetHint')",
  'semantic-sort.tsx': "t('sortHint')",
  'set-game.tsx': "t('setHint')",
  'simon.tsx': "t('hint_simon_color_rule')",
  'spatial-span.tsx': "t('watchSequence')",
  'stop-signal.tsx': "t('stopHint')",
  'story-recall.tsx': "t('storyReadHint')",
  'stroop-emotional.tsx': "t('stroop2Hint')",
  'stroop.tsx': "t('stroopHintInk')",
  'sudoku-fractal.tsx': "t('fractalFeedHint')",
  'switching-task.tsx': "t('judgeCue')",
  'targets.tsx': "t('hint_targets_tap_if')",
  'tower-london.tsx': "t('towerHint')",
  'trail-making.tsx': "t('nextLabel')",
  'visual-search.tsx': 'FIND_CONJ[language]',
  'wcst.tsx': "t('wcstHint')",
  'word-pairs.tsx': "t('label_memorize_word_pairs')",
};

/** Экран не игровой — строке «что делать» неоткуда взяться и незачем. */
const NOT_A_GAME: Record<string, string> = {
  'rhythm-pitch.tsx':
    'экран-обёртка: партию рисует модуль src/games/rhythm-pitch/RhythmPitchGame.tsx, строка живёт там и своя на каждый тип задания (strings.rhythmPrompt «Повторите услышанный ритм», strings.pitchDirectionPrompt «Второй звук был выше или ниже?», strings.pitchSequencePrompt «Повторите путь высот»), а во время звука её место занимает strings.listening; что она РИСУЕТСЯ, а не лежит мёртвой, стережёт rhythm-pitch-integration.test.ts',
  'dots-connect.tsx':
    'экран-обёртка: партию рисует модуль src/games/dots-connect/DotsConnectGame.tsx, строка живёт там (strings.rulesBody + strings.rulesCoverage на правилах, strings.trainingHint на тренировке, roundLabel над доской) вместе со своим словарём; что она РИСУЕТСЯ, а не лежит мёртвой, стережёт dots-connect-integration.test.ts',
  'attention-conflict.tsx': 'хаб: меню из четырёх парадигм, отсюда уходят в саму игру — играть тут не в чем',
  'span.tsx': 'хаб: меню из трёх модальностей охвата, играть тут не в чем',
  'math-slider.tsx':
    'экран-обёртка: партию рисует модуль src/games/math-slider/MathSliderGame.tsx, строка живёт там (strings.prompt) вместе со своим словарём',
  'one-line.tsx':
    'экран-обёртка: партию рисует модуль src/games/one-line/OneLineGame.tsx, строка живёт там (strings.rulesRepeat под счётчиком рёбер: «в вершины можно возвращаться, но уже пройденное ребро использовать нельзя») вместе со своим словарём; что она РИСУЕТСЯ, а не лежит мёртвой, стережёт one-line-integration.test.ts',
  'object-tracker.tsx':
    'экран-обёртка: партию рисует модуль src/games/object-tracker/ObjectTrackerGame.tsx, строка живёт там (phaseTitle → strings.preview/moving/selection, свой словарь ru/en) и меняется на каждой фазе раунда',
  'memory-palace.tsx':
    'экран-обёртка: партию рисует модуль src/games/memory-palace/MemoryPalaceGame.tsx, строка живёт там и меняется по фазе (strings.routeBody → placeBody → studyBody, а в проверке strings.recallPrompt «Что находилось здесь: {место}?» с именем текущего места) вместе со своим словарём; что она РИСУЕТСЯ В ПАРТИИ, а не в выключенном экране итога модуля, стережёт memory-palace-integration.test.ts',
  'faces-names.tsx':
    'экран-обёртка: партию рисует модуль src/games/faces-names/FacesNamesGame.tsx, строка живёт там и меняется по фазе (strings.recognitionPrompt → namePrompt → factPrompt, плюс strings.interferenceBody на помехе) вместе со своим словарём на 12 языков; что она РИСУЕТСЯ, а не лежит мёртвой, стережёт faces-names-integration.test.ts',
  'navigator.tsx':
    'экран-обёртка: партию рисует модуль src/games/navigator/NavigatorGame.tsx, строка живёт там (strings.routePrompt / turnPrompt / homePrompt — своя на каждый из трёх режимов) вместе со своим словарём',
};

/** Строка модуля «Прикидки» — лежит в чужом файле, но проверяется так же. */
const MODULE_LINE = { file: 'src/games/math-slider/MathSliderGame.tsx', token: 'strings.prompt' };
/**
 * Строка «Навигатора» — та же история, но строк ТРИ: у каждого режима свой
 * вопрос, и подставляется он в `prompt` перед отрисовкой. Проверяем все три:
 * пропажа любой означает режим без объяснения, что делать.
 */
const NAVIGATOR_LINES = {
  file: 'src/games/navigator/NavigatorGame.tsx',
  tokens: ['strings.routePrompt', 'strings.turnPrompt', 'strings.homePrompt'],
};

/**
 * ДОЛГ: судоку правит соседний заход, файл трогать нельзя. Список закрыт —
 * новые сюда не дописываются. Погасили — строку УБИРАЮТ, проверка ниже следит,
 * чтобы протухшее исключение не прикрывало будущую поломку.
 */
const DEBT = ['sudoku.tsx', 'sudoku-samurai.tsx'];

describe('строка «что делать» во время партии', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(files.length).toBeGreaterThan(60);
    const covered = new Set([...Object.keys(ADDED), ...Object.keys(ALREADY), ...Object.keys(NOT_A_GAME), ...DEBT]);
    // Каждая игра каталога должна быть в реестре — новая без записи роняет прогон.
    expect(files.filter((f) => !covered.has(f))).toEqual([]);
    // И наоборот: запись про исчезнувший файл — забытая уборка.
    expect([...covered].filter((f) => !files.includes(f))).toEqual([]);
  });

  it('🔴 заведённая строка рисуется в игровой фазе, а не лежит в конфиге', () => {
    const bad: string[] = [];
    for (const [f, key] of Object.entries(ADDED)) {
      const play = playRender(read(`app/games/${f}`));
      if (!play.includes(`t('${key}')`)) bad.push(`${f}: t('${key}') не в игровом рендере`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 старая строка на месте — её не выкинули заодно', () => {
    const bad: string[] = [];
    for (const [f, token] of Object.entries(ALREADY)) {
      const play = playRender(read(`app/games/${f}`));
      if (!play.includes(token)) bad.push(`${f}: «${token}» пропал из игрового рендера`);
    }
    const mod = read(MODULE_LINE.file);
    if (!mod.includes(MODULE_LINE.token)) bad.push(`${MODULE_LINE.file}: «${MODULE_LINE.token}» пропал`);
    const nav = read(NAVIGATOR_LINES.file);
    for (const token of NAVIGATOR_LINES.tokens) {
      if (!nav.includes(token)) bad.push(`${NAVIGATOR_LINES.file}: «${token}» пропал`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 новые ключи переведены на все 12 языков, а не на два', () => {
    const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
    const base = read('src/contexts/LanguageContext.tsx');
    const miss: string[] = [];
    for (const key of new Set(Object.values(ADDED))) {
      // ru+en — базовый словарь
      const entry = new RegExp(`^ {2}${key}:\\s*\\{[^}]*ru:[^}]*en:[^}]*\\}`, 'm');
      if (!entry.test(base)) miss.push(`${key}: нет ru/en в базовом словаре`);
      for (const loc of LOCALES) {
        const src = read(`src/contexts/translations/${loc}.ts`);
        const m = new RegExp(`"${key}":\\s*"([^"]{4,})"`).exec(src);
        if (!m) miss.push(`${key}: нет в локали ${loc}`);
      }
    }
    expect(miss).toEqual([]);
  });

  it('хаб остаётся хабом — иначе его надо переводить в игры', () => {
    for (const [f, why] of Object.entries(NOT_A_GAME)) {
      expect(why.length).toBeGreaterThan(30);
      const src = read(`app/games/${f}`);
      /**
       * Признак «партию рисует не этот файл»: игрового каркаса здесь нет.
       * Появился — экран стал игровым, и строка «что делать» ему уже нужна.
       *
       * ⚠️ ОДНО ПОСЛАБЛЕНИЕ, И ОНО ПРО ДЛИННУЮ ПАРТИЮ. «Дворец памяти» ставит
       * GameShell не ради поля, а ради ВОПРОСА ПРИ ВЫХОДЕ: партия там на минуты,
       * расстановку придумывает человек, и стереть её молча нельзя (реестр
       * длинных игр — в exit-guard.test.ts). Каркас при этом остаётся пустой
       * рамкой: партию, а с ней и строку «что делать», рисует модуль ВНУТРИ
       * него. Поэтому каркас разрешён ровно тогда, когда внутри него
       * смонтирован модуль игры — человек строку видит, а стережёт её свой гейт
       * модуля. Пустой каркас без модуля по-прежнему валит прогон.
       */
      const wrapsModule = /<[A-Z]\w*Game\b/.test(playRender(src));
      expect(`${f}: каркас партии без модуля внутри — ${src.includes('<GameShell') && !wrapsModule}`)
        .toBe(`${f}: каркас партии без модуля внутри — false`);
    }
    // У обёртки «Прикидки» партию рисует модуль — связь обязана быть видна.
    expect(read('app/games/math-slider.tsx')).toContain('<MathSliderGame');
    expect(read('app/games/navigator.tsx')).toContain('<NavigatorGame');
  });

  it('долг не протух: судоку всё ещё без строки', () => {
    const stale: string[] = [];
    for (const f of DEBT) {
      const play = playRender(read(`app/games/${f}`));
      // Появилась строка — запись из DEBT убирают и заводят в ALREADY.
      const hasLine = /styles\.(hintText|instr|rulesText)/.test(play);
      if (hasLine) stale.push(`${f}: строка появилась — перенести из DEBT в ALREADY`);
    }
    expect(stale).toEqual([]);
  });

  it('долг не растёт', () => {
    expect(DEBT.length).toBeLessThanOrEqual(2);
  });
});
