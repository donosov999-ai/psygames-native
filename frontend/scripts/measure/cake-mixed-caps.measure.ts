/* psygames-cake-mixed-caps-measure · VER 1 · 11.09.2026 */
/**
 * ЗАМЕР, А НЕ ТЕСТ: при каком запасе свободных тарелок доска со СМЕШАННЫМИ
 * кругами (4/6/8) вообще доказуема.
 *
 * ЗАЧЕМ. Вторая ось тортов — разная вместимость тарелки — построена и проверена
 * гейтом `cake-plate-capacity`, но ВЫКЛЮЧЕНА: `MIXED_PLATE_FROM = Infinity`.
 * Причина записана замером 09.09.2026 — на смешанных досках решатель не доказал
 * НИ ОДНОГО уровня из 78 при миллионе узлов. Вопрос, который тогда остался без
 * ответа и закрывается здесь: дело в самой смеси кругов или в тесноте?
 *
 * ГИПОТЕЗА, КОТОРУЮ ПРОВЕРЯЕМ. Круг 8 требует восьми одинаковых секторов, круг 4
 * — четырёх; перекладывать их можно только через СВОБОДНОЕ место, и его на столе
 * ровно `plates − types`. Если дело в тесноте, то доказуемость обязана расти с
 * запасом свободных тарелок и не зависеть от уровня; если дело в самой смеси —
 * не вырастет ни при каком запасе.
 *
 * ⚠️ ПОЧЕМУ КРУГИ СЧИТАЮТСЯ ЗДЕСЬ, А НЕ БЕРУТСЯ ИЗ `capsForPlates`. Та функция
 * при выключенной оси возвращает ВСЕ круги по шесть (`L < MIXED_PLATE_FROM`), то
 * есть замер по ней мерил бы обычные доски и выдал бы бодрые числа ни о чём.
 * Поэтому три строки набора повторены здесь буквально — и если они в игре
 * изменятся, замер надо переснять.
 *
 * ⚠️ БЮДЖЕТ ЧЕСТНЫЙ. `provenSolvable` при исчерпании бюджета отвечает «нет», а
 * не «не знаю»; поэтому при маленьком бюджете таблица врёт в сторону «нельзя».
 * Берём 300 000 узлов — вдесятеро больше боевого (20 000) и втрое больше того,
 * на котором прошлый замер сдался.
 *
 * Запуск:
 *   npx jest --rootDir . scripts/measure/cake-mixed-caps.measure.ts \
 *     --testMatch "<rootDir>/scripts/measure/*.measure.ts" -t "СМЁТ"
 */
import { levelCfg, provenSolvable } from '@/src/games/cake-sort/core/level';
import { makeBoard, CIRCLE, type Plate } from '@/src/games/cake-sort/core/plate';

const КРУГИ = [4, 6, 8, 6] as const;

/** Тот же набор кругов, что в `capsForPlates`, но без заслона выключенной оси. */
function кругиУровня(L: number, всего: number): number[] {
  const шаг = 1 + 2 * (L % 2);
  return Array.from({ length: всего }, (_, i) => КРУГИ[(i * шаг + L) % КРУГИ.length] as number);
}

/** Дешёвый детерминированный генератор — тот же приём, что в раздаче игры. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function перемешать<T>(a: T[], rand: () => number): T[] {
  const к = [...a];
  for (let i = к.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [к[i], к[j]] = [к[j] as T, к[i] as T];
  }
  return к;
}

/**
 * Собрать смешанную доску так же, как это сделала бы игра, но с заданным числом
 * СВОБОДНЫХ тарелок. Очередь в замер не берём: она отложенная часть доски и
 * к тесноте на столе отношения не имеет.
 */
