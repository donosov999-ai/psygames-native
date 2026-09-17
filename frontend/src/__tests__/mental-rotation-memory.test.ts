/* psygames-mental-rotation-memory · VER 1 · 17.09.2026 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * «ПАМЯТЬ»: ФИГУРУ ПОКАЗАЛИ, СПРЯТАЛИ, УЗНАЙ ПОВЁРНУТОЙ.
 *
 * Решение Дениса 17.09.2026 (задача 69f1810f): «это твой движок и твоя территория ротации) все
 * упражнения на ментальное вращение используют память) чтобы повернуть в уме надо помнить)».
 *
 * Что стережёт проба — по приёмке задачи:
 *   · время показа — параметр ступени, и ступени правда разные;
 *   · после скрытия фигуры нет в разметке НИКАК (не прозрачность, а отсутствие узла);
 *   · пока фигура видна, отвечать нечем: варианты пустые и не нажимаются;
 *   · пауза останавливает время показа;
 *   · в разборе фигура возвращается и доворачивается до верного варианта;
 *   · в наклон времени по углу «Память» не попадает — там время ещё и на вспоминание.
 * Экран монтируется настоящий, со всеми провайдерами; партия целиком из «Памяти».
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildMemoryTask, createRng, isValidRotation, KIND_UNLOCK, memoryExposureMs, MEMORY_FROM_LEVEL,
  planTaskKinds, rotationReplay, shapeKey, slopeSamples, unlockedKinds, getMentalRotationStrings,
} from '@/src/games/mental-rotation/core';
import type { TrialRecord } from '@/src/games/mental-rotation/core';
import { holdGame, __resetGameClock } from '@/src/services/gamePause';

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
/** Партия целиком из «Памяти»: в жизни она подмешивается к поворотам, здесь нужна каждым раундом. */
jest.mock('@/src/games/mental-rotation/core', () => {
  const actual = jest.requireActual('@/src/games/mental-rotation/core');
  return { ...actual, planTaskKinds: (_level: number, trials: number) => Array.from({ length: trials }, () => 'memory') };
});

/** Экран в пробе говорит по-английски: язык по умолчанию у провайдера без сохранённого выбора. */
const S = getMentalRotationStrings('en');

// ─────────────────────────── ядро ───────────────────────────

