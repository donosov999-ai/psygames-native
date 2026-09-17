/* psygames-mental-rotation-oblique · VER 1 · 17.09.2026 */
/**
 * «СЕЧЕНИЕ»: КОСАЯ ПЛОСКОСТЬ, РАЗРЕЗ — МНОГОУГОЛЬНИК. ПРОБА ГЕОМЕТРИИ, ВАРИАНТОВ И ЛЕСТНИЦЫ.
 *
 * Решение Дениса 17.09.2026 (задача 4f85b6a9): «косой срез делай». Приёмка задачи:
 *   · вырожденные случаи — плоскость по грани, мимо тела, через одну вершину — дают понятный
 *     ответ (здесь: «сечения нет», и генератор такую плоскость не берёт), а не пустой многоугольник;
 *   · единственность: неверные варианты не совпадают с верным ни при каком повороте и отражении.
 * Верные ответы сверяются со школьными сечениями куба, посчитанными руками, а не тем же кодом.
 */
import {
  buildObliqueTask, buildTask, createRng, KIND_UNLOCK, OBLIQUE_MIN_DISTANCE, obliqueLevelSpec, planeThrough,
  polygonDistance, polygonSignature, slicePolygon, to2D, unlockedKinds, levelParams, fitPolygon, planTaskKinds,
  readableAngles, OBLIQUE_ANGLE_MIN, OBLIQUE_ANGLE_MAX, sectionForTask,
} from '@/src/games/mental-rotation/core';
import type { Vec2, Vec3 } from '@/src/games/mental-rotation/core';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));
/** Партия целиком из «Сечений» — для пробы экрана. Ядро в пробах выше берёт настоящий план (`requireActual`). */
jest.mock('@/src/games/mental-rotation/core', () => {
  const actual = jest.requireActual('@/src/games/mental-rotation/core');
  return { ...actual, planTaskKinds: (_level: number, trials: number) => Array.from({ length: trials }, () => 'oblique') };
});

