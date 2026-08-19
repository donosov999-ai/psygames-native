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
 * 🔴 ЧТО ГЕЙТ НАРОЧНО НЕ ТРЕБУЕТ. «Меньше движения» — не «выключить всё».
 * Смысловое движение (карта повернулась лицом, шар надулся, засчитано «+40»)
 * остаётся, но становится мгновенным. Тесты ниже проверяют именно этот размен:
 * декоративное гаснет, смысловое остаётся без проезда.
 */
import React from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
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

/** Всё, что запускает движение. `settle` — наш собственный доводчик. */
const STARTS_MOTION = /Animated\.(timing|spring|sequence|loop|decay|parallel|stagger)\(|(?<![A-Za-z])settle\(/;

describe('дисциплина «сочных» компонентов', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(JUICE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it('🔴 каждый компонент juice, который двигает картинку, спрашивает настройку', () => {
    const bad: string[] = [];
    for (const f of JUICE_FILES) {
      const src = readFileSync(join(JUICE, f), 'utf8') as string;
      if (!STARTS_MOTION.test(src)) continue;                 // статичная грань — двигать нечего
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
    const bad: string[] = [];
    for (const f of JUICE_FILES) {
      const src = readFileSync(join(JUICE, f), 'utf8') as string;
      if (!STARTS_MOTION.test(src)) continue;
      const hasInstantPath = /settle\(|setValue\(|if \(reduced\)|if \(!reduced\)/.test(src);
      if (!hasInstantPath) bad.push(`${f}: движение есть, мгновенной ветки нет`);
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Хук — единственный источник правды. Кто читает системную настройку мимо него,
 * тот наступит на грабли react-native-web из шапки этого файла: без DOM ответ
 * `true`, и щадящий режим включится сам собой.
 *
 * Список ниже — то, что ещё НЕ переехало на хук, с причиной. Проверка написана
 * как «подмножество известного»: файл починили или удалили → тест остаётся
 * зелёным, появился новый обход → краснеет.
 */
const BYPASS_TODO: Record<string, string> = {
  'src/components/LevelInterlude.tsx':
    'экран-заставка между уровнями: читает AccessibilityInfo напрямую, поэтому на пререндере без DOM считает режим включённым; переключить на useReducedMotion',
};

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
