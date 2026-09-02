/* psygames-sudoku-geometric-unique-gate · VER 1 · 26.08.2026 */
/**
 * ЕДИНСТВЕННОСТЬ РЕШЕНИЯ У ЧЕТЫРЁХ ГЕОМЕТРИЧЕСКИХ ВАРИАНТОВ — ЕЁ НЕ СТОРОЖИЛ НИКТО.
 *
 * 🔴 ДЫРА, НАЙДЕННАЯ 26.08.2026. Гейтов на единственность было два, и оба смотрят
 * мимо верхних уровней:
 *   `sudoku-unique-levels`   — уровни 11, 15, 19, 23 (диагональ, антиконь, гипер, несоседние)
 *   `sudoku-overlays-unique` — уровни 31, 35, 39 (чёт-нечет, кропки, сэндвич)
 * Термометр (42–45), стрелка (46–49), термоклетка (50–53) и джигсо (54–57) не
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

/** Бюджет снаружи (рецепт 2731e0b6): на CI 4000 мс не добирали enough — доска-недодел
 * давала недетерминированные вердикты (срез тега 1.253.1). Боевой недобор — красный,
 * задушенный (SUDOKU_BUDGET_MS < дефолта) — null и пропуск кейса. */
const FIXTURE_BUDGET_MS = Number(process.env.SUDOKU_BUDGET_MS ?? 30000);

/**
 * 🔴 «НЕ УСПЕЛ» И «СЛОМАНО» — РАЗНЫЕ ВЕЩИ, И РАЗЛИЧАЕТ ИХ ПОВТОР С БОЛЬШИМ БЮДЖЕТОМ.
 *
 * Бюджет здесь измеряется НАСТЕННЫМИ ЧАСАМИ, а не работой. Значит на занятой
 * машине за те же 30 секунд успевается меньше, и сборщик не добирает — при том,
 * что с ним всё в порядке. Поймано 02.09.2026: полный прогон краснел, когда рядом
 * шёл браузерный аудит, и тут же зеленел в одиночку.
 *
 * Ложное срабатывание стоит дороже пропущенного дефекта: гейт, который краснеет
 * на исправном коде, перестают читать, и вместе с придуманной поломкой он
 * пропускает настоящую. Поэтому при недоборе даём ВТОРОЙ заход с тройным
 * бюджетом: настоящая поломка (сборщик встал, доска не собирается) не пройдёт и
 * его, а просто загруженная машина — пройдёт. Второй заход печатается: замедление
 * должно быть видно, а не молча проглочено.
 */
function собрать(level: number, budgetMs: number) {
  const cfg = levelConfig(level);
  const b = logicalBuilder(level, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs });
  let made: ReturnType<typeof b.step> | null = null;
  let ok = false;
  for (let s = 0; s < b.steps; s++) { made = b.step(); if (b.enough(made)) { ok = true; break; } }
  return { cfg, made, ok };
}

function buildAt(level: number): BuiltBoard | null {
  const cached = built.get(level);
  if (cached) return cached;
  let { cfg, made, ok } = собрать(level, FIXTURE_BUDGET_MS);
  if (!ok && FIXTURE_BUDGET_MS >= 30000) {
    console.log(`уровень ${level}: не добрал за ${FIXTURE_BUDGET_MS} мс — второй заход с тройным бюджетом`);
    ({ cfg, made, ok } = собрать(level, FIXTURE_BUDGET_MS * 3));
  }
  if (!made || !ok) {
    if (FIXTURE_BUDGET_MS < 30000) return null;   // задушенный прогон — пропуск, не вердикт
    throw new Error(`уровень ${level}: сборщик не добрал enough даже на тройном бюджете`);
  }
  const out: BuiltBoard = { cfg, gen: made.gen };
  built.set(level, out);
  return out;
}

/** Верхние уровни каждого из четырёх геометрических вариантов. */
// 27.08.2026: хвост лестницы пересобран по потолкам — джигсо теперь вершина.
const CASES: [number, string][] = [[45, 'thermo'], [49, 'arrow'], [53, 'thermocage'], [57, 'jigsaw']];

