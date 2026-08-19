/**
 * ПРИЛОЖЕНИЕ СЛЫШИТ СИСТЕМНОЕ «МЕНЬШЕ ДВИЖЕНИЯ».
 *
 * 🔴 ЗАЧЕМ. Вестибулярная чувствительность — мигрень, укачивание, последствия
 * сотрясения — превращает наши «сочные» подпрыгивания, полёты очков и
 * вращение карт в настоящую тошноту. Человек уже сказал системе «меньше
 * движения»; пока приложение это игнорирует, играть ему нечем. Это же
 * проверяют на ревью Apple (Reduce Motion) и Google Play (Remove animations).
 *
 * 🔴 ПОЧЕМУ ГЕЙТ, А НЕ «ПРОСТО ПОЧИНИЛИ». Три ловушки, каждая из которых
 * возвращает движение молча — снаружи всё выглядит починенным:
 *
 *  1. Хук есть, но им никто не пользуется. Ровно так уже было с паузой: механику
 *     написали, к 37 экранам не подключили, репорт остался живым. Поэтому ниже
 *     проверяется не наличие файла, а ПОВЕДЕНИЕ — в обоих режимах.
 *  2. Следующий «сочный» компонент, написанный по образцу соседнего, вернёт
 *     пружину обратно. Поэтому есть запрет на уровне исходников juice.
 *  3. Соблазн позвать `AccessibilityInfo.isReduceMotionEnabled()` в вебе: у
 *     react-native-web метод есть, но БЕЗ DOM он отвечает `true`
 *     (`resolve(media ? media.matches : true)`), а DOM'а нет ровно на
 *     пререндере статического экспорта. Тогда щадящий режим молча включился бы
 *     всем. Поэтому веб обязан читать медиазапрос, и это проверяется.
 *
 * 🔴 ПЕТЛИ ЖЁСТЧЕ ВСЕГО. Разовый проезд можно переждать, отведя глаза. Петля не
 * заканчивается: питомец качается и ходит поперёк нижнего края всё время, пока
 * открыт экран, — по периферии зрения, где движение ловится сильнее всего.
 * Поэтому для `Animated.loop` и покадровых спрайтов проверки отдельные.
 *
 * 🔴 ЧТО ГЕЙТ НАРОЧНО НЕ ТРЕБУЕТ. «Меньше движения» — не «выключить всё».
 * Смысловое движение (карта повернулась лицом, шар надулся, засчитано «+40»)
 * остаётся, но становится мгновенным. Тесты ниже проверяют именно этот размен:
 * декоративное гаснет, смысловое остаётся без проезда.
 */
import React from 'react';
import { AccessibilityInfo, Animated, DeviceEventEmitter, Platform } from 'react-native';
import { useReducedMotion, reducedMotionNow } from '@/src/hooks/useReducedMotion';
import { settle } from '@/src/components/juice/motion';
import { ScorePopupLayer } from '@/src/components/juice/ScorePopups';

declare const __dirname: string;
declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

// ─────────────────────────── стенд ───────────────────────────

/** Поддельный matchMedia: столько же, сколько нужно хуку, и ни строкой больше. */
function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches: initial,
    addEventListener: (_t: string, f: (e: { matches: boolean }) => void) => { listeners.add(f); },
    removeEventListener: (_t: string, f: (e: { matches: boolean }) => void) => { listeners.delete(f); },
  };
  return {
    mql,
    /** Человек передвинул системный тумблер, приложение не перезапускалось. */
    flip(next: boolean) {
      mql.matches = next;
      listeners.forEach((f) => f({ matches: next }));
    },
    get subscribers() { return listeners.size; },
  };
}

/** Веб-стенд (он же наша Android-сборка: Tauri = WebView = Platform.OS 'web'). */
function asWeb(matches: boolean) {
  (Platform as any).OS = 'web';
  const media = fakeMatchMedia(matches);
  (globalThis as any).window.matchMedia = () => media.mql;
  return media;
}

afterEach(() => {
  (Platform as any).OS = 'ios';
  delete (globalThis as any).window.matchMedia;
  jest.restoreAllMocks();
});

