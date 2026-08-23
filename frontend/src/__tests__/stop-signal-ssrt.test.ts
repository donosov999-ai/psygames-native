/* psygames-stop-signal-ssrt-gate · VER 1 · 23.08.2026 */
/**
 * ЛЕСТНИЦА ОБЯЗАНА УРАВНЯТЬ БЫСТРОГО И МЕДЛЕННОГО, А SSRT — ВОССТАНОВИТЬ
 * ЗАДАННОЕ ВРЕМЯ ТОРМОЖЕНИЯ. ВСЁ ОСТАЛЬНОЕ ЗДЕСЬ — ПОДРОБНОСТИ.
 *
 * 🔴 ЧТО ИМЕННО ЛОВИТСЯ И ПОЧЕМУ ОБЫЧНЫЕ ПРОВЕРКИ ЭТОГО НЕ ЛОВЯТ.
 * До 23.08.2026 задержку стоп-сигнала назначал НОМЕР УРОВНЯ
 * (`ssd = min(430, 150 + (level−1)*20)`). Код при этом работал безупречно:
 * пробы шли, счёт считался, экран рисовался, все гейты были зелёные. Сломана
 * была не реализация, а конструкция — у быстрого игрока торможение срывалось
 * почти всегда, у медленного удавалось почти всегда, то есть мерка у двух людей
 * была РАЗНАЯ. Такое не видно ни типами, ни осмотром экрана, ни проверкой
 * «на экране есть число». Видно это только прогоном модельных игроков с разной
 * скоростью через одну и ту же лестницу.
 *
 * Поэтому здесь нет ни одной проверки исходника регуляркой. Проверяются
 * ЗНАЧЕНИЯ и ПОВЕДЕНИЕ:
 *   1. три модельных игрока (быстрый / средний / медленный) обязаны сойтись к
 *      доле удавшихся торможений ≈ 50% — все трое, и разброс между ними мал;
 *   2. их ступени задержки при этом обязаны РАЗОЙТИСЬ — это доказывает, что
 *      уравнивает именно лестница, а не совпадение;
 *   3. SSRT у игрока с ЗАДАННЫМ временем торможения обязан восстановиться
 *      близко к заданному — единственная проверка, доказывающая, что формула
 *      считает то, что заявлено;
 *   4. уровень задержку не трогает: один и тот же игрок на первом и на
 *      пятнадцатом уровне сходится к одной и той же ступени;
 *   5. лестница уровней осталась лестницей: пятнадцатый строго плотнее первого.
 *
 * ⚠️ СЛУЧАЙНОСТЬ ЗДЕСЬ ПОСЕЯНА. Модельный игрок ходит по своему генератору с
 * фиксированным семенем: те же входы — те же числа при каждом прогоне. Проба,
 * которая иногда краснеет, — это проба, которую отключают, а вместе с ней
 * отключают и настоящую поломку.
 */
import {
  MIN_STOP_TRIALS,
  POOL_MAX_TRIALS,
  P_RESPOND_MAX,
  P_RESPOND_MIN,
  SSD_MAX_MS,
  SSD_MIN_MS,
  SSD_START_MS,
  SSD_STEP_MS,
  STOP_PROB,
  appendTrials,
  countStopTrials,
  estimateSsrt,
  levelParams,
  nextSsd,
  parseLadder,
  type StopSignalTrial,
} from '@/src/games/stop-signal/core';

// ─── модельный игрок ────────────────────────────────────────────────────────

/** Генератор с семенем: прогон обязан быть воспроизводимым до последней цифры. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Нормальное отклонение по Боксу–Мюллеру. */
function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface ModelPlayer {
  name: string;
  /** Среднее время реакции на GO. Ровно та величина, которой прежняя игра подменяла торможение. */
  goMeanMs: number;
  goSdMs: number;
  /** ЗАДАННОЕ время торможения. Именно его обязан восстановить расчёт. */
  ssrtMs: number;
  ssrtSdMs: number;
}

