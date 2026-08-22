/* psygames-rhythm-miss-position · VER 1 · 22.08.2026 */
/**
 * ЦЕНА ОШИБКИ НЕ ЗАВИСИТ ОТ ТОГО, ГДЕ ОНА СЛУЧИЛАСЬ.
 *
 * 🔴 ЧТО НАШЛОСЬ. В «Ритме и высоте» такты сверялись с нажатиями ПО НОМЕРУ:
 * пятое нажатие всегда сравнивалось с пятым тактом. Один несыгранный удар
 * сдвигал всё, что после него, на позицию — и каждое следующее нажатие
 * промахивалось мимо своего такта на целый интервал. Замер на партии из
 * девяти тактов:
 *
 *     всё точно             → 1.000
 *     пропуск пятого из 9   → 0.000   ← восемь тактов сыграны идеально
 *     пропуск последнего    → 0.833
 *
 * Один и тот же единственный промах стоил либо всей партии, либо одной шестой
 * — по чистой случайности, в каком месте человек сбился. Ближе к началу —
 * страшнее приговор. Это оценка не игры, а места ошибки.
 *
 * Гейт гоняет НАСТОЯЩУЮ партию через сессию игры (`recordRhythmTap` →
 * `submitRhythmResponse`), а не считает формулу заново у себя.
 */
import {
  createRhythmPitchSession,
  startRhythmPitchRound,
  startCalibrationPlayback,
  recordCalibrationTap,
  completeCalibrationPlayback,
  continueAfterCalibration,
  startAudioRoundPlayback,
  completeAudioRoundPlayback,
  recordRhythmTap,
  submitRhythmResponse,
} from '@/src/games/rhythm-pitch/core/session';
import { alignTapsToBeats, estimateLatencyOffset } from '@/src/games/rhythm-pitch/core/scoring';
import type { RhythmEchoRound, RhythmPitchSession } from '@/src/games/rhythm-pitch/core/types';

const T0 = 100_000;

/** Партия целиком: от правил до результата. Нажатия задаются смещением от старта ответа. */
function playRound(level: number, seed: string, taps: (onsets: number[]) => number[]) {
  let s: RhythmPitchSession = createRhythmPitchSession({ seed, level, mode: 'rhythm-echo' });
  s = startRhythmPitchRound(s, T0);
  // калибровку проходим ровно: задержки устройства нет, поправка обязана выйти нулевой
  s = startCalibrationPlayback(s, [T0 + 500, T0 + 1000, T0 + 1500, T0 + 2000]);
  for (const t of s.calibrationExpectedTimes) s = recordCalibrationTap(s, t);
  s = completeCalibrationPlayback(s);
  s = continueAfterCalibration(s);
  s = startAudioRoundPlayback(s);
  const responseStart = T0 + 10_000;
  s = completeAudioRoundPlayback(s, responseStart);
  const onsets = (s.round as RhythmEchoRound).beats.map((b): number => b.onsetMs);
  for (const t of taps(onsets)) s = recordRhythmTap(s, responseStart + t);
  s = submitRhythmResponse(s, responseStart + 30_000);
  if (s.result === null) throw new Error('партия не досчиталась — сессия не дошла до результата');
  return { result: s.result, beats: onsets.length, offset: s.calibrationOffsetMs };
}

const LEVELS: Array<[number, string]> = [[3, 'ритм-a'], [7, 'ритм-b'], [12, 'ритм-c'], [18, 'ритм-d']];

