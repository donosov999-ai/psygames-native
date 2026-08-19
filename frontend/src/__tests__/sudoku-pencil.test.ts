/* psygames-gate-sudoku-pencil · VER 1 · 20.08.2026 */
/**
 * КАРАНДАШНЫЕ ПОМЕТКИ В ОБЫЧНОЙ СУДОКУ И У САМУРАЯ.
 *
 * 🔴 ЗАЧЕМ. Сервис пометок (`services/pencilMarks`) был написан и покрыт гейтом ещё
 * 19.08.2026, но звал его РОВНО ОДИН экран — фрактальная судоку. В обычной судоку и у
 * самурая слова `pencil` не было вовсе. Это не украшение: выше третьей ступени лестницы
 * техник судоку в уме не решается («голая пара» — два кандидата, которые надо помнить в
 * двух клетках разом), а у самурая на 369 клетках и пяти сетках с ОБЩИМИ зонами это
 * не решается тем более. Без места, куда записать кандидатов, верхняя половина уровней
 * не решается, а угадывается.
 *
 * ⚠️ ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ ВЫЗОВОМ, А НЕ ЧТЕНИЕМ. В этом проекте гейт уже пять раз
 * держался зелёным на слове в комментарии (самый дорогой случай — бейдж SET: написан,
 * переведён на 12 языков, покрыт гейтом и не показан ни разу). Поэтому:
 *   · правила карандаша исполняются — ставим, снимаем, стираем, гасим цифрой;
 *   · развилка «куда уходит нажатие цифры» исполняется на всех входах;
 *   · подъём партии идёт через НАСТОЯЩЕЕ хранилище (saveResume/loadResume) и настоящую
 *     версию формата, взятую из самого экрана;
 *   · общая клетка самурая проверяется по НАСТОЯЩЕЙ геометрии поля (gridsOf/GRIDS);
 *   · размер клетки, при котором пометки прячутся, считается настоящей cellSizeFor.
 * И только «дотягивается ли экран до этих правил» смотрится по исходнику — но по
 * ИСХОДНИКУ БЕЗ КОММЕНТАРИЕВ и по телу конкретной функции, а не по файлу целиком.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveResume, loadResume } from '@/src/services/resume';
import {
  emptyPencilMarks, normalizePencilMarks, pencilInput, routeDigitPress, visiblePencilDigits,
  pencilDigits, countPencilMarks, hasPencilMark, PENCIL_MAX_DIGIT,
} from '@/src/services/pencilMarks';
import { MIN_TAP } from '@/src/components/GlassButton';
import { SUDOKU_GAME_ID, SUDOKU_RESUME_V, sudokuVisibleMarks } from '@/app/games/sudoku';
import {
  SAMURAI_GAME_ID, SAMURAI_RESUME_V, samuraiVisibleMarks, PENCIL_MIN_CELL,
  cellSizeFor, gridsOf, GRIDS, SIZE,
} from '@/app/games/sudoku-samurai';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

/**
 * Исходник БЕЗ комментариев. Гейт не имеет права ловить собственные объяснения:
 * ровно так пять раз подряд оставались зелёными проверки на уже сломанный код.
 */
function code(file: string): string {
  const raw = readFileSync(join(__dirname, '../../app/games/', file), 'utf8') as string;
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')          // блочные комментарии, включая {/* … */} в разметке
    .split('\n')
    .filter((l: string) => !l.trim().startsWith('//'))
    .join('\n');
}

const SUDOKU = code('sudoku.tsx');
const SAMURAI = code('sudoku-samurai.tsx');