/** Рендер хука без JSX: тестовый набор — .ts, поэтому через createElement. */
function renderHook<T>(hook: () => T) {
  const box: { value: T | undefined } = { value: undefined };
  const Probe = () => { box.value = hook(); return null; };
  let renderer: any;
  TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(Probe)); });
  return { box, unmount: () => TestRenderer.act(() => renderer.unmount()) };
}

// ─────────────────────── поведение хука ───────────────────────

describe('useReducedMotion — веб (он же наш Android)', () => {
  it('🔴 настройка включена → хук говорит «да»', () => {
    asWeb(true);
    const { box, unmount } = renderHook(useReducedMotion);
    expect(box.value).toBe(true);
    unmount();
  });

  it('настройка выключена → хук говорит «нет» (обычный режим не задет)', () => {
    asWeb(false);
    const { box, unmount } = renderHook(useReducedMotion);
    expect(box.value).toBe(false);
    unmount();
  });

  it('🔴 тумблер переключили на лету — экран узнаёт без перезапуска', () => {
    const media = asWeb(false);
    const { box, unmount } = renderHook(useReducedMotion);
    expect(box.value).toBe(false);
    TestRenderer.act(() => media.flip(true));
    expect(box.value).toBe(true);
    TestRenderer.act(() => media.flip(false));
    expect(box.value).toBe(false);
    unmount();
  });

  it('подписка снимается при уходе с экрана — иначе течём на каждой партии', () => {
    const media = asWeb(true);
    const { unmount } = renderHook(useReducedMotion);
    expect(media.subscribers).toBe(1);
    unmount();
    expect(media.subscribers).toBe(0);
  });

  /**
   * Та самая грабля react-native-web. Пререндер статического экспорта идёт без
   * DOM; если спросить настройку там, честный ответ — «не знаю», то есть false.
   * `true` здесь означал бы, что анимации выключены у всех и навсегда.
   */
  it('🔴 без matchMedia (пререндер без DOM) режим НЕ включается сам собой', () => {
    (Platform as any).OS = 'web';
    delete (globalThis as any).window.matchMedia;
    const { box, unmount } = renderHook(useReducedMotion);
    expect(box.value).toBe(false);
    unmount();
  });

  it('веб не спрашивает AccessibilityInfo — там ответ без DOM равен true', () => {
    asWeb(false);
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');
    const { unmount } = renderHook(useReducedMotion);
    expect(spy).not.toHaveBeenCalled();
    unmount();
  });

  it('reducedMotionNow — синхронный снимок для кода вне рендера', () => {
    const media = asWeb(true);
    expect(reducedMotionNow()).toBe(true);
    media.mql.matches = false;
    expect(reducedMotionNow()).toBe(false);
  });
});

describe('useReducedMotion — натив (iOS)', () => {
  it('🔴 система сказала «да» → хук говорит «да»', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const box: { value: boolean | undefined } = { value: undefined };
    const Probe = () => { box.value = useReducedMotion(); return null; };
    let r: any;
    await TestRenderer.act(async () => { r = TestRenderer.create(React.createElement(Probe)); });
    expect(box.value).toBe(true);
    await TestRenderer.act(async () => r.unmount());
  });

  it('система сказала «нет» → обычный режим', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const box: { value: boolean | undefined } = { value: undefined };
    const Probe = () => { box.value = useReducedMotion(); return null; };
    let r: any;
    await TestRenderer.act(async () => { r = TestRenderer.create(React.createElement(Probe)); });
    expect(box.value).toBe(false);
    await TestRenderer.act(async () => r.unmount());
  });

  it('🔴 подписан на reduceMotionChanged и слышит переключение', async () => {
    let notify: ((v: boolean) => void) | null = null;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: any) => {
      if (event === 'reduceMotionChanged') notify = handler;
      return { remove } as any;
    }) as any);

    const box: { value: boolean | undefined } = { value: undefined };
    const Probe = () => { box.value = useReducedMotion(); return null; };
    let r: any;
    await TestRenderer.act(async () => { r = TestRenderer.create(React.createElement(Probe)); });
    expect(box.value).toBe(false);
    expect(notify).toBeTruthy();

    await TestRenderer.act(async () => { notify!(true); });
    expect(box.value).toBe(true);

    await TestRenderer.act(async () => r.unmount());
    expect(remove).toHaveBeenCalled();
  });

  it('отказ системы не роняет экран — просто остаёмся в обычном режиме', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('нет такого метода'));
    const box: { value: boolean | undefined } = { value: undefined };
    const Probe = () => { box.value = useReducedMotion(); return null; };
    let r: any;
    await TestRenderer.act(async () => { r = TestRenderer.create(React.createElement(Probe)); });
    expect(box.value).toBe(false);
    await TestRenderer.act(async () => r.unmount());
  });
});

