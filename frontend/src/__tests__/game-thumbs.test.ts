/**
 * У КАЖДОЙ ИГРЫ КАТАЛОГА ЕСТЬ ПРЕВЬЮ — ИЛИ ЗАПИСЬ, ПОЧЕМУ ЕГО НЕТ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ. Превью — фон карточки в каталоге (GameCard, opacity 0.22).
 * Игра без записи в gameThumbs падает на фолбэк и в списке выглядит безлико:
 * человек листает 71 карточку и у семи не за что зацепиться глазом. Именно так
 * и вышло — семь новых игр (memory_palace, rhythm_pitch, navigator,
 * object_tracker, faces_names, one_line, dots_connect) приехали в каталог, а в
 * реестр превью их никто не завёл. Ничего при этом не покраснело: игра
 * работает, экран открывается, тесты зелёные — пропажу видно только глазами в
 * списке. Гейт закрывает ровно эту дыру.
 *
 * ⚠️ ГЕЙТ СМОТРИТ НА ФАЙЛ, А НЕ НА ТЕКСТ ИСХОДНИКА. Дважды за 19.08 попадались
 * на том, что проверку держало зелёной СЛОВО В КОММЕНТАРИИ: «превью нарисованы»
 * в шапке — и всё, поиск подстроки доволен, а файла на диске нет. Поэтому здесь
 * ни одна проверка не делает вывод из формулировок: имена файлов вынимаются из
 * реестра, но дальше идёт statSync (файл есть, столько-то байт) и разбор
 * ЗАГОЛОВКА webp (столько-то пикселей). Комментарий в gameThumbs.ts можно
 * переписать как угодно — ни одна строка ниже от этого не изменится.
 *
 * ЧТО ИМЕННО СВЕРЯЕТСЯ:
 *   1. каждая игра каталога — либо в реестре, либо в WITHOUT_THUMB с причиной;
 *   2. каждая запись реестра указывает на существующий непустой файл;
 *   3. размер не выбивается из ряда — и не «примерно», а по РАЗМЕРУ КАРТИНКИ:
 *      160x160 (дорисованные пиктограммы) держат 0.8–6 КБ, промо-скрины
 *      760x1440 — до 64 КБ. Ряд сложился сам: 13 пиктограмм лежат в 1958–2956 Б,
 *      потолок 6 КБ даёт запас втрое и ловит превью, влетевшее «в десять раз
 *      тяжелее»;
 *   4. на диске нет превью, забытого мимо реестра (мёртвый вес в бандле);
 *   5. разбор реестра сверяется с ЖИВОЙ функцией gameThumb() — парсер, который
 *      недосчитал строк, обязан покраснеть, а не похвалить.
 *
 * ПОЧЕМУ СПИСОК ИСКЛЮЧЕНИЙ, А НЕ «пусть будет ноль». Три игры превью не имеют и
 * сегодня не получат — это чужие заходы. Молчаливого пропуска быть не должно:
 * игра без превью и без записи роняет прогон, а запись про игру, у которой
 * превью уже появилось, роняет его тоже — чтобы список не протух.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const THUMB_DIR = path.join(ROOT, 'assets/images/gamethumbs');
const REGISTRY = path.join(ROOT, 'src/constants/gameThumbs.ts');

import { GAMES } from '../constants/games';

/**
 * Реестр грузим ЛЕНИВО и через try/catch. Прямой import ронял весь набор ещё до
 * первой проверки: пропавший файл превью — это `Cannot find module …webp` прямо
 * в gameThumbs.ts, и вместо «реестр указывает на несуществующий файл: one_line»
 * человек получал стек резолвера. Прогон и так краснел, но НЕ ТЕМ сообщением —
 * а гейт, по которому непонятно, что чинить, читают ровно один раз.
 */
let loadError: Error | null = null;
let gameThumb: (id?: string) => any = () => undefined;
try {
  gameThumb = require('../constants/gameThumbs').gameThumb;
} catch (e) {
  loadError = e as Error;
}

/** Игры, у которых превью нет намеренно. Ключ — id, значение — причина. */
const WITHOUT_THUMB: Record<string, string> = {
  /**
   * Девять развилок 04.09.2026. Превью развилке не рисуем НАРОЧНО: карточка ведёт
   * в меню, а не в партию, и картинка обещала бы конкретное упражнение. У трёх
   * прежних развилок (span_group, sudoku_group, attention_conflict) превью тоже нет
   * — здесь тот же случай, просто теперь он назван.
   */
  counting_group: 'развилка: меню проб на счёт, картинка обещала бы конкретную игру',
  words_group: 'развилка: меню проб на словарь',
  hearing_group: 'развилка: меню проб на слух',
  search_group: 'развилка: меню проб на зрительный поиск',
  flexibility_group: 'развилка: меню проб на переключение',
  risk_group: 'развилка: меню проб на решения под риском',
  visual_memory_group: 'развилка: меню проб на зрительную память',
  mnemonics_group: 'развилка: меню мнемотехник',
  languages_group: 'развилка-зонтик над «Словами» и «Слухом»',
  towers_group: 'развилка: меню двух проб на планирование ходов',
  pause:
    'новый хаб практик, перенесён из лаборатории 26.08.2026; превью не рисовали — заход по карточкам отдельный',
  math_slider:
    'новая игра, превью ещё не рисовали; заход по карточкам каталога 19.08 закрывал семь других',
  'sudoku-samurai':
    'длинная форма судоку, отдельный заход по судоку-вариантам; базовая sudoku превью имеет',
  'sudoku-fractal':
    'длинная форма судоку, отдельный заход по судоку-вариантам; базовая sudoku превью имеет',
  'sudoku-fractal-deep':
    'марафонская форма фрактала (28.08), спрятана в групп-карте судоку; превью — когда режим обкатается',
};