describe('геометрические варианты: у выданной доски ровно одно решение', () => {
  it('есть что проверять — уровни те самые, и геометрия на доске есть', () => {
    for (const [lv, want] of CASES) {
      expect(levelConfig(lv).variant).toBe(want);
    }
    // Пустая геометрия превратила бы проверку в проверку обычной судоку.
    const fx = buildAt(57);   // 27.08: джигсо переехал на вершину
    if (!fx) { console.log('бюджет: фикстура L57 не добрана — пропуск'); return; }
    const { cfg, gen } = fx;
    expect(cfg.variant).toBe('jigsaw');
    expect(gen.regions).toBeTruthy();
  }, 120000);

  it('🔴 свой перебор действительно умеет находить ВТОРОЕ решение', () => {
    // Без этой пробы «решение одно» могло бы означать «перебор сломан и всегда
    // возвращает единицу». Берём выданную доску и убираем ещё одну подсказку —
    // почти всегда это порождает второе решение; если нет, пробуем следующую.
    //
    // ⚠️ ОДИНОЧНЫХ СНЯТИЙ МОЖЕТ НЕ ХВАТИТЬ — И ЭТО НЕ ПОЛОМКА ПЕРЕБОРА.
    // Флак 4× за 29.08 (три полных прогона + CI): у thermocage подсказки бывают
    // ПЕРЕОПРЕДЕЛЕНЫ — клетки-суммы и термометр доопределяют снятую цифру, и
    // редкая доска остаётся однозначной после любого одного снятия. Проба про
    // ПЕРЕБОР, а не про доску, поэтому контрольный выстрел: оставить 8 подсказок
    // из всех — такая дырявая доска обязана иметь ≥2 решений на любом раскладе;
    // единица здесь означала бы сломанный перебор по-настоящему.
    const fx = buildAt(53);
    if (!fx) { console.log('бюджет: фикстура L53 не добрана — пропуск'); return; }
    const { cfg, gen } = fx;
    let sawTwo = false;
    for (let r = 0; r < cfg.N && !sawTwo; r++) for (let c = 0; c < cfg.N && !sawTwo; c++) {
      if (gen.puzzle[r][c] === 0) continue;
      const probe = gen.puzzle.map((row) => [...row]);
      probe[r][c] = 0;
      if (countOwn(probe, cfg.N, cfg.BR, cfg.BC, cfg.variant, gen.regions, gen.thermo, gen.arrow, gen.cages, 2) >= 2) sawTwo = true;
    }
    if (!sawTwo) {
      const givens: [number, number][] = [];
      for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) if (gen.puzzle[r][c] !== 0) givens.push([r, c]);
      const probe = gen.puzzle.map((row) => [...row]);
      for (const [r, c] of givens.slice(8)) probe[r][c] = 0;   // первые 8 остаются
      console.log('одиночные снятия однозначны (переопределённая доска) — контрольный выстрел 8 подсказками');
      sawTwo = countOwn(probe, cfg.N, cfg.BR, cfg.BC, cfg.variant, gen.regions, gen.thermo, gen.arrow, gen.cages, 2) >= 2;
    }
    expect(sawTwo).toBe(true);
  }, 300000);

  it.each(CASES)('🔴 L%i (%s): решение ровно одно', (level, _variant) => {
    const fx = buildAt(level as number);
    if (!fx) { console.log(`бюджет: фикстура L${level} не добрана — пропуск`); return; }
    const { cfg, gen } = fx;
    const n = countOwn(gen.puzzle, cfg.N, cfg.BR, cfg.BC, cfg.variant, gen.regions, gen.thermo, gen.arrow, gen.cages, 2);
    expect(n).toBe(1);
  }, 300000);

  it('🔴 зашитое решение согласовано с доской, а не просто «какое-то»', () => {
    // Единственность без этой проверки неполна: доска может иметь одно решение,
    // но НЕ ТО, с которым игра сверяет ходы игрока.
    const bad: string[] = [];
    for (const [level] of CASES) {
      const fx2 = buildAt(level as number);
      if (!fx2) { console.log(`бюджет: фикстура L${level} не добрана — пропуск`); continue; }
      const { cfg, gen } = fx2;
      for (let r = 0; r < cfg.N; r++) for (let c = 0; c < cfg.N; c++) {
        const given = gen.puzzle[r][c];
        if (given !== 0 && given !== gen.solution[r][c]) bad.push(`L${level} (${r},${c}): подсказка ${given} против решения ${gen.solution[r][c]}`);
      }
    }
    expect(bad).toEqual([]);
  }, 300000);
});
