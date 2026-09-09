/* psygames-chess-blind-screen-gate · VER 1 · 23.08.2026 */
/**
 * ЭКРАН СЕРИИ «ШАХМАТЫ ВСЛЕПУЮ»: ТРИ ПРАВИЛА ПО ОДНОЙ ПОЗИЦИИ — ДОКАЗАНО
 * НАЖАТИЯМИ, А НЕ ОБЕЩАНО В КОММЕНТАРИИ.
 *
 * Ядро (`src/games/chess-blind/core`) уже проверено значениями в
 * `chess-blind-series.test.ts`. Здесь другое: ЭКРАН. Он монтируется целиком,
 * серия играется настоящими нажатиями, а ответы считаются по тому, что НАПИСАНО
 * НА ЭКРАНЕ, — вопрос разбирается регуляркой, собранной из шаблона словаря.
 *
 * Замер держится на аддитивном методе: каждый следующий блок добавляет РОВНО
 * ОДНО требование, и тогда разность времён — цена добавленного звена. Разваливают
 * его четыре поломки, и каждая выглядит на экране совершенно исправной:
 *
 *   1. позиция пересобралась между блоками — в T₂−T₁ поехала разница ПОЗИЦИЙ;
 *   2. серия записалась тремя сессиями — разность не посчитать уже никогда,
 *      нечем доказать, что блоки из одного прогона;
 *   3. врезка (или показ позиции) попала внутрь часов блока — разность выросла
 *      ровно на её длительность, и назвать её ценой правила стало нельзя;
 *   4. прерванная серия отдала разности — то есть выдуманные числа.
 *
 * ⚠️ ЗЕЛЁНОЕ ВСЛЕПУЮ ЗДЕСЬ ОСОБЕННО ДЁШЕВО. «Расстановки совпали» — правда и для
 * двух пустых досок; «сессия одна» — правда и когда не записалось ничего. Обе
 * дыры закрыты встречными пробами: каждая проба сперва доказывает, что смотреть
 * есть на что (64 клетки, фигуры на доске, вопросы приходят), а сравнение умеет
 * краснеть на сдвинутой фигуре.
 *
 * ⚠️ ЧАСЫ ДВИГАЮТСЯ РОВНО НА ИЗВЕСТНЫЕ ЧИСЛА. Врезка и показ позиции
 * прокручиваются ТОЧНО на свою длительность: попади любая из них внутрь замера —
 * разности разъедутся ровно на 2500 или 8000 мс, и проба покраснеет числом.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHESS_SERIES_PLAN,
  QUESTIONS_PER_BLOCK,
  bandForLevel,
  getChessBlindStrings,
  knightDistance,
  sameSquareColor,
  squareIndex,
} from '@/src/games/chess-blind/core';

declare const __dirname: string;
declare function require(m: string): any;

const TestRenderer = require('react-test-renderer');

jest.setTimeout(180000);

/** Параметры маршрута — их подменяет каждая проба сама (`?series=1` и без него). */
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => mockParams,
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

/** Что игра записала в журнал. Единственная подмена — сама запись, не её содержимое. */
const mockSaved: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { mockSaved.push(s); return s; },
}));

/** Каркас GameShell спрашивает безопасные поля — без метрик он падает на монтаже. */
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
/** ⚠️ Только внешние совпадения: TouchableOpacity отдаёт второй узел с теми же пропами. */
const OUTER = { deep: false };
/** Язык теста — база приложения ('en' в LanguageContext). */
const EN = getChessBlindStrings('en');
/**
 * Длительности из экрана. Двигаем часы на них ТОЧНО: если врезка или показ
 * позиции попадут в замер блока, разности вырастут ровно на эти числа.
 */
const INTERLUDE = 2500;
const EXPOSE = 8000;
/** Подписи общего словаря приложения, которыми экран подписывает кнопки серии. */
const START = 'Start';
const LEAVE = 'Leave';

function textsIn(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined || typeof n === 'boolean') return;
    if (typeof n === 'string') { out.push(n); return; }
    if (typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) (n.children as any[]).forEach(walk);
  };
  walk(node);
  return out;
}
const joined = (node: any): string => textsIn(node).join('');