/** Тело функции по имени: от объявления до следующего объявления того же уровня. */
function fnBody(src: string, name: string): string {
  const at = src.indexOf(`const ${name} = `);
  if (at < 0) return '';
  const rest = src.slice(at);
  const end = rest.slice(1).search(/\n {2}(?:const |function |useEffect\(|useGameKeyboard\()/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

/** Ширина телефона, на которой считаны все размеры проекта. */
const PHONE = 390;

// ─────────────────────────────────────────────────────────────────────────────
// 1. САМ КАРАНДАШ — ТЕМ ПУТЁМ, КОТОРЫМ ЕГО ЗОВУТ ЭКРАНЫ
// ─────────────────────────────────────────────────────────────────────────────

describe('карандаш пишется и стирается одним движением', () => {
  it('🔴 повторный тап по той же цифре снимает пометку — как карандаш на бумаге', () => {
    let m = emptyPencilMarks(9);
    m = pencilInput(m, 9, 4, 4, 7);
    expect(hasPencilMark(m, 4, 4, 7)).toBe(true);
    m = pencilInput(m, 9, 4, 4, 7);
    expect(hasPencilMark(m, 4, 4, 7)).toBe(false);
    expect(countPencilMarks(m)).toBe(0);
  });

  it('🔴 в одной клетке живут все девять цифр разом — ради этого всё и затевалось', () => {
    let m = emptyPencilMarks(9);
    for (let d = 1; d <= PENCIL_MAX_DIGIT; d++) m = pencilInput(m, 9, 0, 0, d);
    expect(pencilDigits(m[0][0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('стирающая клавиша чистит клетку ЦЕЛИКОМ, а соседей не трогает', () => {
    let m = emptyPencilMarks(9);
    for (const d of [2, 5, 9]) m = pencilInput(m, 9, 3, 3, d);
    m = pencilInput(m, 9, 3, 4, 6);
    m = pencilInput(m, 9, 3, 3, 0);   // 0 = стирающая клавиша
    expect(pencilDigits(m[3][3])).toEqual([]);
    expect(pencilDigits(m[3][4])).toEqual([6]);
  });

  it('прежнее состояние не портится — иначе React не увидит изменения и доска не перерисуется', () => {
    const before = emptyPencilMarks(9);
    const after = pencilInput(before, 9, 1, 1, 3);
    expect(before[1][1]).toBe(0);
    expect(after).not.toBe(before);
  });
});

describe('🔴 карандаш НЕ становится ходом', () => {
  const at = (o: Partial<Parameters<typeof routeDigitPress>[0]>) =>
    routeDigitPress({ pencil: false, hasSelection: true, given: false, blocked: false, ...o });

  it('в режиме карандаша нажатие уходит в пометки, а не в клетку', () => {
    // Уйди оно в клетку — пометка тратила бы жизнь, ложилась в ленту отмены и
    // проверяла доску на победу. Это и есть та поломка, ради которой развилка общая.
    expect(at({ pencil: true })).toBe('pencil');
    expect(at({ pencil: false })).toBe('digit');
  });

  it('без выбранной клетки не пишется ничего — ни цифра, ни пометка', () => {
    expect(at({ pencil: true, hasSelection: false })).toBe('ignore');
    expect(at({ pencil: false, hasSelection: false })).toBe('ignore');
  });

  it('в клетку задания карандашом тоже нельзя: там цифра уже стоит', () => {
    expect(at({ pencil: true, given: true })).toBe('ignore');
    expect(at({ pencil: false, given: true })).toBe('ignore');
  });

  it('после конца партии молчат оба режима', () => {
    expect(at({ pencil: true, blocked: true })).toBe('ignore');
    expect(at({ pencil: false, blocked: true })).toBe('ignore');
  });
});

describe('🔴 цифра ГАСИТ пометки, но не стирает их', () => {
  it('поставили цифру — кандидатов не видно; убрали цифру — они на месте', () => {
    // Стирай цифра пометки, откат хода вернул бы клетку, но не вернул бы стёртое, и
    // отмена оказалась бы половинчатой. А так одна и та же маска отвечает обоим случаям.
    let m = emptyPencilMarks(9);
    for (const d of [1, 4, 8]) m = pencilInput(m, 9, 2, 2, d);
    const mask = m[2][2];
    expect(visiblePencilDigits(mask, 5)).toEqual([]);        // цифра стоит — пометок не видно
    expect(visiblePencilDigits(mask, 0)).toEqual([1, 4, 8]); // цифру убрали — кандидаты те же
    expect(pencilDigits(mask)).toEqual([1, 4, 8]);           // сама маска не тронута
  });

  it('на доске 6×6 не рисуется семёрка — цифр там всего шесть', () => {
    // Незаконченная партия живёт месяц: запись от партии 9×9, поднятая на поле 6×6,
    // иначе нарисовала бы цифры, которых на этой доске не бывает вовсе.
    let m = emptyPencilMarks(9);
    for (const d of [2, 6, 7, 9]) m = pencilInput(m, 9, 0, 0, d);
    expect(sudokuVisibleMarks(m[0][0], 0, 9)).toEqual([2, 6, 7, 9]);
    expect(sudokuVisibleMarks(m[0][0], 0, 6)).toEqual([2, 6]);
    expect(sudokuVisibleMarks(m[0][0], 3, 6)).toEqual([]);   // и цифра гасит их так же
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ПОМЕТКИ ПЕРЕЖИВАЮТ ВЫХОД ИЗ ПАРТИИ — ЧЕРЕЗ НАСТОЯЩЕЕ ХРАНИЛИЩЕ
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 пометки переживают снимок и подъём партии', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  /** Кандидаты, расставленные «человеком»: три клетки, в одной — голая пара. */
  const written = (N: number) => {
    let m = emptyPencilMarks(N);
    m = pencilInput(m, N, 0, 0, 3); m = pencilInput(m, N, 0, 0, 7);   // голая пара
    m = pencilInput(m, N, 1, 2, 5);
    m = pencilInput(m, N, N - 1, N - 1, 9 > N ? N : 9);
    return m;
  };

  it('обычная судоку: кандидаты возвращаются те же, что были при уходе', async () => {
    const marks = written(9);
    await saveResume(SUDOKU_GAME_ID, 'default', SUDOKU_RESUME_V, { dims: { N: 9 }, marks });
    const saved = await loadResume<{ dims: { N: number }; marks: unknown }>(
      SUDOKU_GAME_ID, 'default', SUDOKU_RESUME_V,
    );
    const back = normalizePencilMarks(saved!.marks, saved!.dims.N);
    expect(back).toEqual(marks);
    expect(pencilDigits(back[0][0])).toEqual([3, 7]);
  });

  it('самурай: то же самое на поле 21×21', async () => {
    const marks = written(SIZE);
    await saveResume(SAMURAI_GAME_ID, 'default', SAMURAI_RESUME_V, { marks });
    const saved = await loadResume<{ marks: unknown }>(SAMURAI_GAME_ID, 'default', SAMURAI_RESUME_V);
    const back = normalizePencilMarks(saved!.marks, SIZE);
    expect(back).toEqual(marks);
    expect(countPencilMarks(back)).toBe(countPencilMarks(marks));
  });

  it('версия формата выросла — запись без пометок не поднимется под новый код', async () => {
    // Пометки добавили в снимок, значит старая запись ему больше не подходит.
    expect(SUDOKU_RESUME_V).toBeGreaterThanOrEqual(3);
    expect(SAMURAI_RESUME_V).toBeGreaterThanOrEqual(2);
    await saveResume(SUDOKU_GAME_ID, 'default', SUDOKU_RESUME_V - 1, { marks: 'старьё' });
    expect(await loadResume(SUDOKU_GAME_ID, 'default', SUDOKU_RESUME_V)).toBeNull();
  });

  it('битая запись гасится, а не роняет экран и не рисует несуществующих цифр', () => {
    const dirty: any = emptyPencilMarks(9);
    dirty[0][0] = 1 << 30;      // лишние биты нарисовали бы цифры выше девятки
    dirty[0][1] = -5;
    dirty[0][2] = 'семь';
    const clean = normalizePencilMarks(dirty, 9);
    expect([clean[0][0], clean[0][1], clean[0][2]]).toEqual([0, 0, 0]);
    expect(normalizePencilMarks(null, 9).length).toBe(9);
    expect(normalizePencilMarks(emptyPencilMarks(9), SIZE).length).toBe(SIZE);   // чужой размер → чисто
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. САМУРАЙ: ОБЩАЯ КЛЕТКА — ОДИН НАБОР КАНДИДАТОВ
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 самурай: клетка на стыке двух сеток — ОДНА клетка', () => {
  /** Первая клетка поля, принадлежащая сразу двум сеткам (угловая ↔ центральная). */
  const shared = (() => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (gridsOf(r, c).length === 2) return [r, c];
    return null;
  })();

  it('такие клетки вообще есть — иначе проверка ниже зелена вслепую', () => {
    expect(shared).not.toBeNull();
    expect(GRIDS.length).toBe(5);
  });

  it('пометка, поставленная «из одной сетки», видна из ОБЕИХ', () => {
    // Пять сеток внахлёст: общий блок физически принадлежит двум сеткам сразу. Разложи
    // пометки по сеткам — в общей клетке появились бы ДВА набора кандидатов, и они
    // разъехались бы с первого хода: партия на час решалась бы по вранью.
    const [r, c] = shared as number[];
    const owners = gridsOf(r, c);
    let m = emptyPencilMarks(SIZE);
    m = pencilInput(m, SIZE, r, c, 4);
    m = pencilInput(m, SIZE, r, c, 6);
    const seen = owners.map(([r0, c0]) => {
      // читаем через ЛОКАЛЬНЫЕ координаты каждой сетки — так на неё смотрит игрок
      const [lr, lc] = [r - r0, c - c0];
      return pencilDigits(m[r0 + lr][c0 + lc]);
    });
    expect(seen).toEqual([[4, 6], [4, 6]]);
    expect(countPencilMarks(m)).toBe(2);   // и ровно один набор на всё поле, а не два
  });

  it('снятие пометки в общей клетке тоже видно с обеих сторон', () => {
    const [r, c] = shared as number[];
    let m = emptyPencilMarks(SIZE);
    m = pencilInput(m, SIZE, r, c, 4);
    m = pencilInput(m, SIZE, r, c, 4);
    for (const [r0, c0] of gridsOf(r, c)) expect(pencilDigits(m[r0 + (r - r0)][c0 + (c - c0)])).toEqual([]);
  });

  it('пометка не растекается на соседей — ни в своей сетке, ни в чужой', () => {
    const [r, c] = shared as number[];
    let m = emptyPencilMarks(SIZE);
    m = pencilInput(m, SIZE, r, c, 4);
    let elsewhere = 0;
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) if ((i !== r || j !== c) && m[i][j] !== 0) elsewhere++;
    expect(elsewhere).toBe(0);
  });
});

describe('🔴 самурай: на карте пометки не рисуются', () => {
  it('в рабочем режиме кандидаты видны, на карте — нет', () => {
    // Девять цифр в клетке — это цифра в треть клетки. На карте клетка 16pt при ширине
    // телефона 390: вышло бы 5pt грязи, которая закрасит саму карту — то есть убьёт
    // единственное, ради чего карта существует.
    let m = emptyPencilMarks(SIZE);
    for (const d of [1, 2, 3]) m = pencilInput(m, SIZE, 0, 0, d);
    const fit = cellSizeFor(PHONE, 'fit');
    const zoom = cellSizeFor(PHONE, 'zoom');
    expect(fit).toBeLessThan(PENCIL_MIN_CELL);      // карта физически мельче порога
    expect(zoom).toBeGreaterThanOrEqual(PENCIL_MIN_CELL);
    expect(samuraiVisibleMarks(m[0][0], 0, fit)).toEqual([]);
    expect(samuraiVisibleMarks(m[0][0], 0, zoom)).toEqual([1, 2, 3]);
  });

  it('и цифра гасит их в рабочем режиме так же, как везде', () => {
    let m = emptyPencilMarks(SIZE);
    m = pencilInput(m, SIZE, 0, 0, 5);
    expect(samuraiVisibleMarks(m[0][0], 7, cellSizeFor(PHONE, 'zoom'))).toEqual([]);
  });

  it('порог не ниже читаемого: три ряда цифр в клетке — это треть клетки на цифру', () => {
    expect(PENCIL_MIN_CELL).toBeGreaterThanOrEqual(24);   // 24/3 = 8pt на цифру — уже предел
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ЭКРАНЫ ДЕЙСТВИТЕЛЬНО ЭТИМ ПОЛЬЗУЮТСЯ (исходник БЕЗ комментариев)
// ─────────────────────────────────────────────────────────────────────────────

describe('обе игры дотягиваются до карандаша, а не просто импортируют его', () => {
  it('есть что проверять — комментарии срезаны, код остался', () => {
    expect(SUDOKU.length).toBeGreaterThan(20000);
    expect(SAMURAI.length).toBeGreaterThan(20000);
    // сами комментарии при этом действительно срезаны
    expect(SUDOKU).not.toContain('бухгалтерия игрока');
    expect(SAMURAI).not.toContain('бухгалтерия игрока');
  });

  it('🔴 нажатие цифры проходит через общую развилку и уходит в пометки', () => {
    for (const [name, src] of [['sudoku', SUDOKU], ['samurai', SAMURAI]] as const) {
      const body = fnBody(src, 'handleNumPress');
      expect(`${name}: обработчик цифры найден`).toBe(`${name}: обработчик цифры ${body ? 'найден' : 'НЕ НАЙДЕН'}`);
      expect(`${name}: ${/routeDigitPress\(/.test(body)}`).toBe(`${name}: true`);
      expect(`${name}: ${/setMarks\(\(current\) => pencilInput\(/.test(body)}`).toBe(`${name}: true`);
    }
  });

  it('🔴 карандашная ветка выходит ДО ленты отмены и до счёта ошибок', () => {
    // Забыть здесь `return` — значит превратить каждую пометку в ход: минус жизнь,
    // плюс запись в ленту отмены, проверка доски на победу. Проверяем порядком строк.
    for (const [name, src] of [['sudoku', SUDOKU], ['samurai', SAMURAI]] as const) {
      const body = fnBody(src, 'handleNumPress');
      const pencilAt = body.indexOf('pencilInput(');
      const returnAt = body.indexOf('return;', pencilAt);
      const histAt = body.indexOf('hist.push(');
      const errAt = body.indexOf('setErrors(');
      expect(`${name}: карандаш и лента отмены оба на месте`).toBe(
        `${name}: карандаш и лента отмены ${pencilAt >= 0 && histAt >= 0 && errAt >= 0 ? 'оба на месте' : 'НЕ на месте'}`,
      );
      expect(`${name}: выход из карандаша до ленты: ${returnAt > pencilAt && returnAt < histAt && returnAt < errAt}`)
        .toBe(`${name}: выход из карандаша до ленты: true`);
    }
  });

  it('🔴 пометки попадают в снимок партии и поднимаются из него разобранными', () => {
    for (const [name, src] of [['sudoku', SUDOKU], ['samurai', SAMURAI]] as const) {
      const snap = fnBody(src, 'snapshot');
      expect(`${name}: пометки в снимке: ${/\bmarks\b/.test(snap)}`).toBe(`${name}: пометки в снимке: true`);
      const apply = fnBody(src, 'applyResume');
      expect(`${name}: подъём через normalize: ${/setMarks\(normalizePencilMarks\(/.test(apply)}`)
        .toBe(`${name}: подъём через normalize: true`);
      // и автосохранение просыпается на изменение пометок, иначе они уедут только со следующим ходом
      expect(`${name}: автосохранение видит пометки: ${/\[grid, (?:cellColors, )?marks,/.test(src)}`)
        .toBe(`${name}: автосохранение видит пометки: true`);
    }
  });

  it('🔴 у самурая карандашный слой размером во ВСЮ фигуру, а не в одну сетку', () => {
    // Отсюда и берётся общая клетка: слой 21×21 индексируется координатами поля, значит
    // клетка на стыке одна и набор кандидатов у неё один. Слой размером 9×9 означал бы
    // пять отдельных слоёв и два разных набора в общем блоке.
    expect(/emptyPencilMarks\(SIZE\)/.test(SAMURAI)).toBe(true);
    expect(/pencilInput\(current, SIZE, sel\.r, sel\.c, n\)/.test(SAMURAI)).toBe(true);
    expect(/normalizePencilMarks\(sv\.marks, SIZE\)/.test(SAMURAI)).toBe(true);
    // а в обычной судоку — по размеру ЭТОЙ доски: она бывает и 6×6, и 9×9
    expect(/emptyPencilMarks\(d\.N\)/.test(SUDOKU)).toBe(true);
    expect(/normalizePencilMarks\(s\.marks, s\.dims\.N\)/.test(SUDOKU)).toBe(true);
  });

  it('🔴 слой пометок доезжает до отрисовки в обеих играх', () => {
    // Написанный, но не позванный слой — это ровно поломка бейджа SET: код есть,
    // на экране ничего. Мало найти разметку — она обязана быть ДОСТИЖИМОЙ, поэтому
    // смотрим и на то, чем она загорожена: показ висит на посчитанных кандидатах.
    expect(/\{renderMarks\(r, c, v\)\}/.test(SUDOKU)).toBe(true);
    const rm = fnBody(SUDOKU, 'renderMarks');
    const digitsAt = rm.indexOf('sudokuVisibleMarks(');
    const gridAt = rm.indexOf('styles.markGrid');
    expect(`судоку: пометки считаются и рисуются: ${digitsAt >= 0 && gridAt > digitsAt}`)
      .toBe('судоку: пометки считаются и рисуются: true');
    // и до подсчёта из функции никто не выходит — иначе сетка пометок недостижима
    expect(`судоку: выхода до подсчёта нет: ${!rm.slice(0, digitsAt).includes('return null')}`)
      .toBe('судоку: выхода до подсчёта нет: true');

    // Самурай: показ обязан висеть на ПОСЧИТАННЫХ кандидатах, а не на чём попало.
    expect(/samuraiVisibleMarks\(marks\[r\]\?\.\[c\] \?\? 0, v, cellSize\)/.test(SAMURAI)).toBe(true);
    expect(/\{penciled\.length > 0 && \([\s\S]{0,240}?<View style=\{styles\.markGrid\}/.test(SAMURAI)).toBe(true);
  });

  it('🔴 режим карандаша включается кнопкой, а не только объявлен', () => {
    // Кнопка, которая красится, но не влияет на ввод, — это бейдж SET заново.
    expect(/setPencilMode\(!pencil\)/.test(SUDOKU)).toBe(true);
    expect(/active=\{pencil\}/.test(SUDOKU)).toBe(true);
    expect(/setPencil\(\(on\) => !on\)/.test(SAMURAI)).toBe(true);
    // и режимы письма не включаются вдвоём: карандаш гасит цвет и наоборот
    expect(/setPencil\(on\); if \(on\) setPaintColor\(null\)/.test(SUDOKU)).toBe(true);
    expect(/setPencil\(false\)/.test(SUDOKU)).toBe(true);
  });

  it('🔴 в кнопку карандаша попадает палец: не мельче 48', () => {
    // Промах мимо неё — это не «не нажалось»: под ней в обеих играх стоит либо
    // «Подсказка» (тратит лимит), либо цифровая клавиатура (ставит ход не туда).
    // Обычная судоку: кнопка на общей капсуле, у которой порог зашит внутрь.
    expect(MIN_TAP).toBeGreaterThanOrEqual(48);
    const glass = SUDOKU.slice(SUDOKU.indexOf("label={countPencilMarks(marks)"), SUDOKU.indexOf("label={countPencilMarks(marks)") + 400);
    expect(`судоку: кнопка на GlassButton: ${/onPress=\{\(\) => setPencilMode/.test(glass)}`)
      .toBe('судоку: кнопка на GlassButton: true');
    expect(SUDOKU).toMatch(/<GlassButton\s+grow\s+icon="pencil-outline"/);

    // Самурай: своя кнопка — читаем ИМЯ стиля из разметки и МЕРЯЕМ его объявление.
    const btn = SAMURAI.slice(SAMURAI.indexOf('testID="samurai-pencil"'), SAMURAI.indexOf('testID="samurai-pencil"') + 500);
    const styleName = (btn.match(/style=\{\[styles\.(\w+)/) || [])[1];
    expect(`самурай: стиль кнопки найден: ${!!styleName}`).toBe('самурай: стиль кнопки найден: true');
    const decl = (SAMURAI.match(new RegExp(`\\n  ${styleName}: \\{[^}]*\\}`)) || [''])[0];
    const minH = Number((decl.match(/minHeight: (\d+)/) || [])[1]);
    expect(`самурай: кнопка карандаша ${minH}pt`).toBe('самурай: кнопка карандаша 48pt');
  });

  it('🔴 в ландшафте кнопки идут ОДНИМ рядом — иначе доска уезжает за край', () => {
    // Замер живой сборки 20.08 на 812×375: второй ряд кнопок отнимал 53 точки, и низ
    // доски оказывался на 427 при высоте окна 375 — БЕЗ спасения прокруткой, потому что
    // `boardOverflows` включает её только в портрете. Ширины в ландшафте вдоволь, так
    // что четыре кнопки в ряд там ничего не режут; в портрете наоборот — режут подпись.
    const el = fnBody(SUDOKU, 'hintEl');
    const at = el.indexOf('landscape ? (');
    expect(`развилка по раскладке есть: ${at >= 0}`).toBe('развилка по раскладке есть: true');
    const land = el.slice(at, el.indexOf(') : (', at));
    const port = el.slice(el.indexOf(') : (', at), el.indexOf('</View>\n        )}', at) + 1 || undefined);
    const rows = (s: string) => (s.match(/<View style=\{styles\.hintRow\}>/g) ?? []).length;
    expect(`ландшафт: рядов ${rows(land)}`).toBe('ландшафт: рядов 1');
    expect(`портрет: рядов ${rows(port)}`).toBe('портрет: рядов 2');
    for (const b of ['hintBtn', 'undoBtn', 'pencilBtn', 'paintBtn']) {
      expect(`ландшафт: ${b} в ряду: ${land.includes(`{${b}}`)}`).toBe(`ландшафт: ${b} в ряду: true`);
      expect(`портрет: ${b} в ряду: ${port.includes(`{${b}}`)}`).toBe(`портрет: ${b} в ряду: true`);
    }
    // и подсказка про карандаш в ландшафте не появляется: каждая строка над доской
    // там стоит нижнего ряда клеток
    expect(/\{pencil && !landscape && \(/.test(SUDOKU)).toBe(true);
  });

  it('🔴 отмена хода пометки не трогает — и не должна', () => {
    // Решение то же, что во фрактальной судоку: цифра — ХОД (тратит ошибку, проверяет
    // победу), пометка — бухгалтерия игрока, и своя отмена у неё короче ленты (повторный
    // тап). Держится это тем, что ход не меняет карандашный слой ВООБЩЕ.
    for (const [name, src] of [['sudoku', SUDOKU], ['samurai', SAMURAI]] as const) {
      const undo = fnBody(src, 'handleUndo');
      expect(`${name}: отмена не лезет в пометки: ${!/setMarks\(/.test(undo)}`)
        .toBe(`${name}: отмена не лезет в пометки: true`);
      // и ход не стирает пометки: в обработчике цифры нет чистки карандашного слоя
      const num = fnBody(src, 'handleNumPress');
      const digitPart = num.slice(num.indexOf('hist.push('));
      expect(`${name}: ход не стирает пометки: ${!/setMarks\(/.test(digitPart)}`)
        .toBe(`${name}: ход не стирает пометки: true`);
    }
  });

  it('🔴 уход с расставленными кандидатами спрашивает, а не молчит', () => {
    // Кандидаты на верхних уровнях пишут по десять минут, не поставив ни одной цифры.
    // Уйти с ними молча — то же самое, что уйти с потерянными ходами.
    expect(/touched = hist\.canUndo[^\n]*countPencilMarks\(marks\) > 0/.test(SUDOKU)).toBe(true);
    expect(/confirmExit=\{phase === 'playing' && !over && \(hist\.canUndo \|\| marksWritten > 0\)\}/.test(SAMURAI)).toBe(true);
  });
});
