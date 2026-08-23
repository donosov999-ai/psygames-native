/* psygames-conflict-ratio-is-not-difficulty · VER 1 · 23.08.2026 */
/**
 * 🔴 РУЧКА СЛОЖНОСТИ НЕ ИМЕЕТ ПРАВА УМЕНЬШАТЬ ИЗМЕРЯЕМОЕ.
 *
 * В конфликтных парадигмах величина эффекта задаётся ДОЛЕЙ ПРОБ. Струп меряет
 * разницу времён между конгруэнтными и конфликтными пробами, Simon — между
 * совпадающими и несовпадающими, Познер — между валидной и неверной подсказкой,
 * go/no-go — торможение ПРЕОБЛАДАЮЩЕЙ реакции, CPT — реакцию на РЕДКУЮ цель.
 * Во всех пяти случаях доля стоит в знаменателе смысла: подняли долю конфликтных
 * — уменьшили эффект, ради которого игра существует.
 *
 * До 23.08.2026 все пять игр крутили сложность именно этой ручкой:
 *   струп  50 → 90 % конфликтных · simon 35 → 80 % · познер 80 → 50 % валидных ·
 *   go/no-go 20 → 42 % запретных · CPT 28 → 32 % целей.
 * То есть «сложнее» означало «измерение хуже», и одинаково в пяти играх сразу.
 * Правило при этом в проекте БЫЛО — прямым текстом в `iowa.tsx`: методика с
 * популяционными нормами осмысленна только потому, что условие у всех одинаковое.
 * Оно просто не разошлось на остальные игры.
 *
 * ⚠️ ЭТОТ ГЕЙТ СЧИТАЕТ ВЕЛИЧИНУ, А НЕ ЧИТАЕТ ИСХОДНИК. Регулярка по тексту
 * поймала бы одну знакомую формулу и пропустила любую новую запись той же беды —
 * а беда не в форме текста, а в поведении. Поэтому здесь МОДЕЛИРУЕТСЯ поток проб
 * настоящими генераторами игр (`makeTrial`/`pickStim` по номеру уровня), и по
 * сгенерированным пробам считается ровно то число, от которого зависит биомаркер.
 *
 * ⚠️ ЗЕРНО ОДНО И ТО ЖЕ ДЛЯ КАЖДОГО УРОВНЯ. Тогда у игры, где доли от уровня не
 * зависят, потоки проб на L1 и на L15 совпадают ПОБАЙТОВО, и сравнение уровней
 * идёт без шума выборки: любое расхождение означает, что уровень на доли влияет.
 * У CPT ветка генератора зависит от уровня по существу (X-режим против AX), там
 * сравнение идёт с допуском в один процентный пункт.
 *
 * Вторая половина гейта — что лестница осталась лестницей: пятнадцатый уровень
 * обязан быть строго труднее первого по темпу, окну ответа или объёму, и ни одна
 * ось не имеет права поехать в лёгкую сторону.
 */
import { levelParams as stroopParams, makeTrial as stroopTrial, INCONGRUENT_RATIO } from '@/app/games/stroop';
import { levelParams as simonParams, makeTrial as simonTrial, INCONGRUENT_PROB } from '@/app/games/simon';
import { levelParams as posnerParams, makeTrial as posnerTrial, VALID_RATIO } from '@/app/games/posner';
import { levelParams as goParams, pickStim, NOGO_PROB } from '@/app/games/go-no-go';
import { levelParams as cptParams, makeTrial as cptTrial, TARGET_RATE } from '@/app/games/cpt';

const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);
const N = 40000;              // проб на замер: ошибка выборки ≈ 0.2 п.п.
const TOL = 0.01;             // допуск сравнения долей — один процентный пункт
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** mulberry32 — короткий детерминированный ГПСЧ, чтобы замер не плавал от прогона к прогону. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260823;
const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

/** Доля проб, на которых выполняется признак. Зерно одно и то же на каждом уровне. */
function share(count: (i: number) => boolean): number {
  Math.random = seeded(SEED);
  let hits = 0;
  for (let i = 0; i < N; i++) if (count(i)) hits++;
  Math.random = realRandom;
  return hits / N;
}