describe('ритм: цена промаха одна и та же в любом месте партии', () => {
  it('калибровка без задержки даёт нулевую поправку — иначе замеры ниже врут', () => {
    const { offset } = playRound(3, 'ритм-a', (o) => o);
    expect(offset).toBe(0);
  });

  it('партия сыграна точно → 1.000', () => {
    for (const [level, seed] of LEVELS) {
      const { result } = playRound(level, seed, (o) => o);
      expect(`ур.${level}: ${result.accuracy.toFixed(3)}`).toBe(`ур.${level}: 1.000`);
    }
  });

  /**
   * Главная проверка: пропускаем ПО ОЧЕРЕДИ каждый такт и смотрим на разброс.
   * Партии отличаются только местом пропуска — значит и точность обязана совпасть.
   */
  it('🔴 пропуск любого такта стоит одинаково', () => {
    for (const [level, seed] of LEVELS) {
      const { beats } = playRound(level, seed, (o) => o);
      const scores = Array.from({ length: beats }, (_, skip) =>
        playRound(level, seed, (o) => o.filter((_, i) => i !== skip)).result.accuracy);
      const spread = Math.max(...scores) - Math.min(...scores);
      expect(`ур.${level}: разброс ${spread.toFixed(3)}`).toBe(`ур.${level}: разброс 0.000`);
    }
  });

  it('🔴 лишнее нажатие тоже стоит одинаково в любом месте', () => {
    for (const [level, seed] of LEVELS) {
      const { beats } = playRound(level, seed, (o) => o);
      const scores = Array.from({ length: beats }, (_, at) =>
        playRound(level, seed, (o) => {
          const copy = o.slice();
          // лишний удар посередине между тактами — чтобы он ни к одному не «прилип»
          const prev = at === 0 ? (o[0] as number) - 200 : (o[at - 1] as number);
          copy.splice(at, 0, ((o[at] as number) + prev) / 2);
          return copy;
        }).result.accuracy);
      const spread = Math.max(...scores) - Math.min(...scores);
      expect(`ур.${level}: разброс ${spread.toFixed(3)}`).toBe(`ур.${level}: разброс 0.000`);
    }
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Уравнять цену можно и жульничеством — например, вовсе
   * перестав замечать пропуски. Поэтому рядом проверяем, что игра осталась игрой.
   */
  it('🔴 два пропуска строго дороже одного, три — дороже двух', () => {
    for (const [level, seed] of LEVELS) {
      const cut = (n: number) => playRound(level, seed, (o) => o.filter((_, i) => i >= n)).result.accuracy;
      const [a, b, c] = [cut(1), cut(2), cut(3)];
      expect(`ур.${level}: ${a > b && b > c}`).toBe(`ур.${level}: true`);
    }
  });

  it('🔴 несыгранная партия — ноль, а не «почти получилось»', () => {
    for (const [level, seed] of LEVELS) {
      expect(playRound(level, seed, () => []).result.accuracy).toBe(0);
    }
  });

  it('🔴 промахи по времени по-прежнему видны', () => {
    for (const [level, seed] of LEVELS) {
      const sloppy = playRound(level, seed, (o) => o.map((t, i) => t + (i % 2 ? 260 : -260))).result.accuracy;
      expect(`ур.${level}: ${sloppy < 0.6}`).toBe(`ур.${level}: true`);
    }
  });

  it('пропущенный такт назван пропущенным, а не размазан по точности', () => {
    const { result } = playRound(7, 'ритм-b', (o) => o.filter((_, i) => i !== 2));
    expect(result.specific.missingTaps).toBe(1);
    expect(result.specific.extraTaps).toBe(0);
  });
});

/**
 * ⚠️ ОТДЕЛЬНО — ЧТО ВЫРАВНИВАНИЕ ДЕЙСТВИТЕЛЬНО ЛУЧШЕЕ, А НЕ ПРОСТО КАКОЕ-ТО.
 *
 * Проверки выше гоняют партии, СОБРАННЫЕ ИЗ ТОЧНОЙ ИГРЫ (убрали удар, добавили
 * удар). На таких сопоставление очевидно, и порча таблицы разбора сквозь них
 * проходит незамеченной: мутация «край таблицы без цены пропусков» их не
 * покраснила. А на неровной игре она занижала оценку — 0.423 против 0.233 на
 * той же партии. Это ровно тот вред, из-за которого чинили: наказание за игру,
 * которая была лучше, чем показали.
 *
 * Поэтому здесь стоит независимый оракул: НЕ та же формула, а прямое
 * определение — перебрать все допустимые сопоставления (какие такты сыграны,
 * какими нажатиями, порядок сохраняется) и взять дешёвое. Медленно, зато
 * бесспорно; на коротких партиях перебор укладывается в тысячи вариантов.
 */
describe('выравнивание — лучшее из возможных', () => {
  /** Все монотонные сопоставления: выбираем k тактов и k нажатий, паруем по порядку. */
  function bestCost(expected: number[], observed: number[], tol: number): number {
    const skip = tol * 1.5;
    const subsets = (n: number): number[][] => {
      const out: number[][] = [];
      for (let m = 0; m < (1 << n); m++) {
        const pick: number[] = [];
        for (let b = 0; b < n; b++) if (m & (1 << b)) pick.push(b);
        out.push(pick);
      }
      return out;
    };
    let best = Infinity;
    for (const be of subsets(expected.length)) {
      for (const ta of subsets(observed.length)) {
        if (be.length !== ta.length) continue;
        let c = (expected.length - be.length + observed.length - ta.length) * skip;
        for (let i = 0; i < be.length; i++) c += Math.abs((observed[ta[i] as number] as number) - (expected[be[i] as number] as number));
        if (c < best) best = c;
      }
    }
    return best;
  }

  it('🔴 на неровной игре разбор совпадает с полным перебором', () => {
    let seed = 20260822;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bad: string[] = [];
    for (let k = 0; k < 1500; k++) {
      const n = 1 + Math.floor(rnd() * 6);
      const tol = 100 + Math.floor(rnd() * 200);
      const expected = Array.from({ length: n }, (_, x) => x * 400);
      const observed: number[] = [];
      for (let x = 0; x < n; x++) {
        if (rnd() < 0.85) observed.push(x * 400 + Math.round((rnd() - 0.5) * 500));
        if (rnd() < 0.15) observed.push(Math.round(rnd() * n * 400));
      }
      observed.sort((a, b) => a - b);
      if (observed.length > 6) observed.length = 6;
      const got = alignTapsToBeats(expected, observed, tol);
      const mine = got.errorsMs.reduce((a, b) => a + b, 0) + (got.missingTaps + got.extraTaps) * tol * 1.5;
      const ref = bestCost(expected, observed, tol);
      if (Math.abs(mine - ref) > 1e-6) bad.push(`${JSON.stringify({ expected, observed, tol })}: ${mine} вместо ${ref}`);
    }
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it('счётчики сходятся с числом тактов и нажатий — иначе разбор потерял ход', () => {
    let seed = 4242;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let k = 0; k < 500; k++) {
      const n = 1 + Math.floor(rnd() * 8);
      const expected = Array.from({ length: n }, (_, x) => x * 400);
      const observed = Array.from({ length: Math.floor(rnd() * 10) }, () => Math.round(rnd() * n * 400)).sort((a, b) => a - b);
      const r = alignTapsToBeats(expected, observed, 150);
      expect(r.errorsMs.length + r.missingTaps).toBe(n);
      expect(r.errorsMs.length + r.extraTaps).toBe(observed.length);
    }
  });
});

/**
 * ⚠️ ТО ЖЕ САМОЕ, НО НА НАСТРОЙКЕ — И ТАМ ЦЕНА ВЫШЕ.
 *
 * Промах в раунде стоил раунда. Промах на настройке стоил ВСЕХ следующих партий:
 * поправка уезжала на пол-такта, и потом идеально сыгранный ритм получал 0.333.
 * Заметить это изнутри игры было нечем — экран говорил «Калибровка готова».
 */
describe('настройка задержки: неполный набор не разбирается', () => {
  const CLICKS = [0, 450, 900, 1350];

  it('🔴 щёлкнули не по всем — настройка не принята, а не угадана', () => {
    const cases: Array<[string, number[]]> = [
      ['пропущен первый', CLICKS.slice(1)],
      ['пропущен последний', CLICKS.slice(0, 3)],
      ['пропущен средний', [0, 450, 1350]],
      ['нажали только два', CLICKS.slice(2)],
      ['не нажали вовсе', []],
    ];
    for (const [name, taps] of cases) {
      const e = estimateLatencyOffset(CLICKS, taps);
      expect(`${name}: поправка ${e.offsetMs}, замеров ${e.samples}`).toBe(`${name}: поправка 0, замеров 0`);
    }
  });

  it('полный набор разбирается — настоящая задержка колонки видна', () => {
    for (const lag of [0, 40, 120, 300]) {
      const e = estimateLatencyOffset(CLICKS, CLICKS.map((c) => c + lag));
      expect(`лаг ${lag}: ${e.offsetMs}/${e.samples}`).toBe(`лаг ${lag}: ${lag}/4`);
    }
  });

  /**
   * ⚠️ ВСТРЕЧНО: отказ разбирать не должен превратиться в тупик. Непринятая
   * настройка обязана оставить человека на том же шаге — с просьбой пройти её
   * заново, а не молча пустить дальше и не запереть.
   */
  it('🔴 непринятая настройка не пускает дальше и не запирает', () => {
    let s: RhythmPitchSession = createRhythmPitchSession({ seed: 'настройка', level: 5, mode: 'rhythm-echo' });
    s = startRhythmPitchRound(s, T0);
    s = startCalibrationPlayback(s, CLICKS.map((c) => T0 + c));
    for (const t of CLICKS.slice(1)) s = recordCalibrationTap(s, T0 + t);   // первый щелчок пропущен
    s = completeCalibrationPlayback(s);
    expect(s.calibrationComplete).toBe(false);
    expect(continueAfterCalibration(s).phase).toBe('calibration');
    // а пройденная целиком — пускает
    let ok: RhythmPitchSession = startCalibrationPlayback(
      { ...s, calibrationPlaying: false }, CLICKS.map((c) => T0 + c));
    for (const t of CLICKS) ok = recordCalibrationTap(ok, T0 + t);
    ok = completeCalibrationPlayback(ok);
    expect(ok.calibrationComplete).toBe(true);
    expect(continueAfterCalibration(ok).phase).toBe('ready');
  });
});