const КУБ: Vec3 = [1, 1, 1];
const плоскость = (n: Vec3, d: number) => {
  const len = Math.hypot(...n);
  return { normal: [n[0] / len, n[1] / len, n[2] / len] as Vec3, offset: d / len };
};
const вид = (dims: Vec3, n: Vec3, d: number) => {
  const pl = плоскость(n, d);
  const s = slicePolygon(dims, pl);
  return s ? polygonSignature(to2D(s, pl.normal)) : null;
};
const близко = (a: number[], b: number[], eps = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('«Сечение»: геометрия на школьных сечениях куба', () => {
  it('x = ½ — квадрат', () => {
    const s = вид(КУБ, [1, 0, 0], 0.5)!;
    expect(s.sides.length).toBe(4);
    expect(близко(s.sides, [0.25, 0.25, 0.25, 0.25])).toBe(true);
    expect(s.angles.every((a) => Math.abs(a - 90) < 1e-6)).toBe(true);
  });

  it('x + y = 1 — прямоугольник 1 : √2 через два противоположных ребра (четыре вершины в плоскости, но это не грань)', () => {
    const s = вид(КУБ, [1, 1, 0], 1)!;
    expect(s.sides.length).toBe(4);
    const стороны = [...s.sides].sort();
    const короткая = 1 / (2 + 2 * Math.SQRT2), длинная = Math.SQRT2 / (2 + 2 * Math.SQRT2);
    expect(близко(стороны, [короткая, короткая, длинная, длинная])).toBe(true);
  });

  it('x + y + z = 1 и = 2 — равносторонние треугольники', () => {
    for (const d of [1, 2]) {
      const s = вид(КУБ, [1, 1, 1], d)!;
      expect(s.sides.length).toBe(3);
      expect(s.angles.every((a) => Math.abs(a - 60) < 1e-6)).toBe(true);
    }
  });

  it('x + y + z = 1,5 — правильный шестиугольник через середины шести рёбер', () => {
    const s = вид(КУБ, [1, 1, 1], 1.5)!;
    expect(s.sides.length).toBe(6);
    expect(s.angles.every((a) => Math.abs(a - 120) < 1e-6)).toBe(true);
    expect(близко(s.sides, [1, 1, 1, 1, 1, 1].map((v) => v / 6))).toBe(true);
  });

  it('🔴 вырожденные — не сечение: по грани, через вершину, через ребро, мимо, срез в пылинку', () => {
    expect(вид(КУБ, [1, 0, 0], 0)).toBeNull();          // плоскость грани x = 0
    expect(вид(КУБ, [0, 0, 1], 1)).toBeNull();          // плоскость грани z = 1
    expect(вид(КУБ, [1, 1, 1], 0)).toBeNull();          // касается одной вершины
    expect(вид(КУБ, [1, 1, 0], 0)).toBeNull();          // касается одного ребра
    expect(вид(КУБ, [1, 1, 1], 5)).toBeNull();          // мимо
    // Срез угла: x + y + z = 0,1 — треугольник площадью 0,009 в пылинку на рисунке — не задание;
    // x + y + z = 0,5 — тот же треугольник площадью 0,22 — задание.
    expect(вид(КУБ, [1, 1, 1], 0.1)).toBeNull();
    expect(вид(КУБ, [1, 1, 1], 0.5)?.sides.length).toBe(3);
    expect(planeThrough([0, 0, 0], [1, 1, 1], [2, 2, 2])).toBeNull();   // три точки на прямой
  });

  it('🔴 в задание не идёт сечение с углом, который глаз не видит, и сечение чужой сторонности', () => {
    // Брус 2×1×1, три точки на рёбрах с шагами генератора (¼, ⅔, ⅓): пятиугольник с углом 176° —
    // на рисунке четырёхугольник. Найден замером генератора без проверки углов (уровень 39).
    const тонкий = planeThrough([2, 1, 0.25], [4 / 3, 0, 1], [0, 1, 1 / 3])!;
    const пятиугольник = slicePolygon([2, 1, 1], тонкий)!;
    expect(пятиугольник.length).toBe(5);
    expect(Math.max(...polygonSignature(to2D(пятиугольник, тонкий.normal)).angles)).toBeGreaterThan(OBLIQUE_ANGLE_MAX);
    expect(sectionForTask([2, 1, 1], тонкий, [5, 6])).toBeNull();
    // Контроль: шестиугольник через середины рёбер куба годен, а на ступени «3–4 стороны» — нет.
    const середины = плоскость([1, 1, 1], 1.5);
    expect(sectionForTask(КУБ, середины, [5, 6])?.section.length).toBe(6);
    expect(sectionForTask(КУБ, середины, [3, 4])).toBeNull();
  });

  it('параллелепипед 2×1×1: сечение x = 1 — квадрат, x + y = 1 — прямоугольник', () => {
    const квадрат = вид([2, 1, 1], [1, 0, 0], 1)!;
    expect(близко(квадрат.sides, [0.25, 0.25, 0.25, 0.25])).toBe(true);
    const прямоугольник = вид([2, 1, 1], [0, 1, 1], 1)!;
    expect(прямоугольник.sides.length).toBe(4);
  });
});

describe('«Сечение»: сравнение с точностью до подобия, поворота и отражения', () => {
  const квадрат: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const повернуть = (p: Vec2[], a: number, k = 1): Vec2[] => p.map(([x, y]) => [k * (x * Math.cos(a) - y * Math.sin(a)) + 3, k * (x * Math.sin(a) + y * Math.cos(a)) - 2]);
  const отразить = (p: Vec2[]): Vec2[] => p.map(([x, y]) => [-x, y] as Vec2).reverse();

  it('повёрнутый, увеличенный, отражённый и сдвинутый по обходу — одна форма', () => {
    const трапеция: Vec2[] = [[0, 0], [4, 0], [3, 2], [1, 2]];
    expect(polygonDistance(трапеция, повернуть(трапеция, 1.1, 2.5))).toBeLessThan(1e-9);
    expect(polygonDistance(трапеция, отразить(трапеция))).toBeLessThan(1e-9);
    expect(polygonDistance(трапеция, [...трапеция.slice(2), ...трапеция.slice(0, 2)])).toBeLessThan(1e-9);
    expect(polygonDistance(квадрат, [[0, 0], [2, 0], [2, 2], [0, 2]])).toBeLessThan(1e-9);
    // Трапеция симметрична: обход в обратную сторону у неё совпадает с прямым. Несимметричный
    // пятиугольник проверяет то, что встречается в заданиях на деле: выпуклая оболочка тени всегда
    // идёт против часовой, а сечение — как выпадет, то есть тот же многоугольник обходится наоборот.
    const кривой: Vec2[] = [[0, 0], [5, 0], [6, 2], [3, 4], [0, 3]];
    expect(polygonDistance(кривой, [...кривой].reverse())).toBeLessThan(1e-9);
    expect(polygonDistance(кривой, отразить(повернуть(кривой, 0.7, 0.4)))).toBeLessThan(1e-9);
    expect(polygonDistance(кривой, [...кривой.slice(3), ...кривой.slice(0, 3)].reverse())).toBeLessThan(1e-9);
    // Контроль: мера не нулевая для всего подряд — другой пятиугольник различим.
    expect(polygonDistance(кривой, [[0, 0], [5, 0], [5, 3], [2, 5], [0, 3]])).toBeGreaterThanOrEqual(OBLIQUE_MIN_DISTANCE);
  });

  it('🔴 порог различимости стоит между тем, что видно, и тем, что не видно', () => {
    const прям = (w: number): Vec2[] => [[0, 0], [w, 0], [w, 1], [0, 1]];
    // квадрат и 1 : √2 — глазом различимы
    expect(polygonDistance(квадрат, прям(Math.SQRT2))).toBeGreaterThanOrEqual(OBLIQUE_MIN_DISTANCE);
    // 1 : 1,41 и 1 : 1,5 — глазом одно и то же
    expect(polygonDistance(прям(1.41), прям(1.5))).toBeLessThan(OBLIQUE_MIN_DISTANCE);
    // разное число сторон — всегда различимы
    expect(polygonDistance(квадрат, [[0, 0], [1, 0], [0, 1]])).toBe(Infinity);
  });
});

describe('«Сечение»: задания', () => {
  const партия: { level: number; seed: string; task: ReturnType<typeof buildObliqueTask> }[] = [];
  beforeAll(() => {
    for (let level = KIND_UNLOCK.oblique; level <= 50; level++) for (let i = 0; i < 4; i++) {
      const seed = `obl-${level}-${i}`;
      партия.push({ level, seed, task: buildObliqueTask(level, createRng(seed)) });
    }
  });

  it('открывается с 24-го уровня', () => {
    expect(KIND_UNLOCK.oblique).toBe(24);
    expect(unlockedKinds(23)).not.toContain('oblique');
    expect(unlockedKinds(24)).toContain('oblique');
    expect(buildTask('oblique', 30, createRng('bt')).kind).toBe('oblique');
    const настоящийПлан = jest.requireActual('@/src/games/mental-rotation/core').planTaskKinds as typeof planTaskKinds;
    let встреч = 0;
    for (let i = 0; i < 40; i++) встреч += настоящийПлан(30, 15, createRng(`plan-obl-${i}`)).filter((k) => k === 'oblique').length;
    expect(встреч).toBeGreaterThan(0);
  });

  it('🔴 верный вариант — настоящая форма сечения; сечение не вырожденное и нужной сторонности', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of партия) {
      const верный = task.options[task.correctIdx];
      if (!верный.isMatch || task.options.filter((o) => o.isMatch).length !== 1) плохо.push(`${seed}: верных не один`);
      const заново = slicePolygon(task.dims, task.plane);
      if (!заново) { плохо.push(`${seed}: сечение вырожденное`); continue; }
      if (polygonDistance(верный.points, to2D(заново, task.plane.normal)) > 1e-9) плохо.push(`${seed}: верный вариант не совпал с сечением`);
      if (!obliqueLevelSpec(level).sides.includes(task.sides)) плохо.push(`${seed}: сторон ${task.sides} не по ступени`);
      if (task.options.length !== levelParams(level).optionCount) плохо.push(`${seed}: вариантов ${task.options.length}`);
      // Все вершины сечения — на рёбрах тела и в плоскости.
      for (const p of task.section) {
        const вПлоскости = Math.abs(p[0] * task.plane.normal[0] + p[1] * task.plane.normal[1] + p[2] * task.plane.normal[2] - task.plane.offset) < 1e-9;
        const наГранице = p.filter((v, k) => Math.abs(v) < 1e-9 || Math.abs(v - task.dims[k]) < 1e-9).length >= 2;
        if (!вПлоскости || !наГранице) плохо.push(`${seed}: вершина ${p.map((v) => v.toFixed(2))} не на ребре или не в плоскости`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 единственность: подделки отличимы от верного и друг от друга при любом повороте и отражении', () => {
    const плохо: string[] = [];
    for (const { seed, task } of партия) {
      task.options.forEach((a, i) => task.options.forEach((b, j) => {
        if (j <= i) return;
        const d = polygonDistance(a.points, b.points);
        if (d < OBLIQUE_MIN_DISTANCE) плохо.push(`${seed}: варианты ${i} и ${j} одного вида (${d.toFixed(3)})`);
      }));
      // Мера «разное число сторон — различимы» верна, только если каждый угол виден как угол:
      // шестиугольник с углом 178° на карточке — пятиугольник.
      for (const o of task.options) if (!readableAngles(o.points)) {
        плохо.push(`${seed}: ${o.flaw} с нечитаемым углом ${polygonSignature(o.points).angles.map((a) => a.toFixed(0)).join('/')} (норма ${OBLIQUE_ANGLE_MIN}…${OBLIQUE_ANGLE_MAX})`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 близость подделок — ось лестницы: на младших ступенях подделки дальше от верного ответа', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of партия) {
      const верный = task.options[task.correctIdx];
      for (const o of task.options) {
        if (o.isMatch) continue;
        const d = polygonDistance(верный.points, o.points);
        if (d < obliqueLevelSpec(level).minDistance) плохо.push(`${seed}: подделка ${o.flaw} ближе порога ступени (${d.toFixed(3)} < ${obliqueLevelSpec(level).minDistance})`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
    expect(obliqueLevelSpec(24).minDistance).toBeGreaterThan(obliqueLevelSpec(50).minDistance);
    expect(obliqueLevelSpec(50).minDistance).toBe(OBLIQUE_MIN_DISTANCE);
  });

  it('подделки разного рода встречаются, а не одна «другая плоскость»', () => {
    const рода = new Set(партия.flatMap(({ task }) => task.options.map((o) => o.flaw)));
    expect([...рода].sort()).toEqual(['none', 'other', 'seen', 'shadow']);
  });

  it('лестница растёт: больше сторон и тела длиннее к верхним уровням', () => {
    const средняя = (from: number, to: number) => {
      const t = партия.filter((p) => p.level >= from && p.level <= to).map((p) => p.task.sides);
      return t.reduce((s, v) => s + v, 0) / t.length;
    };
    expect(средняя(24, 29)).toBeLessThan(средняя(36, 41));
    expect(партия.filter((p) => p.level >= 42).some((p) => p.task.dims[0] === 2)).toBe(true);
    expect(партия.filter((p) => p.level < 36).every((p) => p.task.dims.join() === '1,1,1')).toBe(true);
  });

  it('рисунок варианта вписан в карточку и лежит длинной стороной внизу', () => {
    const плохо: string[] = [];
    for (const { seed, task } of партия.slice(0, 40)) task.options.forEach((o, i) => {
      const p = fitPolygon(o.points, 100, 8);
      for (const [x, y] of p) { expect(x).toBeGreaterThanOrEqual(7.99); expect(x).toBeLessThanOrEqual(92.01); expect(y).toBeGreaterThanOrEqual(7.99); expect(y).toBeLessThanOrEqual(92.01); }
      // Низ карточки — наибольший y. Сторона у низа обязана быть самой длинной (с точностью до равных сторон).
      const n = p.length;
      const длина = (k: number) => Math.hypot(p[(k + 1) % n][0] - p[k][0], p[(k + 1) % n][1] - p[k][1]);
      const низ = Math.max(...p.map((q) => q[1]));
      const длиннейшая = Math.max(...p.map((_, k) => длина(k)));
      const внизу = p.map((_, k) => k).filter((k) => Math.abs(p[k][1] - низ) < 1e-6 && Math.abs(p[(k + 1) % n][1] - низ) < 1e-6);
      if (!внизу.some((k) => длина(k) > длиннейшая - 1e-6)) плохо.push(`${seed} вариант ${i}: внизу не самая длинная сторона`);
    });
    expect(плохо.slice(0, 5)).toEqual([]);
  });
});

// ─────────────────────────── экран ───────────────────────────

describe('«Сечение»: настоящий экран', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  async function осесть(r: any, кругов = 6, шаг = 500) {
    for (let i = 0; i < кругов; i += 1) {
      await TestRenderer.act(async () => { jest.advanceTimersByTime(шаг); for (let k = 0; k < 30; k += 1) await Promise.resolve(); });
    }
  }
  const текст = (node: any): string => {
    const out: string[] = [];
    const walk = (n: any) => { if (n == null) return; if (typeof n === 'string') { out.push(n); return; } if (Array.isArray(n)) { n.forEach(walk); return; } walk(n.props?.children ?? n.children); };
    walk(node); return out.join(' ');
  };
  const поId = (r: any, id: string) => r.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === id);

  it('🔴 эталон рисует тело и закрашенное сечение, варианты — многоугольники; промах открывает разбор с подписями', async () => {
    await AsyncStorage.clear();
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { ThemeProvider } = require('@/src/contexts/ThemeContext');
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');
    const { ProfileProvider } = require('@/src/contexts/ProfileContext');
    const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const { WarmupProvider } = require('@/src/contexts/WarmupContext');
    const Screen = require('@/app/games/mental-rotation').default;
    const { getMentalRotationStrings } = require('@/src/games/mental-rotation/core');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const S = getMentalRotationStrings('en');
    let r: any;
    await TestRenderer.act(async () => {
      r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null, React.createElement(LanguageProvider, null,
          React.createElement(PlayerLevelValue, { level: 30 }, React.createElement(WarmupProvider, null, React.createElement(Screen))))))));
    });
    await осесть(r);
    const старт = r.root.findAll((n: any) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function' && /начать|start|play|играть/i.test(текст(n)));
    await TestRenderer.act(async () => { старт[0].props.onPress(); });
    await осесть(r, 2, 100);

    expect(поId(r, 'oblique-reference').length).toBe(1);
    expect(поId(r, 'oblique-section-fill').length).toBe(1);
    // Хост-узел Polygon в react-native-svg — путь `d`; точки видны на составном узле.
    const заливка = r.root.findAll((n: any) => n.props?.testID === 'oblique-section-fill' && typeof n.props?.points === 'string')[0];
    expect(String(заливка.props.points).trim().split(/\s+/).length).toBeGreaterThanOrEqual(3);
    const варианты = () => r.root.findAll((n: any) => typeof n.type !== 'string' && /вариант|option/i.test(String(n.props?.accessibilityLabel ?? '')) && typeof n.props?.onPress === 'function');
    const число = new Set(варианты().map((n: any) => n.props.accessibilityLabel)).size;
    expect(число).toBeGreaterThanOrEqual(3);
    expect(`многоугольников в вариантах: ${поId(r, 'oblique-option').length}`).toBe(`многоугольников в вариантах: ${число}`);
    expect(текст(r.toJSON())).toContain(S.obliquePrompt.slice(0, 20));

    let разбор = false;
    for (let i = 0; i < 8 && !разбор; i++) {
      const живые = варианты().filter((n: any) => !n.props.disabled);
      if (!живые.length) { await осесть(r, 3); continue; }
      await TestRenderer.act(async () => { живые[i % живые.length].props.onPress(); });
      await осесть(r, 1, 100);
      разбор = поId(r, 'mental-review-next').length > 0;
      if (!разбор) await осесть(r, 3);
    }
    expect(`разбор открылся: ${разбор}`).toBe('разбор открылся: true');
    const экран = текст(r.toJSON());
    expect(экран).toContain(S.reviewObliqueHint.slice(0, 20));
    // Подписи подделок «Сечения» названы своими словами, а не «другая фигура».
    const подписи = [S.optionSeenAtAngle, S.optionShadow, S.optionOtherPlane].filter((s: string) => экран.includes(s));
    expect(подписи.length).toBeGreaterThan(0);
    expect(экран).not.toContain(S.optionOther);
  });
});