// ─── что именно меряется в каждой игре ────────────────────────────────────
// Струп: interference_ms = RT(конфликтные) − RT(конгруэнтные). Знаменатель
// смысла — доля КОНГРУЭНТНЫХ: их не должно становиться меньше с уровнем.
const stroopCongruent = (level: number) => share(() => stroopTrial(level).congruent);
// Simon: simon_effect_ms = RT(несовпад) − RT(совпад). Считаем СОВПАДАЮЩИЕ.
const simonCongruent = (level: number) => share(() => simonTrial(level).kind === 'congruent');
// Познер: validity_effect_ms существует, только пока подсказка информативна.
const posnerValid = (level: number) => share(() => posnerTrial(level).validity === 'valid');
const posnerInvalid = (level: number) => share(() => posnerTrial(level).validity === 'invalid');
// Go/No-Go: тормозить можно только преобладающую реакцию — считаем долю GO.
const goPrepotent = (level: number) => share(() => pickStim(level) === 'go');
// CPT: проба бдительности требует РЕДКОЙ цели. Поток связный (AX смотрит назад).
function cptTargets(level: number): number {
  Math.random = seeded(SEED);
  let prev = '';
  let targets = 0;
  for (let i = 0; i < N; i++) {
    const trial = cptTrial(level, prev);
    prev = trial.letter;
    if (trial.isTarget) targets++;
  }
  Math.random = realRandom;
  return targets / N;
}

/** Сколько проб CPT успевает дать за партию: окно ответа = ещё один ISI. */
const cptTrialBudget = (level: number) => {
  const p = cptParams(level);
  return Math.floor((p.durationSec * 1000) / (p.isiMs * 2));
};

describe('🔴 доля проб задаёт величину эффекта — и потому не может быть ручкой сложности', () => {
  it('Струп: конгруэнтных проб на пятнадцатом уровне не меньше, чем на первом', () => {
    const byLevel = LEVELS.map(stroopCongruent);
    const [first, last] = [byLevel[0], byLevel[14]];
    const drop = Math.max(0, first - last);
    expect(`конгруэнтных L1 ${pct(first)} → L15 ${pct(last)}, падение ${pct(drop)}`)
      .toBe(`конгруэнтных L1 ${pct(first)} → L15 ${pct(last)}, падение 0.0%`);
    // и ни на одном уровне между ними доля не проседает
    expect(Math.min(...byLevel)).toBeGreaterThanOrEqual(first - TOL);
    // канон парадигмы: равные доли
    expect(Math.abs(last - (1 - INCONGRUENT_RATIO))).toBeLessThan(TOL);
  });

  it('Simon: совпадающих проб на пятнадцатом уровне не меньше, чем на первом', () => {
    const byLevel = LEVELS.map(simonCongruent);
    const [first, last] = [byLevel[0], byLevel[14]];
    expect(`совпадающих L1 ${pct(first)} → L15 ${pct(last)}, падение ${pct(Math.max(0, first - last))}`)
      .toBe(`совпадающих L1 ${pct(first)} → L15 ${pct(last)}, падение 0.0%`);
    expect(Math.min(...byLevel)).toBeGreaterThanOrEqual(first - TOL);
    expect(Math.abs(last - (1 - INCONGRUENT_PROB))).toBeLessThan(TOL);
  });

  it('Познер: подсказка остаётся информативной на всех уровнях', () => {
    const valid = LEVELS.map(posnerValid);
    const invalid = LEVELS.map(posnerInvalid);
    const [first, last] = [valid[0], valid[14]];
    expect(`валидных L1 ${pct(first)} → L15 ${pct(last)}, падение ${pct(Math.max(0, first - last))}`)
      .toBe(`валидных L1 ${pct(first)} → L15 ${pct(last)}, падение 0.0%`);
    // «Информативность» — это доля валидных среди НАПРАВЛЕННЫХ подсказок:
    // нейтральная проба («+») ни на что не указывает и в счёт не идёт.
    LEVELS.forEach((L, i) => {
      const informative = valid[i] / (valid[i] + invalid[i]);
      expect(`L${L} валидных среди направленных ${informative >= 0.7}`).toBe(`L${L} валидных среди направленных true`);
    });
    expect(Math.abs(last - VALID_RATIO)).toBeLessThan(TOL);
  });

  it('Go/No-Go: преобладающая реакция остаётся преобладающей', () => {
    const byLevel = LEVELS.map(goPrepotent);
    const [first, last] = [byLevel[0], byLevel[14]];
    expect(`GO-проб L1 ${pct(first)} → L15 ${pct(last)}, падение ${pct(Math.max(0, first - last))}`)
      .toBe(`GO-проб L1 ${pct(first)} → L15 ${pct(last)}, падение 0.0%`);
    // тормозить нечего, если «жать» не стало привычкой: канон — 20-25 % запретных
    expect(Math.min(...byLevel)).toBeGreaterThanOrEqual(0.7);
    expect(Math.abs(last - (1 - NOGO_PROB))).toBeLessThan(TOL);
  });

  it('CPT: цель остаётся редкой — доля целей с уровнем НЕ растёт', () => {
    const byLevel = LEVELS.map(cptTargets);
    const [first, last] = [byLevel[0], byLevel[14]];
    const rise = Math.max(0, last - first);
    expect(`целей L1 ${pct(first)} → L15 ${pct(last)}, рост ${rise <= TOL ? 'в пределах выборки' : pct(rise)}`)
      .toBe(`целей L1 ${pct(first)} → L15 ${pct(last)}, рост в пределах выборки`);
    // 10-20 % — канон бдительности: реже нечего усреднять, чаще это уже не бдительность
    LEVELS.forEach((L, i) => {
      expect(`L${L} доля целей ${byLevel[i].toFixed(3)} в коридоре 0.10..0.25: ${byLevel[i] >= 0.1 && byLevel[i] <= 0.25}`)
        .toBe(`L${L} доля целей ${byLevel[i].toFixed(3)} в коридоре 0.10..0.25: true`);
    });
    expect(Math.abs(last - TARGET_RATE)).toBeLessThan(TOL);
  });
});

