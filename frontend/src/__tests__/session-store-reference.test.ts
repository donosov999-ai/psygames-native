/* psygames-session-store-reference · VER 1 · 12.11.2026 */
/**
 * 🔴 УЧЁТ ПАРТИЙ — ЭТАЛОН ДЛЯ DART (задача 0f3d3910, вариант Б d6a60b02, шаг а).
 *
 * Настоящий `saveSession` (`services/api.ts`) на подставном хранилище: сценарий партий → хранилище после
 * каждой. Dart (`lib/shell/session_store.dart`) обязан дать то же хранилище на той же последовательности —
 * так учёт переезжает с веба без второй копии правил, которая разошлась бы молча.
 * Срез 1: журнал `psygames_sessions` (запись, повтор по id, миграция старых имён при записи) и серия
 * «чисто» `psygames_clean_run_<профиль>`. Остальные ключи пишутся в образец целиком — следующие срезы
 * (начисление, вызов дня, достижения) сверяют их без перезаписи образца.
 * Сеть не трогается: облако без согласия не пишет (`cloudConsentGranted`).
 * Перезапись — `WRITE=1 NODE_OPTIONS=--experimental-vm-modules npx jest -i --runTestsByPath src/__tests__/session-store-reference.test.ts`.
 * ⚠️ Без `--experimental-vm-modules` динамический `import()` в jest падает, а `saveSession` глотает ошибку:
 * рекорд питомца, вызов дня и достижения молча не срабатывают — образец вышел бы без них.
 */
declare const process: { env: Record<string, string | undefined> };
/* eslint-disable @typescript-eslint/no-require-imports -- загрузка после сброса модулей */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

type Sess = Record<string, unknown>;
type Case = { name: string; storage?: Record<string, string>; sessions: Sess[]; warmup?: boolean };

/** Часы образца: начисление пишет метку и календарный день устройства — Dart сверяется на тех же. */
const NOW = Date.parse('2026-11-12T10:00:00.000Z');

const s = (id: string, game: string, score: number, errors: number, extra: Sess = {}): Sess => ({
  id, game_type: game, score, errors, time_seconds: 30, difficulty: '3', timestamp: `2026-11-12T10:0${id.slice(-1)}:00.000Z`, ...extra,
});

const CASES: Case[] = [
  {
    name: 'cleanSeries',
    sessions: [s('a1', 'schulte_table', 50, 0), s('a2', 'schulte_table', 60, 0), s('a3', 'corsi', 10, 2), s('a4', 'corsi', 12, 0)],
  },
  { name: 'duplicateId', sessions: [s('b1', 'n_back', 40, 0), s('b1', 'n_back', 40, 0), s('b2', 'n_back', 45, 0)] },
  { name: 'lessonKeepsRun', sessions: [s('c1', 'sudoku', 90, 0), s('c2', 'sudoku', 80, 0, { details: { lesson: true } }), s('c3', 'sudoku', 85, 1, { details: { solver_used: true } })] },
  { name: 'zeroScoreNotClean', sessions: [s('d1', 'stroop', 20, 0), s('d2', 'stroop', 0, 0)] },
  { name: 'ownProfile', sessions: [s('e1', 'digit_span', 30, 0, { profile_id: 'free' }), s('e2', 'digit_span', 31, 0)] },
  {
    name: 'legacyMigratedOnWrite',
    storage: {
      psygames_sessions: JSON.stringify([
        { id: 'old1', game_type: 'word_mnemonics', score: 5, errors: 0, timestamp: '2026-10-01T10:00:00.000Z' },
        { id: 'old2', game_type: 'sudoku', score: 70, errors: 0, details: { samurai: true }, timestamp: '2026-10-02T10:00:00.000Z' },
      ]),
      psygames_clean_run_nzt48: '4',
    },
    sessions: [s('f1', 'schulte_table', 33, 0)],
  },
  // Срез 2 — начисление (earn.ts): суточная квота ×2 в одной игре — три партии, четвёртая без множителя.
  { name: 'earnQuota', sessions: [s('g1', 'corsi', 400, 0), s('g2', 'corsi', 400, 0), s('g3', 'corsi', 400, 0), s('g4', 'corsi', 400, 0), s('g5', 'n_back', 400, 0)] },
  // Серия трёх дней → ×2 и за партию с ошибками; база ограничена 50.
  {
    name: 'earnDayStreak',
    storage: {
      psygames_earn_v1: JSON.stringify({ nzt48: { entries: [], days: ['2026-11-10', '2026-11-11'] } }),
      psygames_tokens_v1: JSON.stringify({ nzt48: 7 }),
      psygames_earned_total_v1: JSON.stringify({ nzt48: 7 }),
    },
    sessions: [s('h1', 'stroop', 300, 2), s('h2', 'stroop', 5000, 0)],
  },
  // Шаг зарядки — без множителя (комплекс платит свой бонус).
  { name: 'earnWarmupStep', warmup: true, sessions: [s('i1', 'digit_span', 400, 0)] },
  // Срез 3 — рекорд для питомца: ≥ 3 прошлые партии этой игры и счёт выше их максимума; равный — не рекорд.
  {
    name: 'petRecord',
    storage: {
      psygames_sessions: JSON.stringify([
        { id: 'p1', game_type: 'corsi', score: 10, errors: 0, timestamp: '2026-11-01T10:00:00.000Z', profile_id: 'nzt48' },
        { id: 'p2', game_type: 'corsi', score: 30, errors: 0, timestamp: '2026-11-02T10:00:00.000Z', profile_id: 'nzt48' },
        { id: 'p3', game_type: 'corsi', score: 20, errors: 0, timestamp: '2026-11-03T10:00:00.000Z', profile_id: 'nzt48' },
      ]),
    },
    sessions: [s('j1', 'corsi', 30, 0), s('j2', 'corsi', 31, 0)],
  },
  { name: 'petNoRecordTooFew', sessions: [s('k1', 'stroop', 10, 0), s('k2', 'stroop', 20, 0), s('k3', 'stroop', 30, 0)] },
  // Срез 3 — вызов дня: задуманный на сегодня в этой игре засчитывается (вчера был → серия +1), чужая игра — нет.
  {
    name: 'challengeCommit',
    storage: {
      psygames_daily_challenge_pending_nzt48: JSON.stringify({ date: '2026-11-12', gameId: 'n_back' }),
      psygames_daily_challenge_streak_nzt48: JSON.stringify({ streak: 2, total: 5, last: '2026-11-11' }),
    },
    sessions: [s('l1', 'corsi', 100, 0), s('l2', 'n_back', 100, 0), s('l3', 'n_back', 120, 0)],
  },
  {
    name: 'challengeStalePending',
    storage: { psygames_daily_challenge_pending_nzt48: JSON.stringify({ date: '2026-11-11', gameId: 'n_back' }) },
    sessions: [s('m1', 'n_back', 100, 0)],
  },
];