async function settle() {
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
}

/** Прокрутить игровые часы: они же и часы блока (gameNow ← Date.now под фейк-таймерами). */
async function advance(ms: number) {
  await TestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

async function mountScreen(params: Record<string, string> = {}) {
  mockParams = params;
  await AsyncStorage.clear();
  mockSaved.length = 0;
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/chess-blind').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await settle();
  return r;
}

/* ── ЧТЕНИЕ ОТРИСОВАННОГО ДЕРЕВА ───────────────────────────────────────────── */

/**
 * КЛЕТКА ДОСКИ — узел, подписанный именем поля («e4»). Подпись рисует сам экран
 * для читалки, и она же — единственный честный способ прочитать расстановку:
 * фигура берётся ИЗ ТЕКСТА клетки, а не из внутренних данных экрана.
 */
const SQUARE_LABEL = /^[a-h][1-8]$/;
function boardCells(r: any): any[] {
  return r.root.findAll(
    (n: any) => SQUARE_LABEL.test(String(n.props?.accessibilityLabel ?? '')),
    OUTER,
  );
}

/** Расстановка так, как её видит человек: поле → фигурный знак (пусто = ''). */
/**
 * ⚠️ 03.09.2026 ФИГУРУ ОПОЗНАЁМ ПО `testID`, А НЕ ПО ТЕКСТУ. Раньше в клетке лежал
 * знак юникода ♞ и хватало текста; теперь фигура — картинка (набор Cburnett, просьба
 * Дениса «найди нормальные фигуры»). Опознавательный знак у неё задан явно —
 * `piece:♞`, — и проверяемое свойство не изменилось: в клетке ровно одна фигура и
 * расстановка та же самая.
 */
function layout(r: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cell of boardCells(r)) {
    const знаки = cell.findAll((n: any) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('piece:'), { deep: true })
      .map((n: any) => String(n.props.testID).slice('piece:'.length));
    const текст = Array.from(new Set(textsIn(cell))).join('');
    out[String(cell.props.accessibilityLabel)] = Array.from(new Set(знаки)).join('') || текст;
  }
  return out;
}

const filled = (l: Record<string, string>): string[] => Object.keys(l).filter((k) => l[k] !== '');

/** Все строки дерева — чтобы искать вопрос по шаблону словаря, а не по стилю. */
function allTexts(r: any): string[] {
  const out = r.root.findAll(() => true, { deep: true }).map((n: any) => joined(n).trim());
  const line = questionLine(r);
  return line ? [...out, line] : out;
}

/**
 * ⚠️ 08.09.2026 ФИГУРУ В ВОПРОСЕ ТОЖЕ ОПОЗНАЁМ ПО `testID`. Ровно та же правка, что
 * 03.09 сделали для клеток доски, и по той же причине: шрифтовой глиф `♙` в строке
 * вопроса был нечитаем (отчёты `18be48ff`, `d35840f8`), и вопрос теперь рисует ту же
 * картинку, что доска. Текста у картинки нет, опознавательный знак задан явно —
 * `piece:♙`. Проверяемое свойство не изменилось: вопрос спрашивает про ту же фигуру.
 */
function questionLine(r: any): string | null {
  const rows = r.root.findAll((n: any) => n.props?.testID === 'chess-question', OUTER);
  if (!rows.length) return null;
  const parts: string[] = [];
  const walk = (node: any) => {
    if (typeof node === 'string') { parts.push(node); return; }
    const id = String(node?.props?.testID ?? '');
    if (id.startsWith('piece:')) { parts.push(id.slice('piece:'.length)); return; }
    (node?.children ?? []).forEach(walk);
  };
  rows[0].children.forEach(walk);
  return parts.join('').trim();
}