// ───────────────── поведение «сочных» компонентов ─────────────────

describe('доводчик settle — смысл остаётся, проезд исчезает', () => {
  it('обычный режим: значение едет пружиной, а не прыгает', () => {
    const v = new Animated.Value(1);
    settle(v, 0.95, false, { friction: 6, tension: 220 });
    expect((v as any).__getValue()).toBe(1);   // на первом кадре ещё в старой точке
    v.stopAnimation();
  });

  it('🔴 щадящий режим: значение уже в конечной точке, движения не было', () => {
    const v = new Animated.Value(1);
    settle(v, 0.95, true);
    expect((v as any).__getValue()).toBe(0.95);
  });
});

/** Слой очков — то место, которое в отчёте названо первым. */
describe('всплывашки «+N»', () => {
  const popups = [{ id: 1, x: 10, y: 20, text: '+40', color: '#fde047' }];
  // Снимаем дерево и сразу размонтируем: иначе 900-миллисекундная анимация
  // продолжает крутиться в фоне и тормозит весь набор.
  const render = () => {
    let r: any;
    TestRenderer.act(() => { r = TestRenderer.create(React.createElement(ScorePopupLayer, { popups })); });
    const tree = r.toJSON();
    TestRenderer.act(() => r.unmount());
    return tree;
  };
  /** Внутри слоя-absoluteFill лежит одна всплывашка — берём её. */
  const popNode = (tree: any) => (Array.isArray(tree.children) ? tree.children[0] : tree);

  it('обычный режим: текст взлетает и подпрыгивает масштабом', () => {
    asWeb(false);
    const node = popNode(render());
    const style = node.props.style;
    expect(JSON.stringify(style)).toContain('translateY');
    expect(JSON.stringify(style)).toContain('scale');
  });

  it('🔴 щадящий режим: «+40» на месте — ни полёта, ни подпрыгивания', () => {
    asWeb(true);
    const node = popNode(render());
    const style = node.props.style;
    expect(JSON.stringify(style)).not.toContain('translateY');
    expect(JSON.stringify(style)).not.toContain('scale');
  });

  /** Погасить движение — не значит отнять счёт: цифра обязана остаться. */
  it('🔴 щадящий режим сохраняет саму цифру, а не прячет её вместе с анимацией', () => {
    asWeb(true);
    const node = popNode(render());
    expect(JSON.stringify(node)).toContain('+40');
  });
});

// ──────────────────── запрет на уровне исходников ────────────────────

const JUICE = join(__dirname, '../components/juice');
const JUICE_FILES: string[] = readdirSync(JUICE).filter((f: string) => f.endsWith('.tsx'));

/**
 * Ветка «мгновенно». Компонент, который умеет только «включить движение», в
 * щадящем режиме бесполезен: правило живёт в вызове, а не в хуке. Формы, в
 * которых развязка выглядит по-настоящему: доводчик `settle`, прямая простановка
 * `setValue`, ветвление `if (reduced…)` и тернарник `reduced… ? … : …`.
 */
const INSTANT_PATH = /settle\(|\.setValue\(|reduced[A-Za-z]*\s*\?|if \(!?reduced/;
function instantPathOffenders(files: string[]): string[] {
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8') as string;
    if (!startsMotion(src) && !/animation:\s*.*slide_from_/.test(src)) continue;
    if (!INSTANT_PATH.test(src)) bad.push(`${f.split('/').slice(-2).join('/')}: движение есть, мгновенной ветки нет`);
  }
  return bad;
}

const APP_ROOT = join(__dirname, '../..');
/** Все .ts/.tsx приложения, кроме тестов и служебного. */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(e.name) && !full.includes('__tests__')) out.push(full);
  }
  return out;
}
const ALL_SOURCES: string[] = [...sources(join(APP_ROOT, 'app')), ...sources(join(APP_ROOT, 'src'))];
const rel = (f: string) => f.slice(APP_ROOT.length + 1);
const read = (f: string) => readFileSync(f, 'utf8') as string;

