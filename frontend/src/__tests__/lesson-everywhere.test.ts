/* psygames-lesson-everywhere · VER 4 · 17.09.2026 */
/**
 * 🎓 РАЗБОР ПО ШАГАМ У ВСЕХ ИГР — РЕЕСТР ОХВАТА С ХРАПОВИКОМ.
 *
 * 📍 Денис 17.09.2026: «мне нужно обучение для каждой игры, как играть правильно — решатель по
 * шагам рисует решение и объясняет, почему тут ставим; это сильнее справки». Пилот — «Чёт-нечет»,
 * уровни 1–3, на весь экран. Проверив его: «да, обучение зашло — раскатывай везде по всем играм».
 *
 * Этот набор — не проверка поведения, а РЕЕСТР: каждый экран игры на каркасе и каждый из 42
 * режимов головоломок либо уже учит, либо стоит в списке ждущих с именем раздела-владельца.
 * Поведение каждого разбора сторожит проба самого раздела (образец — `unruly-teach`).
 *   · экран учит, если в его файле есть `<LessonPlayer` (общий плеер `src/components/LessonPlayer.tsx`);
 *   · режим головоломок учит, если у него есть учитель в `tatham-bridge/sections/<раздел>.teach.ts`.
 * Списки только сокращаются: сделал разбор — убери свой экран или режим из `ЖДУТ_…` в том же
 * коммите (иначе набор покраснеет). Новый экран на каркасе — сразу с разбором или сюда с владельцем.
 */
import { УЧИТЕЛЯ } from '@/src/games/tatham-bridge/teach';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const КАТАЛОГ = path.join(__dirname, '../../app/games');
const РЕЖИМЫ: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'tatham-tables.generated.json'), 'utf8')).режимы;

const СПАН = 'psygames-span-claude-mac';
const ПАМЯТЬ_СЛУХ = 'psygames-memory-hearing-claude-mac';
const ШАХМАТЫ = 'psygames-chess-claude-mac';
const ВНИМАНИЕ = 'psygames-attention-claude-mac';
const ПОИСК = 'psygames-search-claude-mac';
const СУДОКУ = 'psygames-sudoku-claude-mac';
const ПРОСТРАНСТВО = 'psygames-spatial-claude-mac';
const СОРТИРОВКА = 'psygames-sorting-claude-mac';
const СЧЁТ = 'psygames-counting-claude-mac';
const СЛОВА = 'psygames-words-claude-mac';

/** Экраны, которым разбор не нужен по устройству, — с причиной. */
const БЕЗ_РАЗБОРА: Record<string, string> = {
  breathing: 'практика ведёт сама: каждая фаза показана и озвучена в ходе упражнения, правила «как верно» нет',
  'eye-gym': 'практика ведёт сама: точка показывает движение, глаза следуют; верного хода нет',
  pause: 'хаб телесных практик, не игра',
  puzzles: 'один экран на 42 режима: охват считается по РЕЖИМАМ ниже, а не по файлу экрана',
};

/**
 * Экраны без разбора — владелец по развилке (состав серий «Все игры», defaultPlaylists.json).
 * Список только сокращается.
 */