/** Регулярка из шаблона словаря: «Are {a} and {b} the same colour?» → тот же вопрос с дырами. */
function askRe(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\{\w+\\\}/g, '(.+?)')}$`);
}
const RE_SQUARE = askRe(EN.askSquare);
const RE_KNIGHT = askRe(EN.askKnight);
const RE_RECALL = askRe(EN.askRecall);

function matchAsk(r: any, re: RegExp): string | null {
  for (const s of allTexts(r)) if (re.test(s)) return s;
  return null;
}

const squaresIn = (s: string): string[] => s.match(/\b[a-h][1-8]\b/g) || [];
const glyphIn = (s: string): string => (s.match(/[♔-♟]/) || [''])[0];

function pressText(r: any, label: string) {
  const btns = r.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && joined(n).trim() === label,
    OUTER,
  );
  if (btns.length !== 1) throw new Error(`кнопку «${label}» не опознать: найдено ${btns.length}`);
  TestRenderer.act(() => { btns[0].props.onPress(); });
}

function pressLabelled(r: any, a11y: string) {
  const btns = r.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === a11y,
    OUTER,
  );
  if (btns.length !== 1) throw new Error(`кнопку «${a11y}» не опознать: найдено ${btns.length}`);
  TestRenderer.act(() => { btns[0].props.onPress(); });
}

/**
 * Ответить на текущий вопрос ВЕРНО, решая его самостоятельно по тому, что
 * написано на экране: цвет полей и маршрут коня считаются здесь заново, а фигура
 * сверяется с расстановкой, которую показали ГЛАЗАМИ (`memorised`).
 */
function answerOne(r: any, memorised: Record<string, string> | null): 'square' | 'knight' | 'recall' {
  const square = matchAsk(r, RE_SQUARE);
  if (square) {
    const [a, b] = squaresIn(square);
    if (!a || !b) throw new Error(`в вопросе о полях нет двух полей: «${square}»`);
    pressText(r, sameSquareColor(squareIndex(a), squareIndex(b)) ? EN.answerYes : EN.answerNo);
    return 'square';
  }
  const knight = matchAsk(r, RE_KNIGHT);
  if (knight) {
    const [a, b] = squaresIn(knight);
    const moves = Number((knight.match(/\b\d+\b/) || ['0'])[0]);
    if (!a || !b || !moves) throw new Error(`вопрос о коне не разобран: «${knight}»`);
    pressText(r, knightDistance(squareIndex(a), squareIndex(b)) <= moves ? EN.answerYes : EN.answerNo);
    return 'knight';
  }
  const recall = matchAsk(r, RE_RECALL);
  if (recall) {
    if (!memorised) throw new Error('вопрос о памяти пришёл раньше показа позиции');
    const [sq] = squaresIn(recall);
    const glyph = glyphIn(recall);
    if (!sq || !glyph) throw new Error(`вопрос о памяти не разобран: «${recall}»`);
    pressText(r, memorised[sq] === glyph ? EN.answerYes : EN.answerNo);
    return 'recall';
  }
  throw new Error(`вопроса на экране нет вовсе: ${allTexts(r).slice(-12).join(' | ')}`);
}

/** Пройти блок целиком, отвечая верно. Возвращает вид каждого вопроса. */
function playBlock(r: any, memorised: Record<string, string> | null): string[] {
  const kinds: string[] = [];
  for (let i = 0; i < QUESTIONS_PER_BLOCK; i += 1) kinds.push(answerOne(r, memorised));
  return kinds;
}

/* ── ПРОБЫ ─────────────────────────────────────────────────────────────────── */

describe('экран серии: три блока по одной позиции, одна сессия, честные разности', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 позиция во всех трёх блоках ОДНА И ТА ЖЕ, сверено поэлементно по 64 клеткам', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      // Блок 1 — про цвет полей, доски во время вопросов нет вовсе.
      expect(`доска в блоке вопросов: ${boardCells(r).length}`).toBe('доска в блоке вопросов: 0');
      const kinds1 = playBlock(r, null);
      expect(new Set(kinds1)).toEqual(new Set(['square']));

      // Врезка: позиция показана и названа той же самой.
      await advance(100);
      const first = layout(r);
      expect(`клеток на доске: ${Object.keys(first).length}`).toBe('клеток на доске: 64');
      expect(filled(first).length).toBeGreaterThanOrEqual(bandForLevel(1).min);
      await advance(INTERLUDE);

      const kinds2 = playBlock(r, null);
      expect(new Set(kinds2)).toEqual(new Set(['knight']));
      await advance(100);
      const second = layout(r);
      await advance(INTERLUDE);

      // Блок «память»: показ начинает человек, потом позицию убирают.
      expect(`доска до нажатия «готов»: ${boardCells(r).length}`).toBe('доска до нажатия «готов»: 0');
      pressText(r, START);
      const third = layout(r);
      await advance(EXPOSE);
      expect(`доска после показа: ${boardCells(r).length}`).toBe('доска после показа: 0');

      expect(second).toEqual(first);
      expect(third).toEqual(first);
      // И это не «совпало число клеток»: сверяется каждое поле по своему имени.
      const moved = Object.keys(first).filter((sq) => third[sq] !== first[sq]);
      expect(`поля, где расстановка разошлась: ${moved.join(',') || 'нет'}`)
        .toBe('поля, где расстановка разошлась: нет');

      // ⚠️ Встречная проба: сравнение умеет КРАСНЕТЬ. Одна сдвинутая фигура — и всё.
      const busy = filled(first)[0];
      const shifted = { ...first, [busy]: '' };
      expect(shifted).not.toEqual(first);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 серия пишет ОДНУ сессию, а разности равны тому, на сколько двигали часы В БЛОКАХ', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      await advance(40_000);
      playBlock(r, null);
      expect(`сессий после первого блока: ${mockSaved.length}`).toBe('сессий после первого блока: 0');

      await advance(INTERLUDE);
      await advance(65_000);
      playBlock(r, null);
      expect(`сессий после второго блока: ${mockSaved.length}`).toBe('сессий после второго блока: 0');

      await advance(INTERLUDE);
      pressText(r, START);
      const shown = layout(r);
      await advance(EXPOSE);
      await advance(90_000);
      playBlock(r, shown);
      await settle();

      expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
      const s = mockSaved[0];
      expect(s.game_type).toBe('chess_blind_series');
      expect((s.details.blocks as any[]).map((b) => b.key)).toEqual([...CHESS_SERIES_PLAN]);
      expect(s.details.series_complete).toBe(true);
      expect(s.passed).toBe(true);
      // 🔴 Врезка (2500) и показ позиции (8000) в замер НЕ вошли: иначе здесь
      // стояли бы 27 500 и 58 000 (или 100 500), а не ровно то, что накрутили.
      expect(s.details.diffs).toEqual({ knight_minus_square: 25_000, recall_minus_square: 50_000 });
      expect((s.details.blocks as any[]).map((b) => b.time_ms)).toEqual([40_000, 65_000, 90_000]);
      // Ошибок нет: все восемь вопросов каждого блока решены верно.
      expect((s.details.blocks as any[]).map((b) => b.errors)).toEqual([0, 0, 0]);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 разбор показывает T₁/T₂/T₃ и обе разности словами словаря', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      await advance(30_000);
      playBlock(r, null);
      await advance(INTERLUDE);
      await advance(45_000);
      playBlock(r, null);
      await advance(INTERLUDE);
      pressText(r, START);
      const shown = layout(r);
      await advance(EXPOSE);
      await advance(60_000);
      playBlock(r, shown);
      await settle();

      const page = joined(r.root);
      expect(page).toContain(EN.seriesDone);
      // T₁, T₂, T₃ — по одному на блок, названы своими именами.
      expect(page).toContain(`${EN.blockSquare}: 30.0`);
      expect(page).toContain(`${EN.blockKnight}: 45.0`);
      expect(page).toContain(`${EN.blockRecall}: 60.0`);
      // Обе разности — со знаком и в тех же секундах.
      expect(page).toContain(`${EN.coordSpeed}: 30.0`);
      expect(page).toContain(`${EN.knightCost}: +15.0`);
      expect(page).toContain(`${EN.holdCost}: +30.0`);
      expect(page).not.toContain(EN.notFinished);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 выход на середине: блоки записаны, разностей НЕТ ВООБЩЕ', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      await advance(30_000);
      playBlock(r, null);                       // первый блок доигран
      await advance(INTERLUDE);
      await advance(10_000);
      answerOne(r, null);                       // второй начат и брошен
      pressLabelled(r, LEAVE);
      await settle();

      expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
      const s = mockSaved[0];
      expect((s.details.blocks as any[]).map((b) => `${b.key}:${b.done}`)).toEqual(['square:true', 'knight:false']);
      expect(s.details.series_complete).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(s.details, 'diffs')).toBe(false);
      expect(s.passed).toBe(false);
      // И человеку сказано прямо, а не показаны нули.
      const page = joined(r.root);
      expect(page).toContain(EN.notFinished);
      expect(page).not.toContain(EN.knightCost);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 уход мимо кнопок (аппаратная «назад») серию не теряет и разностей не выдумывает', async () => {
    const r = await mountScreen();
    pressText(r, EN.entry);
    await advance(12_000);
    answerOne(r, null);
    await TestRenderer.act(async () => { r.unmount(); });
    await settle();

    expect(`записано сессий: ${mockSaved.length}`).toBe('записано сессий: 1');
    const s = mockSaved[0];
    expect((s.details.blocks as any[]).map((b) => `${b.key}:${b.done}`)).toEqual(['square:false']);
    expect(s.details.series_complete).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(s.details, 'diffs')).toBe(false);
  });

  it('🔴 доигранная серия не получает ВТОРУЮ запись при уходе с экрана', async () => {
    const r = await mountScreen();
    pressText(r, EN.entry);
    await advance(20_000);
    playBlock(r, null);
    await advance(INTERLUDE);
    await advance(20_000);
    playBlock(r, null);
    await advance(INTERLUDE);
    pressText(r, START);
    const shown = layout(r);
    await advance(EXPOSE);
    await advance(20_000);
    playBlock(r, shown);
    await settle();
    expect(`сессий сразу после серии: ${mockSaved.length}`).toBe('сессий сразу после серии: 1');
    await TestRenderer.act(async () => { r.unmount(); });
    await settle();
    expect(`сессий после ухода: ${mockSaved.length}`).toBe('сессий после ухода: 1');
  });

  it('🔴 врезка называет новое правило, говорит «позиция та же» и показывает её', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      playBlock(r, null);
      await advance(100);                       // врезка на экране
      const page = joined(r.root);
      expect(page).toContain(EN.ruleChanges);
      expect(page).toContain(EN.samePosition);
      expect(page).toContain(EN.blockKnight);
      expect(`клеток на доске врезки: ${boardCells(r).length}`).toBe('клеток на доске врезки: 64');
      await advance(INTERLUDE - 100);
      // Врезка ушла — на экране снова вопрос, и уже по новому правилу.
      expect(matchAsk(r, RE_KNIGHT)).not.toBeNull();
      expect(`клеток на доске в вопросах: ${boardCells(r).length}`).toBe('клеток на доске в вопросах: 0');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 вопрос блока «память» спрашивает про ТУ ЖЕ доску, что показали', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      playBlock(r, null);
      await advance(INTERLUDE);
      playBlock(r, null);
      await advance(INTERLUDE);
      pressText(r, START);
      const shown = layout(r);
      await advance(EXPOSE);

      const asked = matchAsk(r, RE_RECALL);
      expect(asked).not.toBeNull();
      const [sq] = squaresIn(asked as string);
      // Поле вопроса — настоящее поле показанной доски, а утверждение — фигура,
      // которая на ней и правда стоит (пустотой утверждать нельзя).
      expect(Object.prototype.hasOwnProperty.call(shown, sq)).toBe(true);
      expect(filled(shown)).toContain(
        Object.keys(shown).find((k) => shown[k] === glyphIn(asked as string)) as string,
      );
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 фигура в вопросе нарисована КАРТИНКОЙ, а не шрифтовым знаком', async () => {
    /**
     * Отчёты `18be48ff` и `d35840f8`: «фигуру в вопросе не видно». Доску перевели на
     * картинки ещё 03.09 и записали, почему: у шрифтового глифа не поправить ни
     * толщину линии, ни пропорции, и контурные белые `♔♕♖♗♘♙` на светлом фоне
     * теряются. Вопрос при этом остался текстом — тем самым знаком, который уже
     * признали нечитаемым, да ещё и в кегле обычной строки.
     *
     * ⚠️ Проверяем ВЫЗОВОМ: в строке вопроса стоит узел фигуры (`piece:♙`), а самого
     * шрифтового знака среди её ТЕКСТА нет.
     */
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      playBlock(r, null);
      await advance(INTERLUDE);
      playBlock(r, null);
      await advance(INTERLUDE);
      pressText(r, START);
      await advance(EXPOSE);

      const rows = r.root.findAll((n: any) => n.props?.testID === 'chess-question', OUTER);
      expect(`строка вопроса на экране: ${rows.length > 0}`).toBe('строка вопроса на экране: true');

      // фигура — узлом-картинкой
      const pieces = rows[0].findAll(
        (n: any) => String(n.props?.testID ?? '').startsWith('piece:'), OUTER,
      );
      expect(`фигур-картинок в вопросе: ${pieces.length}`).toBe('фигур-картинок в вопросе: 1');

      // …и её шрифтового знака в тексте строки НЕТ
      const текст = joined(rows[0]);
      expect(`шрифтовой знак в тексте вопроса: ${/[♔-♟]/.test(текст)}`)
        .toBe('шрифтовой знак в тексте вопроса: false');

      // а спрашивает вопрос по-прежнему про фигуру показанной доски
      expect(glyphIn(questionLine(r) as string)).not.toBe('');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('вход в серию назван, и с какой доски она начнётся — сказано ДО старта', async () => {
    const r = await mountScreen();
    try {
      const page = joined(r.root);
      const band = bandForLevel(1);
      expect(page).toContain(EN.entry);
      expect(page).toContain(`${band.min}`);
      expect(page).toContain(`${band.max}`);
      expect(page).toContain(EN.yourLevels.split('{')[0].trim());
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  /**
   * 🔴 МЕНЮ ПАУЗЫ НА ЭКРАНЕ СЕРИИ — ТРЕТИЙ КАРКАС ИГРЫ, И САМЫЙ ДОРОГОЙ.
   *
   * Серия меряет разности T₂−T₁ и T₃−T₁; вылет из неё одним касанием стрелки
   * стоит не «партии», а всего замера — прогон уходит в никуда. Каркасная проба
   * `game-shell-pause-menu` сторожит сам каркас, проводку игры — не видит.
   * Замер 09.09 до правки: `grep -c pauseActions app/games/chess-blind.tsx` → 0.
   */
  it('🔴 стрелка в серии открывает меню паузы, а не обрывает замер', async () => {
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      const метка = (id: string) => r.root.findAll((n: any) => n.props?.testID === id, OUTER);
      expect(`меню до стрелки: ${метка('game-pause-menu').length > 0}`).toBe('меню до стрелки: false');

      await TestRenderer.act(async () => { метка('game-back')[0].props.onPress(); });
      await settle();
      expect(`меню после стрелки: ${метка('game-pause-menu').length > 0}`).toBe('меню после стрелки: true');
      const пункты = ['resume', 'restart', 'home']
        .map((id) => `${id}:${метка(`pause-action:${id}`).length > 0}`).join(' ');
      expect(пункты).toBe('resume:true restart:true home:true');

      // Отпускаем общий счётчик пауз — иначе он утечёт в следующую пробу файла.
      await TestRenderer.act(async () => { метка('pause-action:resume')[0].props.onPress(); });
      await settle();
      expect(`меню после «Продолжить»: ${метка('game-pause-menu').length > 0}`)
        .toBe('меню после «Продолжить»: false');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 разбор ошибки показывает фигуру КАРТИНКОЙ, а не шрифтовым знаком', async () => {
    /**
     * Продолжение отчётов `18be48ff` и `d35840f8`. Коммит `bf9e3237` перевёл на
     * картинку ДВА места сразу — вопрос блока «память» и разбор ошибок «что стояло
     * на поле на самом деле». Проба тогда была написана только на первое.
     *
     * 🔴 ЗАМЕР 09.09.2026, почему проба нужна: вернул разбор к прежней строке со
     * шрифтовым знаком (`squareName — truthLabel`) и прогнал всё своё —
     * **24 набора, 284 пробы, код выхода 0**. Дефект вернулся, не покраснело ничто.
     *
     * Чтобы разбор вообще появился, блок «память» проходится ЗАВЕДОМО МИМО: на
     * каждый вопрос жмётся ответ, противоположный верному. Что стояло на поле,
     * проба знает из показанной ГЛАЗАМИ расстановки, а не из внутренностей игры,
     * и поэтому умеет сказать, сколько картинок обязано быть — не «хотя бы одна».
     */
    const r = await mountScreen();
    try {
      pressText(r, EN.entry);
      playBlock(r, null);
      await advance(INTERLUDE);
      playBlock(r, null);
      await advance(INTERLUDE);
      pressText(r, START);
      const shown = layout(r);
      await advance(EXPOSE);

      const правда: string[] = [];
      for (let i = 0; i < QUESTIONS_PER_BLOCK; i += 1) {
        const вопрос = matchAsk(r, RE_RECALL);
        expect(`вопрос памяти №${i + 1} на экране: ${вопрос !== null}`)
          .toBe(`вопрос памяти №${i + 1} на экране: true`);
        const [поле] = squaresIn(вопрос as string);
        const верно = shown[поле] === glyphIn(вопрос as string);
        правда.push(shown[поле] ?? '');
        pressText(r, верно ? EN.answerNo : EN.answerYes);   // намеренно мимо
      }
      await settle();

      // Разбор без единой фигуры судить нельзя — сперва доказываем, что смотреть есть на что.
      const сФигурой = правда.filter((g) => g !== '').length;
      expect(`полей с фигурой среди ошибок: ${сФигурой > 0}`)
        .toBe('полей с фигурой среди ошибок: true');

      const rows = r.root.findAll((n: any) => n.props?.testID === 'chess-miss', OUTER);
      expect(`строк разбора: ${rows.length}`).toBe(`строк разбора: ${QUESTIONS_PER_BLOCK}`);

      const картинок = rows.reduce((n: number, row: any) => n + row.findAll(
        (x: any) => String(x.props?.testID ?? '').startsWith('piece:'), OUTER,
      ).length, 0);
      expect(`фигур-картинок в разборе: ${картинок}`)
        .toBe(`фигур-картинок в разборе: ${сФигурой}`);

      const текст = rows.map((row: any) => joined(row)).join(' ');
      expect(`шрифтовой знак в тексте разбора: ${/[♔-♟]/.test(текст)}`)
        .toBe('шрифтовой знак в тексте разбора: false');
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });
});

/**
 * ВХОД ИЗ «ЗАРЯДКИ» — ЧЕРЕЗ ПАРАМЕТР, А НЕ ЧЕРЕЗ НАДЕЖДУ.
 *
 * 🔴 МАРШРУТ БЕСПОЛЕЗЕН, ЕСЛИ ЭКРАН ПАРАМЕТР НЕ ЧИТАЕТ: ровно это уже случилось
 * с корректуркой — запись в «Зарядке» была, а экран вёл в обычную партию. Проба
 * поэтому парная: с `series=1` открывается блок серии, без него — обычная партия.
 */
describe('зарядка просит именно серию: ?series=1', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 с параметром экран открывает БЛОК СЕРИИ, а не обычную партию', async () => {
    const r = await mountScreen({ auto: '1', series: '1' });
    try {
      const page = joined(r.root);
      expect(page).toContain(EN.blockSquare);
      expect(matchAsk(r, RE_SQUARE)).not.toBeNull();
      expect(page).toContain(EN.answerYes);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });

  it('🔴 без параметра тот же автостарт ведёт в обычную партию — проба различает их', async () => {
    const r = await mountScreen({ auto: '1' });
    try {
      expect(matchAsk(r, RE_SQUARE)).toBeNull();
      expect(joined(r.root)).not.toContain(EN.blockSquare);
    } finally { TestRenderer.act(() => { try { r.unmount(); } catch { /* уже ушёл */ } }); }
  });
});