/**
 * Всё, что запускает движение. `settle` — наш собственный доводчик, но имя
 * слишком обычное: в appFeedback.ts так зовётся хелпер «завершить промис».
 * Поэтому считаем его движением только там, где он и правда импортирован
 * из juice/motion, иначе гейт краснеет на постороннем коде.
 */
const startsMotion = (src: string): boolean =>
  /Animated\.(timing|spring|sequence|loop|decay|parallel|stagger)\(/.test(src)
  || (/(?<![A-Za-z])settle\(/.test(src) && /juice\/motion'|from '\.\/motion'/.test(src));

describe('дисциплина «сочных» компонентов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(JUICE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it('🔴 каждый компонент juice, который двигает картинку, спрашивает настройку', () => {
    const bad: string[] = [];
    for (const f of JUICE_FILES) {
      const src = readFileSync(join(JUICE, f), 'utf8') as string;
      if (!startsMotion(src)) continue;                       // статичная грань — двигать нечего
      if (!src.includes('useReducedMotion')) bad.push(`${f}: анимирует, но настройку не читает`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Компонент, который умеет только «включить движение», в щадящем режиме
   * бесполезен: правило живёт в вызове, а не в хуке. Поэтому у каждого должен
   * быть виден и второй путь — мгновенная развязка.
   */
  it('🔴 у каждого анимирующего компонента есть ветка «мгновенно»', () => {
    expect(instantPathOffenders(JUICE_FILES.map((f) => join(JUICE, f)))).toEqual([]);
  });
});

/**
 * Хук — единственный источник правды. Кто читает системную настройку мимо него,
 * тот наступит на грабли react-native-web из шапки этого файла: без DOM ответ
 * `true`, и щадящий режим включится сам собой.
 *
 * Список пуст и должен таким оставаться. Он существует как место для явного,
 * подписанного исключения на время чужой правки — молчаливых быть не должно.
 * (`LevelInterlude.tsx` жил здесь до 19.08, пока читал AccessibilityInfo
 * напрямую; переведён на хук — строчка удалена.)
 */
const BYPASS_TODO: Record<string, string> = {};

describe('единственный источник правды', () => {
  const ROOTS = ['app', 'src'].map((d) => join(__dirname, '../..', d));
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };

  it('🔴 настройку читают только через хук', () => {
    const hook = join(__dirname, '../hooks/useReducedMotion.ts');
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (file === hook) continue;
        if (file.includes('__tests__')) continue;
        const src = readFileSync(file, 'utf8') as string;
        src.split('\n').forEach((line) => {
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;   // комментарий
          if (!/isReduceMotionEnabled|prefers-reduced-motion|reduceMotionChanged/.test(line)) return;
          offenders.push(file.slice(file.indexOf('/src/') + 1) || file);
        });
      }
    }
    const unexpected = offenders.filter((f) => !BYPASS_TODO[f]);
    expect(unexpected).toEqual([]);
  });
});

// ════════════════ НЕПРЕРЫВНЫЕ ПЕТЛИ ════════════════
/**
 * 🔴 ПОЧЕМУ ПЕТЛИ ОТДЕЛЬНО И ЖЁСТЧЕ ОСТАЛЬНОГО. Разовый проезд можно переждать,
 * отведя глаза на полсекунды. Петля не заканчивается: питомец качается и ходит
 * поперёк нижнего края всё время, пока открыт экран, то есть по периферии
 * зрения — там, где движение ловится сильнее всего и откуда его не убрать,
 * не уйдя с экрана. Для вестибулярной чувствительности это худший из случаев.
 */

/** Перехватываем НАСТОЯЩИЙ Animated.loop и считаем, сколько петель осталось крутиться. */
function countLoops() {
  const rec: { started: number; stopped: number }[] = [];
  const real = Animated.loop.bind(Animated);
  jest.spyOn(Animated, 'loop').mockImplementation(((...args: any[]) => {
    const l: any = (real as any)(...args);
    const r = { started: 0, stopped: 0 };
    rec.push(r);
    const s = l.start.bind(l);
    const st = l.stop.bind(l);
    l.start = (cb?: any) => { r.started++; return s(cb); };
    l.stop = () => { r.stopped++; return st(); };
    return l;
  }) as any);
  /** Петля считается живой, если её запустили и не остановили. */
  return { running: () => rec.filter((r) => r.started > r.stopped).length };
}

describe('питомец «Синапс» — вечное покачивание', () => {
  const render = () => {
    const SynapsePet = require('@/src/components/pet/SynapsePet').default;
    let r: any;
    TestRenderer.act(() => { r = TestRenderer.create(React.createElement(SynapsePet, { stage: 1, size: 60 })); });
    return r;
  };

  it('обычный режим: боб крутится', () => {
    asWeb(false);
    const loops = countLoops();
    const r = render();
    expect(loops.running()).toBeGreaterThanOrEqual(1);
    TestRenderer.act(() => r.unmount());
  });

  /**
   * Хук стартует с false (гидратация), поэтому петля успевает запуститься на
   * первом кадре и тут же гасится. Проверяем именно ИТОГ — «крутящихся не
   * осталось», а не «loop не вызывали»: важно, что движения нет, а не каким
   * путём к этому пришли.
   */
  it('🔴 щадящий режим: ни одной живой петли не осталось', () => {
    asWeb(true);
    const loops = countLoops();
    const r = render();
    expect(loops.running()).toBe(0);
    TestRenderer.act(() => r.unmount());
  });

  it('🔴 щадящий режим: питомец стоит в СРЕДНЕМ положении, а не съехавший вниз', () => {
    asWeb(true);
    const r = render();
    // В toJSON анимированные значения приходят объектами AnimatedInterpolation,
    // а числами становятся только через их же toJSON — отсюда прогон через JSON.
    // Первый элемент массива стилей — свежий снимок анимированных пропов.
    const style = ([] as any[]).concat(JSON.parse(JSON.stringify(r.toJSON().props.style)))[0];
    expect(style.transform).toEqual([{ translateY: 0 }]);
    TestRenderer.act(() => r.unmount());
  });
});

/**
 * 🔴 ЭТО ЖИВАЯ ПЕТЛЯ ПРИЛОЖЕНИЯ, В ОТЛИЧИЕ ОТ SVG-«Синапса» выше.
 * Все три точки показа питомца — гуляка внизу главной, портрет на /pet и
 * мини-аватар в шапке — рисуются кадрами PetSprite: `setInterval` перебирает
 * их всё время, пока открыт экран. SynapsePet.tsx (SVG) в UI уже не
 * используется, поэтому смотреть надо именно сюда.
 */
describe('флипбук питомца — кадры без конца', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  /** Видимый кадр — единственная картинка с opacity 1. */
  const visibleFrame = (r: any): number => {
    const kids = ([] as any[]).concat(r.toJSON().children || []);
    return kids.findIndex((k: any) => Object.assign({}, ...([] as any[]).concat(k.props?.style).flat(9)).opacity === 1);
  };
  const render = () => {
    const PetSprite = require('@/src/components/pet/PetSprite').default;
    let r: any;
    TestRenderer.act(() => { r = TestRenderer.create(React.createElement(PetSprite, { state: 'idle', size: 56 })); });
    return r;
  };

  it('обычный режим: кадры перелистываются сами', () => {
    asWeb(false);
    const r = render();
    const before = visibleFrame(r);
    TestRenderer.act(() => { jest.advanceTimersByTime(1500); });   // idle = 420 мс на кадр
    expect(visibleFrame(r)).not.toBe(before);
    TestRenderer.act(() => r.unmount());
  });

  it('🔴 щадящий режим: кадр замер и сам не меняется', () => {
    asWeb(true);
    const r = render();
    expect(visibleFrame(r)).toBe(0);
    TestRenderer.act(() => { jest.advanceTimersByTime(5000); });
    expect(visibleFrame(r)).toBe(0);
    TestRenderer.act(() => r.unmount());
  });

  /** Погасить шевеление — не значит стереть питомца: он собеседник, а не фон. */
  it('🔴 щадящий режим: питомец по-прежнему нарисован', () => {
    asWeb(true);
    const r = render();
    expect(([] as any[]).concat(r.toJSON().children || []).length).toBeGreaterThan(0);
    TestRenderer.act(() => r.unmount());
  });
});