/**
 * Три игрока отличаются ТОЛЬКО скоростью руки. Время торможения у всех троих
 * одинаковое — 220 мс: если лестница честна, они получат одинаковую долю
 * удавшихся торможений и одинаковый SSRT при РАЗНЫХ ступенях задержки.
 */
const PLAYERS: ModelPlayer[] = [
  { name: 'быстрый', goMeanMs: 380, goSdMs: 80, ssrtMs: 220, ssrtSdMs: 25 },
  { name: 'средний', goMeanMs: 520, goSdMs: 90, ssrtMs: 220, ssrtSdMs: 25 },
  { name: 'медленный', goMeanMs: 700, goSdMs: 110, ssrtMs: 220, ssrtSdMs: 25 },
];

interface RunOptions {
  trials: number;
  goWindowMs: number;
  startSsdMs: number;
  seed: number;
  stopProb?: number;
  /** Подменённый ход лестницы — им и ломаются мутации в отдельной пробе. */
  advance?: (currentMs: number, inhibited: boolean) => number;
}

interface RunResult {
  trials: StopSignalTrial[];
  /** Ступень после каждой стоп-пробы — это и есть траектория лестницы. */
  ssdTrace: number[];
  finalSsdMs: number;
}

/**
 * МОДЕЛЬ ГОНКИ, И НИЧЕГО СВЕРХ НЕЁ. Рука стартует по GO и приходит через `goRt`;
 * торможение стартует по стоп-сигналу (то есть через `ssd`) и приходит через
 * `ssd + stopLatency`. Кто раньше — тот и решил исход. Ровно на этой модели
 * держится метод интеграции, поэтому играть модельным игроком по другим
 * правилам было бы проверкой самой себя.
 */
function playRun(player: ModelPlayer, opts: RunOptions): RunResult {
  const rnd = seeded(opts.seed);
  const step = opts.advance ?? nextSsd;
  const stopProb = opts.stopProb ?? STOP_PROB;
  let ssd = opts.startSsdMs;
  const trials: StopSignalTrial[] = [];
  const ssdTrace: number[] = [];

  for (let i = 0; i < opts.trials; i += 1) {
    const isStop = rnd() < stopProb;
    const goRt = Math.max(120, player.goMeanMs + player.goSdMs * gauss(rnd));
    if (!isStop) {
      trials.push({
        isStop: false,
        ssdMs: null,
        rtMs: goRt <= opts.goWindowMs ? goRt : null,
        goWindowMs: opts.goWindowMs,
      });
      continue;
    }
    const stopLatency = Math.max(60, player.ssrtMs + player.ssrtSdMs * gauss(rnd));
    const wonByHand = goRt <= ssd + stopLatency && goRt <= opts.goWindowMs;
    trials.push({
      isStop: true,
      ssdMs: ssd,
      rtMs: wonByHand ? goRt : null,
      goWindowMs: opts.goWindowMs,
    });
    ssd = step(ssd, !wonByHand);
    ssdTrace.push(ssd);
  }
  return { trials, ssdTrace, finalSsdMs: ssd };
}

/** Доля удавшихся торможений по набору проб — то самое, что обязано стать половиной. */
function inhibitionRate(trials: readonly StopSignalTrial[]): number {
  const stop = trials.filter((t) => t.isStop);
  if (stop.length === 0) return 0;
  return stop.filter((t) => t.rtMs === null).length / stop.length;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number): number => Math.round(x * 100);

/**
 * Разгон отбрасывается: пока лестница идёт от старта к своей точке, её доля
 * торможений заведомо смещена. Меряем установившийся режим — так же, как
 * методика велит считать SSRT не по первым пробам, а по вышедшему на режим блоку.
 */
const WARMUP_TRIALS = 400;
const MEASURE_TRIALS = 2000;

