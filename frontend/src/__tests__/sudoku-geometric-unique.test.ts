/* psygames-sudoku-geometric-unique-gate · VER 1 · 26.08.2026 */
/**
 * ЕДИНСТВЕННОСТЬ РЕШЕНИЯ У ЧЕТЫРЁХ ГЕОМЕТРИЧЕСКИХ ВАРИАНТОВ — ЕЁ НЕ СТОРОЖИЛ НИКТО.
 *
 * 🔴 ДЫРА, НАЙДЕННАЯ 26.08.2026. Гейтов на единственность было два, и оба смотрят
 * мимо верхних уровней:
 *   `sudoku-unique-levels`   — уровни 11, 15, 19, 23 (диагональ, антиконь, гипер, несоседние)
 *   `sudoku-overlays-unique` — уровни 31, 35, 39 (чёт-нечет, кропки, сэндвич)
 * Термометр (42–45), стрелка (46–49), джигсо (50–53) и термоклетка (54–57) не
 * покрыты НИ ОДНИМ. Это ровно те четыре варианта, у которых геометрия рисуется
 * генератором, то есть где ошибиться проще всего.
 *
 * Почему это опаснее, чем звучит. Доска с двумя решениями выглядит нормальной:
 * человек играет по правилам, ставит цифру ВТОРОГО решения — и сверка с зашитым
 * `solution` объявляет ошибку. Он теряет жизнь за верный ход. Ровно этот репорт
 * («в текущем моменте несколько вариантов победы») уже приходил от Вали на 30-м
 * уровне и стоил отдельной починки — вернуться он может через любой из этих
 * четырёх вариантов, и тогда снова никто не покраснеет.
 *
 * ⚠️ ПЕРЕБОР ЗДЕСЬ СВОЙ, А НЕ `countSolutions` ИЗ ИГРЫ. Гейт, проверяющий движок
 * его же счётчиком, доказывает лишь «счётчик согласен сам с собой»: ошибись
 * пруннинг — оба соврут одинаково. Ниже обычный обход с возвратом, который знает
 * только `isValid`, и предохранитель по числу шагов.
 *
 * ЗАМЕР ПРИ ЗАВЕДЕНИИ: 16 досок из 16 (джигсо L51/L53, термоклетка L55/L57) имели
 * ровно одно решение. То есть гейт заводится на ЗЕЛЁНОМ поведении и сторожит его
 * от регресса, а не чинит существующую поломку.
 *
 * 🔴 ЧЕМ ИМЕННО ДЕРЖИТСЯ ЕДИНСТВЕННОСТЬ — ВЫЯСНЕНО МУТАЦИЕЙ, А НЕ ЧТЕНИЕМ.
 * Первая мутация сняла `solvedSameBoard` из условия приёмки выколотой клетки
 * (`sudoku-grade.ts:803`), ожидая красноты, — и гейт остался ЗЕЛЁНЫМ все семь
 * проверок. Значит эта сеть ловит другое: она стережёт, что решатель пришёл к ТОЙ
 * ЖЕ доске (неверный пруннинг «решил» бы чужую сетку), а не число решений.
 *
 * Настоящий держатель — `g.solved`: доска принимается, только если берётся ЧИСТОЙ
 * ЛОГИКОЙ, без перебора. Логика не ветвится, поэтому дойти она может ровно до
 * одного решения — единственность здесь СЛЕДСТВИЕ способа приёмки, а не отдельная
 * проверка. Мутация, снявшая всё условие целиком, покраснела на трёх вариантах из
 * четырёх (термометр, стрелка, джигсо), и это доказывает, что гейт кусает.
 *
 * ⚠️ Термоклетка при той же мутации осталась зелёной: её два правила (цепочка и
 * сумма) сами по себе так жёстко связывают доску, что второе решение не находится
 * даже без приёмки. Не повод считать её защищённой — повод помнить, что одна
 * зелёная проверка из четырёх ничего не говорит об остальных.
 */
import { logicalBuilder } from '@/src/services/sudoku-grade';
import {
  levelConfig, isValid,
  type Cell, type Variant, type ThermoPN, type ArrowMap, type CageMap,
} from '@/src/services/sudoku-core';

/** Сколько решений у доски — свой обход с возвратом, до предела `limit`. */
function countOwn(
  grid: Cell[][], N: number, BR: number, BC: number, variant: Variant,
  regions?: number[][], thermo?: ThermoPN, arrow?: ArrowMap, cages?: CageMap, limit = 2,
): number {
  const g = grid.map((row) => [...row]);
  let found = 0;
  let steps = 0;
  const walk = (): boolean => {
    // Предохранитель: доска, которую не берёт даже перебор, — отдельная беда,
    // и молча висеть на ней проверка не должна.
    if (++steps > 2_000_000) throw new Error('перебор не уложился в 2 млн шагов');
    let br = -1, bc = -1, best: number[] | null = null;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (g[r][c] !== 0) continue;
      const cand: number[] = [];
      for (let v = 1; v <= N; v++) if (isValid(g, r, c, v, N, BR, BC, variant, regions, thermo, arrow, cages)) cand.push(v);
      if (!best || cand.length < best.length) { best = cand; br = r; bc = c; if (!cand.length) return false; }
    }
    if (br < 0) { found++; return found >= limit; }
    for (const v of best as number[]) {
      g[br][bc] = v;
      if (walk()) { g[br][bc] = 0; return true; }
      g[br][bc] = 0;
    }
    return false;
  };
  walk();
  return found;
}