describe('плашка «открылся уровень»', () => {
  // Плашка сама снимает себя через 4.5 секунды. На настоящих таймерах этот
  // отложенный вызов переживает тест и стреляет уже по снесённому окружению.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  const show = () => {
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');
    const UnlockToast = require('@/src/components/UnlockToast').default;
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(React.createElement(LanguageProvider, null, React.createElement(UnlockToast)));
    });
    TestRenderer.act(() => {
      DeviceEventEmitter.emit('psygames:level-unlocked', { gameId: 'x', levelKey: 'k', label: 'Тест' });
    });
    const node = r.toJSON();
    const props = (Array.isArray(node) ? node[0] : node).props;
    const style = Object.assign({}, ...JSON.parse(JSON.stringify(props.style)).flat(9));
    TestRenderer.act(() => r.unmount());
    return style;
  };

  it('обычный режим: плашка наезжает сверху и проявляется', () => {
    asWeb(false);
    const style = show();
    expect(style.opacity).toBeLessThan(1);              // ещё проявляется
    expect(style.transform[0].translateY).toBeLessThan(0);   // ещё выше своего места
  });

  it('🔴 щадящий режим: плашка сразу на месте и читаемая', () => {
    asWeb(true);
    const style = show();
    expect(style.opacity).toBe(1);
    expect(style.transform).toEqual([{ translateY: 0 }]);
  });
});