const ЖДУТ_ЭКРАНЫ: Record<string, string> = {
  corsi: СПАН, 'digit-span': СПАН, 'listening-span': СПАН, 'memory-matrix': СПАН, 'n-back': СПАН,
  'picture-pairs': СПАН, 'reading-span': СПАН, 'spatial-span': СПАН,
  'faces-names': ПАМЯТЬ_СЛУХ, mnemonics: ПАМЯТЬ_СЛУХ, rmet: ПАМЯТЬ_СЛУХ,
  'chinese-tones': ПАМЯТЬ_СЛУХ, dictation: ПАМЯТЬ_СЛУХ, 'phoneme-pairs': ПАМЯТЬ_СЛУХ,
  'pseudoword-echo': ПАМЯТЬ_СЛУХ, 'rhythm-pitch': ПАМЯТЬ_СЛУХ,
  'chess-blind': ШАХМАТЫ, 'scholars-mate': ШАХМАТЫ,
  ant: ВНИМАНИЕ, bart: ВНИМАНИЕ, 'choice-rt': ВНИМАНИЕ, cpt: ВНИМАНИЕ, flanker: ВНИМАНИЕ, 'go-no-go': ВНИМАНИЕ,
  inhibition: ВНИМАНИЕ, iowa: ВНИМАНИЕ, posner: ВНИМАНИЕ, prl: ВНИМАНИЕ, proofreading: ВНИМАНИЕ, simon: ВНИМАНИЕ,
  'stop-signal': ВНИМАНИЕ, stroop: ВНИМАНИЕ, 'stroop-emotional': ВНИМАНИЕ, 'switching-task': ВНИМАНИЕ,
  targets: ВНИМАНИЕ, wcst: ВНИМАНИЕ,
  'find-differences': ПОИСК, mahjong: ПОИСК, 'object-tracker': ПОИСК, 'quick-count': ПОИСК, schulte: ПОИСК,
  sdmt: ПОИСК, 'set-game': ПОИСК, 'visual-search': ПОИСК,
  sudoku: СУДОКУ, 'sudoku-fractal': СУДОКУ, 'sudoku-fractal-deep': СУДОКУ, 'sudoku-samurai': СУДОКУ,
  'dots-connect': ПРОСТРАНСТВО, 'mental-rotation': ПРОСТРАНСТВО, navigator: ПРОСТРАНСТВО, 'one-line': ПРОСТРАНСТВО,
  'spatial-lab': ПРОСТРАНСТВО, 'trail-making': ПРОСТРАНСТВО,
  'ball-sort': СОРТИРОВКА, 'cake-sort': СОРТИРОВКА, 'goods-sort': СОРТИРОВКА, hanoi: СОРТИРОВКА,
  'nut-sort': СОРТИРОВКА, 'pizza-sort': СОРТИРОВКА, 'tower-london': СОРТИРОВКА, 'water-sort': СОРТИРОВКА,
  counter: СЧЁТ, 'math-slider': СЧЁТ, 'math-sprint': СЧЁТ, 'number-bonds': СЧЁТ, 'number-run': СЧЁТ,
  ospan: СЧЁТ, pattern: СЧЁТ,
  cloze: СЛОВА, 'lexical-decision': СЛОВА, 'phonemic-fluency': СЛОВА, 'semantic-sort': СЛОВА,
  'story-recall': СЛОВА, 'vocab-srs': СЛОВА,
};

/** Режимы головоломок без учителя — владелец из `sections/<раздел>.ts` (поле `РАЗДЕЛ.чат`). */
const ЖДУТ_РЕЖИМЫ: Record<string, string> = {
  Mines: ПОИСК, Mosaic: ПОИСК, Pattern: ПОИСК, Range: ПОИСК, Magnets: ПОИСК, Galaxies: ПОИСК, Palisade: ПОИСК,
  'Light Up': ПОИСК, Tents: ПОИСК, Dominosa: ПОИСК, Rectangles: ПОИСК, Map: ПОИСК,
  Pegs: СОРТИРОВКА, Flood: СОРТИРОВКА, 'Same Game': СОРТИРОВКА, Signpost: СОРТИРОВКА, Inertia: СОРТИРОВКА,
  Loopy: СОРТИРОВКА, Pearl: СОРТИРОВКА, Bridges: СОРТИРОВКА, 'Train Tracks': СОРТИРОВКА,
  Slide: ПРОСТРАНСТВО, Sokoban: ПРОСТРАНСТВО, Net: ПРОСТРАНСТВО, Netslide: ПРОСТРАНСТВО, Twiddle: ПРОСТРАНСТВО,
  Cube: ПРОСТРАНСТВО, Flip: ПРОСТРАНСТВО, Sixteen: ПРОСТРАНСТВО, Fifteen: ПРОСТРАНСТВО, Untangle: ПРОСТРАНСТВО,
  Solo: СУДОКУ, Towers: СУДОКУ, Unequal: СУДОКУ, Keen: СУДОКУ, Singles: СУДОКУ, Filling: СУДОКУ, Undead: СУДОКУ,
};

