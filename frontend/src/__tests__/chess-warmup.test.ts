/**
 * 🔴 ШАХМАТНАЯ ЗАРЯДКА — ПРОВЕРЯЕМ ТРИ ТРЕБОВАНИЯ ОТЧЁТА, А НЕ «СОБРАЛОСЬ».
 *
 * Отчёт Дениса 05.09.2026: «Надо стерео типа зарядки собрать и с обоих этих
 * штук и чтобы они типа потекли по уровням и желательно чтобы можно было
 * задавать время типа как в режиме потока». Каждое из трёх — отдельная проба.
 */
import { estimateStepSec } from '@/src/services/gameDuration';
import {
  chessWarmupSteps, buildChessWarmup, wordWarmupSteps, buildWordWarmup,
  ДЛИТЕЛЬНОСТИ, ШАГ_МАТ_СЕК, ШАГ_ДОСКА_СЕК, ШАГ_ФИЛВОРДЫ_СЕК,
} from '@/src/services/chessWarmup';

// Список длительностей берётся из самого устройства зарядки, а не переписывается.

describe('шахматная зарядка', () => {
  it('🔴 «с обоих этих штук»: в наборе есть и «Доска в уме», и «Детский мат»', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const игры = new Set(chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 }).map((s) => s.game_id));
      if (!игры.has('scholars_mate')) плохо.push(`${m} мин: нет «Детского мата»`);
      if (!игры.has('chess_blind')) плохо.push(`${m} мин: нет «Доски в уме»`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 упражнения ЧЕРЕДУЮТСЯ — два подряд одинаковых это не зарядка', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const s = chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 });
      for (let i = 1; i < s.length; i++) {
        if (s[i]!.game_id === s[i - 1]!.game_id) плохо.push(`${m} мин: шаги ${i}–${i + 1} оба ${s[i]!.game_id}`);
      }
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 «потекли по уровням»: у каждого шага уровень СВОЕЙ игры, а не общий', () => {
    const s = chessWarmupSteps({ minutes: 15, blindLevel: 4, mateLevel: 31 });
    const плохо = s.filter((x) => {
      const ждём = x.game_id === 'scholars_mate' ? 31 : 4;
      return Number(x.settings?.level) !== ждём;
    }).map((x) => `${x.game_id}: уровень ${x.settings?.level}`);
    expect(плохо).toEqual([]);
  });

  it('🔴 «задавать время»: набор укладывается в выбранную длительность', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const шаги = chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 });
      // Считаем ПО ЗАМЕРУ (медиана живых партий + переход), как и сам набор с 09.09.2026:
      // объявленные числа здесь больше не длительность, а запасной вариант без снимка.
      const total = шаги.reduce((a, x) => a + estimateStepSec(x), 0);
      const самыйДлинный = Math.max(...шаги.map((x) => estimateStepSec(x)));
      // Ровно в секунду не попасть — шаги неделимы. Но перебор больше чем на
      // половину самого длинного шага означал бы, что заданное время не значит ничего.
      if (total > m * 60 + самыйДлинный / 2) плохо.push(`${m} мин: набралось ${total} с`);
      if (total < m * 60 * 0.5) плохо.push(`${m} мин: набралось всего ${total} с`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 время набирается по ЗАМЕРУ живых партий, а не по объявленному числу (задача 2f8f4444)', () => {
    // Слова: анаграммы объявлены как 90 с, а медиана живых партий 188 (+12 переход).
    // Набор по объявлению уложил бы в десять минут вдвое больше анаграмм, чем человек
    // успеет, и «десять минут» стали бы четырнадцатью. Проверяем сумму ПО ЗАМЕРУ.
    const шаги = wordWarmupSteps({ minutes: 10, anagramsLevel: 3, proofreadingLevel: 3 });
    // Проба осмысленна, только если замер и объявление расходятся хотя бы у одного шага.
    expect(шаги.some((x) => estimateStepSec(x) !== x.est_duration_sec)).toBe(true);
    const поЗамеру = шаги.reduce((a, x) => a + estimateStepSec(x), 0);
    const самыйДлинный = Math.max(...шаги.map((x) => estimateStepSec(x)));
    expect(`10 мин по замеру: ${поЗамеру} с ≤ ${600 + самыйДлинный / 2}`)
      .toBe(`10 мин по замеру: ${поЗамеру} с ≤ ${600 + самыйДлинный / 2}`.replace(/^(.*): (\d+) с ≤ (\d+)$/, (_, a, b, c) => `${a}: ${Number(b) <= Number(c) ? b : 'ПЕРЕБОР ' + b} с ≤ ${c}`));
    expect(поЗамеру).toBeGreaterThanOrEqual(300);
  });

  it('🔴 длиннее время — БОЛЬШЕ шагов, иначе выбор ничего не меняет', () => {
    // ⚠️ Здесь стояла ТАВТОЛОГИЯ `expect(X).toBe(X)` — зелёная всегда, что бы ни
    // случилось с набором; работали только два сравнения по индексам, и
    // четвёртая длительность (20 мин, 09.09.2026) не проверялась бы вовсе.
    const n = ДЛИТЕЛЬНОСТИ.map((m) => chessWarmupSteps({ minutes: m, blindLevel: 3, mateLevel: 7 }).length);
    const пары = n.slice(1).map((_, i) => `${ДЛИТЕЛЬНОСТИ[i]}м ${n[i]} → ${ДЛИТЕЛЬНОСТИ[i + 1]}м ${n[i + 1]}`);
    const растёт = n.slice(1).map((_, i) => `${ДЛИТЕЛЬНОСТИ[i]}м ${n[i]} → ${ДЛИТЕЛЬНОСТИ[i + 1]}м ${n[i + 1]! > n[i]! ? n[i + 1] : 'НЕ ВЫРОС'}`);
    expect(растёт).toEqual(пары);
  });

  it('пустого набора не бывает даже на пяти минутах', () => {
    for (const m of ДЛИТЕЛЬНОСТИ) expect(chessWarmupSteps({ minutes: m, blindLevel: 1, mateLevel: 1 }).length).toBeGreaterThan(0);
  });

  it('уровень ниже первого не выдаётся', () => {
    const s = chessWarmupSteps({ minutes: 10, blindLevel: 0, mateLevel: -3 });
    expect(s.every((x) => Number(x.settings?.level) >= 1)).toBe(true);
  });

  it('сборка отдаёт готовый набор с подсчитанным временем', () => {
    const meta = buildChessWarmup({ minutes: 10, blindLevel: 5, mateLevel: 12 });
    expect(meta.steps.length).toBeGreaterThan(0);
    // Итог считается по замеру (медиана + переход), как и сам набор с 09.09.2026.
    expect(meta.est_total_sec).toBe(meta.steps.reduce((a, x) => a + estimateStepSec(x), 0));
    expect(meta.duration_min).toBeGreaterThanOrEqual(5);
    // Оценки длительности берутся из самих упражнений, а не с потолка.
    expect(ШАГ_МАТ_СЕК).toBeLessThan(ШАГ_ДОСКА_СЕК);
  });
});

