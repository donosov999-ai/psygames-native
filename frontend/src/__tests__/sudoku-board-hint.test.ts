/**
 * СТРОКА-ОБЪЯСНЕНИЕ НАД ДОСКОЙ СУДОКУ: ЕСТЬ, ВИДНА И ГОВОРИТ НА ВСЕХ ЯЗЫКАХ.
 *
 * 🔴 ЗАЧЕМ. Три репорта Вали от 19.08.2026 складываются в один провал: механика
 * появляется, а объяснения на доске нет.
 *   · сэндвич, уровень 38 — «Я не понимаю правила, что значит сумма от одного до
 *     девяти с краю, сумма чего, из чего сумма»;
 *   · отмена — «зачем появилась кнопка отменить, какая-то бесполезная кнопка»;
 *   · цвет — «зачем нужно каким-то цветом выделять клетки, что это даёт вообще
 *     непонятно».
 * Тексты правил в словаре БЫЛИ и были переведены на 12 языков — они просто жили в
 * окне, которое показывается один раз при входе на уровень и закрывается кнопкой
 * «ПОНЯТНО». Поэтому гейт стережёт не наличие строк, а то, что объяснение ДОХОДИТ:
 * лестницу «что показать сейчас», её тексты во всех локалях и живую разметку экрана.
 *
 * ⚠️ ЧЕГО ГЕЙТ НЕ ДЕЛАЕТ — не проверяет формулировки. Переводить и переписывать
 * объяснения можно как угодно; нельзя терять сам механизм, ронять локаль на ключ
 * вместо текста и оставлять строку невидимой.
 *
 * ⚠️ КОММЕНТАРИИ СРЕЗАЮТСЯ ДО ПОИСКА. Гейт, который зеленеет от собственного
 * объяснения в шапке экрана, ловили в этом репозитории шесть раз за два дня.
 */
import {
  sudokuBoardHint, sudokuBoardRule, sudokuClueText,
  type SudokuHintCtx,
} from '@/src/services/sudoku-board-hint';
import { Variant, variantRule } from '@/src/services/sudoku-core';
import { translateFor } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/** Все двенадцать языков приложения. Английский — база, остальные оверлеи. */
const LANGS = ['ru', 'en', 'es', 'pt', 'hi', 'zh', 'de', 'fr', 'it', 'ja', 'ko', 'ar'];
const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

/** Все варианты правил судоку — берём из типа через levelConfig, а не списком из памяти. */
const VARIANTS: Variant[] = [
  'none', 'diagonal', 'antiknight', 'hyper', 'nonconsec', 'jigsaw', 'antiking',
  'evenodd', 'kropki', 'sandwich', 'thermo', 'arrow', 'thermocage',
];

/**
 * Текст без комментариев и без JSX-комментариев: ищем КОД, а не объяснения к нему.
 * Строковые литералы оставляем — в них живут имена ключей словаря.
 */
function codeOnly(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]; i++; }
        if (i < src.length) { out += src[i]; i++; }
      }
      out += q;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const SCREEN = codeOnly(read('app/games/sudoku.tsx'));

const ctx = (over: Partial<SudokuHintCtx> = {}): SudokuHintCtx =>
  ({ variant: 'none', killer: false, N: 9, focus: null, ...over });

