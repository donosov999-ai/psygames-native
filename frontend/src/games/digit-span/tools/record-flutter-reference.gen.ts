/* psygames-digit-span-record-flutter-reference · VER 1 · 01.10.2026 */
/**
 * ЭТАЛОН ДЛЯ FLUTTER-ПОЛОВИНЫ «ЦИФРОВОГО РЯДА». Пишет `flutter/test/fixtures/digit-span-reference.json`.
 *
 * 🔴 ПОЧЕМУ ЭКСПОРТЁР ПОЯВИЛСЯ ТОЛЬКО СЕЙЧАС. Эталон лёг в репо 23.09 при первом переносе, а
 * экспортёра к нему не было: вшитые данные без экспортёра не чинятся — правка веба молча
 * расходилась бы с эталоном. Этот файл пересоздаёт прежние ключи (`volumeTop`, `levels` L1…L60,
 * `seqs` — восемь рядов по трём направлениям) ДОСЛОВНО и дописывает то, без чего перенос был
 * урезан: темп шага зарядки, «весь ряд разом», подачу и три лестницы, рекорд в шапке, шаг
 * лесенки длин, метки отчёта и ЦЕЛЫЕ ПАРТИИ на записанном потоке случайных чисел.
 *
 * ⚠️ ПОСЛЕ ЛЮБОЙ ПРАВКИ `app/games/digit-span.tsx` (levelParams, showTiming, effectiveDelivery,
 * ladderIdFor, hudRecord, generateSeq, drawDirection, spanStep, sessionLabels) — ПЕРЕЗАПУСТИТЬ И
 * ЗАКОММИТИТЬ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/digit-span/tools/record-flutter-reference.gen.ts'
 */
import {
  allAtOnceMs, DELIVERIES, DIRECTIONS, drawDirection, DS_RULES, DS_VOLUME_TOP, effectiveDelivery, expectedDigits,
  generateSeq, hudRecord, ladderIdFor, levelParams, PACE_STEPS, sessionLabels, showTiming, spanFinished, spanStep,
  type Direction, type Pace,
} from '@/app/games/digit-span';
import { capPresetByLevel } from '@/src/services/presetCap';
import { getDigitSpanStrings } from '@/src/games/digit-span/core/i18n';
import type { TtsBlock } from '@/src/services/tts';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const REFERENCE_PATH = join(__dirname, '../../../../../flutter/test/fixtures/digit-span-reference.json');
/** Словарь модуля для нативной половины — те же двенадцать языков, что у веба. */
const STRINGS_PATH = join(__dirname, '../../../../../flutter/assets/l10n/digit_span.json');
const LOCALES = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'] as const;

/** mulberry32 — только источник потока; Dart его не повторяет, а читает записанные числа. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SessionCase {
  level: number;
  isPreset: boolean;
  /** Шаг зарядки: стартовая длина, направление и метка трудности из адреса шага. */
  want?: number;
  dir?: Direction;
  diff?: string;
  /** Игрок-модель: верно, пока длина не больше trueSpan, и неверно в раундах wrongAt. */
  trueSpan: number;
  wrongAt: number[];
}

/**
 * Партия тем же ходом, что у экрана: startGame → showSequence(startLen) → handleSubmit → …
 * Решения (шаг, конец, метки) — живыми функциями экрана; здесь только порядок вызовов.
 */
function playSession(c: SessionCase, seed: number) {
  const source = mulberry32(seed);
  const randoms: number[] = [];
  const rng = () => { const r = source(); randoms.push(r); return r; };
  const effLevel = c.isPreset ? 1 : c.level;
  const p = levelParams(effLevel);
  const surprise = !c.isPreset && p.surpriseDir;
  const dir: Direction = surprise ? drawDirection(rng) : (c.isPreset ? (c.dir ?? 'forward') : (p.reverse ? 'backward' : 'forward'));
  const startLen = c.isPreset
    ? capPresetByLevel({ want: c.want ?? 4, atLevel: p.startLen, atTop: p.startLen >= 9 })
    : p.startLen;
  let seqLen = startLen;
  let round = 1;
  let atLen = 0;
  let correctRounds = 0;
  let maxSpan = 0;
  let errors = 0;
  const rows: { len: number; seq: number[]; expected: number[]; correct: boolean }[] = [];
  for (;;) {
    const seq = generateSeq(seqLen, rng);
    const correct = !(seqLen > c.trueSpan || c.wrongAt.includes(round));
    rows.push({ len: seqLen, seq, expected: expectedDigits(seq, dir), correct });
    const step = spanStep({ seqLen, round, atLenErrors: atLen, correct });
    if (correct) { correctRounds += 1; maxSpan = Math.max(maxSpan, seqLen); } else { errors += 1; }
    atLen = step.atLenErrors;
    if (spanFinished(step)) break;
    seqLen = correct ? step.nextLen : seqLen;
    round += 1;
  }
  return {
    ...c, seed, effLevel, surprise, dir, startLen, randoms, rows,
    finalLength: seqLen, rounds: round, correctRounds, maxSpan, errors,
    score: maxSpan * 10,
    passed: !c.isPreset && correctRounds >= 1,
    labels: sessionLabels({ isPreset: c.isPreset, diff: c.diff ?? 'medium', direction: dir, finalLength: seqLen }),
  };
}