function доска(L: number, types: number, свободных: number, попытка: number) {
  const круги = кругиУровня(L + попытка, types + свободных);
  const занятые = круги.slice(0, types);
  const материал: number[] = [];
  занятые.forEach((c, i) => { for (let k = 0; k < c; k += 1) материал.push(i % types); });
  const перемешано = перемешать(материал, rng(L * 1000 + попытка));
  const стопки: number[][] = Array.from({ length: types }, () => []);
  let i = 0;
  for (const s of перемешано) {
    while (i < types && (стопки[i] as number[]).length >= (занятые[i] as number)) i += 1;
    if (i >= types) break;
    (стопки[i] as number[]).push(s);
  }
  const plates: Plate[] = [...стопки, ...Array.from({ length: свободных }, () => [] as number[])];
  return makeBoard(plates, [], круги);
}

const БЮДЖЕТ = 300_000;
const ПОПЫТОК = 6;

describe('СМЁТ смешанных кругов тортов', () => {
  jest.setTimeout(3_600_000);

  it('доказуемость по запасу свободных тарелок', () => {
    const уровни = [12, 20, 28, 36, 44, 52, 60, 72, 84, 96];
    const запасы = [1, 2, 3, 4, 5, 6, 7, 8];
    const строки: string[] = [];
    const свод = new Map<number, { д: number; всего: number; мс: number }>();

    for (const L of уровни) {
      const cfg = levelCfg(L);
      const части: string[] = [];
      for (const з of запасы) {
        let доказано = 0;
        const т0 = Date.now();
        for (let п = 0; п < ПОПЫТОК; п += 1) {
          const b = доска(L, cfg.types, з, п);
          if (provenSolvable(b, БЮДЖЕТ)) доказано += 1;
        }
        const мс = Date.now() - т0;
        части.push(`${з}:${доказано}/${ПОПЫТОК}`);
        const s = свод.get(з) ?? { д: 0, всего: 0, мс: 0 };
        свод.set(з, { д: s.д + доказано, всего: s.всего + ПОПЫТОК, мс: s.мс + мс });
      }
      строки.push(`L${String(L).padStart(3)} · видов ${String(cfg.types).padStart(2)} · ${части.join('  ')}`);
    }

    console.log(['', 'ЗАПАС СВОБОДНЫХ ТАРЕЛОК → доказано из ' + ПОПЫТОК, ...строки, '',
      'ИТОГО по запасу:',
      ...[...свод.entries()].map(([з, s]) =>
        `  свободных ${з}: ${s.д}/${s.всего} (${Math.round((100 * s.д) / s.всего)} %) · ${Math.round(s.мс / 1000)} с`),
    ].join('\n'));

    expect(строки.length).toBe(уровни.length);
  });

  /**
   * Контроль: те же уровни с ОБЫЧНЫМИ кругами по шесть. Без него таблица выше
   * ни о чём не говорит — может, не доказуемо вообще ничего при таком числе
   * видов, и смесь кругов ни при чём.
   */
  it('контроль: одинаковые круги по шесть', () => {
    const уровни = [12, 20, 28, 36, 44, 52, 60, 72, 84, 96];
    const строки: string[] = [];
    for (const L of уровни) {
      const cfg = levelCfg(L);
      let доказано = 0;
      for (let п = 0; п < ПОПЫТОК; п += 1) {
        const материал: number[] = [];
        for (let i = 0; i < cfg.types; i += 1) for (let k = 0; k < CIRCLE; k += 1) материал.push(i);
        const перемешано = перемешать(материал, rng(L * 1000 + п));
        const стопки: number[][] = Array.from({ length: cfg.types }, () => []);
        let i = 0;
        for (const s of перемешано) {
          while (i < cfg.types && (стопки[i] as number[]).length >= CIRCLE) i += 1;
          if (i >= cfg.types) break;
          (стопки[i] as number[]).push(s);
        }
        const свободных = Math.max(2, cfg.plates - cfg.types);
        const plates: Plate[] = [...стопки, ...Array.from({ length: свободных }, () => [] as number[])];
        if (provenSolvable(makeBoard(plates), БЮДЖЕТ)) доказано += 1;
      }
      строки.push(`L${String(L).padStart(3)} · видов ${String(cfg.types).padStart(2)} · ${доказано}/${ПОПЫТОК}`);
    }
    console.log(['', 'КОНТРОЛЬ (все круги по 6):', ...строки].join('\n'));
    expect(строки.length).toBe(уровни.length);
  });
});