describe('правило доски доходит до человека на всех вариантах и языках', () => {
  it.each(LANGS)('на языке %s у каждого из 12 вариантов есть живой текст правила', (lang) => {
    const broken: string[] = [];
    for (const v of VARIANTS) {
      const text = sudokuBoardRule(ctx({ variant: v }), lang);
      // Ключ вместо текста — ровно то, как выглядит дыра в словаре: translateFor
      // возвращает сам ключ. Короткий текст — обрубок вроде «—».
      // ⚠️ Порог низкий намеренно: у японского и корейского то же правило короче
      // русского вдвое, и порог «по русской длине» красил бы исправный перевод.
      if (text.length < 12 || /^sudoku[A-Za-z_]+$/.test(text) || text.includes('{n}')) {
        broken.push(`${v}: ${text}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('killer объясняется своим правилом, а не правилом варианта', () => {
    const killer = sudokuBoardRule(ctx({ killer: true, variant: 'none' }), 'ru');
    expect(killer).not.toBe(sudokuBoardRule(ctx({ variant: 'none' }), 'ru'));
    expect(killer.length).toBeGreaterThan(12);
  });

  it('базовое правило подставляет сторону доски: 6×6 и 9×9 говорят разное', () => {
    const six = sudokuBoardRule(ctx({ N: 6 }), 'ru');
    const nine = sudokuBoardRule(ctx({ N: 9 }), 'ru');
    expect(six).toContain('6');
    expect(nine).toContain('9');
    expect(six).not.toBe(nine);
  });

  /**
   * У Вали на доске уровня 38 по краям стояли ДВА НУЛЯ. Без оговорки про ноль правило
   * «сумма цифр между 1 и 9» читается как ошибка генератора: суммы ноль не бывает.
   */
  it.each(LANGS)('на языке %s правило сэндвича объясняет ноль у края', (lang) => {
    const rule = sudokuBoardRule(ctx({ variant: 'sandwich' }), lang);
    const bare = variantRule('sandwich', lang);
    const note = translateFor(lang, 'sudokuSandwichZeroNote');
    // Оговорка не «где-то есть», а приклеена именно к правилу сэндвича и взята из
    // словаря: иначе на девяти языках она молча выродится в английскую заглушку.
    expect(note).not.toBe('sudokuSandwichZeroNote');
    expect(rule).toContain(note);
    expect(rule.length).toBeGreaterThan(bare.length + 20);
    // …и только к сэндвичу: у соседнего варианта оговорки про ноль быть не должно.
    expect(sudokuBoardRule(ctx({ variant: 'diagonal' }), lang)).not.toContain(note);
  });
});

describe('число у края объясняется поимённо', () => {
  it.each(LANGS)('на языке %s подсказка называет само число', (lang) => {
    const text = sudokuClueText({ axis: 'row', index: 2, sum: 16 }, lang);
    expect(text).toContain('16');
    expect(text).not.toContain('{n}');
    expect(text.length).toBeGreaterThan(12);
  });

  it('строка и столбец объясняются разными словами — иначе непонятно, куда смотреть', () => {
    const row = sudokuClueText({ axis: 'row', index: 0, sum: 16 }, 'ru');
    const col = sudokuClueText({ axis: 'col', index: 0, sum: 16 }, 'ru');
    expect(row).not.toBe(col);
  });

  it.each(LANGS)('на языке %s ноль объясняется НЕ как сумма', (lang) => {
    const zero = sudokuClueText({ axis: 'row', index: 0, sum: 0 }, lang);
    /**
     * ⚠️ «ДРУГОЙ ТЕКСТ» — НЕ ПРОВЕРКА. Первая версия сличала ноль с ненулевой
     * подсказкой и была зелёной даже без отдельной ветки: тексты и так различались
     * подставленным числом. Сличаем с той же подсказкой, где 12 заменено на 0, —
     * ровно то, что получится, если ветку про ноль убрать.
     */
    const asSum = sudokuClueText({ axis: 'row', index: 0, sum: 12 }, lang).split('12').join('0');
    expect(zero).not.toBe(asSum);
    expect(zero).toBe(translateFor(lang, 'sudokuSandwichClueZero'));
    expect(zero.length).toBeGreaterThan(12);
  });
});

describe('лестница приоритета: строка показывает то, на что смотрят', () => {
  const rule = sudokuBoardHint(ctx({ variant: 'sandwich' }), 'ru');

  it('ткнули в число у края — строка объясняет ЭТО число, а не общее правило', () => {
    const hint = sudokuBoardHint(
      ctx({ variant: 'sandwich', focus: { kind: 'clue', clue: { axis: 'row', index: 3, sum: 15 } } }), 'ru',
    );
    expect(hint).toContain('15');
    expect(hint).not.toBe(rule);
  });

  it('включён цвет — строка отвечает «зачем красить», а не правилом доски', () => {
    const hint = sudokuBoardHint(ctx({ variant: 'sandwich', focus: { kind: 'paint' } }), 'ru');
    expect(hint).not.toBe(rule);
    expect(hint.length).toBeGreaterThan(12);
  });

  it('нажали отмену — строка говорит про отмену', () => {
    const hint = sudokuBoardHint(ctx({ focus: { kind: 'undo' } }), 'ru');
    expect(hint).not.toBe(sudokuBoardHint(ctx(), 'ru'));
    expect(hint.length).toBeGreaterThan(12);
  });

  it('число у края побеждает цвет: последнее касание — важнее режима', () => {
    const clue = sudokuBoardHint(
      ctx({ variant: 'sandwich', focus: { kind: 'clue', clue: { axis: 'col', index: 1, sum: 24 } } }), 'ru',
    );
    expect(clue).toContain('24');
  });

  it('строка не бывает пустой: у покоя всегда есть правило доски', () => {
    for (const v of VARIANTS) {
      expect(sudokuBoardHint(ctx({ variant: v }), 'ru').length).toBeGreaterThan(12);
    }
  });
});

describe('экран действительно показывает строку, а не хранит её мёртвой', () => {
  it('строка собирается сервисом и рисуется над доской', () => {
    expect(SCREEN).toContain('sudokuBoardHint(');
    /**
     * ⚠️ ИЩЕМ ПЕРЕМЕННУЮ В РАЗМЕТКЕ, А НЕ ТОЧНУЮ СТРОЧКУ `{boardHint}`. 22.08.2026
     * строка стала `{rejectWhy || boardHint}` — причина отказа вытесняет обычную
     * подсказку, — и гейт покраснел на ПРАВИЛЬНОЙ правке. Проверка буквы вместо
     * смысла ловит своего же автора и приучает править её не глядя.
     */
    expect(SCREEN).toMatch(/\{[^}]*\bboardHint\b[^}]*\}/);
  });

  /**
   * ⚠️ ГЛАВНАЯ ЛОВУШКА ЭТОГО РЕПОЗИТОРИЯ: разметка написана, переведена, покрыта
   * гейтом — и выключена условием, которое никогда не истинно. Ловили дважды.
   */
  it('показ не выключён мёртвым условием', () => {
    const at = SCREEN.search(/\{[^}]*\bboardHint\b[^}]*\}/);
    expect(at).toBeGreaterThan(0);
    const around = SCREEN.slice(Math.max(0, at - 700), at);
    expect(around).not.toMatch(/\{\s*false\s*&&/);
    expect(around).not.toMatch(/\{\s*0\s*&&/);
    expect(SCREEN).not.toMatch(/\{\s*false\s*&&[^}]{0,200}boardHint/);
  });

  it('строка живёт на доске, а не во втором окне поверх экрана', () => {
    const at = SCREEN.search(/\{[^}]*\bboardHint\b[^}]*\}/);
    const around = SCREEN.slice(Math.max(0, at - 1500), at);
    // Окно правил у судоку своё (RulesHelpModal) и стоит отдельным компонентом:
    // если строка вдруг окажется внутри него, объяснение опять придётся открывать.
    expect(around).not.toContain('rhStyles.backdrop');
    expect(around).not.toContain('RulesHelpModal');
    expect(SCREEN).toContain('const gridEl = (');
    expect(at).toBeGreaterThan(SCREEN.indexOf('const gridEl = ('));
  });

  it('числа у края доски нажимаются и объясняют себя', () => {
    const at = SCREEN.indexOf('sandwich.cols.map');
    expect(at).toBeGreaterThan(0);
    const block = SCREEN.slice(at, at + 1400);
    expect(block).toContain('TouchableOpacity');
    expect(block).toContain("setBoardFocus({ kind: 'clue'");
    expect(block).toContain('sudokuClueText(');
    const rowsAt = SCREEN.indexOf('sandwich.rows.map');
    const rowsBlock = SCREEN.slice(rowsAt, rowsAt + 1400);
    expect(rowsBlock).toContain('TouchableOpacity');
    expect(rowsBlock).toContain("setBoardFocus({ kind: 'clue'");
  });

  it('отмена и цвет доходят до строки: оба взгляда выставляются кодом экрана', () => {
    expect(SCREEN).toContain("setBoardFocus({ kind: 'undo' })");
    expect(SCREEN).toContain("{ kind: 'paint' }");
  });

  /**
   * Взгляд — свойство ПАРТИИ, а не экрана: «что вернула отмена» с прошлого уровня на
   * новой доске врёт, и врёт молча, потому что строка не пустует и подмены не видно.
   */
  it('новая партия начинается с правила доски, а не с чужого взгляда', () => {
    const at = SCREEN.indexOf('const startGame');
    expect(at).toBeGreaterThan(0);
    const body = SCREEN.slice(at, SCREEN.indexOf("setPhase('playing')", at));
    expect(body).toContain('setBoardFocus(null)');
  });

  /**
   * Репорт Вали с уровня 29 «где нижняя строка????» — про то, что доска считается от
   * остатка высоты экрана. Новая строка над доской обязана быть вычтена из бюджета,
   * иначе она срезает нижний ряд клеток.
   */
  it('высота строки вычтена из бюджета доски в обеих раскладках', () => {
    const at = SCREEN.indexOf('const cellSize =');
    expect(at).toBeGreaterThan(0);
    const block = SCREEN.slice(at, at + 400);
    expect((block.match(/BOARD_HINT_H/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  /**
   * Замер живой сборки 20.08.2026 (812×375): поле каркаса 173 точки, доска 283 —
   * не влезшая доска расползалась вверх и накрывала собой ряд кнопок, из-за чего
   * `elementFromPoint` в центре «Отменить» возвращал доску, а не кнопку. Прокрутка
   * поля обязана быть ВСЕГДА: она бесплатна, когда содержимое влезает (каркас его
   * центрирует), и стоит недоступных кнопок, когда её выключили догадкой о высоте.
   */
  it('поле прокручивается в обеих раскладках, а не по догадке о высоте', () => {
    const at = SCREEN.indexOf('const fieldScrolls');
    expect(at).toBeGreaterThan(0);
    const line = SCREEN.slice(at, SCREEN.indexOf(';', at));
    expect(line).not.toContain('landscape');
    expect(line).not.toContain('height');
    expect(SCREEN).toContain('scrollableField={fieldScrolls}');
  });
});

describe('новые строки словаря переведены во всех локалях', () => {
  const KEYS = [
    'sudokuSandwichZeroNote', 'sudokuSandwichClueRow', 'sudokuSandwichClueCol',
    'sudokuSandwichClueZero', 'sudokuColorWhy', 'sudokuUndoWhy',
  ];

  it('базовый словарь знает все ключи строки-объяснения', () => {
    const base = read('src/contexts/LanguageContext.tsx');
    expect(KEYS.filter((k) => !base.includes(`  ${k}: {`))).toEqual([]);
  });

  it.each(LOCALES)('локаль %s знает все ключи строки-объяснения', (loc) => {
    const src = read(`src/contexts/translations/${loc}.ts`);
    expect(KEYS.filter((k) => !src.includes(`"${k}":`))).toEqual([]);
  });
});