/** Семь превью, нарисованных 19.08 — перечислены поимённо, чтобы откат заметили. */
const DRAWN_19_08 = [
  'dots_connect',
  'faces_names',
  'memory_palace',
  'navigator',
  'object_tracker',
  'one_line',
  'rhythm_pitch',
];

/** Пиктограммы 160x160: 0.8–6 КБ. Существующие 13 лежат в 1958–2956 Б. */
const ICON_MIN = 800;
const ICON_MAX = 6 * 1024;
/** Промо-скрины с сайта 760x1440: до 64 КБ. Самый тяжёлый сейчас — prl, 57 004 Б. */
const SHOT_MAX = 64 * 1024;

/**
 * Ширина и высота webp — из заголовка файла, без sharp и прочих зависимостей.
 * RIFF....WEBP, дальше чанк: VP8 (lossy), VP8L (lossless) или VP8X (расширенный).
 * Нужен именно факт с диска: по имени файла отличить пиктограмму от скрина нельзя.
 */
function webpSize(file: string): { width: number; height: number } {
  const b = fs.readFileSync(file);
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`${path.basename(file)}: это не webp`);
  }
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
      height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
    };
  }
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`${path.basename(file)}: неизвестный чанк webp «${chunk}»`);
}

/** id → путь к файлу, вынутые из реестра. Дальше всё решает диск, не текст. */
function registryEntries(): Array<{ id: string; file: string }> {
  const src = fs.readFileSync(REGISTRY, 'utf8') as string;
  const body = src.slice(src.indexOf('const THUMBS'), src.indexOf('export function gameThumb'));
  const found: Array<{ id: string; file: string }> = [];
  const re = /^\s*([A-Za-z0-9_-]+|'[^']+'):\s*require\('\.\.\/\.\.\/assets\/images\/gamethumbs\/([^']+)'\)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    found.push({ id: m[1].replace(/'/g, ''), file: path.join(THUMB_DIR, m[2]) });
  }
  return found;
}

const ENTRIES = registryEntries();

describe('превью карточек каталога', () => {
  it('реестр вообще грузится (пропавший файл ломает его на import)', () => {
    expect(loadError && loadError.message).toBe(null);
  });

  it('парсер реестра разобрал все строки с require (иначе он врёт в плюс)', () => {
    const src = fs.readFileSync(REGISTRY, 'utf8') as string;
    const rawRequires = (src.match(/require\('\.\.\/\.\.\/assets\/images\/gamethumbs\//g) || []).length;
    expect(ENTRIES.length).toBe(rawRequires);
    expect(ENTRIES.length).toBeGreaterThan(60);
  });

  it('каждая игра каталога либо имеет превью, либо записана в исключения с причиной', () => {
    const missing: string[] = [];
    for (const g of GAMES) {
      if (gameThumb(g.id) !== undefined) continue;
      const why = WITHOUT_THUMB[g.id];
      if (!why || why.trim().length < 20) missing.push(g.id);
    }
    expect(missing).toEqual([]);
  });

  it('список исключений не протух: у записанных игр превью действительно нет', () => {
    const stale = Object.keys(WITHOUT_THUMB).filter((id) => gameThumb(id) !== undefined);
    expect(stale).toEqual([]);
    const unknown = Object.keys(WITHOUT_THUMB).filter((id) => !GAMES.some((g) => g.id === id));
    expect(unknown).toEqual([]);
  });

  it('семь превью, нарисованных 19.08, на месте', () => {
    const gone = DRAWN_19_08.filter((id) => gameThumb(id) === undefined);
    expect(gone).toEqual([]);
  });

  it('реестр не указывает на несуществующий или пустой файл', () => {
    const broken: string[] = [];
    for (const { id, file } of ENTRIES) {
      if (!fs.existsSync(file) || fs.statSync(file).size === 0) broken.push(id);
    }
    expect(broken).toEqual([]);
  });

  it('запись реестра сходится с живой gameThumb() (не только с текстом файла)', () => {
    const dead = ENTRIES.filter((e) => GAMES.some((g) => g.id === e.id) && gameThumb(e.id) === undefined);
    expect(dead.map((e) => e.id)).toEqual([]);
  });

  it('размер файла не выбивается из ряда — по реальным пикселям, а не по имени', () => {
    const outliers: string[] = [];
    for (const { id, file } of ENTRIES) {
      if (!fs.existsSync(file)) continue;
      const bytes = fs.statSync(file).size;
      const { width, height } = webpSize(file);
      const icon = width <= 200 && height <= 200;
      const min = icon ? ICON_MIN : 1024;
      const max = icon ? ICON_MAX : SHOT_MAX;
      if (bytes < min || bytes > max) {
        outliers.push(`${id}: ${width}x${height}, ${bytes} Б (ждём ${min}..${max})`);
      }
    }
    expect(outliers).toEqual([]);
  });

  it('семь новых — пиктограммы 160x160, как прежние 13, а не скрины', () => {
    const wrong: string[] = [];
    for (const id of DRAWN_19_08) {
      const { width, height } = webpSize(path.join(THUMB_DIR, `${id}.webp`));
      if (width !== 160 || height !== 160) wrong.push(`${id}: ${width}x${height}`);
    }
    expect(wrong).toEqual([]);
  });

  it('на диске нет превью мимо реестра (мёртвый вес в бандле)', () => {
    const known = new Set(ENTRIES.map((e) => path.basename(e.file)));
    const orphans = fs
      .readdirSync(THUMB_DIR)
      .filter((f: string) => f.endsWith('.webp') && !known.has(f));
    expect(orphans).toEqual([]);
  });
});