describe('учёт партий — эталон хранилища для Dart', () => {
  const out: unknown[] = [];
  for (const c of CASES) {
    it(c.name, async () => {
      jest.resetModules();
      jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask', 'clearTimeout', 'clearInterval', 'clearImmediate'] });
      (globalThis as any).__psygames_warmup_active = c.warmup === true;
      const mod = require('@react-native-async-storage/async-storage'); // eslint-disable-line @typescript-eslint/no-require-imports
      const AsyncStorage = mod.default ?? mod;
      await AsyncStorage.clear();
      for (const [k, v] of Object.entries(c.storage ?? {})) await AsyncStorage.setItem(k, v);
      (globalThis as any).__psygames_active_profile_id = 'nzt48';
      const { saveSession } = require('@/src/services/api'); // eslint-disable-line @typescript-eslint/no-require-imports
      const steps: unknown[] = [];
      for (const sess of c.sessions) {
        await saveSession({ ...sess });
        await new Promise((r) => setTimeout(r, 0));
        const keys: string[] = (await AsyncStorage.getAllKeys()).filter((k: string) => k.startsWith('psygames_')).sort();
        const storage: Record<string, string | null> = {};
        for (const k of keys) storage[k] = await AsyncStorage.getItem(k);
        steps.push({ session: sess, storage });
      }
      jest.useRealTimers();
      (globalThis as any).__psygames_warmup_active = undefined;
      out.push({ name: c.name, profile: 'nzt48', warmup: c.warmup === true, storage: c.storage ?? {}, steps });
      const last = steps[steps.length - 1] as { storage: Record<string, string> };
      expect(last.storage.psygames_sessions).toBeTruthy();
    });
  }
  afterAll(() => {
    if (process.env.WRITE !== '1') return;
    const file = path.join(__dirname, '../../../flutter/test/fixtures/session_store_reference.json');
    // Пояс образца: день начисления — МЕСТНЫЙ (`dayKey`), Dart считает его на том же сдвиге.
    const tzOffsetMinutes = new Date(NOW).getTimezoneOffset();
    fs.writeFileSync(file, JSON.stringify({ source: 'frontend/src/services/api.ts saveSession', now: NOW, tzOffsetMinutes, cases: out }, null, 2) + '\n');
  });
});
