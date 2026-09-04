/**
 * ТРЕКЕР ОБЪЕКТОВ — ГЕЙТ НА ТО, ЧТО ЛОМАЕТСЯ МОЛЧА.
 *
 * 🔴 ЗАЧЕМ ГЕЙТ, А НЕ «ПОСМОТРЕЛИ ГЛАЗАМИ». Эта игра единственная, где движение
 * идёт САМО, кадрами. Всё остальное приложение стоит на месте и ждёт тапа —
 * значит все привычные проверки его и стерегут, а покадровый мир не стережёт
 * никто. Четыре вещи ломаются здесь беззвучно и выглядят как исправные:
 *
 *  1. ПАУЗА. `gamePause` замораживает часы, и экран, честно заменивший
 *     `Date.now()` на `gameNow()`, выглядит починенным. Но мир двигают дельты
 *     `requestAnimationFrame`, а они тикают мимо любых часов: открыл справку
 *     «Правила» — и, пока читаешь, объекты разлетелись, то есть цели потеряны.
 *     Репорт 18.08.2026 («пока я писала отзыв, игра моя закончилась») в игре про
 *     движение стоит дороже, чем где угодно ещё. Поэтому проверяем ПОЛОЖЕНИЯ
 *     объектов до, во время и после паузы, а не наличие импорта.
 *
 *  2. ЩАДЯЩИЙ РЕЖИМ. Игра целиком про движение — выключить его нельзя, это и
 *     есть упражнение; отказать («включите анимации») тоже нельзя. Движение
 *     остаётся, но управляет им человек: шаг по кнопке, кадровый цикл не
 *     заводится вовсе. Соблазн следующего захода — «шаг 250 мс мелковат, на 41-м
 *     уровне тридцать нажатий, поставим 500». Это ровно тот размен, где станет
 *     быстрее и бессмысленнее: за 500 мс объект уезжает дальше собственного
 *     радиуса, и ближайшим к прежнему месту цели оказывается СОСЕД — слежение
 *     превращается в лотерею. Проверка ниже считает это арифметикой, а не верой.
 *
 *  3. ОДИНАКОВОСТЬ. Кольцо цели, случайно оставленное в фазе движения, убивает
 *     упражнение целиком: следить больше не за чем, задача становится «ткни в
 *     обведённое». Снаружи такая игра выглядит работающей и даже более понятной.
 *
 *  4. ЧАСЫ. Длительность партии обязана считаться игровыми часами, которые подаёт
 *     экран. Модуль со своим `Date.now` внутри прошёл бы гейт `game-clock-discipline`
 *     — тот смотрит только в `app/games/*`.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { holdGame, __resetGameClock } from '@/src/services/gamePause';
import ObjectTrackerGame, { REDUCED_STEP_MS } from '@/src/games/object-tracker/ObjectTrackerGame';
import {
  LEVELS,
  createObjectTrackerSession,
  startObjectTrackerRound,
  selectTrackedObject,
  startTrackerMovement,
  advanceTrackerMovement,
  TRACKER_OBJECT_RADIUS,
  advanceTrackerWorld,
  generateObjectTrackerRound,
  getObjectTrackerStrings,
  isPassed,
  type ObjectTrackerMetrics,
} from '@/src/games/object-tracker/core';

declare const __dirname: string;
declare function require(m: string): any;
// @types/node в проекте нет (фронт собирается под RN/web), а подставные кадры
// живут именно в глобальном объекте — объявляем его здесь, как это делают соседние гейты.
declare const global: any;
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '../..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Комментарии вырезаем ДО поиска запрещённого. Иначе гейт краснеет на объяснении,
 * почему так делать нельзя, — а объяснение как раз и обязано называть ловушку по
 * имени. Ровно на этом ловились соседние гейты (см. шапку ci-i18n-hardcode-guard).
 */
const readCode = (rel: string): string => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const RU = getObjectTrackerStrings('ru');
const PHONE_W = 375;   // самый тесный размер: на нём и промахиваются пальцем

