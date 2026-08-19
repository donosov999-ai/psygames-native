/**
 * ШТАМП РЕДАКЦИИ ЭКРАНА — первой строкой у каждого упражнения в app/games.
 *
 * ЗАЧЕМ. Номеров упражнениям не вводим (решение 19.08.2026 — строковых id хватает),
 * но по коду экрана нельзя было сказать, какая это редакция и когда её трогали.
 * Штамп несли 8 экранов, написанных с нуля; у остальных 63 первой строкой шло либо
 * описание, либо сразу импорты. Правило должно держаться прогоном, а не памятью:
 * новый экран без штампа обязан ронять сборку в тот же день, когда его завели.
 *
 * Формат ровно один, третий разделитель — средняя точка «·», не дефис:
 *     /* psygames-game-<имя-файла> · VER <число> · дд.мм.гггг *\/
 *
 * ПОЧЕМУ НЕ grep. В описании 8 экранов стоит ссылка на лабораторию игр
 * (`~/dev/psygames-game-lab`, строка 6). Поиск подстроки «psygames-game-» по файлу
 * зелёный на экране, где штампа НЕТ ВООБЩЕ. Поэтому разбираем РОВНО первую строку
 * и сверяем имя с именем файла на диске: переименовали файл, забыли штамп — красное.
 *
 * ЧЕГО ГЕЙТ НЕ ПРОВЕРЯЕТ. Дату против git. У 8 старых штампов дата — день выпуска
 * редакции в лаборатории (math-slider: 17.08 в штампе при последнем коммите 19.08),
 * а не день последней правки файла. Сверка с git красила бы их зря; проверяем форму
 * и календарную осмысленность даты, а откуда её брать — правило автора правки.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.resolve(__dirname, '../../app/games');

/** Первая строка файла целиком: имя, номер редакции, дата. */
const STAMP = /^\/\* (psygames-game-[a-z0-9-]+) · VER (\d+) · (\d{2})\.(\d{2})\.(\d{4}) \*\/$/;

type Stamp = { id: string; ver: number; date: string };

/**
 * Разбор ТОЛЬКО первой строки. Всё, что ниже, — не штамп, даже если выглядит им:
 * это отсекает и упоминание лаборатории в описании, и штамп, съехавший со строки 1.
 */
function parseStamp(src: string): Stamp | null {
  const first = src.split('\n', 1)[0].replace(/\r$/, '');
  const m = STAMP.exec(first);
  if (!m) return null;

  const [, id, ver, dd, mm, yyyy] = m;
  const [day, month, year] = [Number(dd), Number(mm), Number(yyyy)];

  // Дата должна существовать в календаре: 31.02.2026 и 00.00.0000 — не даты.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (Number(ver) < 1) return null; // редакции нумеруются с первой

  return { id, ver: Number(ver), date: `${dd}.${mm}.${yyyy}` };
}

/**
 * Текст без комментариев и без содержимого строк — то, что реально исполняется.
 * Нужен там, где ищем КОД: `export default` в описании или в литерале кодом не является.
 * Разбор посимвольный, а не регуляркой: «//» внутри строки (любой url) съел бы
 * регуляркой остаток строки вместе с кодом.
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
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Экраны упражнений. Берём КАТАЛОГ, а не список в коде: новый файл попадает под
 * проверку сам, без правки гейта. Служебные файлы expo-router (`_layout.tsx`)
 * экранами не являются — маршрута у них нет, штамп им не нужен.
 */
function screens(): string[] {
  return fs
    .readdirSync(GAMES_DIR)
    .filter((f: string) => f.endsWith('.tsx') && !f.startsWith('_'))
    .sort();
}

const read = (file: string) => fs.readFileSync(path.join(GAMES_DIR, file), 'utf-8') as string;

describe('штамп редакции экрана', () => {
  it('в каталоге есть экраны — иначе гейт зелёный на пустом месте', () => {
    expect(screens().length).toBeGreaterThan(60);
  });

  it('у каждого экрана штамп стоит ПЕРВОЙ строкой и разобран', () => {
    const bad = screens().filter((f: string) => parseStamp(read(f)) === null);
    expect(bad).toEqual([]);
  });

  it('имя в штампе совпадает с именем файла', () => {
    const mismatched = screens()
      .map((f: string) => ({ file: f, stamp: parseStamp(read(f)) }))
      .filter(({ file, stamp }: any) => stamp && stamp.id !== `psygames-game-${file.replace(/\.tsx$/, '')}`)
      .map(({ file, stamp }: any) => `${file} → ${stamp.id}`);
    expect(mismatched).toEqual([]);
  });

  /**
   * Незакрытый комментарий в первой строке превращает код ниже в текст. Проверять
   * только `export default` мало: он у экрана в самом низу и переживает проглатывание
   * первых двух сотен строк (проверено поломкой на sudoku.tsx — 188 строк ушли в
   * комментарий, а гейт остался зелёным). Импорты стоят сразу под штампом и пропадают
   * первыми, поэтому спрашиваем и то и другое.
   */
  it('штамп не съел код: после среза комментариев остались и импорты, и экран', () => {
    const broken = screens().filter((f: string) => {
      const code = codeOnly(read(f));
      return !/export\s+default/.test(code) || !/\bimport\b[\s\S]{0,200}\bfrom\b/.test(code);
    });
    expect(broken).toEqual([]);
  });
});

/**
 * Проверка самой проверки. Ниже — те самые поломки, на которых гейт обязан краснеть;
 * держим их прогоном, чтобы правило нельзя было обойти похожим на правду текстом.
 */
describe('гейт смотрит на смысл, а не на присутствие слова в файле', () => {
  const good = '/* psygames-game-schulte · VER 1 · 19.08.2026 */\nimport React from "react";\n';

  it('целый штамп разобран', () => {
    expect(parseStamp(good)).toEqual({ id: 'psygames-game-schulte', ver: 1, date: '19.08.2026' });
  });

  it('ссылка на psygames-game-lab в описании штампом не считается', () => {
    expect(parseStamp('/**\n * Перенесено из `~/dev/psygames-game-lab`, ветка codex/game-x.\n */\n')).toBeNull();
  });

  it('штамп со второй строки не считается — он обязан быть первым', () => {
    expect(parseStamp('/** описание */\n/* psygames-game-schulte · VER 1 · 19.08.2026 */\n')).toBeNull();
  });

  it('дефис вместо средней точки — другой формат', () => {
    expect(parseStamp('/* psygames-game-schulte - VER 1 - 19.08.2026 */\n')).toBeNull();
  });

  it('VER без числа и дата не по формату — красное', () => {
    expect(parseStamp('/* psygames-game-schulte · VER · 19.08.2026 */\n')).toBeNull();
    expect(parseStamp('/* psygames-game-schulte · VER 1 · 2026-08-19 */\n')).toBeNull();
  });

  it('несуществующая дата не проходит', () => {
    expect(parseStamp('/* psygames-game-schulte · VER 1 · 31.02.2026 */\n')).toBeNull();
    expect(parseStamp('/* psygames-game-schulte · VER 0 · 19.08.2026 */\n')).toBeNull();
  });

  it('срез комментариев не путает код с текстом о коде', () => {
    expect(codeOnly('/** export default Screen */\nconst a = 1;')).not.toMatch(/export\s+default/);
    expect(codeOnly('const s = "export default";')).not.toMatch(/export\s+default/);
    expect(codeOnly('const url = "https://x/y"; export default A;')).toMatch(/export\s+default/);
  });
});