function settled(player: ModelPlayer, seed: number, goWindowMs = 1400, startSsdMs = SSD_START_MS) {
  const warm = playRun(player, { trials: WARMUP_TRIALS, goWindowMs, startSsdMs, seed });
  const run = playRun(player, {
    trials: MEASURE_TRIALS,
    goWindowMs,
    startSsdMs: warm.finalSsdMs,
    seed: seed + 1,
  });
  return {
    rate: inhibitionRate(run.trials),
    meanSsd: mean(run.ssdTrace),
    estimate: estimateSsrt(run.trials),
    trace: run.ssdTrace,
    trials: run.trials,
  };
}

// ─── 1. сходимость: доля торможений ≈ 50% У ВСЕХ ТРЁХ ───────────────────────

describe('лестница уравнивает игроков с разной скоростью руки', () => {
  const settledPlayers = PLAYERS.map((p, i) => ({ player: p, ...settled(p, 1000 + i * 7) }));

  it('🔴 доля удавшихся торможений сходится к половине у КАЖДОГО из трёх', () => {
    const off = settledPlayers
      .map((s) => `${s.player.name}: ${pct(s.rate)}%`)
      .filter((_, i) => Math.abs(settledPlayers[i].rate - 0.5) > 0.05);
    expect(off).toEqual([]);
  });

  it('🔴 разброс доли между быстрым и медленным — считаные проценты, а не десятки', () => {
    const rates = settledPlayers.map((s) => s.rate);
    const spread = Math.max(...rates) - Math.min(...rates);
    expect(`разброс ${pct(spread)} п.п. ≤ 5`).toBe('разброс ' + Math.min(pct(spread), 5) + ' п.п. ≤ 5');
  });

  /**
   * 🔴 БЕЗ ЭТОЙ ПРОБЫ ПРЕДЫДУЩАЯ НИЧЕГО НЕ ДОКАЗЫВАЕТ. Совпасть доли могли бы и
   * по случайности. Настоящее доказательство в том, что РАВЕНСТВО ДОЛЕЙ КУПЛЕНО
   * РАЗНЫМИ СТУПЕНЯМИ: быстрый оседает на маленькой задержке, медленный на
   * большой. Именно этого прежняя игра сделать не могла — там ступень была одна
   * на всех, назначенная уровнем.
   */
  it('🔴 равные доли куплены РАЗНЫМИ ступенями задержки', () => {
    const [fast, mid, slow] = settledPlayers.map((s) => s.meanSsd);
    expect(`быстрый<средний<медленный: ${fast < mid && mid < slow}`).toBe('быстрый<средний<медленный: true');
    expect(`разница медленный−быстрый ≥ 200 мс: ${slow - fast >= 200}`).toBe('разница медленный−быстрый ≥ 200 мс: true');
  });

  /**
   * Распределение ступеней: у каждого игрока лестница стоит на своей паре
   * соседних значений сетки, и обе занимают вместе почти весь прогон. Это и есть
   * картинка схождения — не «где-то около», а «топчется вокруг одной точки».
   */
  it('🔴 распределение ступеней сжато: три самые частые ступени держат ≥ 65% времени', () => {
    const thin: string[] = [];
    for (const s of settledPlayers) {
      const hist = new Map<number, number>();
      for (const v of s.trace) hist.set(v, (hist.get(v) ?? 0) + 1);
      const top = [...hist.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
      if (top / s.trace.length < 0.65) thin.push(`${s.player.name}: ${pct(top / s.trace.length)}%`);
    }
    expect(thin).toEqual([]);
  });

  it('🔴 ступени не упёрлись в границы — иначе «схождение» было бы упором в стенку', () => {
    const stuck = settledPlayers
      .filter((s) => s.meanSsd <= SSD_MIN_MS + SSD_STEP_MS || s.meanSsd >= SSD_MAX_MS - SSD_STEP_MS)
      .map((s) => `${s.player.name}: ${Math.round(s.meanSsd)} мс`);
    expect(stuck).toEqual([]);
  });
});

// ─── 2. SSRT восстанавливает ЗАДАННОЕ время торможения ──────────────────────

describe('SSRT считает то, что заявлено', () => {
  it('🔴 у игрока с заданным временем торможения оценка восстанавливает заданное', () => {
    const off: string[] = [];
    for (let i = 0; i < PLAYERS.length; i += 1) {
      const p = PLAYERS[i];
      const s = settled(p, 2000 + i * 11);
      const got = s.estimate.ssrtMs;
      if (got === null) { off.push(`${p.name}: числа нет вовсе (${s.estimate.doubt})`); continue; }
      if (Math.abs(got - p.ssrtMs) > 25) off.push(`${p.name}: ${got} мс против заданных ${p.ssrtMs} мс`);
    }
    expect(off).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ ОТЛИЧИЕ ОТ ПРЕЖНЕГО «СЧЁТА»: число обязано НЕ ЗАВИСЕТЬ от скорости
   * руки. Быстрый и медленный игроки с одним и тем же временем торможения обязаны
   * получить один и тот же SSRT, хотя их времена реакции различаются на 320 мс.
   */
  it('🔴 SSRT не зависит от базовой скорости реакции', () => {
    const got = PLAYERS.map((p, i) => settled(p, 3000 + i * 13).estimate);
    const values = got.map((e) => e.ssrtMs ?? -1);
    const rtSpread = Math.max(...got.map((e) => e.meanGoRtMs)) - Math.min(...got.map((e) => e.meanGoRtMs));
    const ssrtSpread = Math.max(...values) - Math.min(...values);
    expect(`реакции разошлись на ≥ 250 мс: ${rtSpread >= 250}`).toBe('реакции разошлись на ≥ 250 мс: true');
    expect(`SSRT разошлись ≤ 30 мс: ${ssrtSpread <= 30}`).toBe('SSRT разошлись ≤ 30 мс: true');
  });

  /**
   * 🔴 РАЗНОЕ ВРЕМЯ ТОРМОЖЕНИЯ ОБЯЗАНО ДАВАТЬ РАЗНЫЙ SSRT — иначе показатель не
   * измеряет ничего и просто держится вокруг одного числа.
   */
  it('🔴 игрок, который тормозит вдвое медленнее, получает заметно больший SSRT', () => {
    const quick = settled({ name: 'q', goMeanMs: 520, goSdMs: 90, ssrtMs: 160, ssrtSdMs: 25 }, 4100);
    const sluggish = settled({ name: 's', goMeanMs: 520, goSdMs: 90, ssrtMs: 320, ssrtSdMs: 25 }, 4200);
    const a = quick.estimate.ssrtMs ?? 0;
    const b = sluggish.estimate.ssrtMs ?? 0;
    expect(`${Math.abs(a - 160) <= 25} · ${Math.abs(b - 320) <= 25} · ${b - a >= 120}`).toBe('true · true · true');
  });
});

// ─── 3. задержка принадлежит лестнице, а не уровню ──────────────────────────

describe('задержка принадлежит лестнице, а не уровню', () => {
  /**
   * 🔴 ПРЯМАЯ ПРОБА НА ВЕРНУВШИЙСЯ ДЕФЕКТ §2.1. Один и тот же игрок проходит
   * первый и пятнадцатый уровень. Если задержку снова начнёт назначать уровень,
   * ступени разойдутся — а они обязаны совпасть, потому что игрок не изменился.
   */
  it('🔴 один игрок на уровнях 1 и 15 оседает на ОДНОЙ ступени задержки', () => {
    const p = PLAYERS[0];
    const l1 = levelParams(1);
    const l15 = levelParams(15);
    const a = settled(p, 5000, l1.goWindowMs);
    const b = settled(p, 5000, l15.goWindowMs);
    expect(`ступени сошлись в пределах шага: ${Math.abs(a.meanSsd - b.meanSsd) <= SSD_STEP_MS}`)
      .toBe('ступени сошлись в пределах шага: true');
  });

  it('🔴 доля торможений на уровнях 1 и 15 одна и та же — уровень крутит темп, не мерку', () => {
    const p = PLAYERS[0];
    const a = settled(p, 5100, levelParams(1).goWindowMs);
    const b = settled(p, 5100, levelParams(15).goWindowMs);
    expect(`${pct(a.rate)}% ≈ ${pct(b.rate)}%: ${Math.abs(a.rate - b.rate) <= 0.05}`)
      .toBe(`${pct(a.rate)}% ≈ ${pct(b.rate)}%: true`);
  });

  it('🔴 параметры уровня вообще не содержат поля про задержку', () => {
    const keys = Object.keys(levelParams(7)).filter((k) => /ssd|delay/i.test(k));
    expect(keys).toEqual([]);
  });

  it('🔴 доля стоп-проб одинакова на всех уровнях и равна канонным 25%', () => {
    const wrong: string[] = [];
    for (let lv = 1; lv <= 20; lv += 1) {
      const p = levelParams(lv);
      if (p.stopProb !== STOP_PROB) wrong.push(`уровень ${lv}: ${p.stopProb}`);
    }
    expect([...wrong, STOP_PROB]).toEqual([0.25]);
  });
});

// ─── 4. лестница уровней осталась лестницей ─────────────────────────────────

describe('лестница уровней осталась лестницей', () => {
  const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

  it('🔴 пятнадцатый уровень строго плотнее первого по каждой из трёх осей', () => {
    const a = levelParams(1);
    const b = levelParams(15);
    expect([
      b.goWindowMs < a.goWindowMs,
      b.fixMinMs < a.fixMinMs,
      b.interTrialMs < a.interTrialMs,
    ]).toEqual([true, true, true]);
  });

  it('🔴 ни одна ось не растёт по дороге — иначе где-то посередине становится легче', () => {
    const bumps: string[] = [];
    for (let i = 1; i < LEVELS.length; i += 1) {
      const prev = levelParams(LEVELS[i - 1]);
      const cur = levelParams(LEVELS[i]);
      if (cur.goWindowMs > prev.goWindowMs) bumps.push(`окно выросло на ${LEVELS[i]}`);
      if (cur.fixMinMs > prev.fixMinMs) bumps.push(`пауза выросла на ${LEVELS[i]}`);
      if (cur.interTrialMs > prev.interTrialMs) bumps.push(`промежуток вырос на ${LEVELS[i]}`);
      if (cur.trials < prev.trials) bumps.push(`проб стало меньше на ${LEVELS[i]}`);
    }
    expect(bumps).toEqual([]);
  });

  it('🔴 разница первого и пятнадцатого ощутима, а не косметическая', () => {
    const a = levelParams(1);
    const b = levelParams(15);
    expect([
      a.goWindowMs - b.goWindowMs >= 500,
      a.fixMinMs - b.fixMinMs >= 250,
      b.trials > a.trials,
    ]).toEqual([true, true, true]);
  });

  it('окно ответа не опускается ниже времени реакции живого человека', () => {
    const tooTight = LEVELS.filter((lv) => levelParams(lv).goWindowMs < 600);
    expect(tooTight).toEqual([]);
  });
});

// ─── 5. ход лестницы: ровно один вверх и ровно один вниз ────────────────────

describe('ход лестницы', () => {
  it('🔴 удержался — задержка растёт, сорвался — падает', () => {
    expect([nextSsd(300, true), nextSsd(300, false)]).toEqual([300 + SSD_STEP_MS, 300 - SSD_STEP_MS]);
  });

  it('🔴 шаг ровно 50 мс в обе стороны, а не «чуть-чуть» и не «сразу к потолку»', () => {
    const up = nextSsd(300, true) - 300;
    const down = 300 - nextSsd(300, false);
    expect([up, down]).toEqual([SSD_STEP_MS, SSD_STEP_MS]);
  });

  it('🔴 границы держат: ниже 50 мс и выше 700 мс лестница не уходит', () => {
    expect([nextSsd(SSD_MIN_MS, false), nextSsd(SSD_MAX_MS, true)]).toEqual([SSD_MIN_MS, SSD_MAX_MS]);
  });

  it('старт лестницы — 250 мс, и он внутри границ', () => {
    expect([SSD_START_MS > SSD_MIN_MS, SSD_START_MS < SSD_MAX_MS, SSD_START_MS]).toEqual([true, true, 250]);
  });

  /**
   * 🔴 ОДНОСТОРОННЯЯ ЛЕСТНИЦА — ЭТО ОТСУТСТВИЕ ЛЕСТНИЦЫ, и вот чем она кончается.
   * Прогон тем же игроком, но с шагом только вверх: задержка упирается в потолок
   * и торможение перестаёт удаваться вовсе. Проба стоит здесь, чтобы «шаг в одну
   * сторону» нельзя было принять за мелкую неточность.
   */
  it('🔴 шаг только вверх убивает замер: доля торможений валится к нулю', () => {
    const oneWay = playRun(PLAYERS[1], {
      trials: 800,
      goWindowMs: 1400,
      startSsdMs: SSD_START_MS,
      seed: 6000,
      advance: (cur) => nextSsd(cur, true),
    });
    const tail = oneWay.trials.slice(400);
    expect(`доля торможений ${pct(inhibitionRate(tail))}% < 15%: ${inhibitionRate(tail) < 0.15}`)
      .toBe(`доля торможений ${pct(inhibitionRate(tail))}% < 15%: true`);
  });

  /**
   * 🔴 И ЗАМОРОЖЕННАЯ ЛЕСТНИЦА — ТОЖЕ. Ступень не двигается вовсе (ровно то, что
   * делал уровень до 23.08.2026): быстрый и медленный расходятся на десятки
   * процентов, и общей мерки не остаётся.
   */
  it('🔴 неподвижная ступень возвращает прежний дефект: быстрый и медленный расходятся', () => {
    const frozen = (cur: number) => cur;
    const rates = PLAYERS.map((p) => inhibitionRate(
      playRun(p, { trials: 800, goWindowMs: 1400, startSsdMs: SSD_START_MS, seed: 7000, advance: frozen }).trials,
    ));
    const spread = Math.max(...rates) - Math.min(...rates);
    expect(`разброс ${pct(spread)} п.п. > 40: ${spread > 0.4}`).toBe(`разброс ${pct(spread)} п.п. > 40: true`);
  });
});

// ─── 6. условия применимости: молчать честнее, чем выдумывать ───────────────

describe('ненадёжную оценку не выдаём молча', () => {
  const goTrial = (rt: number | null): StopSignalTrial => ({ isStop: false, ssdMs: null, rtMs: rt, goWindowMs: 1400 });
  const stopTrial = (ssd: number, rt: number | null): StopSignalTrial => ({ isStop: true, ssdMs: ssd, rtMs: rt, goWindowMs: 1400 });

  it('🔴 пустая история не даёт ни числа, ни падения', () => {
    const e = estimateSsrt([]);
    expect([e.ssrtMs, e.trustworthy, e.doubt]).toEqual([null, false, 'noStopTrials']);
  });

  it('🔴 партия из двадцати проб одна числа НЕ даёт — стоп-проб в ней три-пять', () => {
    const run = playRun(PLAYERS[1], { trials: 20, goWindowMs: 1400, startSsdMs: SSD_START_MS, seed: 8000 });
    const e = estimateSsrt(run.trials);
    expect([countStopTrials(run.trials) < MIN_STOP_TRIALS, e.ssrtMs, e.doubt])
      .toEqual([true, null, 'tooFewStopTrials']);
  });

  it('🔴 лестница не сошлась (торможений 10%) — числа нет, названа причина', () => {
    const trials: StopSignalTrial[] = [];
    for (let i = 0; i < 40; i += 1) trials.push(goTrial(400 + i * 5));
    for (let i = 0; i < 20; i += 1) trials.push(stopTrial(200, i < 18 ? 350 + i : null));
    const e = estimateSsrt(trials);
    expect([e.doubt, e.ssrtMs, e.pRespond > P_RESPOND_MAX]).toEqual(['pRespondOffTarget', null, true]);
  });

  it('🔴 зеркальный край (торможений 95%) тоже отсекается', () => {
    const trials: StopSignalTrial[] = [];
    for (let i = 0; i < 40; i += 1) trials.push(goTrial(400 + i * 5));
    for (let i = 0; i < 20; i += 1) trials.push(stopTrial(200, i < 1 ? 350 : null));
    const e = estimateSsrt(trials);
    expect([e.doubt, e.ssrtMs, e.pRespond < P_RESPOND_MIN]).toEqual(['pRespondOffTarget', null, true]);
  });

  it('🔴 нарушенная модель гонки отсекается: на сорванных стопах реакция медленнее обычной', () => {
    const trials: StopSignalTrial[] = [];
    for (let i = 0; i < 40; i += 1) trials.push(goTrial(400 + i));
    for (let i = 0; i < 20; i += 1) trials.push(stopTrial(200, i < 10 ? 900 + i : null));
    const e = estimateSsrt(trials);
    expect([e.doubt, e.ssrtMs, e.meanFailedStopRtMs > e.meanGoRtMs]).toEqual(['raceModelViolated', null, true]);
  });

  it('🔴 гора пропущенных GO отсекается: каждый пропуск тянет оценку вниз', () => {
    const trials: StopSignalTrial[] = [];
    for (let i = 0; i < 30; i += 1) trials.push(goTrial(400 + i));
    for (let i = 0; i < 10; i += 1) trials.push(goTrial(null));
    for (let i = 0; i < 20; i += 1) trials.push(stopTrial(200, i < 10 ? 350 + i : null));
    const e = estimateSsrt(trials);
    expect([e.doubt, e.ssrtMs]).toEqual(['tooManyOmissions', null]);
  });

  it('🔴 годный расклад проходит все четыре условия и число отдаёт', () => {
    const s = settled(PLAYERS[1], 9000);
    expect([s.estimate.trustworthy, s.estimate.doubt, s.estimate.ssrtMs === null])
      .toEqual([true, null, false]);
  });

  it('пропущенный GO входит в расчёт как самый медленный ответ, а не выбрасывается', () => {
    const withMiss = estimateSsrt([goTrial(300), goTrial(null), ...Array.from({ length: 20 }, (_, i) => stopTrial(200, i < 10 ? 280 : null))]);
    const withoutMiss = estimateSsrt([goTrial(300), ...Array.from({ length: 20 }, (_, i) => stopTrial(200, i < 10 ? 280 : null))]);
    expect(withMiss.goTrials - withoutMiss.goTrials).toBe(1);
    expect(withMiss.goOmissions).toBe(1);
  });
});

// ─── 7. окно проб живёт дольше партии ───────────────────────────────────────

describe('окно проб переживает партию', () => {
  const trial = (i: number): StopSignalTrial => ({ isStop: i % 4 === 0, ssdMs: i % 4 === 0 ? 250 : null, rtMs: 400, goWindowMs: 1400 });

  it('🔴 пробы копятся между заходами — иначе лестница никогда не сойдётся', () => {
    let pool: StopSignalTrial[] = [];
    for (let run = 0; run < 6; run += 1) {
      pool = appendTrials(pool, Array.from({ length: 20 }, (_, i) => trial(run * 20 + i)));
    }
    expect([pool.length, countStopTrials(pool) >= MIN_STOP_TRIALS]).toEqual([120, true]);
  });

  it('🔴 окно не растёт без предела: старое вытесняется новым', () => {
    let pool: StopSignalTrial[] = [];
    for (let run = 0; run < 40; run += 1) {
      pool = appendTrials(pool, Array.from({ length: 20 }, (_, i) => trial(i)));
    }
    expect(pool.length).toBe(POOL_MAX_TRIALS);
  });

  it('🔴 мусор в хранилище даёт пустую лестницу, а не падение посреди партии', () => {
    expect(parseLadder(null)).toEqual({ ssdMs: SSD_START_MS, trials: [] });
    expect(parseLadder('{ ломаный json')).toEqual({ ssdMs: SSD_START_MS, trials: [] });
    expect(parseLadder('{"ssdMs":"нет","trials":"нет"}')).toEqual({ ssdMs: SSD_START_MS, trials: [] });
  });

  it('🔴 сохранённая ступень возвращается зажатой в границы', () => {
    expect(parseLadder('{"ssdMs":5000,"trials":[]}').ssdMs).toBe(SSD_MAX_MS);
    expect(parseLadder('{"ssdMs":-40,"trials":[]}').ssdMs).toBe(SSD_MIN_MS);
  });

  it('сохранённая проба возвращается целиком, включая пропуск ответа', () => {
    const raw = JSON.stringify({ ssdMs: 300, trials: [{ isStop: true, ssdMs: 300, rtMs: null, goWindowMs: 1200 }] });
    expect(parseLadder(raw)).toEqual({ ssdMs: 300, trials: [{ isStop: true, ssdMs: 300, rtMs: null, goWindowMs: 1200 }] });
  });
});

// ─── 8. самопроверка модели ─────────────────────────────────────────────────

/**
 * ⚠️ ПРОБЫ ВЫШЕ СТОЯТ РОВНО СТОЛЬКО, СКОЛЬКО СТОИТ МОДЕЛЬНЫЙ ИГРОК. Сломанный
 * генератор (всегда одно и то же число, нулевой разброс) сделал бы зелёными
 * почти все проверки выше — просто потому, что сравнивать стало бы нечего.
 */
describe('модельный игрок и правда играет', () => {
  it('генератор воспроизводим: одно семя — один и тот же прогон', () => {
    const a = playRun(PLAYERS[0], { trials: 50, goWindowMs: 1400, startSsdMs: 250, seed: 42 });
    const b = playRun(PLAYERS[0], { trials: 50, goWindowMs: 1400, startSsdMs: 250, seed: 42 });
    expect(a.trials).toEqual(b.trials);
  });

  it('разные семена дают разные прогоны — иначе это не случайность', () => {
    const a = playRun(PLAYERS[0], { trials: 50, goWindowMs: 1400, startSsdMs: 250, seed: 1 });
    const b = playRun(PLAYERS[0], { trials: 50, goWindowMs: 1400, startSsdMs: 250, seed: 2 });
    expect(a.trials).not.toEqual(b.trials);
  });

  it('доля стоп-проб у модельного игрока близка к заявленной', () => {
    const run = playRun(PLAYERS[0], { trials: 4000, goWindowMs: 1400, startSsdMs: 250, seed: 99 });
    const share = countStopTrials(run.trials) / run.trials.length;
    expect(`${Math.abs(share - STOP_PROB) < 0.03}`).toBe('true');
  });

  it('времена реакции трёх игроков и правда разные', () => {
    const means = PLAYERS.map((p) => {
      const run = playRun(p, { trials: 600, goWindowMs: 1400, startSsdMs: 250, seed: 77 });
      const rts = run.trials.filter((t) => !t.isStop && t.rtMs !== null).map((t) => t.rtMs as number);
      return Math.round(mean(rts));
    });
    expect(`${means[0] < means[1] && means[1] < means[2]}`).toBe('true');
  });
});