describe('«Память»: ядро', () => {
  it('открывается с 13-го уровня — после «Сборки», до «Трёх видов»', () => {
    expect(KIND_UNLOCK.memory).toBe(13);
    expect(MEMORY_FROM_LEVEL).toBe(KIND_UNLOCK.memory);
    expect(unlockedKinds(12)).not.toContain('memory');
    expect(unlockedKinds(13)).toContain('memory');
    expect(KIND_UNLOCK.assembly).toBeLessThan(KIND_UNLOCK.memory);
    expect(KIND_UNLOCK.memory).toBeLessThan(KIND_UNLOCK.formation);
  });

  it('🔴 время показа — лестница: с каждым уровнем не дольше, а ступени правда разные', () => {
    const ряд = Array.from({ length: 50 - MEMORY_FROM_LEVEL + 1 }, (_, i) => memoryExposureMs(MEMORY_FROM_LEVEL + i));
    expect(ряд[0]).toBe(5000);
    expect(ряд[ряд.length - 1]).toBe(1500);
    const рост = ряд.filter((ms, i) => i > 0 && ms > ряд[i - 1]).length;
    expect(`уровней, где показ стал ДОЛЬШЕ: ${рост}`).toBe('уровней, где показ стал ДОЛЬШЕ: 0');
    // Три ступени из приёмки — три разных времени, а не одно на всех.
    expect(new Set([13, 25, 37, 50].map(memoryExposureMs)).size).toBe(4);
    for (let level = MEMORY_FROM_LEVEL; level <= 50; level += 5) {
      expect(buildMemoryTask(level, createRng(`exp-${level}`)).exposureMs).toBe(memoryExposureMs(level));
    }
  });

  it('🔴 верный вариант — поворот эталона, подделки — нет; разбор доворачивает ровно до верного', () => {
    const плохо: string[] = [];
    for (let level = MEMORY_FROM_LEVEL; level <= 50; level += 1) for (let i = 0; i < 3; i++) {
      const task = buildMemoryTask(level, createRng(`mem-${level}-${i}`));
      const тег = `L${level}#${i}`;
      if (task.kind !== 'memory') плохо.push(`${тег}: вид ${task.kind}`);
      task.options.forEach((o, k) => {
        const поворот = isValidRotation(task.base, o.shape);
        if (k === task.correctIdx && !поворот) плохо.push(`${тег}: верный вариант не поворот`);
        if (k !== task.correctIdx && поворот) плохо.push(`${тег}: подделка ${k} — тоже поворот (второй верный ответ)`);
      });
      const кадры = rotationReplay(task);
      if (shapeKey(кадры[кадры.length - 1].shape) !== shapeKey(task.options[task.correctIdx].shape)) плохо.push(`${тег}: разбор не доходит до верного`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('«Память» подмешивается в партию на своих уровнях', () => {
    const actualPlan = jest.requireActual('@/src/games/mental-rotation/core').planTaskKinds as typeof planTaskKinds;
    let встреч = 0;
    for (let i = 0; i < 40; i++) встреч += actualPlan(20, 15, createRng(`plan-mem-${i}`)).filter((k) => k === 'memory').length;
    expect(встреч).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) expect(actualPlan(12, 15, createRng(`plan-early-${i}`))).not.toContain('memory');
  });

  it('🔴 в наклон времени по углу «Память» не попадает — там время ещё и на вспоминание', () => {
    const журнал: TrialRecord[] = [
      { kind: 'rotation', angle: 90, rt: 680, correct: true },
      { kind: 'memory', angle: 180, rt: 9000, correct: true },
      { kind: 'rotation', angle: 180, rt: 860, correct: true },
      { kind: 'memory', angle: 270, rt: 40, correct: true },
    ];
    expect(slopeSamples(журнал)).toEqual([{ angle: 90, rt: 680 }, { angle: 180, rt: 860 }]);
  });
});

// ─────────────────────────── экран ───────────────────────────

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function осесть(r: any, кругов = 6, шаг = 500) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(шаг);
      for (let k = 0; k < 30; k += 1) await Promise.resolve();
    });
  }
}

async function монтировать() {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const Screen = require('@/app/games/mental-rotation').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(PlayerLevelValue, { level: 30 },
                React.createElement(WarmupProvider, null,
                  React.createElement(Screen))))))),
    );
  });
  await осесть(r);
  return r;
}

function текст(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk(n.props?.children ?? n.children);
  };
  walk(node);
  return out.join(' ');
}

/** Только узлы разметки: композит и его View несут один testID, считать надо один раз. */
const поId = (r: any, id: string) => r.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === id);
const варианты = (r: any) => r.root.findAll((n: any) => /вариант|option/i.test(String(n.props?.accessibilityLabel ?? '')) && typeof n.props?.onPress === 'function');
/** Рисунок внутри узла: хоть один многоугольник SVG. */
const рисунков = (узел: any) => узел.findAll((n: any) => n.type === 'polygon' || n.type === 'Polygon' || n.props?.points !== undefined).length;
const эталон = (r: any) => поId(r, 'mental-reference')[0];