// ────────────────────────── подставные кадры ──────────────────────────
/**
 * Настоящий `requestAnimationFrame` в тесте бесполезен: он приходит когда хочет,
 * и «объекты не сдвинулись» означало бы «кадр не успел», а не «пауза работает».
 * Здесь кадры выдаём мы — тогда каждое утверждение про движение однозначно.
 */
let pending: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let rafRequests: number;
let clock: number;

function installFakeFrames() {
  pending = new Map();
  nextFrameId = 1;
  rafRequests = 0;
  clock = 1_000;
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafRequests += 1;
    const id = nextFrameId++;
    pending.set(id, cb);
    return id;
  };
  (global as any).cancelAnimationFrame = (id: number) => { pending.delete(id); };
}

/** Прогнать n кадров по 16 мс. Возвращает, сколько кадров реально выполнилось. */
function runFrames(n: number): number {
  let ran = 0;
  for (let i = 0; i < n; i += 1) {
    const entry = [...pending.entries()][0];
    if (!entry) break;
    pending.delete(entry[0]);
    clock += 16;
    TestRenderer.act(() => { entry[1](clock); });
    ran += 1;
  }
  return ran;
}

// ────────────────────────── чтение отрисованного ──────────────────────────
type Renderer = TestRenderer.ReactTestRenderer;

function flat(style: any): Record<string, any> {
  if (Array.isArray(style)) return style.reduce((acc, s) => ({ ...acc, ...flat(s) }), {});
  return style && typeof style === 'object' ? style : {};
}

/** Кружки объектов — по подписи для скринридера, а не по имени стиля. */
function objects(r: Renderer): { label: string; style: Record<string, any> }[] {
  return r.root
    .findAll((n) => typeof n.type === 'string'
      && typeof n.props.accessibilityLabel === 'string'
      && /^(Объект|Цель) \d+/.test(n.props.accessibilityLabel), { deep: true })
    .map((n) => ({ label: n.props.accessibilityLabel as string, style: flat(n.props.style) }));
}

/** Отпечаток раскладки: сдвинулся хоть один объект — строка изменилась. */
function layout(r: Renderer): string {
  return objects(r).map((o) => `${Math.round(o.style.left)},${Math.round(o.style.top)}`).join(' ');
}

function press(r: Renderer, label: string): void {
  const btn = r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function');
  expect(`кнопка «${label}»: ${btn.length}`).toBe(`кнопка «${label}»: 1`);
  TestRenderer.act(() => { btn[0].props.onPress(); });
}

function has(r: Renderer, label: string): boolean {
  return r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function').length > 0;
}

interface MountOptions {
  level?: number;
  screenWidth?: number;
  reducedMotion?: boolean;
  now?: () => number;
  onComplete?: (m: ObjectTrackerMetrics) => void;
}

function mount(opts: MountOptions = {}): Renderer {
  let r!: Renderer;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(ObjectTrackerGame as any, {
      seed: 'object-tracker-gate',
      level: opts.level ?? 20,
      locale: 'ru',
      reducedMotion: opts.reducedMotion ?? false,
      screenWidth: opts.screenWidth ?? PHONE_W,
      now: opts.now ?? (() => clock),
      theme: {
        background: '#0b1020', surface: '#151b2e', card: '#151b2e',
        text: '#f2f4f8', textSecondary: '#9aa3b8', primary: '#f59e0b',
        border: '#2a3350', success: '#22c55e', error: '#ef4444', warning: '#eab308',
      },
      gameGradient: ['#f59e0b', '#7c3aed'],
      onComplete: opts.onComplete ?? (() => {}),
      onExit: () => {},
    }));
  });
  return r;
}

/**
 * ⚠️ ПАУЗА ГЛОБАЛЬНА. `gamePause` — счётчик на всё приложение, и не снятый в
 * упавшем тесте `holdGame()` уводит в «вечную паузу» ВСЕ следующие тесты файла.
 * Ловилось ровно так: три проверки подряд краснели на исправном коде, потому что
 * первая упала до своего `release()`. Поэтому паузы берём только через `hold()`,
 * а хвосты снимаем принудительно.
 */
const holds: (() => void)[] = [];
function hold(): () => void {
  let release!: () => void;
  TestRenderer.act(() => { release = holdGame(); });
  holds.push(release);
  return () => { TestRenderer.act(() => { release(); }); };
}