/**
 * Игры, чью партию рисует ДРУГОЙ файл: разбор засчитывается по нему. Своего `<GameShell` в файле
 * маршрута у них нет, и без этой карты реестр их не видел бы вовсе.
 */
const ЧЕРЕЗ_ЭКРАН: Record<string, string> = {
  'ball-sort': 'app/games/water-sort.tsx',
  'nut-sort': 'app/games/water-sort.tsx',
  'pizza-sort': 'app/games/cake-sort.tsx',
  'spatial-lab': 'src/components/SpatialLab.tsx',
};

function экраныНаКаркасе(): { имя: string; учит: boolean }[] {
  const корень = path.join(__dirname, '../..');
  const свои = (fs.readdirSync(КАТАЛОГ) as string[])
    .filter((ф) => ф.endsWith('.tsx'))
    .map((ф) => ({ имя: ф.slice(0, -4), текст: fs.readFileSync(path.join(КАТАЛОГ, ф), 'utf8') as string }))
    .filter((э) => э.текст.includes('<GameShell'))
    .map((э) => ({ имя: э.имя, учит: э.текст.includes('<LessonPlayer') }));
  const чужие = Object.entries(ЧЕРЕЗ_ЭКРАН).map(([имя, файл]) => {
    expect(fs.existsSync(path.join(КАТАЛОГ, `${имя}.tsx`))).toBe(true);
    return { имя, учит: (fs.readFileSync(path.join(корень, файл), 'utf8') as string).includes('<LessonPlayer') };
  });
  return [...свои, ...чужие];
}

describe('🎓 разбор по шагам — охват игр', () => {
  it('каждый экран игры на каркасе учит, ждёт раздела или записан без разбора с причиной', () => {
    const экраны = экраныНаКаркасе();
    expect(экраны.length).toBeGreaterThan(70);
    const ничьи = экраны
      .filter((э) => !э.учит && !(э.имя in ЖДУТ_ЭКРАНЫ) && !(э.имя in БЕЗ_РАЗБОРА))
      .map((э) => э.имя);
    expect(ничьи).toEqual([]);
  });

  it('🔴 сделал разбор — убери экран из ЖДУТ_ЭКРАНЫ (храповик: список только сокращается)', () => {
    const учат = экраныНаКаркасе().filter((э) => э.учит && э.имя in ЖДУТ_ЭКРАНЫ).map((э) => э.имя);
    expect(учат).toEqual([]);
  });

  it('списки не держат экранов, которых больше нет', () => {
    const есть = new Set(экраныНаКаркасе().map((э) => э.имя));
    expect([...Object.keys(ЖДУТ_ЭКРАНЫ), ...Object.keys(БЕЗ_РАЗБОРА)].filter((и) => !есть.has(и))).toEqual([]);
  });

  it('каждый из 42 режимов головоломок учит или ждёт своего раздела', () => {
    expect(РЕЖИМЫ).toHaveLength(42);
    expect(РЕЖИМЫ.filter((р) => !УЧИТЕЛЯ[р] && !(р in ЖДУТ_РЕЖИМЫ))).toEqual([]);
    expect(Object.keys(УЧИТЕЛЯ).filter((р) => !РЕЖИМЫ.includes(р))).toEqual([]);
  });

  it('🔴 вписал учителя режима — убери режим из ЖДУТ_РЕЖИМЫ', () => {
    expect(Object.keys(УЧИТЕЛЯ).filter((р) => р in ЖДУТ_РЕЖИМЫ)).toEqual([]);
  });

  it('пилот на месте: «Чёт-нечет» учит', () => {
    expect(УЧИТЕЛЯ.Unruly).toBeDefined();
  });
});
