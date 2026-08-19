/**
 * НАВИГАТОР — ПРИЁМКА ИГРЫ G6 В ПРИЛОЖЕНИЕ.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Игра пришла из лаборатории со своими тестами, и они
 * проверяют ЯДРО: геометрию, генератор, состояние партии. Здесь проверяется
 * другое — СТЫКОВКА, то есть ровно те места, где приёмка ломается молча:
 *
 *   1. поворот карты не должен менять правильный ответ (иначе игра нечестна,
 *      а выглядит рабочей: человек просто «ошибается» и не понимает почему);
 *   2. свой экран итога модуля не должен показываться — иначе звёзды, серия и
 *      глаз-разрядка не пишутся, и выпадение это ТИХОЕ;
 *   3. кнопки должны быть не только написаны, но и живыми — в SET бейдж
 *      отсчёта был написан, переведён на 12 языков и не показался ни разу;
 *   4. время партии должно идти по игровым часам, а не по настенным;
 *   5. сложность должна расти содержанием, а не скоростью.
 *
 * ⚠️ ПРОВЕРЯЕМ СМЫСЛ, А НЕ БУКВУ. Здесь почти нет поиска подстрок в исходнике:
 * партия прогоняется по-настоящему — состояние, рендер, нажатия. Там, где без
 * исходника не обойтись (запрет настенных часов), проверка сформулирована как
 * НАБЛЮДАЕМОЕ свойство, а не как имя функции: переписать реализацию можно,
 * сломать правило — нет.
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

import {
  CARDINAL_DIRECTIONS,
  HOME_SECTORS,
  LEVELS,
  completeNavigatorStudy,
  createNavigatorSession,
  generateNavigatorRound,
  inputNavigatorHomeSector,
  inputNavigatorRouteDirection,
  inputNavigatorTurn,
  isPassed,
  navigatorModeForLevel,
  rotateCardinal,
  rotateHomeSector,
  startNavigatorRound,
  advanceNavigatorDelay,
  type CardinalDirection,
  type NavigatorMetrics,
  type NavigatorSession,
} from '../games/navigator/core/index';
import NavigatorGame from '../games/navigator/NavigatorGame';

const MODULE_DIR = join(__dirname, '../games/navigator');
const SCREEN = join(__dirname, '../../app/games/navigator.tsx');
const read = (p: string): string => readFileSync(p, 'utf8');

const THEME = {
  background: '#101014', surface: '#1c1c22', card: '#26262e',
  text: '#ffffff', textSecondary: '#a0a0ac', border: '#3a3a44',
  primary: '#2563eb', success: '#34c759', error: '#ff3b30', warning: '#ff9500',
};
const GRADIENT: readonly [string, string] = ['#2563eb', '#14b8a6'];

/** Часы, которыми управляет тест: ими же проверяется, что модуль берёт ИХ, а не свои. */
function fakeClock(start = 5_000) {
  let t = start;
  const now = () => t;
  return { now, tick: (ms: number) => { t += ms; } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ПОВОРОТ КАРТЫ НЕ МЕНЯЕТ ПРАВИЛЬНЫЙ ОТВЕТ
// ─────────────────────────────────────────────────────────────────────────────

/** Провести партию «Маршрут» целиком, отвечая ЭКРАННЫМИ направлениями. */
function walkRoute(session: NavigatorSession, now: () => number): NavigatorSession {
  let s = startNavigatorRound(session, now());
  s = completeNavigatorStudy(s);
  while (s.phase === 'delay') s = advanceNavigatorDelay(s);
  for (const logical of s.round.routeDirections) {
    // Человек видит ПОВЁРНУТУЮ карту и жмёт то, что видит.
    const onScreen = rotateCardinal(logical, s.round.mapRotation);
    s = inputNavigatorRouteDirection(s, onScreen, now());
  }
  return s;
}

describe('поворот карты — только облик, ответ тот же', () => {
  /**
   * 🔴 Самое дорогое свойство игры. Если поворот применяется к ответу дважды
   * или не применяется вовсе, партия становится непроходимой ЧЕСТНЫМ способом,
   * а на экране всё выглядит исправным: маршрут нарисован, кнопки нажимаются,
   * просто «человек ошибается».
   */
  it('пройденный по экрану маршрут засчитывается при любом повороте', () => {
    const clock = fakeClock();
    const seen = new Set<number>();
    const failed: string[] = [];
    for (let level = 1; level <= LEVELS; level++) {
      if (navigatorModeForLevel(level) !== 'route-recall') continue;
      for (const salt of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
        const s = walkRoute(createNavigatorSession({ seed: `nav-${salt}`, level }), clock.now);
        seen.add(s.round.mapRotation);
        if (s.phase !== 'result') { failed.push(`ур.${level}/${salt}: партия не завершилась`); continue; }
        const m = s.result as NavigatorMetrics;
        if (m.specific.extraSteps !== 0) failed.push(`ур.${level}/${salt}: ${m.specific.extraSteps} лишних шагов на верном пути`);
        if (!isPassed(m)) failed.push(`ур.${level}/${salt}: верный путь не засчитан`);
      }
    }
    expect(failed).toEqual([]);
    // Проверка не должна быть зелена вслепую: повороты обязаны реально встретиться.
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
  });

  /**
   * Обратная сторона: если бы поворот игнорировался, проверка выше прошла бы и
   * на «повёрнутой» карте, где ничего не повёрнуто. Поэтому убеждаемся, что на
   * повёрнутой карте ЛОГИЧЕСКОЕ направление отвергается как лишний шаг.
   */
  it('на повёрнутой карте логическое направление — ошибка, экранное — ход', () => {
    const clock = fakeClock();
    let checked = 0;
    for (let level = 1; level <= LEVELS && checked < 8; level++) {
      if (navigatorModeForLevel(level) !== 'route-recall') continue;
      for (const salt of ['a', 'b', 'c', 'd', 'e', 'f']) {
        let s = createNavigatorSession({ seed: `rot-${salt}`, level });
        if (s.round.mapRotation === 0) continue;                  // без поворота сравнивать нечего
        s = completeNavigatorStudy(startNavigatorRound(s, clock.now()));
        while (s.phase === 'delay') s = advanceNavigatorDelay(s);
        const logical = s.round.routeDirections[0] as CardinalDirection;
        const wrong = inputNavigatorRouteDirection(s, logical, clock.now());
        expect(wrong.routeIndex).toBe(0);
        expect(wrong.extraSteps).toBe(1);
        const right = inputNavigatorRouteDirection(s, rotateCardinal(logical, s.round.mapRotation), clock.now());
        expect(right.routeIndex).toBe(1);
        expect(right.extraSteps).toBe(0);
        checked++;
        break;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it('«домой» — тот же сектор, куда бы карту ни повернули', () => {
    const clock = fakeClock();
    const bad: string[] = [];
    for (let level = 1; level <= LEVELS; level++) {
      if (navigatorModeForLevel(level) !== 'home-direction') continue;
      let s = createNavigatorSession({ seed: `home-${level}`, level });
      s = completeNavigatorStudy(startNavigatorRound(s, clock.now()));
      while (s.phase === 'delay') s = advanceNavigatorDelay(s);
      // На экране человек жмёт сектор, повёрнутый вместе с картой.
      const onScreen = rotateHomeSector(s.round.correctHomeSector, s.round.mapRotation);
      const done = inputNavigatorHomeSector(s, onScreen, clock.now());
      const m = done.result as NavigatorMetrics;
      if (m.specific.selectedHomeSector !== s.round.correctHomeSector) {
        bad.push(`ур.${level}: выбран ${m.specific.selectedHomeSector}, а верен ${s.round.correctHomeSector}`);
      }
      if (!isPassed(m)) bad.push(`ур.${level}: верный сектор не засчитан (${m.specific.angularErrorDeg}°)`);
    }
    expect(bad).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. СЛОЖНОСТЬ РАСТЁТ СОДЕРЖАНИЕМ, А НЕ СКОРОСТЬЮ
// ─────────────────────────────────────────────────────────────────────────────

describe('лестница из 33 уровней', () => {
  it('задача меняется каждый уровень — три режима идут по кругу', () => {
    const cycle = Array.from({ length: 6 }, (_, i) => navigatorModeForLevel(i + 1));
    expect(cycle).toEqual([
      'route-recall', 'turn-sequence', 'home-direction',
      'route-recall', 'turn-sequence', 'home-direction',
    ]);
  });

  it('🔴 нагрузка растёт содержанием: поле, длина пути, ориентиры, ветви, поворот', () => {
    const at = (level: number) => generateNavigatorRound(`ladder-${level}`, level);
    const first = at(1);
    const last = at(LEVELS);
    // Начало — обучение: маленькое поле, никаких помех.
    expect(first.gridSize).toBe(3);
    expect(first.landmarks.length).toBe(0);
    expect(first.falseBranches.length).toBe(0);
    expect(first.mapRotation).toBe(0);
    expect(first.hideMapDuringRecall).toBe(false);
    // Конец — всё сразу.
    expect(last.gridSize).toBe(8);
    expect(last.routeSteps).toBe(15);
    expect(last.landmarks.length).toBe(5);
    expect(last.falseBranches.length).toBeGreaterThanOrEqual(4);
    expect(last.hideMapDuringRecall).toBe(true);
    // И ни одна ось не проваливается назад по дороге.
    for (let level = 2; level <= LEVELS; level++) {
      const prev = at(level - 1);
      const cur = at(level);
      expect(`ур.${level}: поле ${cur.gridSize}`).toBe(`ур.${level}: поле ${Math.max(prev.gridSize, cur.gridSize)}`);
      expect(`ур.${level}: шагов ${cur.routeSteps}`).toBe(`ур.${level}: шагов ${Math.max(prev.routeSteps, cur.routeSteps)}`);
    }
  });

  it('🔴 нигде нет отсчёта времени: «пауза на удержание» — это нажатия, а не секунды', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(MODULE_DIR);
    files.push(SCREEN);
    const timers: string[] = [];
    for (const f of files) {
      read(f).split('\n').forEach((line: string, i: number) => {
        const code = line.replace(/\/\/.*$/, '');
        if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;
        if (/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/.test(code)) {
          timers.push(`${f.split('/frontend/')[1]}:${i + 1}`);
        }
      });
    }
    expect(timers).toEqual([]);
    // И задержка живёт нажатиями: у уровня с задержкой она измеряется шагами.
    const withDelay = generateNavigatorRound('delay-check', 30);
    expect(withDelay.delaySteps).toBeGreaterThan(0);
    expect(Number.isInteger(withDelay.delaySteps)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ЧАСЫ ПАРТИИ — ИГРОВЫЕ
// ─────────────────────────────────────────────────────────────────────────────

describe('время партии', () => {
  /**
   * Наблюдаемое свойство, а не имя функции: длительность обязана приехать из
   * переданных часов. Модуль, вернувшийся к `Date.now()`, покажет здесь
   * настенное время и покраснеет.
   */
  it('🔴 длительность считается по переданным часам, а не по настенным', () => {
    const clock = fakeClock(1_000);
    let s = createNavigatorSession({ seed: 'clock', level: 1 });
    s = startNavigatorRound(s, clock.now());
    s = completeNavigatorStudy(s);
    clock.tick(4_200);
    for (const logical of s.round.routeDirections) {
      s = inputNavigatorRouteDirection(s, rotateCardinal(logical, s.round.mapRotation), clock.now());
    }
    expect((s.result as NavigatorMetrics).durationMs).toBe(4_200);
  });

  it('🔴 экран отдаёт модулю ОБЩИЕ часы и нигде не берёт настенные', () => {
    const screen = read(SCREEN);
    expect(screen).toMatch(/now=\{gameNow\}/);
    expect(screen).toContain("from '@/src/services/gamePause'");
    const wall = screen.split('\n')
      .map((l: string, i: number) => ({ l, i }))
      .filter(({ l }: any) => l.includes('Date.now()') && !l.trim().startsWith('*') && !l.trim().startsWith('//'));
    expect(wall).toEqual([]);
    /**
     * И у модуля НЕТ умолчания на настенные часы: забытый проп обязан ронять
     * сборку, а не тихо переезжать на Date.now(). Комментарии вырезаем — про
     * снятое умолчание в шапке написано словами, и без этого проверка ловила
     * бы собственное объяснение.
     */
    const mod = read(join(MODULE_DIR, 'NavigatorGame.tsx'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(mod).not.toMatch(/\bnow\s*=\s*Date\.now/);
    expect(mod).not.toMatch(/\bnow\?:/);                 // проп обязателен
    expect(mod).toMatch(/\bnow:\s*\(\)\s*=>\s*number;/);
    expect(mod).not.toMatch(/Date\.now\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ЖИВОЙ ЭКРАН: РИСУЕТСЯ, НАЖИМАЕТСЯ, ЗАКАНЧИВАЕТСЯ ОБЩИМ ИТОГОМ
// ─────────────────────────────────────────────────────────────────────────────

const walkTree = (node: any, out: any[] = []): any[] => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => walkTree(n, out)); return out; }
  out.push(node);
  (node.children || []).forEach((c: any) => walkTree(c, out));
  return out;
};
const flatStyle = (s: any): any => Object.assign({}, ...(Array.isArray(s) ? s.flat(4) : [s]).filter(Boolean));
const buttons = (r: any) => walkTree(r.toJSON()).filter((n: any) => n.props?.accessibilityRole === 'button');
const texts = (r: any) => walkTree(r.toJSON())
  .filter((n: any) => typeof n.children?.[0] === 'string')
  .map((n: any) => n.children.join(''));

function mount(props: any) {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(NavigatorGame as any, {
      locale: 'ru', theme: THEME, gameGradient: GRADIENT, gameGradientText: '#ffffff',
      ...props,
    }));
  });
  return r;
}

/** Нажать кнопку по подписи — как это делает человек, а не вызовом внутренней функции. */
function press(r: any, label: string) {
  const node = r.root.findAll((x: any) => x.props?.accessibilityLabel === label && typeof x.props?.onPress === 'function', { deep: true })[0];
  if (!node) throw new Error(`нет кнопки «${label}»; есть: ${buttons(r).map((b: any) => b.props.accessibilityLabel).join(' | ')}`);
  TestRenderer.act(() => { node.props.onPress(); });
}

describe('экран партии живой', () => {
  it('🔴 поле рисуется НА ПЕРВОМ КАДРЕ: ширина приходит из хука, а не из onLayout', () => {
    const clock = fakeClock();
    const r = mount({ seed: 'draw', level: 1, now: clock.now });
    press(r, 'Начать раунд');
    const board = walkTree(r.toJSON()).find((n: any) => n.props?.accessibilityRole === 'image');
    expect(board).toBeTruthy();
    const size = flatStyle(board.props.style).width;
    expect(typeof size).toBe('number');
    expect(size).toBeGreaterThan(0);
    // Клетки поля нарисованы сразу, а не после первой перерисовки.
    const cells = walkTree(board).filter((n: any) => flatStyle(n.props?.style).position === 'absolute');
    expect(cells.length).toBe(9);                    // 3×3 на первом уровне
    TestRenderer.act(() => { r.unmount(); });
  });

  it('🔴 у каждой кнопки партии палец помещается: ≥48 pt', () => {
    const clock = fakeClock();
    const small: string[] = [];
    // Все три режима: у каждого своя раскладка ответа.
    for (const level of [1, 2, 3]) {
      const r = mount({ seed: 'tap', level, now: clock.now });
      press(r, 'Начать раунд');
      press(r, 'Готов — перейти к ответу');
      for (const b of buttons(r)) {
        const st = flatStyle(b.props.style);
        const h = st.minHeight ?? st.height ?? 0;
        if (h < 48) small.push(`ур.${level} «${b.props.accessibilityLabel}»: ${h}`);
      }
      TestRenderer.act(() => { r.unmount(); });
    }
    expect(small).toEqual([]);
  });

  /**
   * ⚠️ ЛОВУШКА, НА КОТОРОЙ ОБЖИГАЛИСЬ: разметка есть, а элемент мёртв. Мало
   * убедиться, что восемь кнопок «домой» НАРИСОВАНЫ — каждая обязана ещё и
   * ЗАВЕРШАТЬ партию своим сектором. Проверяем нажатием, все восемь.
   */
  it('🔴 все восемь направлений «домой» не только нарисованы, но и работают', () => {
    const answers: (string | null)[] = [];
    for (const sector of HOME_SECTORS) {
      const clock = fakeClock();
      let done: NavigatorMetrics | null = null;
      const r = mount({ seed: 'home-live', level: 3, now: clock.now, onComplete: (m: NavigatorMetrics) => { done = m; } });
      press(r, 'Начать раунд');
      press(r, 'Готов — перейти к ответу');
      const labels = buttons(r).map((b: any) => b.props.accessibilityLabel);
      expect(labels.length).toBeGreaterThanOrEqual(8);
      press(r, HOME_LABELS[sector]);
      answers.push(done ? (done as NavigatorMetrics).specific.selectedHomeSector : null);
      TestRenderer.act(() => { r.unmount(); });
    }
    // Восемь разных нажатий — восемь разных ответов, ни одного «не сработало».
    expect(answers.filter((a) => a === null)).toEqual([]);
    expect(new Set(answers).size).toBe(8);
  });

  it('🔴 все четыре направления маршрута живые: ход считается, промах записан', () => {
    const clock = fakeClock();
    const r = mount({ seed: 'route-live', level: 1, now: clock.now });
    press(r, 'Начать раунд');
    press(r, 'Готов — перейти к ответу');
    const before = texts(r).find((t: string) => /Шаг 1 из/.test(t));
    expect(before).toBeTruthy();
    // Заведомо неверное направление — обратное правильному.
    const round = generateNavigatorRound('route-live', 1);
    const right = rotateCardinal(round.routeDirections[0] as CardinalDirection, round.mapRotation);
    const wrong = rotateCardinal(right, 180);
    press(r, DIR_LABELS[wrong]);
    expect(texts(r).some((t: string) => /Шаг 1 из/.test(t))).toBe(true);      // шаг не сдвинулся
    press(r, DIR_LABELS[right]);
    expect(texts(r).some((t: string) => /Шаг 2 из/.test(t))).toBe(true);      // а верный — сдвинул
    TestRenderer.act(() => { r.unmount(); });
  });

  /**
   * 🔴 ГЛАВНОЕ ПРАВИЛО СТЫКОВКИ. Свой экран поздравления = тихое выпадение из
   * звёзд, серии и глаз-разрядки. Проверяем не отсутствие строки в исходнике, а
   * наблюдаемое: партия дошла до конца, приложение об этом узнало РОВНО ОДИН
   * раз, а модуль со сцены ушёл и ничего своего не нарисовал.
   */
  it('🔴 после партии модуль ничего не рисует — поздравляет приложение', () => {
    const clock = fakeClock();
    const results: NavigatorMetrics[] = [];
    const r = mount({ seed: 'finish', level: 1, now: clock.now, onComplete: (m: NavigatorMetrics) => results.push(m) });
    press(r, 'Начать раунд');
    press(r, 'Готов — перейти к ответу');
    const round = generateNavigatorRound('finish', 1);
    for (const logical of round.routeDirections) {
      press(r, DIR_LABELS[rotateCardinal(logical, round.mapRotation)]);
    }
    expect(results.length).toBe(1);
    expect(r.toJSON()).toBeNull();
    expect(buttons(r)).toEqual([]);
    TestRenderer.act(() => { r.unmount(); });
  });

  it('🔴 экран приложения заканчивает раунд ОБЩИМ итогом и не заводит своего', () => {
    const screen = read(SCREEN);
    expect(screen).toMatch(/<LevelCleared/);
    expect(screen).toMatch(/<LevelProgressMap/);
    expect(screen).toMatch(/usePersistentLevel\(/);
    // Уровень уезжает в сессию — иначе прогресс не переживёт сброс профиля.
    expect(screen).toMatch(/details:\s*\{[\s\S]{0,80}\blevel\b/);
    // И порог прохождения берётся из ядра, а не переписан здесь числом.
    expect(screen).toMatch(/isPassed\(m\)/);
  });

  /**
   * 🔴 ПОЗДРАВЛЯЕМ С ТЕМ УРОВНЕМ, КОТОРЫЙ СЫГРАН, А НЕ СО СЛЕДУЮЩИМ.
   *
   * Поймано глазами, а не кодом: прошёл первый уровень — в хранилище легло
   * `psygames_navigator_stars_free = {"2":3}`. Причина в порядке: `level`
   * пересчитывается из `lvl.level`, а успешный раунд поднимает потолок ДО того,
   * как нарисуется плашка итога. Снаружи это выглядит правдоподобно («Уровень 2
   * пройден»), а звёзды за первый уровень не появляются никогда.
   *
   * Проверяем механизм, а не имя: плашке отдают ЗАМОРОЖЕННЫЙ уровень, и
   * заморозка случается РАНЬШЕ подъёма потолка.
   */
  it('🔴 плашка итога получает сыгранный уровень, замороженный до подъёма потолка', () => {
    const screen = read(SCREEN);
    const cleared = /<LevelCleared[^>]*?\blevel=\{([A-Za-z_$][\w$]*)\}/.exec(screen);
    expect(cleared).toBeTruthy();
    const frozen = cleared![1];
    // Пересчитываемый на каждый рендер `level` сюда отдавать нельзя.
    expect(frozen).not.toBe('level');
    const body = screen.slice(screen.indexOf('const onComplete'), screen.indexOf('const stars'));
    const setter = new RegExp(`set${frozen[0].toUpperCase()}${frozen.slice(1)}\\(`).exec(body);
    expect(`${frozen}: заморожен в onComplete — ${!!setter}`).toBe(`${frozen}: заморожен в onComplete — true`);
    expect(setter!.index).toBeLessThan(body.indexOf('lvl.reach('));
  });

  /**
   * 🔴 НА ЭКРАНЕ СЛОВО, А НЕ ИМЯ КЛЮЧА.
   *
   * `t()` на ключе, которого нет в словаре, возвращает сам ключ — и в шапке
   * встаёт «navigator». Ни tsc, ни сличение словарей этого не видят: у ключей
   * нет типов. Общий гейт словаря это ловит по всему коду; здесь то же самое
   * прицельно по своему экрану, чтобы поломка называлась своим именем.
   *
   * ⚠️ Ключи `navigator` / `navigatorDesc` заводит заход-интегратор вместе с
   * карточкой каталога (INTEGRATION.md §2). Пока их нет, название и описание
   * берутся из словаря модуля — и проверка ниже следит, что это НЕ заглушка:
   * текст обязан быть настоящей строкой на языке человека.
   */
  it('🔴 экран не просит у словаря ключей, которых там нет', () => {
    const dict = read(join(__dirname, '../contexts/LanguageContext.tsx'));
    const known = new Set([...dict.matchAll(/^ {2}([A-Za-z0-9_]+):\s*\{/gm)].map((m) => m[1]));
    expect(known.size).toBeGreaterThan(500);
    const asked = [...read(SCREEN).matchAll(/\bt\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'\s*\)/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((k) => !known.has(k))).toEqual([]);
  });

  it('🔴 название и описание — живые слова, а не заглушка', () => {
    const ru = getNavigatorStrings('ru');
    const en = getNavigatorStrings('en');
    expect(ru.title).toBe('Навигатор');
    expect(en.title).toBe('Navigator');
    // Описание — предложение для человека, а не имя ключа и не обрубок.
    for (const [tag, v] of [['ru', ru.catalogDesc], ['en', en.catalogDesc]] as const) {
      expect(`${tag}: ${v.length > 40 && /\s/.test(v) && v !== 'navigatorDesc'}`).toBe(`${tag}: true`);
    }
    // И экран берёт именно их, а не подставляет своё.
    const screen = read(SCREEN);
    expect(screen).toMatch(/\{navStrings\.title\}/);
    expect(screen).toMatch(/\{navStrings\.catalogDesc\}/);
  });

  it('🔴 primary отдан ЦВЕТОМ ИГРЫ, а не акцентом профиля', () => {
    const screen = read(SCREEN);
    const themeBlock = screen.slice(screen.indexOf('theme={{'), screen.indexOf('gameGradient='));
    expect(themeBlock).toMatch(/primary:\s*GRADIENT\[0\]/);
    expect(themeBlock).not.toMatch(/primary:\s*colors\.primary/);
  });
});

// Подписи берём из словаря модуля — так же, как их видит человек на кнопке.
import { getCardinalLabel, getHomeSectorLabel, getNavigatorStrings } from '../games/navigator/core/index';
const DIR_LABELS = Object.fromEntries(CARDINAL_DIRECTIONS.map((d) => [d, getCardinalLabel('ru', d)])) as Record<CardinalDirection, string>;
const HOME_LABELS = Object.fromEntries(HOME_SECTORS.map((s) => [s, getHomeSectorLabel('ru', s)])) as Record<string, string>;

// Ссылка на неиспользуемое — чтобы линтер не срезал импорт, нужный смыслу теста.
void inputNavigatorTurn;
