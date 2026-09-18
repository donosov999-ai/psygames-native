/* psygames-solution-everywhere · VER 2 · 18.09.2026 */
/**
 * «ПОКАЗАТЬ РЕШЕНИЕ» У ВСЕХ ИГР НА КАРКАСЕ — РЕЕСТР ОХВАТА С ХРАПОВИКОМ (задача 3afc4172).
 *
 * 📍 Денис 16.09.2026: «во всех играх нужно внизу где-то добавить кнопку „Показать решение“».
 * Каркас умеет с 17.09.2026: проп `solution` у GameShell ставит лампочку в конце поля и пункт
 * в меню паузы (поведение сторожит `solution-button-in-shell`). ЧТО показать — решение
 * решателя, верную последовательность последней пробы, разбор ответа — решает раздел-владелец
 * экрана, в своих файлах.
 *
 * Этот набор — не проверка поведения, а РЕЕСТР: каждый экран на каркасе либо передаёт
 * `solution`, либо стоит в одном из списков ниже (своя кнопка, нечего решать, ждёт раздела).
 * ⚠️ Проверка по ТЕКСТУ файла: `solution={` в комментарии тоже засчитается. Поведение самой
 * кнопки сторожит `solution-button-in-shell`, этот набор — только охват. Списки только сокращаются:
 *   · подключил решение — убери экран из `ЖДУТ_РАЗДЕЛА` (иначе набор покраснеет);
 *   · новый экран на каркасе — подключи решение или впиши его сюда с причиной.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const КАТАЛОГ = path.join(__dirname, '../../app/games');

/** Своя кнопка решения, не через каркас — с причиной. */
const СВОЯ: Record<string, string> = {
  puzzles: 'лампочка в ряду команд и в пустой клетке у крестовины (295b73d3, 941b927c): у режимов со стрелками её место — рядом с «↑», каркас так не ставит',
};

/** Практики без задания с верным ответом — показывать нечего. */
const НЕЧЕГО_РЕШАТЬ: Record<string, string> = {
  breathing: 'дыхательная практика: темп и фазы, верного ответа нет',
  'eye-gym': 'зарядка для глаз: движения по траектории, верного ответа нет',
  pause: 'хаб телесных практик (дыхание, растяжка, глаза): верного ответа нет',
};

/** Содержание решения за разделом-владельцем. Список только сокращается. */
const ЖДУТ_РАЗДЕЛА = new Set<string>([
  'anagrams', 'ant', 'bart', 'cake-sort', 'chess-blind', 'chinese-tones', 'choice-rt', 'cloze',
  'corsi', 'counter', 'cpt', 'dictation', 'digit-span', 'dots-connect', 'faces-names', 'find-differences',
  'flanker', 'go-no-go', 'goods-sort', 'hanoi', 'inhibition', 'iowa', 'lexical-decision',
  'listening-span', 'mahjong', 'math-slider', 'math-sprint', 'memory-matrix', 'memory-palace',
  'mental-rotation', 'mnemonics', 'n-back', 'navigator', 'number-bonds', 'number-run', 'object-tracker',
  'one-line', 'ospan', 'pattern', 'phoneme-pairs', 'phonemic-fluency', 'picture-pairs', 'posner',
  'prl', 'proofreading', 'pseudoword-echo', 'quick-count', 'reading-span', 'rhythm-pitch',
  'rmet', 'scholars-mate', 'schulte', 'sdmt', 'semantic-sort', 'set-game', 'simon', 'spatial-span',
  'stop-signal', 'story-recall', 'stroop', 'stroop-emotional', 'sudoku',
  'sudoku-fractal-deep', 'sudoku-samurai', 'switching-task', 'targets', 'tower-london', 'trail-making',
  'visual-search', 'vocab-srs', 'water-sort', 'wcst', 'word-pairs',
]);

function экраныНаКаркасе(): { имя: string; решение: boolean }[] {
  return (fs.readdirSync(КАТАЛОГ) as string[])
    .filter((ф) => ф.endsWith('.tsx'))
    .map((ф) => ({ имя: ф.slice(0, -4), текст: fs.readFileSync(path.join(КАТАЛОГ, ф), 'utf8') as string }))
    .filter((э) => э.текст.includes('<GameShell'))
    .map((э) => ({ имя: э.имя, решение: /\bsolution=\{/.test(э.текст) }));
}

describe('«Показать решение» — охват экранов на каркасе', () => {
  const экраны = экраныНаКаркасе();

  it('есть что проверять — иначе реестр зелен вслепую', () => {
    expect(экраны.length).toBeGreaterThan(70);
  });

  it('🔴 каждый экран на каркасе: передаёт solution, или своя кнопка с причиной, или ждёт раздела', () => {
    const безМеста = экраны
      .filter((э) => !э.решение && !(э.имя in СВОЯ) && !(э.имя in НЕЧЕГО_РЕШАТЬ) && !ЖДУТ_РАЗДЕЛА.has(э.имя))
      .map((э) => э.имя);
    expect(`экраны без решения и вне реестра: ${безМеста.join(', ') || 'нет'}`).toBe('экраны без решения и вне реестра: нет');
  });

  it('🔴 подключивший решение убран из списка ожидания — список только сокращается', () => {
    const подключили = экраны.filter((э) => э.решение && ЖДУТ_РАЗДЕЛА.has(э.имя)).map((э) => э.имя);
    expect(`подключили, но стоят в ожидании: ${подключили.join(', ') || 'нет'}`).toBe('подключили, но стоят в ожидании: нет');
  });

  it('в реестре нет призраков — каждое имя из списков существует на каркасе', () => {
    const есть = new Set(экраны.map((э) => э.имя));
    const призраки = [...ЖДУТ_РАЗДЕЛА, ...Object.keys(СВОЯ), ...Object.keys(НЕЧЕГО_РЕШАТЬ)].filter((и) => !есть.has(и));
    expect(`призраки: ${призраки.join(', ') || 'нет'}`).toBe('призраки: нет');
  });
});