beforeEach(() => { installFakeFrames(); __resetGameClock(); });
afterEach(() => { while (holds.length) holds.pop()!(); });

// ══════════════════════════════════════════════════════════════════════════
describe('пауза: объекты замирают, пока человек читает правила', () => {
  it('🔴 общая пауза останавливает объекты, а снятие возвращает движение', () => {
    const r = mount();
    press(r, RU.beginMotion);

    const atStart = layout(r);
    expect(runFrames(6)).toBe(6);
    const beforeHold = layout(r);
    expect(beforeHold).not.toBe(atStart);          // без паузы мир едет — иначе тест зелен вслепую

    // Открылась справка «Правила» или окно отзыва.
    const release = hold();
    // Кадр, который был в полёте, обязан быть отменён: иначе один «последний»
    // кадр всё же сдвинет объекты уже под открытым окном.
    expect(pending.size).toBe(0);
    const requestsWhileHeld = rafRequests;
    expect(runFrames(10)).toBe(0);                 // цикл не крутится вовсе
    expect(rafRequests).toBe(requestsWhileHeld);   // и новых кадров не просит
    expect(layout(r)).toBe(beforeHold);            // 🔴 объекты стоят

    release();
    expect(runFrames(6)).toBe(6);
    expect(layout(r)).not.toBe(beforeHold);        // после закрытия окна движение продолжилось
    r.unmount();
  });

  it('🔴 пауза, начатая ДО входа в игру, не даёт движению стартовать', () => {
    // Справку открывают с экрана настройки — кнопка «?» живёт в корне приложения
    // и переживает переход на игровой экран.
    const release = hold();
    const r = mount();
    press(r, RU.beginMotion);
    const atStart = layout(r);
    expect(runFrames(8)).toBe(0);
    expect(layout(r)).toBe(atStart);
    release();
    expect(runFrames(4)).toBe(4);
    expect(layout(r)).not.toBe(atStart);
    r.unmount();
  });

  it('уход с экрана снимает кадр — отложенный кадр не дописывает мёртвую партию', () => {
    const r = mount();
    press(r, RU.beginMotion);
    runFrames(2);
    expect(pending.size).toBe(1);
    TestRenderer.act(() => { r.unmount(); });
    expect(pending.size).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('щадящий режим: движение остаётся, но ведёт его человек', () => {
  it('🔴 кадровый цикл не заводится ни разу', () => {
    const r = mount({ reducedMotion: true });
    press(r, RU.beginMotion);
    expect(rafRequests).toBe(0);
    expect(pending.size).toBe(0);
    r.unmount();
  });

  it('🔴 раунд всё равно проходится до конца — режим не отбирает игру', () => {
    const results: ObjectTrackerMetrics[] = [];
    const r = mount({ level: 1, reducedMotion: true, onComplete: (m) => results.push(m) });
    press(r, RU.beginMotion);

    // Шагаем, пока есть кнопка шага. Потолок 200 — защита от вечного цикла в тесте.
    let steps = 0;
    while (has(r, RU.stepMotion) && steps < 200) { press(r, RU.stepMotion); steps += 1; }
    expect(steps).toBeGreaterThan(0);
    expect(has(r, RU.stepMotion)).toBe(false);      // движение кончилось

    // Выбираем ровно столько объектов, сколько целей, и сдаём.
    const round = generateObjectTrackerRound('object-tracker-gate', 1);
    const circles = objects(r);
    for (let i = 0; i < round.targetCount; i += 1) {
      const node = r.root.findAll((n) => n.props?.accessibilityLabel === circles[i].label
        && typeof n.props?.onPress === 'function');
      TestRenderer.act(() => { node[0].props.onPress(); });
    }
    // 04.09.2026 (отчёт 701b69d7): кнопки «Проверить выбор» больше нет — последний
    // выбранный шар закрывает раунд сам. Гейт остался тем же по смыслу: пройден ли
    // раунд до конца в щадящем режиме; изменился только способ его закрыть.
    expect(has(r, 'Проверить выбор')).toBe(false);

    expect(results.length).toBe(1);
    expect(results[0].details.level).toBe(1);
    expect(results[0].specific.reducedMotion).toBe(true);
    expect(rafRequests).toBe(0);
    r.unmount();
  });

  /**
   * 🔴 АРИФМЕТИКА ШАГА, А НЕ ВКУС. Опознать объект после скачка можно, только если
   * он сместился меньше, чем на свой радиус: иначе ближайшим к прежнему месту
   * цели оказывается сосед. Проверяем на самом быстром уровне и по ВСЕЙ
   * траектории, а не в первый момент — схождение к центру разгоняет объекты
   * к середине раунда.
   */
  it('🔴 за один шаг объект не уезжает дальше своего радиуса', () => {
    const round = generateObjectTrackerRound('object-tracker-gate', LEVELS);
    let world = round.initialWorld;
    let worst = 0;
    while (world.timeMs < round.durationMs) {
      const next = advanceTrackerWorld(round, world, REDUCED_STEP_MS);
      for (const after of next.objects) {
        const before = world.objects.find((o) => o.id === after.id)!;
        worst = Math.max(worst, Math.hypot(after.x - before.x, after.y - before.y));
      }
      world = next;
    }
    expect(worst).toBeGreaterThan(0);                       // мир вообще движется
    expect(`сдвиг ${worst.toFixed(4)} < радиус ${TRACKER_OBJECT_RADIUS}`)
      .toBe(`сдвиг ${worst.toFixed(4)} < радиус ${TRACKER_OBJECT_RADIUS}`);
    expect(worst).toBeLessThan(TRACKER_OBJECT_RADIUS);
  });

  it('щадящий режим НЕ укорачивает раунд — уровень достаётся за ту же нагрузку', () => {
    const normal = generateObjectTrackerRound('object-tracker-gate', 33);
    expect(normal.durationMs).toBe(generateObjectTrackerRound('object-tracker-gate', 33).durationMs);
    // Число шагов — прямое следствие длительности, отдельной «щадящей» длины нет.
    expect(Math.ceil(normal.durationMs / REDUCED_STEP_MS)).toBeGreaterThan(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('в движении объекты неотличимы — иначе следить не за чем', () => {
  it('🔴 кольца целей есть в показе и исчезают, как только мир поехал', () => {
    const round = generateObjectTrackerRound('object-tracker-gate', 20);
    const r = mount({ level: 20 });

    const marked = objects(r).filter((o) => /^Цель /.test(o.label));
    expect(marked.length).toBe(round.targetCount);
    expect(round.targetCount).toBeGreaterThan(0);

    press(r, RU.beginMotion);
    runFrames(3);
    expect(objects(r).filter((o) => /^Цель /.test(o.label)).length).toBe(0);

    // И визуально тоже: рамка у всех одна и та же, а не «у целей потолще».
    const widths = new Set(objects(r).map((o) => o.style.borderWidth));
    const colors = new Set(objects(r).map((o) => o.style.borderColor));
    expect([...widths].length).toBe(1);
    expect([...colors].length).toBe(1);
    r.unmount();
  });

  it('🔴 в движении по объекту нельзя ткнуть — иначе цель отмечается заранее', () => {
    const r = mount();
    press(r, RU.beginMotion);
    runFrames(3);
    const clickable = r.root.findAll((n) => /^(Объект|Цель) \d+/.test(String(n.props?.accessibilityLabel))
      && n.props?.disabled === false);
    expect(clickable.length).toBe(0);
    r.unmount();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('часы партии — игровые, а не настенные', () => {
  it('🔴 длительность считается теми часами, которые подал экран', () => {
    const results: ObjectTrackerMetrics[] = [];
    let fake = 5_000;
    const r = mount({ level: 1, reducedMotion: true, now: () => fake, onComplete: (m) => results.push(m) });
    press(r, RU.beginMotion);
    let steps = 0;
    while (has(r, RU.stepMotion) && steps < 200) { press(r, RU.stepMotion); steps += 1; }
    fake += 4_321;                                  // «прошло» 4.321 с по ИГРОВЫМ часам
    const round = generateObjectTrackerRound('object-tracker-gate', 1);
    const circles = objects(r);
    for (let i = 0; i < round.targetCount; i += 1) {
      const node = r.root.findAll((n) => n.props?.accessibilityLabel === circles[i].label
        && typeof n.props?.onPress === 'function');
      TestRenderer.act(() => { node[0].props.onPress(); });
    }
    // подтверждения нет: набор закрылся последним касанием (отчёт 701b69d7)
    expect(results.length).toBe(1);
    // Настенные часы за этот тест столько не прошли бы никогда — значит взяты поданные.
    expect(results[0].durationMs).toBe(4_321);
    r.unmount();
  });

  it('🔴 ни модуль, ни экран не зовут настенные часы', () => {
    const bad: string[] = [];
    for (const rel of [
      'app/games/object-tracker.tsx',
      'src/games/object-tracker/ObjectTrackerGame.tsx',
      'src/games/object-tracker/useTrackerLoop.ts',
    ]) {
      read(rel).split('\n').forEach((line, i) => {
        if (!line.includes('Date.now()')) return;
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;   // разбор в комментарии
        bad.push(`${rel}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('экран подаёт модулю именно общие часы', () => {
    const src = read('app/games/object-tracker.tsx');
    expect(src).toContain("import { gameNow } from '@/src/services/gamePause'");
    expect(src).toContain('now={gameNow}');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('стыковка с приложением', () => {
  it('искалка запрещённого не слепа: в коде находит, в комментарии — нет', () => {
    // Без этой проверки сломанный вырезатель комментариев дал бы вечный зелёный.
    expect(readCode('src/games/object-tracker/ObjectTrackerGame.tsx')).toContain('reducedMotion');
    expect(readCode('src/games/object-tracker/ObjectTrackerGame.tsx')).not.toContain('ЛАБОРАТОРН');
  });

  it('🔴 модуль не спрашивает систему про «меньше движения» сам', () => {
    // В react-native-web `isReduceMotionEnabled()` БЕЗ DOM отвечает `true`, а DOM'а
    // нет на пререндере статического экспорта: режим включился бы всем подряд.
    const src = readCode('src/games/object-tracker/ObjectTrackerGame.tsx')
      + readCode('src/games/object-tracker/useTrackerLoop.ts');
    const found = ['isReduceMotionEnabled', 'reduceMotionChanged', 'prefers-reduced-motion']
      .filter((forbidden) => src.includes(forbidden));
    expect(found).toEqual([]);
    // Настройку читает экран одним общим хуком и передаёт внутрь пропом.
    expect(read('app/games/object-tracker.tsx')).toContain('useReducedMotion()');
    expect(read('src/games/object-tracker/ObjectTrackerGame.tsx')).toContain('reducedMotion: boolean;');
  });

  it('🔴 итог показывает ОБЩИЙ экран, своего у модуля нет', () => {
    const screen = read('app/games/object-tracker.tsx');
    expect(screen).toContain('<LevelCleared');
    expect(screen).toContain('<LevelProgressMap');
    expect(screen).toContain("usePersistentLevel('object_tracker')");
    // Своего экрана поздравления у модуля не осталось — не спрятан за флагом, а убран.
    const game = read('src/games/object-tracker/ObjectTrackerGame.tsx');
    expect(game.includes('showOwnResults')).toBe(false);
    expect(game.includes('resultTitle')).toBe(false);
  });

  it('🔴 ширина берётся хуком: голый useWindowDimensions на первом кадре отдаёт 0', () => {
    // Ловим ИМПОРТ, а не упоминание: в шапках обоих файлов про эту ловушку
    // написано словами, и поиск по слову краснел бы на объяснении, почему так нельзя.
    const imported = (src: string) => /import[^;]*\buseWindowDimensions\b/.test(src);
    const screen = read('app/games/object-tracker.tsx');
    expect(screen).toContain('useScreenWidth');
    expect(imported(screen)).toBe(false);
    expect(imported(read('src/games/object-tracker/ObjectTrackerGame.tsx'))).toBe(false);
  });

  it('🔴 в кружок объекта попадают пальцем: не меньше 48 pt на самом тесном экране', () => {
    // 12 объектов — самая тесная раскладка. Меряем на ДВУХ ширинах: на 375 норму
    // даёт сама физика (радиус 0.068 от поля 359 = 48.8 pt), а на 320 её уже нет —
    // и держится она только нижним ограничителем. Проверять одну 375 значило бы
    // проверять физику вместо кода: ограничитель можно было бы снять незаметно.
    for (const width of [375, 320]) {
      const r = mount({ level: LEVELS, screenWidth: width });
      const sizes = objects(r).map((o) => o.style.width);
      expect(`${width}: объектов ${sizes.length}`).toBe(`${width}: объектов 12`);
      expect(`${width}: мельчайший ${Math.min(...sizes) >= 48 ? '≥48' : Math.min(...sizes).toFixed(1)}`)
        .toBe(`${width}: мельчайший ≥48`);
      r.unmount();
    }
  });

  it('порог прохождения берётся у модуля, а не переписан на экране', () => {
    // Ядро уже решило: точность ≥ 0.60 и не больше одного ложного выбора.
    const base = { accuracy: 0.6, specific: { falseSelections: 1 } } as any;
    expect(isPassed(base)).toBe(true);
    expect(isPassed({ ...base, accuracy: 0.59 } as any)).toBe(false);
    expect(isPassed({ accuracy: 1, specific: { falseSelections: 2 } } as any)).toBe(false);
    expect(read('app/games/object-tracker.tsx')).toContain('isPassed(m)');
  });

  it('уровень выше потолка генератора не роняет игру', () => {
    expect(generateObjectTrackerRound('x', 999).level).toBe(LEVELS);
    expect(read('app/games/object-tracker.tsx')).toContain('Math.min(LEVELS,');
  });
  /**
   * Отчёт 701b69d7: «когда выбрал — автоматом фиксировал, без лишнего нажатия».
   * Гейт проверяет ПОВЕДЕНИЕ ядра, а не отсутствие кнопки в разметке: раунд обязан
   * закрыться тем же касанием, что добрало последний шар. Проверять по разметке
   * нельзя — кнопку легко вернуть под другим именем, и текстовый гейт этого не
   * заметит; и наоборот, кнопку можно снять, забыв авто-фиксацию, и тогда раунд
   * станет непроходимым вовсе.
   */
  it('последний выбранный шар закрывает раунд без кнопки', () => {
    let s = startObjectTrackerRound(createObjectTrackerSession({ seed: 'auto-fix', level: 1 }), 0);
    s = startTrackerMovement(s);
    while (s.phase === 'moving') s = advanceTrackerMovement(s, REDUCED_STEP_MS);
    expect(s.phase).toBe('selection');

    const цели = s.round.targetCount;
    const шары = s.world.objects.map((o) => o.id).slice(0, цели);
    шары.forEach((id, i) => {
      s = selectTrackedObject(s, id, 1_000 + i);
      const последний = i === цели - 1;
      expect(s.phase).toBe(последний ? 'result' : 'selection');
    });
    expect(s.result).toBeTruthy();
  });

  it('снятие галочки НЕ засчитывает раунд', () => {
    // на первом уровне цель одна — снимать нечего; берём первый уровень с двумя
    const уровень = Array.from({ length: LEVELS }, (_, i) => i + 1).find(
      (l) => generateObjectTrackerRound('auto-fix-2', l).targetCount >= 2,
    );
    expect(уровень).toBeDefined();
    let s = startObjectTrackerRound(
      createObjectTrackerSession({ seed: 'auto-fix-2', level: уровень as number }),
      0,
    );
    s = startTrackerMovement(s);
    while (s.phase === 'moving') s = advanceTrackerMovement(s, REDUCED_STEP_MS);
    const шары = s.world.objects.map((o) => o.id);
    // добираем до полного набора минус один, потом снимаем — раунд обязан остаться жив
    for (let i = 0; i < s.round.targetCount - 1; i += 1) s = selectTrackedObject(s, шары[i], 1_000);
    const был = s.selectedIds.length;
    expect(был).toBeGreaterThan(0);
    s = selectTrackedObject(s, шары[0], 1_100);
    expect(s.selectedIds.length).toBe(был - 1);
    expect(s.phase).toBe('selection');
  });
});