/**
 * 🔴 СЛОВЕСНАЯ ЗАРЯДКА И ОБЩЕЕ УСТРОЙСТВО.
 *
 * 📍 ПРОСЬБА ДЕНИСА 06.09.2026: «надо зарядку по словам собрать на 5–10 минут;
 * надо по идее выбор сделать в зарядках по времени, чтобы понять, какую серию
 * запускают». Правила у всех тематических зарядок одни, поэтому и устройство
 * одно: своя копия разошлась бы с оригиналом молча.
 */
describe('словесная зарядка', () => {
  const о = { anagramsLevel: 4, proofreadingLevel: 7 };

  it('🔴 в наборе ТРИ разных упражнения, а не три вида одного', () => {
    const игры = new Set(wordWarmupSteps({ ...о, minutes: 15 }).map((s) => s.game_id));
    expect([...игры].sort()).toEqual(['anagrams', 'phonemic_fluency', 'proofreading']);
  });

  it('упражнения чередуются', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const s = wordWarmupSteps({ ...о, minutes: m });
      for (let i = 1; i < s.length; i++) {
        if (s[i]!.game_id === s[i - 1]!.game_id) плохо.push(`${m} мин: шаги ${i}–${i + 1} оба ${s[i]!.game_id}`);
      }
    }
    expect(плохо).toEqual([]);
  });

  it('уровень у каждого шага — из своей игры', () => {
    const плохо = wordWarmupSteps({ ...о, minutes: 15 }).filter((x) => {
      const ждём = x.game_id === 'anagrams' ? 4 : x.game_id === 'proofreading' ? 7 : 1;
      return Number(x.settings?.level) !== ждём;
    }).map((x) => `${x.game_id}: ${x.settings?.level}`);
    expect(плохо).toEqual([]);
  });

  it('🔴 «Корректура» идёт филвордами, а не поиском букв', () => {
    // Иначе словесная зарядка выдавала бы упражнение на внимание вместо слов.
    const шаг = wordWarmupSteps({ ...о, minutes: 15 }).find((x) => x.game_id === 'proofreading')!;
    expect(шаг.settings?.taskMode).toBe('fillwords');
  });

  /**
   * 🔴 И ФИЛВОРДЫ ЛЕЖАТ НЕ В `mode`. Эта проба стоит здесь потому, что раньше
   * проверка выше требовала `mode === 'fillwords'` — и была ЗЕЛЁНОЙ, пока экран
   * падал у живых людей на втором упражнении языковой зарядки (10.09.2026).
   *
   * У «Корректуры» два разных параметра, и оба назывались бы «режим» по-русски:
   *   · `mode`     — АЛФАВИТ: 'cyrillic' | 'latin' | 'digits' и прочие письменности;
   *   · `taskMode` — ЧТО ДЕЛАТЬ: 'letters' | 'fillwords'.
   * Зарядка клала 'fillwords' в `mode`. Ключ читался — поэтому проба на ИМЯ
   * параметра проходила, — но значения такой письменности нет, и экран валился.
   *
   * Отсюда правило: проверять ЗНАЧЕНИЕ в правильном поле, а не наличие поля.
   * Падение целиком ловит `warmup-step-does-not-crash`, монтируя экран с этими же
   * параметрами; здесь — дешёвая проба на само значение.
   */
  it('🔴 «филворды» не лежат в поле алфавита — там их значения не существует', () => {
    const шаг = wordWarmupSteps({ ...о, minutes: 15 }).find((x) => x.game_id === 'proofreading')!;
    expect(шаг.settings?.mode).not.toBe('fillwords');
  });

  it('длиннее время — больше шагов', () => {
    const n = ДЛИТЕЛЬНОСТИ.map((m) => wordWarmupSteps({ ...о, minutes: m }).length);
    const пары = n.slice(1).map((_, i) => `${ДЛИТЕЛЬНОСТИ[i]}м ${n[i]} → ${ДЛИТЕЛЬНОСТИ[i + 1]}м ${n[i + 1]}`);
    const растёт = n.slice(1).map((_, i) => `${ДЛИТЕЛЬНОСТИ[i]}м ${n[i]} → ${ДЛИТЕЛЬНОСТИ[i + 1]}м ${n[i + 1]! > n[i]! ? n[i + 1] : 'НЕ ВЫРОС'}`);
    expect(растёт).toEqual(пары);
  });

  it('набор укладывается в выбранное время', () => {
    const плохо: string[] = [];
    for (const m of ДЛИТЕЛЬНОСТИ) {
      const total = wordWarmupSteps({ ...о, minutes: m }).reduce((a, x) => a + x.est_duration_sec, 0);
      if (total > m * 60 + ШАГ_ФИЛВОРДЫ_СЕК / 2) плохо.push(`${m} мин: ${total} с`);
    }
    expect(плохо).toEqual([]);
  });

  it('сборка отдаёт готовый набор', () => {
    const meta = buildWordWarmup({ ...о, minutes: 10 });
    expect(meta.steps.length).toBeGreaterThan(0);
    // Итог считается по замеру (медиана + переход), как и сам набор с 09.09.2026.
    expect(meta.est_total_sec).toBe(meta.steps.reduce((a, x) => a + estimateStepSec(x), 0));
  });
});