async function начать(r: any) {
  const старт = r.root.findAll((n: any) =>
    n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function' && /начать|start|play|играть/i.test(текст(n)));
  expect(старт.length).toBeGreaterThan(0);
  await TestRenderer.act(async () => { старт[0].props.onPress(); });
  // Короткий шаг: в партию входим, но время показа (≥ 1,5 с) ещё не вышло.
  await осесть(r, 2, 100);
}

describe('«Память»: экран', () => {
  beforeEach(() => { jest.useFakeTimers(); __resetGameClock(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 показ → фигура исчезает из разметки → варианты появляются и нажимаются → разбор возвращает фигуру', async () => {
    const r = await монтировать();
    await начать(r);

    // ПОКАЗ: фигура есть, варианты пустые и выключены, вопрос — «запомни».
    expect(`фигура при показе: ${поId(r, 'memory-figure').length}, заглушка: ${поId(r, 'memory-hidden').length}`).toBe('фигура при показе: 1, заглушка: 0');
    expect(рисунков(эталон(r))).toBeGreaterThan(0);
    expect(варианты(r).length).toBeGreaterThanOrEqual(3);
    expect(`варианты при показе: выключено ${варианты(r).filter((n: any) => n.props.disabled).length} из ${варианты(r).length}, рисунков ${варианты(r).reduce((s: number, n: any) => s + рисунков(n), 0)}`)
      .toBe(`варианты при показе: выключено ${варианты(r).length} из ${варианты(r).length}, рисунков 0`);
    expect(текст(r.toJSON())).toContain(S.memoryStudyPrompt.split('{s}')[0].trim().slice(0, 12));
    // Пустая карточка держит размер рисунка: иначе она схлопывается в полоску, и ряд прыгает при скрытии
    // (живой кадр 17.09.2026). Место — квадрат со стороной рисунка варианта.
    const заглушки = поId(r, 'memory-option-blank');
    const вариантов = new Set(варианты(r).map((n: any) => n.props.accessibilityLabel)).size;
    expect(`пустых мест в вариантах: ${заглушки.length} из ${вариантов}`).toBe(`пустых мест в вариантах: ${вариантов} из ${вариантов}`);
    for (const з of заглушки) {
      const ст = [з.props.style].flat().reduce((a: any, s: any) => ({ ...a, ...s }), {});
      expect(ст.width).toBeGreaterThanOrEqual(48);
      expect(ст.height).toBe(ст.width);
    }
    // Нажатие во время показа ничего не делает: разбора нет, фигура на месте.
    await TestRenderer.act(async () => { варианты(r)[0].props.onPress(); });
    await осесть(r, 1, 50);
    expect(поId(r, 'mental-review-next').length).toBe(0);
    expect(поId(r, 'memory-figure').length).toBe(1);

    // СКРЫТИЕ: время показа вышло (не больше 5 с на любом уровне).
    await осесть(r, 12, 500);
    expect(`фигура после скрытия: ${поId(r, 'memory-figure').length}, заглушка: ${поId(r, 'memory-hidden').length}`).toBe('фигура после скрытия: 0, заглушка: 1');
    expect(`рисунков в эталоне после скрытия: ${рисунков(эталон(r))}`).toBe('рисунков в эталоне после скрытия: 0');
    expect(варианты(r).filter((n: any) => n.props.disabled).length).toBe(0);
    expect(варианты(r).every((n: any) => рисунков(n) > 0)).toBe(true);
    expect(текст(r.toJSON())).toContain(S.memoryPrompt.slice(0, 12));

    // ОТВЕТ МИМО → РАЗБОР: фигура снова видна.
    let разбор = false;
    for (let i = 0; i < 6 && !разбор; i++) {
      const живые = варианты(r).filter((n: any) => !n.props.disabled);
      if (живые.length === 0) { await осесть(r, 12, 500); continue; }
      await TestRenderer.act(async () => { живые[i % живые.length].props.onPress(); });
      await осесть(r, 1, 100);
      разбор = поId(r, 'mental-review-next').length > 0;
      if (!разбор) await осесть(r, 14, 500);   // попали в верный: новая фигура, снова показ и скрытие
    }
    expect(`разбор открылся: ${разбор}`).toBe('разбор открылся: true');
    expect(поId(r, 'memory-figure').length).toBe(1);
    expect(текст(r.toJSON())).toContain(S.reviewMemoryHint.slice(0, 20));
  });

  it('🔴 пауза останавливает время показа', async () => {
    const r = await монтировать();
    await начать(r);
    expect(поId(r, 'memory-figure').length).toBe(1);
    const отпустить = holdGame();
    await осесть(r, 20, 500);                       // 10 с на паузе
    expect(`после 10 с паузы фигура на месте: ${поId(r, 'memory-figure').length}`).toBe('после 10 с паузы фигура на месте: 1');
    await TestRenderer.act(async () => { отпустить(); });
    await осесть(r, 12, 500);
    expect(`после паузы и показа — спрятана: ${поId(r, 'memory-hidden').length}`).toBe('после паузы и показа — спрятана: 1');
  });
});