// ════════════════ ЗАПРЕТ НА УРОВНЕ ИСХОДНИКОВ (всё приложение) ════════════════

describe('дисциплина движения во всём приложении', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(ALL_SOURCES.length).toBeGreaterThan(150);
  });

  /**
   * Единственное исключение — сам доводчик: он и есть реализация правила,
   * настройку ему передают аргументом.
   */
  const MOTION_OK = new Set(['src/components/juice/motion.ts']);

  it('🔴 кто запускает анимацию — спрашивает настройку', () => {
    const bad: string[] = [];
    for (const f of ALL_SOURCES) {
      if (MOTION_OK.has(rel(f))) continue;
      const src = read(f);
      if (!startsMotion(src)) continue;
      if (!src.includes('useReducedMotion')) bad.push(`${rel(f)}: анимирует, но настройку не читает`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 у всего, что двигается, есть ветка «мгновенно»', () => {
    expect(instantPathOffenders(ALL_SOURCES.filter((f) => !MOTION_OK.has(rel(f))))).toEqual([]);
  });

  it('🔴 ни одна вечная петля не крутится мимо настройки', () => {
    const bad: string[] = [];
    for (const f of ALL_SOURCES) {
      const src = read(f);
      if (!src.includes('Animated.loop(')) continue;
      if (!src.includes('useReducedMotion')) bad.push(`${rel(f)}: Animated.loop без оглядки на настройку`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Переход между экранами. `slide_from_*` прогоняет всю плоскость поперёк
   * поля зрения на каждой навигации — самый крупный движущийся объект в
   * приложении. Смысл («ушёл вглубь») сохраняем, проезд — нет.
   */
  it('🔴 проезд экрана при навигации знает про настройку', () => {
    const bad: string[] = [];
    for (const f of ALL_SOURCES) {
      const src = read(f);
      if (!/animation:\s*.*slide_from_/.test(src)) continue;
      if (!src.includes('useReducedMotion')) bad.push(`${rel(f)}: экраны въезжают всегда`);
      else if (!/'none'/.test(src)) bad.push(`${rel(f)}: настройку читает, но мгновенного варианта нет`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * Покадровая анимация спрайта на setInterval — такая же вечная петля, просто
   * не через Animated. Список ниже — то, что ещё не переехало, с причиной;
   * проверка написана как «подмножество известного», поэтому чинится молча.
   */
  const SPRITE_TODO: Record<string, string> = {};

  it('🔴 покадровые спрайты не крутятся мимо настройки', () => {
    const offenders: string[] = [];
    for (const f of ALL_SOURCES) {
      const src = read(f);
      if (!/setInterval\([\s\S]{0,120}setFrame/.test(src)) continue;
      if (src.includes('useReducedMotion')) continue;
      offenders.push(rel(f));
    }
    expect(offenders.filter((f) => !SPRITE_TODO[f])).toEqual([]);
  });

  it('каждое исключение объяснено, а не просто вписано', () => {
    for (const why of [...Object.values(SPRITE_TODO), ...Object.values(BYPASS_TODO)]) {
      expect(why.length).toBeGreaterThan(30);
    }
  });
});