describe('и мерить по-прежнему есть по чему — сколько проб редкого класса даёт партия', () => {
  /**
   * Доля сама по себе ничего не гарантирует: 50 % от четырёх проб — это две.
   * Поэтому отдельно считается ЧИСЛО проб того класса, которого меньше, — именно
   * оно стоит в знаменателе среднего, из которого вычитают.
   */
  it('Струп и Simon: конгруэнтных проб на партию хватает и с уровнем их больше', () => {
    const stroop = LEVELS.map((L) => stroopParams(L).trials * stroopCongruent(L));
    const simon = LEVELS.map((L) => simonParams(L).trials * simonCongruent(L));
    expect(`струп L1 ${stroop[0].toFixed(1)} → L15 ${stroop[14].toFixed(1)} конгруэнтных проб`)
      .toBe(`струп L1 ${stroop[0].toFixed(1)} → L15 ${stroop[14].toFixed(1)} конгруэнтных проб`);
    expect(Math.min(...stroop)).toBeGreaterThanOrEqual(8);
    expect(Math.min(...simon)).toBeGreaterThanOrEqual(7);
    expect(stroop[14]).toBeGreaterThan(stroop[0]);
    expect(simon[14]).toBeGreaterThan(simon[0]);
  });

  it('Познер: неверных подсказок на партию не становится меньше', () => {
    const invalid = LEVELS.map((L) => posnerParams(L).trials * posnerInvalid(L));
    expect(invalid[14]).toBeGreaterThan(invalid[0]);
    /**
     * ⚠️ ДОЛГ, НАЗВАННЫЙ ВСЛУХ: три неверные подсказки на первом уровне — это
     * мало для `validity_effect_ms`, и гейт не делает вид, что это норма. До
     * правки их было 0.6 (валидных 80 %, нейтральных 15 % → на неверные 5 %),
     * то есть эффект считался по НУЛЮ наблюдений в большинстве партий. Довести
     * до устойчивого замера — это ≥40 проб на партию, отдельное решение о
     * длине игры, а не побочный эффект этой правки.
     */
    expect(Math.min(...invalid)).toBeGreaterThanOrEqual(3);
  });

  it('Go/No-Go и CPT: запретных проб и целей на партию хватает', () => {
    const nogo = LEVELS.map((L) => goParams(L).trials * (1 - goPrepotent(L)));
    const targets = LEVELS.map((L) => cptTrialBudget(L) * cptTargets(L));
    expect(Math.min(...nogo)).toBeGreaterThanOrEqual(5);
    expect(nogo[14]).toBeGreaterThan(nogo[0]);
    expect(Math.min(...targets)).toBeGreaterThanOrEqual(5);
  });
});