/**
 * ⚠️ ДОСКА СТРОИТСЯ ОДИН РАЗ НА УРОВЕНЬ И ПЕРЕИСПОЛЬЗУЕТСЯ.
 *
 * Первая редакция звала сборщик в каждой проверке — десять сборок на четыре
 * уровня, 47 секунд на этот файл. На CI, где машина медленнее, шаг тестов
 * упёрся в десятиминутный лимит и был УБИТ: в логе нет ни одной строки итога,
 * только «Terminate orphan process (npm test --ci)». То есть выпуск встал не
 * из-за красной проверки, а из-за того, что мой же гейт не уложился во время.
 *
 * Кеш ничего не ослабляет: проверки смотрят на РАЗНЫЕ свойства ОДНОЙ доски, и
 * гонять ради каждой свежую сборку незачем. Разнообразие досок даёт не повтор
 * внутри файла, а то, что генератор случаен и на каждом прогоне доска новая.
 */
type BuiltBoard = {
  cfg: ReturnType<typeof levelConfig>;
  gen: { puzzle: Cell[][]; solution: Cell[][]; regions?: number[][]; thermo?: ThermoPN; arrow?: ArrowMap; cages?: CageMap };
};
const built = new Map<number, BuiltBoard>();

function buildAt(level: number) {
  const cached = built.get(level);
  if (cached) return cached;
  const cfg = levelConfig(level);
  const b = logicalBuilder(level, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 4000 });
  let made: ReturnType<typeof b.step> | null = null;
  for (let s = 0; s < b.steps; s++) { made = b.step(); if (b.enough(made)) break; }
  if (!made) throw new Error(`уровень ${level}: сборщик не отдал доску`);
  const out: BuiltBoard = { cfg, gen: made.gen };
  built.set(level, out);
  return out;
}

/** Верхние уровни каждого из четырёх геометрических вариантов. */
const CASES: [number, string][] = [[45, 'thermo'], [49, 'arrow'], [53, 'jigsaw'], [57, 'thermocage']];

describe('геометрические варианты: у выданной доски ровно одно решение', () => {
  it('есть что проверять — уровни те самые, и геометрия на доске есть', () => {
    for (const [lv, want] of CASES) {
      expect(levelConfig(lv).variant).toBe(want);
    }
    // Пустая геометрия превратила бы проверку в проверку обычной судоку.
    const { cfg, gen } = buildAt(53);
    expect(cfg.variant).toBe('jigsaw');
    expect(gen.regions).toBeTruthy();
  }, 120000);

  it('🔴 свой перебор действительно умеет находить ВТОРОЕ решение', () => {
    // Без этой пробы «решение одно» могло бы означать «перебор сломан и всегда
    // возвращает единицу». Берём выданную доску и убираем ещё одну подсказку —
    // почти всегда это порождает второе решение; если нет, пробуем следующую.
    const { cfg, gen } = buildAt(53);
    let sawTwo = false;
    for (let r = 0; r < cfg.N && !sawTwo; r++) for (let c = 0; c < cfg.N && !sawTwo; c++) {
      if (gen.puzzle[r][c] === 0) continue;
      const probe = gen.puzzle.map((row) => [...row]);
      probe[r][c] = 0;
      if (countOwn(probe, cfg.N, cfg.BR, cfg.BC, cfg.variant, gen.regions, gen.thermo, gen.arrow, gen.cages, 2) >= 2) sawTwo = true;
    }
    expect(sawTwo).toBe(true);
  }, 300000);

  it.each(CASES)('🔴 L%i (%s): решение ровно одно', (level, _variant) => {
    const { cfg, gen } = buildAt(level as number);
    const n = countOwn(gen.puzzle, cfg.N, cfg.BR, cfg.BC, cfg.variant, gen.regions, gen.thermo, gen.arrow, gen.cages, 2);
    expect(n).toBe(1);
  }, 300000);

  it('🔴 зашитое решение согласовано с доской, а не просто «какое-то»', () => {
    // Единственность без этой проверки неполна: доска может иметь одно решение,
    // но НЕ ТО, с которым игра сверяет ходы игрока.
    const bad: string[] = [];
    for (const [level] of CASES) {
      const { cfg, gen } = buildAt(level as number);
      for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) {
        const given = gen.puzzle[r][c];
        if (given !== 0 && given !== gen.solution[r][c]) bad.push(`L${level} (${r},${c}): подсказка ${given} против решения ${gen.solution[r][c]}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300000);
});