test('эталон «Цифрового ряда» для Flutter', () => {
  // ── прежние ключи — дословно, в прежнем порядке ──
  const levels = [];
  for (let level = 1; level <= 60; level++) levels.push({ level, ...levelParams(level) });
  const seqs = [];
  for (const [seq, dir] of [
    [[1, 2, 5, 5], 'forward'], [[1, 2, 5, 5], 'backward'], [[1, 2, 5, 5], 'ascending'],
    [[9, 3, 7, 1, 4], 'forward'], [[9, 3, 7, 1, 4], 'backward'], [[9, 3, 7, 1, 4], 'ascending'],
    [[5, 5, 5], 'ascending'], [[2, 8], 'backward'],
  ] as [number[], Direction][]) seqs.push({ seq, dir, expected: expectedDigits(seq, dir) });

  // ── новое ──
  const allAtOnce = [];
  for (const gapMs of [550, 750, 1100, 1600]) {
    for (let len = 1; len <= 12; len++) allAtOnce.push({ len, gapMs, ms: allAtOnceMs(len, gapMs) });
  }
  const timing = [];
  for (let level = 1; level <= 60; level++) timing.push({ isPreset: false, level, pace: 'normal', ...showTiming({ isPreset: false, level, pace: 'normal' }) });
  for (const pace of PACE_STEPS as Pace[]) timing.push({ isPreset: true, level: 1, pace, ...showTiming({ isPreset: true, level: 1, pace }) });
  const deliveryTable = [];
  for (const chosen of DELIVERIES) {
    for (const block of [null, 'sound-off', 'no-voice'] as TtsBlock[]) {
      deliveryTable.push({ chosen, block, effective: effectiveDelivery(chosen, block), ladderId: ladderIdFor(chosen, block) });
    }
  }
  const records = [];
  for (const stored of [null, 3, 7, 12]) {
    for (const span of [0, 4, 7, 10]) {
      for (const counts of [true, false]) records.push({ stored, span, counts, shown: hudRecord(stored, span, counts) });
    }
  }
  const steps = [];
  for (let seqLen = 3; seqLen <= 12; seqLen++) {
    for (const round of [1, 6, 11, 12]) {
      for (const atLenErrors of [0, 1]) {
        for (const correct of [true, false]) {
          const step = spanStep({ seqLen, round, atLenErrors, correct });
          steps.push({ seqLen, round, atLenErrorsBefore: atLenErrors, correct, ...step, finished: spanFinished(step) });
        }
      }
    }
  }
  const labels = [];
  for (const isPreset of [false, true]) {
    for (const direction of DIRECTIONS) {
      for (const finalLength of [4, 9, 12]) labels.push({ isPreset, diff: 'medium', direction, finalLength, ...sessionLabels({ isPreset, diff: 'medium', direction, finalLength }) });
    }
  }
  const cases: SessionCase[] = [
    { level: 1, isPreset: false, trueSpan: 6, wrongAt: [] },
    { level: 1, isPreset: false, trueSpan: 99, wrongAt: [] },                    // до длины 12 и за неё
    { level: 1, isPreset: false, trueSpan: 9, wrongAt: [1, 3] },                 // случай пробы правила остановки
    { level: 1, isPreset: false, trueSpan: 9, wrongAt: [1, 2] },                 // две ошибки на старте — уровень не взят
    { level: 1, isPreset: false, trueSpan: 99, wrongAt: [2, 4, 6, 8, 10, 12] },  // стоп на двенадцатом раунде
    { level: 5, isPreset: false, trueSpan: 7, wrongAt: [] },
    { level: 11, isPreset: false, trueSpan: 9, wrongAt: [] },                    // обратный ввод
    { level: 15, isPreset: false, trueSpan: 8, wrongAt: [] },                    // направление разыгрывается
    { level: 20, isPreset: false, trueSpan: 10, wrongAt: [3] },
    { level: 33, isPreset: false, trueSpan: 9, wrongAt: [] },
    { level: 9, isPreset: true, want: 4, dir: 'ascending', diff: 'medium', trueSpan: 6, wrongAt: [] },
    { level: 9, isPreset: true, want: 9, dir: 'backward', diff: 'hard', trueSpan: 7, wrongAt: [2] },   // потолок шага
  ];
  const sessions = cases.map((c, i) => playSession(c, 101 + i));
  // Ось 9 разыгрывается — пусть в эталоне окажутся все три направления.
  const draws = [];
  for (let seed = 1; seed <= 30; seed++) {
    const source = mulberry32(seed * 7);
    const r = source();
    draws.push({ random: r, dir: drawDirection(() => r) });
  }

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    volumeTop: DS_VOLUME_TOP, levels, seqs,
    source: 'app/games/digit-span.tsx',
    rules: DS_RULES.map((r) => ({ key: r.key, fromLevel: r.fromLevel })),
    deliveries: DELIVERIES, directions: DIRECTIONS, paceSteps: PACE_STEPS,
    allAtOnce, timing, deliveryTable, records, steps, labels, sessions, draws,
  }, null, 1));
  const strings: Record<string, unknown> = {};
  for (const l of LOCALES) strings[l] = getDigitSpanStrings(l);
  writeFileSync(STRINGS_PATH, JSON.stringify(strings, null, 1) + '\n');

  expect(levels).toHaveLength(60);
  expect(seqs).toHaveLength(8);
  expect(new Set(draws.map((d) => d.dir)).size).toBe(3);
  expect(sessions.some((s) => !s.passed && !s.isPreset)).toBe(true);
});