describe('лестница осталась лестницей — вес сложности перенесён на темп, окно и объём', () => {
  /** Оси, по которым разрешено крутить сложность: окно ответа, темп подачи, объём. */
  interface Axes { windowMs: number; tempoMs: number | null; trials: number }
  const AXES: Record<string, (level: number) => Axes> = {
    stroop: (L) => ({ windowMs: stroopParams(L).windowMs, tempoMs: null, trials: stroopParams(L).trials }),
    simon: (L) => {
      const p = simonParams(L);
      return { windowMs: p.windowMs, tempoMs: p.preMinMs + p.preJitterMs / 2, trials: p.trials };
    },
    posner: (L) => ({ windowMs: posnerParams(L).windowMs, tempoMs: null, trials: posnerParams(L).trials }),
    'go-no-go': (L) => {
      const p = goParams(L);
      return { windowMs: p.windowMs, tempoMs: p.itiMinMs + p.itiJitterMs / 2, trials: p.trials };
    },
  };

  it('пятнадцатый уровень строго труднее первого', () => {
    for (const [game, axes] of Object.entries(AXES)) {
      const a = axes(1), b = axes(15);
      const harder = b.windowMs < a.windowMs || b.trials > a.trials
        || (a.tempoMs !== null && b.tempoMs !== null && b.tempoMs < a.tempoMs);
      expect(`${game}: окно ${a.windowMs}→${b.windowMs}мс, проб ${a.trials}→${b.trials}, труднее: ${harder}`)
        .toBe(`${game}: окно ${a.windowMs}→${b.windowMs}мс, проб ${a.trials}→${b.trials}, труднее: true`);
    }
  });

  it('ни одна ось не едет в лёгкую сторону', () => {
    for (const [game, axes] of Object.entries(AXES)) {
      for (let L = 2; L <= 15; L++) {
        const prev = axes(L - 1), cur = axes(L);
        expect(`${game} L${L}: окно ${cur.windowMs} ≤ ${prev.windowMs}`).toBe(`${game} L${L}: окно ${cur.windowMs} ≤ ${prev.windowMs}`);
        expect(cur.windowMs).toBeLessThanOrEqual(prev.windowMs);
        expect(cur.trials).toBeGreaterThanOrEqual(prev.trials);
        if (cur.tempoMs !== null && prev.tempoMs !== null) expect(cur.tempoMs).toBeLessThanOrEqual(prev.tempoMs);
      }
    }
  });

  it('CPT: темп, режим и перцептивная нагрузка растут — длительность и доля целей неизменны', () => {
    const a = cptParams(1), b = cptParams(15);
    expect(`ISI ${a.isiMs}→${b.isiMs}мс, режим ${a.mode}→${b.mode}, похожих букв ${a.confusableRatio}→${b.confusableRatio}`)
      .toBe(`ISI ${a.isiMs}→${b.isiMs}мс, режим X→AX, похожих букв 0→0.5`);
    expect(b.isiMs).toBeLessThan(a.isiMs);
    expect(b.durationSec).toBe(a.durationSec);
    /**
     * Темп падает ВНУТРИ полосы уровней, а на границе полосы намеренно
     * отпускается — потому что там прибавляется задача: L5→L6 включается
     * AX-режим (держать в уме предыдущую букву), L10→L11 добавляются буквы,
     * похожие на X. Требовать монотонности ISI сквозь границу значило бы
     * требовать, чтобы новая нагрузка приходила бесплатно.
     */
    for (const band of [[1, 5], [6, 10], [11, 15]]) {
      for (let L = band[0] + 1; L <= band[1]; L++) {
        expect(cptParams(L).isiMs).toBeLessThanOrEqual(cptParams(L - 1).isiMs);
      }
    }
    expect(`L5→L6 режим ${cptParams(5).mode}→${cptParams(6).mode}`).toBe('L5→L6 режим X→AX');
    expect(cptParams(11).confusableRatio).toBeGreaterThan(cptParams(10).confusableRatio);
  });
});
